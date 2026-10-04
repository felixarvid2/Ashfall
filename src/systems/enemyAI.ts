/**
 * Enemy behaviours, driven by EnemyDef.behavior:
 *  - rusher:  chase, telegraphed melee swing (dodgeable: the hit is checked when the swing lands)
 *  - ranged:  hold a distance band, strafe, telegraphed projectile
 *  - support: hide behind its pack and periodically shield nearby allies (and revive the fallen)
 * Attack kinds add their own movement: flamethrower cones, lunges, grab-and-throw slams.
 * Def extras: a front shield raised as the target closes in, burning trails, revives.
 */
import { HEARING, minesBehaviours } from './minesAI';
import { nextWaypoint, type NavField } from './navigation';
import {
  Collider,
  Dead,
  DisplayName,
  EnemyAI,
  Faction,
  ForcedMove,
  Health,
  Mover,
  PlayerControlled,
  Projectile,
  Renderable,
  StatusEffects,
  Targetable,
  Taunt,
  Transform,
  makeTransform,
  type EnemyAI as EnemyAIData,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { CombatStats } from '../core/components';
import { enemyDef } from '../data/db';
import type { EnemyDef } from '../data/schemas';
import { applyStatus, dealHit, hasStatus, conditionsOf, heal, kill, spawnEnemyHazard } from './combat';
import { spawnEnemy } from '../world/spawn';
import { computeOutgoing } from './damage';
import { angleDelta } from './movement';
import { livingInCircle } from './targeting';
import { hubAt } from '../world/zone';

const ALERT_RADIUS = 9;
const WANDER_SPEED = 0.35;

interface Candidate {
  e: Entity;
  tr: Transform;
  /** Taunt radius (decoys), 0 for normal targets. */
  taunt: number;
}

/** Living, visible player-team entities enemies may attack (player, decoys, minions). */
function targetCandidates(world: World, ctx: GameContext, seeStealth = false): Candidate[] {
  const out: Candidate[] = [];
  for (const e of world.query(Faction, Health, Transform)) {
    if (world.req(e, Faction).team !== 'player' || world.has(e, Dead)) continue;
    if (!seeStealth && hasStatus(world, e, 'stealth')) continue;
    // Nobody is attacked inside a safe hub.
    const t = world.req(e, Transform);
    if (hubAt(ctx.zone, t.x, t.z)) continue;
    out.push({ e, tr: world.req(e, Transform), taunt: world.get(e, Taunt)?.radius ?? 0 });
  }
  return out;
}

/** A taunting decoy in range wins; otherwise the nearest candidate. */
export function chooseTarget(candidates: readonly Candidate[], x: number, z: number): Candidate | null {
  let best: Candidate | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.tr.x - x, c.tr.z - z);
    const score = c.taunt > 0 && d <= c.taunt ? d - 1000 : d;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function enemyAISystem(world: World, frameDt: number, ctx: GameContext): void {
  nav = ctx.nav;
  const candidates = targetCandidates(world, ctx);
  // Blind Hounds hear what they cannot see (stealth does not hide you from them).
  let heard: Candidate[] | null = null;
  regrowFallen(world, ctx);

  for (const e of world.query(EnemyAI, Transform, Mover)) {
    if (world.has(e, Dead)) continue;
    const ai = world.req(e, EnemyAI);
    // Enraged bosses run their wind-ups and cooldowns faster.
    const dt = frameDt * (ai.tempo ?? 1);
    const def = enemyDef(ai.defId);
    const tr = world.req(e, Transform);
    const mover = world.req(e, Mover);
    ai.cooldown = Math.max(0, ai.cooldown - dt);
    mover.vx = 0;
    mover.vz = 0;
    if (def.shield) {
      ai.shieldUp = Math.max(0, (ai.shieldUp ?? 0) - dt);
      ai.shieldCooldown = Math.max(0, (ai.shieldCooldown ?? 0) - dt);
    }
    if (def.trail && ai.aggro) trail(world, e, ai, def, tr, dt);
    if (ai.aggro) vaultBehaviours(world, ctx, e, ai, def, tr, dt);

    if (!(world.get(e, StatusEffects)?.canAct ?? true)) continue;

    // Enemies keep out of safe hubs.
    const hub = hubAt(ctx.zone, tr.x, tr.z, 3);
    if (hub) {
      ai.state = 'idle';
      steer(mover, tr, tr.x - hub.x, tr.z - hub.z, mover.speed, 0);
      continue;
    }

    if (minesBehaviours(world, ctx, e, ai, def, tr, mover, dt)) continue;

    const target = chooseTarget(def.hearing ? (heard ??= targetCandidates(world, ctx, true)) : candidates, tr.x, tr.z);
    if (!target) {
      // Nobody visible (player stealthed or dead): drop the attack and wait.
      ai.state = 'idle';
      continue;
    }
    const player = target.e;
    const ptr = target.tr;
    const dx = ptr.x - tr.x;
    const dz = ptr.z - tr.z;
    const dist = Math.hypot(dx, dz);

    if (!ai.aggro) {
      if (dist < (def.hearing ? HEARING.notice : def.aggroRange)) {
        alert(world, ctx, e, tr);
      } else {
        wander(ai, tr, mover, ctx, dt);
        continue;
      }
    }

    // Fire shield: raised when the target closes in from the front; the Smelter advances behind it.
    if (def.shield && ai.state !== 'windup' && (ai.shieldUp ?? 0) <= 0 && (ai.shieldCooldown ?? 0) <= 0 && dist <= def.shield.range) {
      ai.shieldUp = def.shield.duration;
      ai.shieldCooldown = def.shield.cooldown + def.shield.duration;
      ctx.events.push({ type: 'vfx', kind: 'shield', x: tr.x, z: tr.z, radius: 1.2, facing: tr.facing });
    }
    if ((ai.shieldUp ?? 0) > 0) {
      face(tr, ptr.x, ptr.z, def.turnRate, dt);
      steer(mover, tr, ptr.x - tr.x, ptr.z - tr.z, mover.speed * 0.45, 2);
      continue;
    }
    // Vine lash: a telegraphed line that drags a target who keeps its distance.
    if (def.pull && pull(world, ctx, e, ai, def, tr, player, ptr, dist, dt)) continue;
    if (def.attack.kind === 'cone') {
      flamer(world, ctx, e, ai, def, tr, mover, ptr, dist, dt);
      continue;
    }
    if (def.attack.kind === 'lunge') {
      lunger(world, ctx, e, ai, def, tr, mover, ptr, dist, dt);
      continue;
    }

    switch (def.behavior) {
      case 'rusher':
        rusher(world, ctx, e, ai, def, tr, mover, player, ptr, dist, dt);
        break;
      case 'ranged':
        ranged(world, ctx, e, ai, def, tr, mover, ptr, dist, dt);
        break;
      case 'support':
        support(world, ctx, e, ai, def, tr, mover, ptr, dist, dt);
        break;
      case 'kamikaze':
        kamikaze(world, ctx, e, ai, def, tr, mover, ptr, dist, dt);
        break;
      case 'flanker':
        // Circle to the target's side first, then attack like a rusher.
        if (dist > 3.2 && ai.state !== 'windup' && ai.state !== 'recover') {
          const away = Math.atan2(tr.x - ptr.x, tr.z - ptr.z) + ai.strafeDir * 1.2;
          const fx = ptr.x + Math.sin(away) * 2.6;
          const fz = ptr.z + Math.cos(away) * 2.6;
          ai.state = 'chase';
          face(tr, fx, fz, def.turnRate, dt);
          steer(mover, tr, fx - tr.x, fz - tr.z, mover.speed, 0.3);
        } else {
          rusher(world, ctx, e, ai, def, tr, mover, player, ptr, dist, dt);
        }
        break;
      case 'tank':
        // Heavies either shoot (riot sergeants) or close in and slam.
        if (def.attack.kind === 'melee') rusher(world, ctx, e, ai, def, tr, mover, player, ptr, dist, dt);
        else ranged(world, ctx, e, ai, def, tr, mover, ptr, dist, dt);
        break;
    }
  }
}

/** Aggro this enemy and its neighbours. */
function alert(world: World, ctx: GameContext, e: Entity, tr: Transform): void {
  world.req(e, EnemyAI).aggro = true;
  for (const other of livingInCircle(world, ctx, tr.x, tr.z, ALERT_RADIUS, 'enemy')) {
    const ai = world.get(other, EnemyAI);
    if (ai) ai.aggro = true;
  }
}

function wander(ai: EnemyAIData, tr: Transform, mover: Mover, ctx: GameContext, dt: number): void {
  ai.timer -= dt;
  if (ai.timer <= 0) {
    ai.timer = ctx.rng.range(2, 5);
    ai.wanderX = tr.x + ctx.rng.range(-4, 4);
    ai.wanderZ = tr.z + ctx.rng.range(-4, 4);
  }
  steer(mover, tr, ai.wanderX - tr.x, ai.wanderZ - tr.z, mover.speed * WANDER_SPEED, 0.5);
}

/** The flow field toward the player this tick (pathfinding), if any. */
let nav: NavField | undefined;

/**
 * Set velocity toward (dx, dz) unless within `stopAt` metres. Heading for the player (or a spot right
 * next to them) round a wall or along a winding tunnel follows the flow field instead of the
 * straight line.
 */
function steer(mover: Mover, tr: Transform, dx: number, dz: number, speed: number, stopAt: number): void {
  const d = Math.hypot(dx, dz);
  if (d <= stopAt) return;
  if (nav && Math.hypot(tr.x + dx - nav.origin.x, tr.z + dz - nav.origin.z) < 3.5) {
    const wp = nextWaypoint(nav, tr.x, tr.z);
    if (wp) {
      dx = wp.x - tr.x;
      dz = wp.z - tr.z;
      const w = Math.hypot(dx, dz) || 1;
      mover.vx = (dx / w) * speed;
      mover.vz = (dz / w) * speed;
      return;
    }
  }
  mover.vx = (dx / d) * speed;
  mover.vz = (dz / d) * speed;
}

function face(tr: Transform, x: number, z: number, turnRate: number, dt: number): void {
  const desired = Math.atan2(x - tr.x, z - tr.z);
  const delta = angleDelta(tr.facing, desired);
  const max = turnRate * dt;
  tr.facing = angleDelta(0, tr.facing + (Math.abs(delta) <= max ? delta : Math.sign(delta) * max));
}

function rusher(
  world: World,
  ctx: GameContext,
  e: Entity,
  ai: EnemyAIData,
  def: EnemyDef,
  tr: Transform,
  mover: Mover,
  player: Entity,
  ptr: Transform,
  dist: number,
  dt: number,
): void {
  if (def.attack.kind !== 'melee') return;
  const atk = def.attack;
  const playerRadius = world.get(player, Collider)?.radius ?? 0.4;

  if (ai.state === 'windup') {
    face(tr, ai.aimX, ai.aimZ, def.turnRate * 0.25, dt);
    ai.timer -= dt;
    if (ai.timer <= 0) {
      // The swing lands now: only hits if the player is still in the arc.
      const angle = Math.atan2(ptr.x - tr.x, ptr.z - tr.z);
      const inArc = Math.abs(angleDelta(tr.facing, angle)) <= (atk.arcDeg * Math.PI) / 360;
      ai.swings = (ai.swings ?? 0) + 1;
      const grab = atk.grabEvery !== undefined && ai.swings % atk.grabEvery === 0;
      if (dist <= atk.range + playerRadius && inArc) {
        dealHit(world, ctx, e, player, {
          coefficient: grab ? 1.3 : 1,
          damageType: atk.damageType,
          knockback: grab ? 0 : atk.knockback,
          fromX: tr.x,
          fromZ: tr.z,
          applies: atk.applies,
          range: 'melee',
        });
        if (grab && !world.has(player, Dead)) throwTarget(world, ctx, player, tr, atk.throwDistance);
        // Vines: every Nth hit that lands holds the target in place for a moment.
        ai.landed = (ai.landed ?? 0) + 1;
        if (atk.rootEvery !== undefined && ai.landed % atk.rootEvery === 0 && !world.has(player, Dead)) {
          applyStatus(world, ctx, player, { status: 'rooted', duration: atk.rootDuration }, { team: 'enemy', level: world.get(e, CombatStats)?.level ?? 1 });
        }
      }
      ctx.events.push({ type: 'vfx', kind: 'enemySlash', x: tr.x, z: tr.z, radius: atk.range, facing: tr.facing, arcDeg: atk.arcDeg });
      ai.state = 'recover';
      ai.timer = atk.recovery;
      ai.cooldown = atk.cooldown;
    }
    return;
  }
  if (ai.state === 'recover') {
    ai.timer -= dt;
    if (ai.timer <= 0) ai.state = 'chase';
    return;
  }

  ai.state = 'chase';
  face(tr, ptr.x, ptr.z, def.turnRate, dt);
  if (dist <= atk.range + playerRadius * 0.5 && ai.cooldown <= 0) {
    ai.state = 'windup';
    ai.attackSeq++;
    ai.timer = atk.windup;
    ai.aimX = ptr.x;
    ai.aimZ = ptr.z;
    tr.facing = Math.atan2(ptr.x - tr.x, ptr.z - tr.z);
    ctx.events.push({
      type: 'telegraph',
      owner: e,
      x: tr.x,
      z: tr.z,
      shape: { kind: 'cone', radius: atk.range + playerRadius, arcDeg: atk.arcDeg, facing: tr.facing },
      duration: atk.windup,
      color: '#ff3b2f',
    });
    return;
  }
  steer(mover, tr, ptr.x - tr.x, ptr.z - tr.z, mover.speed, atk.range * 0.7);
}

/** Grab and fling the target along the thrower's facing; it lands stunned. */
function throwTarget(world: World, ctx: GameContext, target: Entity, from: Transform, distance: number): void {
  const t = world.req(target, Transform);
  const lim = ctx.worldHalfSize - 1;
  const toX = Math.max(-lim, Math.min(lim, t.x + Math.sin(from.facing) * distance));
  const toZ = Math.max(-lim, Math.min(lim, t.z + Math.cos(from.facing) * distance));
  world.add(target, ForcedMove, { fromX: t.x, fromZ: t.z, toX, toZ, elapsed: 0, duration: 0.55, height: 1.6, landingSkill: null });
  applyStatus(world, ctx, target, { status: 'stunned', duration: 1.1 }, { team: 'enemy', level: world.get(target, CombatStats)?.level ?? 1 });
  ctx.events.push({ type: 'shake', trauma: 0.45 });
}

/** Flamethrower: close in, telegraph a cone, then hold the stream (it follows the target slowly). */
function flamer(
  world: World,
  ctx: GameContext,
  e: Entity,
  ai: EnemyAIData,
  def: EnemyDef,
  tr: Transform,
  mover: Mover,
  ptr: Transform,
  dist: number,
  dt: number,
): void {
  if (def.attack.kind !== 'cone') return;
  const atk = def.attack;
  if (ai.state === 'windup') {
    ai.timer -= dt;
    if (ai.timer > 0) return;
    // Streaming: turn slowly toward the target and hit everything in the cone each tick.
    if (ai.channel === undefined) {
      ai.channel = atk.duration;
      ai.channelTick = 0;
    }
    face(tr, ptr.x, ptr.z, def.turnRate * 0.2, dt);
    ai.channel -= dt;
    ai.channelTick = (ai.channelTick ?? 0) - dt;
    if (ai.channelTick <= 0) {
      ai.channelTick = atk.tick;
      ctx.events.push({ type: 'vfx', kind: 'flame', x: tr.x, z: tr.z, radius: atk.range, facing: tr.facing, arcDeg: atk.arcDeg });
      for (const target of livingInCircle(world, ctx, tr.x, tr.z, atk.range + 0.4, 'player')) {
        const t = world.req(target, Transform);
        const angle = Math.atan2(t.x - tr.x, t.z - tr.z);
        if (Math.abs(angleDelta(tr.facing, angle)) > (atk.arcDeg * Math.PI) / 360) continue;
        dealHit(world, ctx, e, target, { coefficient: atk.coefficient, damageType: atk.damageType, knockback: 0, fromX: tr.x, fromZ: tr.z, applies: atk.applies, range: 'ranged' });
      }
    }
    if (ai.channel <= 0) {
      ai.channel = undefined;
      ai.state = 'recover';
      ai.timer = 0.4;
      ai.cooldown = atk.cooldown;
    }
    return;
  }
  if (ai.state === 'recover') {
    ai.timer -= dt;
    if (ai.timer <= 0) ai.state = 'chase';
    return;
  }
  ai.state = 'chase';
  face(tr, ptr.x, ptr.z, def.turnRate, dt);
  if (dist <= atk.range * 0.85 && ai.cooldown <= 0) {
    ai.state = 'windup';
    ai.attackSeq++;
    ai.timer = atk.windup;
    ai.channel = undefined;
    tr.facing = Math.atan2(ptr.x - tr.x, ptr.z - tr.z);
    ctx.events.push({ type: 'telegraph', owner: e, x: tr.x, z: tr.z, shape: { kind: 'cone', radius: atk.range, arcDeg: atk.arcDeg, facing: tr.facing }, duration: atk.windup, color: '#ff7a1a' });
    return;
  }
  steer(mover, tr, ptr.x - tr.x, ptr.z - tr.z, mover.speed, atk.range * 0.6);
}

/** Welder: telegraph a line, then dash along it, hitting everything in the path. */
function lunger(
  world: World,
  ctx: GameContext,
  e: Entity,
  ai: EnemyAIData,
  def: EnemyDef,
  tr: Transform,
  mover: Mover,
  ptr: Transform,
  dist: number,
  dt: number,
): void {
  if (def.attack.kind !== 'lunge') return;
  const atk = def.attack;
  if (ai.state === 'windup') {
    face(tr, ai.aimX, ai.aimZ, def.turnRate * 0.15, dt);
    ai.timer -= dt;
    if (ai.timer > 0) return;
    const lim = ctx.worldHalfSize - 1;
    const toX = Math.max(-lim, Math.min(lim, tr.x + Math.sin(tr.facing) * atk.distance));
    const toZ = Math.max(-lim, Math.min(lim, tr.z + Math.cos(tr.facing) * atk.distance));
    // Everything along the dash line is hit (checked now: the telegraph was the warning).
    const vx = toX - tr.x;
    const vz = toZ - tr.z;
    const len2 = vx * vx + vz * vz || 1;
    for (const target of livingInCircle(world, ctx, (tr.x + toX) / 2, (tr.z + toZ) / 2, atk.distance / 2 + atk.width, 'player')) {
      const t = world.req(target, Transform);
      const k = Math.max(0, Math.min(1, ((t.x - tr.x) * vx + (t.z - tr.z) * vz) / len2));
      const r = world.get(target, Collider)?.radius ?? 0.4;
      if (Math.hypot(tr.x + vx * k - t.x, tr.z + vz * k - t.z) > atk.width / 2 + r) continue;
      dealHit(world, ctx, e, target, { coefficient: 1, damageType: atk.damageType, knockback: atk.knockback, fromX: tr.x, fromZ: tr.z, applies: atk.applies, range: 'melee' });
    }
    world.add(e, ForcedMove, { fromX: tr.x, fromZ: tr.z, toX, toZ, elapsed: 0, duration: atk.distance / atk.speed, height: 0, landingSkill: null });
    ctx.events.push({ type: 'vfx', kind: 'dodge', x: tr.x, z: tr.z, radius: atk.width, facing: tr.facing });
    ai.state = 'recover';
    ai.timer = atk.recovery + atk.distance / atk.speed;
    ai.cooldown = atk.cooldown;
    return;
  }
  if (ai.state === 'recover') {
    ai.timer -= dt;
    if (ai.timer <= 0) ai.state = 'chase';
    return;
  }
  ai.state = 'chase';
  face(tr, ptr.x, ptr.z, def.turnRate, dt);
  if (dist <= atk.range && ai.cooldown <= 0) {
    ai.state = 'windup';
    ai.attackSeq++;
    ai.timer = atk.windup;
    ai.aimX = ptr.x;
    ai.aimZ = ptr.z;
    tr.facing = Math.atan2(ptr.x - tr.x, ptr.z - tr.z);
    ctx.events.push({ type: 'telegraph', owner: e, x: tr.x, z: tr.z, shape: { kind: 'line', length: atk.distance, width: atk.width, facing: tr.facing }, duration: atk.windup, color: '#ffb03a' });
    return;
  }
  // Between lunges it keeps a little distance, circling, so the next dash has room.
  if (dist < 3) steer(mover, tr, tr.x - ptr.x, tr.z - ptr.z, mover.speed * 0.6, 0);
  else steer(mover, tr, ptr.x - tr.x, ptr.z - tr.z, mover.speed, atk.range * 0.6);
}

/** Burning ground left behind while walking. */
function trail(world: World, e: Entity, ai: EnemyAIData, def: EnemyDef, tr: Transform, dt: number): void {
  const spec = def.trail!;
  ai.trailTimer = (ai.trailTimer ?? spec.every) - dt;
  if (ai.trailTimer > 0) return;
  ai.trailTimer = spec.every;
  // Only where it actually walked since the last patch.
  if (Math.hypot(tr.x - tr.prevX, tr.z - tr.prevZ) < 1e-3) return;
  spawnEnemyHazard(world, e, tr.x, tr.z, spec);
}

function ranged(
  world: World,
  ctx: GameContext,
  e: Entity,
  ai: EnemyAIData,
  def: EnemyDef,
  tr: Transform,
  mover: Mover,
  ptr: Transform,
  dist: number,
  dt: number,
): void {
  if (def.attack.kind !== 'projectile') return;
  const atk = def.attack;
  const [minR, maxR] = def.preferredRange ?? [6, 10];

  if (ai.state === 'windup') {
    face(tr, ai.aimX, ai.aimZ, def.turnRate, dt);
    ai.timer -= dt;
    if (ai.timer <= 0) {
      // Bursts fire one shot per interval while staying in wind-up.
      const fired = ai.burstFired ?? 0;
      const spread = atk.burst > 1 ? ((fired / (atk.burst - 1)) - 0.5) * ((atk.spreadDeg * Math.PI) / 180) : 0;
      const ang = Math.atan2(ai.aimX - tr.x, ai.aimZ - tr.z) + spread;
      fireProjectile(world, ctx, e, tr, tr.x + Math.sin(ang) * 10, tr.z + Math.cos(ang) * 10, atk);
      ai.burstFired = fired + 1;
      if (ai.burstFired < atk.burst) {
        ai.timer = atk.burstInterval;
        return;
      }
      ai.burstFired = 0;
      ai.state = 'recover';
      ai.timer = 0.25;
      ai.cooldown = atk.cooldown;
    }
    return;
  }
  if (ai.state === 'recover') {
    ai.timer -= dt;
    if (ai.timer <= 0) ai.state = 'chase';
    return;
  }

  ai.state = 'chase';
  face(tr, ptr.x, ptr.z, def.turnRate, dt);
  if (ai.cooldown <= 0 && dist <= Math.min(atk.maxRange, maxR + 2)) {
    // Lock the aim at wind-up start so moving sideways dodges the shot.
    ai.state = 'windup';
    ai.attackSeq++;
    ai.timer = atk.windup;
    ai.aimX = ptr.x;
    ai.aimZ = ptr.z;
    ctx.events.push({
      type: 'telegraph',
      owner: e,
      x: tr.x,
      z: tr.z,
      shape: { kind: 'line', length: Math.min(atk.maxRange, dist + 3), width: atk.radius * 2.4, facing: Math.atan2(ptr.x - tr.x, ptr.z - tr.z) },
      duration: atk.windup,
      color: '#ff5a2a',
    });
    return;
  }

  const nx = (ptr.x - tr.x) / (dist || 1);
  const nz = (ptr.z - tr.z) / (dist || 1);
  if (dist > maxR) {
    steer(mover, tr, nx, nz, mover.speed, 0);
  } else if (dist < minR) {
    // Back away slowly: melee classes can still catch a drone that crowds them.
    steer(mover, tr, -nx, -nz, mover.speed * 0.5, 0);
  } else {
    ai.strafeTimer -= dt;
    if (ai.strafeTimer <= 0) {
      ai.strafeTimer = ctx.rng.range(1.5, 3);
      ai.strafeDir = ctx.rng.chance(0.5) ? 1 : -1;
    }
    steer(mover, tr, -nz * ai.strafeDir, nx * ai.strafeDir, mover.speed * 0.6, 0);
  }
}

function fireProjectile(
  world: World,
  ctx: GameContext,
  owner: Entity,
  tr: Transform,
  aimX: number,
  aimZ: number,
  atk: Extract<EnemyDef['attack'], { kind: 'projectile' }>,
): void {
  const stats = world.get(owner, CombatStats);
  if (!stats) return;
  let dx = aimX - tr.x;
  let dz = aimZ - tr.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  // Damage is computed at fire time so it still lands if the shooter dies.
  const out = computeOutgoing({ ...stats, coefficient: 1 }, conditionsOf(world, owner, 'ranged'), ctx.rng.next());
  const p = world.create();
  world.add(p, Transform, makeTransform(tr.x + dx * 0.6, Math.max(1, tr.y), tr.z + dz * 0.6, Math.atan2(dx, dz)));
  world.add(p, Projectile, {
    team: world.get(owner, Faction)?.team ?? 'enemy',
    vx: dx * atk.speed,
    vz: dz * atk.speed,
    radius: atk.radius,
    remaining: atk.maxRange / atk.speed,
    damage: out.outgoing,
    damageType: atk.damageType,
    attackerLevel: stats.level,
    owner,
  });
}

function kamikaze(
  world: World,
  ctx: GameContext,
  e: Entity,
  ai: EnemyAIData,
  def: EnemyDef,
  tr: Transform,
  mover: Mover,
  ptr: Transform,
  dist: number,
  dt: number,
): void {
  if (def.attack.kind !== 'explode') return;
  const atk = def.attack;
  if (ai.state === 'windup') {
    ai.timer -= dt;
    if (ai.timer <= 0) {
      // Burst: hit everything on the opposing side in the radius, then die (leaving the cloud).
      for (const target of livingInCircle(world, ctx, tr.x, tr.z, atk.radius, 'player')) {
        dealHit(world, ctx, e, target, {
          coefficient: 1,
          damageType: atk.damageType,
          knockback: atk.knockback,
          fromX: tr.x,
          fromZ: tr.z,
          applies: [],
          range: 'melee',
        });
      }
      ctx.events.push({ type: 'vfx', kind: 'corpseBurst', x: tr.x, z: tr.z, radius: atk.radius, facing: 0 });
      ctx.events.push({ type: 'shake', trauma: 0.3 });
      kill(world, ctx, e, 0);
    }
    return;
  }
  ai.state = 'chase';
  face(tr, ptr.x, ptr.z, def.turnRate, dt);
  if (dist <= atk.range) {
    ai.state = 'windup';
    ai.attackSeq++;
    ai.timer = atk.windup;
    ctx.events.push({ type: 'telegraph', owner: e, x: tr.x, z: tr.z, shape: { kind: 'circle', radius: atk.radius }, duration: atk.windup, color: '#c8d040' });
    return;
  }
  steer(mover, tr, ptr.x - tr.x, ptr.z - tr.z, mover.speed, 0.5);
}

function support(
  world: World,
  ctx: GameContext,
  e: Entity,
  ai: EnemyAIData,
  def: EnemyDef,
  tr: Transform,
  mover: Mover,
  ptr: Transform,
  dist: number,
  dt: number,
): void {
  if (def.attack.kind !== 'buffAllies') return;
  const atk = def.attack;
  const [minR] = def.preferredRange ?? [7, 12];
  if (def.revive) {
    ai.revives ??= def.revive.uses;
    ai.reviveCooldown = Math.max(0, (ai.reviveCooldown ?? 0) - dt);
  }

  if (ai.state === 'windup' && ai.reviveTarget !== undefined) {
    ai.timer -= dt;
    if (ai.timer <= 0) {
      revive(world, ctx, ai.reviveTarget, def.revive!.lifeFraction);
      ai.reviveTarget = undefined;
      ai.state = 'recover';
      ai.timer = 0.4;
    }
    return;
  }
  if (ai.state === 'windup') {
    ai.timer -= dt;
    if (ai.timer <= 0) {
      for (const ally of livingInCircle(world, ctx, tr.x, tr.z, atk.radius, 'enemy')) {
        for (const apply of atk.applies) applyStatus(world, ctx, ally, apply, { team: 'enemy', level: 1 });
      }
      ctx.events.push({ type: 'vfx', kind: 'sporePulse', x: tr.x, z: tr.z, radius: atk.radius, facing: 0 });
      ai.state = 'recover';
      ai.timer = 0.3;
      ai.cooldown = atk.cooldown;
    }
    return;
  }
  if (ai.state === 'recover') {
    ai.timer -= dt;
    if (ai.timer <= 0) ai.state = 'chase';
    return;
  }

  ai.state = 'chase';
  face(tr, ptr.x, ptr.z, def.turnRate, dt);
  // Raise a fallen ally (once per cooldown, a few times per life).
  if (def.revive && (ai.revives ?? 0) > 0 && (ai.reviveCooldown ?? 0) <= 0) {
    const corpse = fallenAlly(world, tr, def.revive.targets, def.revive.radius);
    if (corpse !== undefined) {
      ai.state = 'windup';
      ai.attackSeq++;
      ai.timer = def.revive.windup;
      ai.reviveTarget = corpse;
      ai.revives = (ai.revives ?? 1) - 1;
      ai.reviveCooldown = def.revive.cooldown;
      const ct = world.req(corpse, Transform);
      ctx.events.push({ type: 'telegraph', owner: e, x: ct.x, z: ct.z, shape: { kind: 'circle', radius: 1.6 }, duration: def.revive.windup, color: '#ffd23a' });
      return;
    }
  }
  const allies = livingInCircle(world, ctx, tr.x, tr.z, 12, 'enemy').filter(
    (a) => a !== e && world.get(a, EnemyAI)?.defId !== ai.defId,
  );
  const alliesInRange = allies.filter((a) => {
    const at = world.req(a, Transform);
    return Math.hypot(at.x - tr.x, at.z - tr.z) <= atk.radius;
  });
  if (ai.cooldown <= 0 && alliesInRange.length > 0) {
    ai.state = 'windup';
    ai.attackSeq++;
    ai.timer = atk.windup;
    ctx.events.push({
      type: 'telegraph',
      owner: e,
      x: tr.x,
      z: tr.z,
      shape: { kind: 'circle', radius: atk.radius },
      duration: atk.windup,
      color: '#6bff7a',
    });
    return;
  }

  if (dist < minR) {
    steer(mover, tr, tr.x - ptr.x, tr.z - ptr.z, mover.speed, 0);
    return;
  }
  // Stand behind the pack's centre, on the side away from the player.
  let cx = ptr.x;
  let cz = ptr.z;
  if (allies.length > 0) {
    cx = 0;
    cz = 0;
    for (const a of allies) {
      const at = world.req(a, Transform);
      cx += at.x;
      cz += at.z;
    }
    cx /= allies.length;
    cz /= allies.length;
    const ax = cx - ptr.x;
    const az = cz - ptr.z;
    const al = Math.hypot(ax, az) || 1;
    cx += (ax / al) * 2.5;
    cz += (az / al) * 2.5;
  }
  steer(mover, tr, cx - tr.x, cz - tr.z, mover.speed, 1.5);
}

/** The nearest corpse of these enemy types within reach. */
function fallenAlly(world: World, tr: Transform, targets: string[], radius: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD = radius;
  for (const e of world.query(EnemyAI, Dead, Transform)) {
    if (!world.req(e, Dead).corpse || !targets.includes(world.req(e, EnemyAI).defId)) continue;
    const t = world.req(e, Transform);
    const d = Math.hypot(t.x - tr.x, t.z - tr.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Bring a corpse back to its feet with part of its life (its first death already paid out). */
export function revive(world: World, ctx: GameContext, e: Entity, lifeFraction: number): boolean {
  if (!world.isAlive(e) || !world.has(e, Dead) || world.has(e, PlayerControlled)) return false;
  world.remove(e, Dead);
  const h = world.req(e, Health);
  h.current = h.max * lifeFraction;
  const ai = world.get(e, EnemyAI);
  if (ai) {
    ai.state = 'chase';
    ai.aggro = true;
    ai.timer = 0;
    ai.cooldown = 1;
  }
  const tr = world.req(e, Transform);
  ctx.events.push({ type: 'vfx', kind: 'raise', x: tr.x, z: tr.z, radius: 1.4, facing: 0 });
  return true;
}

// ---- Region 3 behaviours (docs/regions/hydroponic-vaults.md) ----------------------------------

const isUp = (world: World, e: Entity | undefined) => e !== undefined && world.isAlive(e) && !world.has(e, Dead);

/** Heal pulses, calls for help, lobbed spore clouds and a Lumen Giant's fungi, while fighting. */
function vaultBehaviours(world: World, ctx: GameContext, e: Entity, ai: EnemyAIData, def: EnemyDef, tr: Transform, dt: number): void {
  const level = world.get(e, CombatStats)?.level ?? 1;
  if (def.healAllies) {
    const h = def.healAllies;
    ai.healTimer = (ai.healTimer ?? h.every) - dt;
    if (ai.healTimer <= 0) {
      ai.healTimer = h.every;
      let healed = 0;
      for (const ally of livingInCircle(world, ctx, tr.x, tr.z, h.radius, 'enemy')) {
        const allyAi = world.get(ally, EnemyAI);
        if (!allyAi || !h.families.includes(enemyDef(allyAi.defId).family)) continue;
        const health = world.req(ally, Health);
        if (health.current >= health.max) continue;
        heal(world, ctx, ally, health.max * h.fraction);
        healed++;
      }
      if (healed) ctx.events.push({ type: 'vfx', kind: 'heal', x: tr.x, z: tr.z, radius: h.radius, facing: 0 });
    }
  }
  if (def.reinforce) {
    const r = def.reinforce;
    ai.fightTime = (ai.fightTime ?? 0) + dt;
    ai.reinforceTimer = Math.max(0, (ai.reinforceTimer ?? 0) - dt);
    if (ai.fightTime >= r.after && ai.reinforceTimer <= 0) {
      ai.reinforceTimer = r.cooldown;
      for (let i = 0; i < r.count; i++) {
        const a = (i / r.count) * Math.PI * 2 + ctx.rng.range(0, 1);
        const m = spawnEnemy(world, r.enemy, tr.x + Math.sin(a) * 3, tr.z + Math.cos(a) * 3, { level });
        world.req(m, EnemyAI).aggro = true;
        if (ai.pack) world.req(m, EnemyAI).pack = ai.pack;
      }
      ctx.events.push({ type: 'vfx', kind: 'sporePulse', x: tr.x, z: tr.z, radius: 4, facing: 0 });
    }
  }
  if (def.sporeCloud) {
    const c = def.sporeCloud;
    ai.clouds ??= [];
    for (const cloud of ai.clouds) cloud.t -= dt;
    for (const cloud of ai.clouds.filter((q) => q.t <= 0)) spawnEnemyHazard(world, e, cloud.x, cloud.z, c);
    ai.clouds = ai.clouds.filter((q) => q.t > 0);
    ai.cloudTimer = (ai.cloudTimer ?? c.every * 0.5) - dt;
    const target = world.first(PlayerControlled, Transform);
    if (ai.cloudTimer <= 0 && target !== undefined && !world.has(target, Dead)) {
      const t = world.req(target, Transform);
      if (Math.hypot(t.x - tr.x, t.z - tr.z) <= c.range) {
        ai.cloudTimer = c.every;
        ai.clouds.push({ x: t.x, z: t.z, t: c.warning });
        ctx.events.push({ type: 'telegraph', owner: null, x: t.x, z: t.z, shape: { kind: 'circle', radius: c.radius }, duration: c.warning, color: c.color ?? '#7dff5a' });
      }
    }
  }
  if (def.regrow && ai.fungi === undefined) {
    // The Giant's fungi sprout around it as it wakes; break them or it keeps getting back up.
    const g = def.regrow;
    ai.fungi = [];
    for (let i = 0; i < g.fungi; i++) {
      const a = (i / g.fungi) * Math.PI * 2 + ctx.rng.range(0, 0.6);
      const d = g.radius * ctx.rng.range(0.55, 0.9);
      const f = world.create();
      world.add(f, Transform, makeTransform(tr.x + Math.sin(a) * d, 0, tr.z + Math.cos(a) * d, ctx.rng.range(0, 6)));
      world.add(f, Renderable, { assetId: 'prop.lumen_growth', scale: 1.7, glow: '#7affd8' });
      world.add(f, Faction, { team: 'enemy' });
      const life = g.fungusLife * (1 + 0.15 * (level - 1));
      world.add(f, Health, { current: life, max: life });
      world.add(f, Collider, { radius: 0.9, mass: Infinity, layer: 'ground', isStatic: true });
      world.add(f, Targetable, {});
      world.add(f, DisplayName, { key: 'enemies.fungus' });
      ai.fungi.push(f);
    }
  }
}

/** Fallen Lumen Giants rise again while a fungus stands; once they are all gone, it stays down. */
function regrowFallen(world: World, ctx: GameContext): void {
  for (const e of world.query(EnemyAI, Dead)) {
    const ai = world.req(e, EnemyAI);
    if (ai.regrowAt === undefined || ctx.time < ai.regrowAt) continue;
    ai.regrowAt = undefined;
    const def = enemyDef(ai.defId);
    if (def.regrow && ai.fungi?.some((f) => isUp(world, f))) {
      revive(world, ctx, e, def.regrow.lifeFraction);
    } else {
      // No fungi left: the death counts now (loot, quests).
      world.remove(e, Dead);
      world.req(e, Health).current = 0;
      kill(world, ctx, e, 0);
    }
  }
}

/** Vine Weaver: telegraph a lash along a line; a target still on it is hit and dragged in. Returns true while busy. */
function pull(world: World, ctx: GameContext, e: Entity, ai: EnemyAIData, def: EnemyDef, tr: Transform, player: Entity, ptr: Transform, dist: number, dt: number): boolean {
  const p = def.pull!;
  // The first lash comes soon after it spots you.
  ai.pullCooldown = Math.max(0, (ai.pullCooldown ?? 1) - dt);
  if ((ai.pullTimer ?? 0) > 0) {
    ai.pullTimer! -= dt;
    if (ai.pullTimer! > 0) return true;
    ai.pullTimer = 0;
    // Still on the line?
    const ang = Math.atan2(ptr.x - tr.x, ptr.z - tr.z);
    const off = Math.abs(Math.sin(angleDelta(tr.facing, ang))) * dist;
    const ahead = Math.cos(angleDelta(tr.facing, ang)) > 0;
    if (ahead && dist <= p.range + 0.5 && off <= p.width / 2 + (world.get(player, Collider)?.radius ?? 0.4)) {
      dealHit(world, ctx, e, player, { coefficient: p.coefficient, damageType: 'toxic', knockback: 0, fromX: tr.x, fromZ: tr.z, applies: [], range: 'ranged' });
      if (!world.has(player, Dead)) {
        const stop = 1.8;
        const toX = tr.x + Math.sin(ang) * stop;
        const toZ = tr.z + Math.cos(ang) * stop;
        world.add(player, ForcedMove, { fromX: ptr.x, fromZ: ptr.z, toX, toZ, elapsed: 0, duration: 0.35, height: 0.4, landingSkill: null });
        ctx.events.push({ type: 'vfx', kind: 'pull', x: tr.x, z: tr.z, radius: dist, facing: tr.facing });
      }
    }
    ai.pullCooldown = p.every;
    ai.state = 'recover';
    ai.timer = 0.5;
    return true;
  }
  if (ai.state === 'windup' || ai.state === 'recover' || ai.pullCooldown > 0 || dist < p.minRange || dist > p.range) return false;
  ai.pullTimer = p.windup;
  ai.attackSeq++;
  tr.facing = Math.atan2(ptr.x - tr.x, ptr.z - tr.z);
  ctx.events.push({ type: 'telegraph', owner: e, x: tr.x, z: tr.z, shape: { kind: 'line', length: p.range, width: p.width, facing: tr.facing }, duration: p.windup, color: '#6aff8a' });
  return true;
}
