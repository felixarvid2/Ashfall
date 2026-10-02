/**
 * Enemy behaviours, driven by EnemyDef.behavior:
 *  - rusher:  chase, telegraphed melee swing (dodgeable: the hit is checked when the swing lands)
 *  - ranged:  hold a distance band, strafe, telegraphed projectile
 *  - support: hide behind its pack and periodically shield nearby allies
 */
import {
  Collider,
  Dead,
  EnemyAI,
  Faction,
  Health,
  Mover,
  Projectile,
  StatusEffects,
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
import { applyStatus, dealHit, hasStatus, conditionsOf } from './combat';
import { computeOutgoing } from './damage';
import { angleDelta } from './movement';
import { livingInCircle } from './targeting';

const ALERT_RADIUS = 9;
const WANDER_SPEED = 0.35;

interface Candidate {
  e: Entity;
  tr: Transform;
  /** Taunt radius (decoys), 0 for normal targets. */
  taunt: number;
}

/** Living, visible player-team entities enemies may attack (player, decoys, minions). */
function targetCandidates(world: World): Candidate[] {
  const out: Candidate[] = [];
  for (const e of world.query(Faction, Health, Transform)) {
    if (world.req(e, Faction).team !== 'player' || world.has(e, Dead)) continue;
    if (hasStatus(world, e, 'stealth')) continue;
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

export function enemyAISystem(world: World, dt: number, ctx: GameContext): void {
  const candidates = targetCandidates(world);

  for (const e of world.query(EnemyAI, Transform, Mover)) {
    if (world.has(e, Dead)) continue;
    const ai = world.req(e, EnemyAI);
    const def = enemyDef(ai.defId);
    const tr = world.req(e, Transform);
    const mover = world.req(e, Mover);
    ai.cooldown = Math.max(0, ai.cooldown - dt);
    mover.vx = 0;
    mover.vz = 0;

    if (!(world.get(e, StatusEffects)?.canAct ?? true)) continue;

    const target = chooseTarget(candidates, tr.x, tr.z);
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
      if (dist < def.aggroRange) {
        alert(world, ctx, e, tr);
      } else {
        wander(ai, tr, mover, ctx, dt);
        continue;
      }
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

/** Set velocity toward (dx, dz) unless within `stopAt` metres. */
function steer(mover: Mover, _tr: Transform, dx: number, dz: number, speed: number, stopAt: number): void {
  const d = Math.hypot(dx, dz);
  if (d <= stopAt) return;
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
      if (dist <= atk.range + playerRadius && inArc) {
        dealHit(world, ctx, e, player, {
          coefficient: 1,
          damageType: atk.damageType,
          knockback: atk.knockback,
          fromX: tr.x,
          fromZ: tr.z,
          applies: [],
          range: 'melee',
        });
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
      fireProjectile(world, ctx, e, tr, ai.aimX, ai.aimZ, atk);
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
