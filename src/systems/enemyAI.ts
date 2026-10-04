/**
 * Enemy behaviours, driven by EnemyDef.behavior:
 *  - rusher:  chase, telegraphed melee swing (dodgeable: the hit is checked when the swing lands)
 *  - ranged:  hold a distance band, strafe, telegraphed projectile
 *  - support: hide behind its pack and periodically shield nearby allies (and revive the fallen)
 * Attack kinds add their own movement: flamethrower cones, lunges, grab-and-throw slams.
 * Def extras: a front shield raised as the target closes in, burning trails, revives.
 */
import { HEARING, minesBehaviours } from './minesAI';
import { cellOf, clearLine, downhill, findPath, fleeOf, freeLine, lineOfSight, nearestOpen, nextWaypoint, openAt, snipeOf, type NavField, type NavMode, type NavService } from './navigation';
import { caveGrid, walkableAt } from '../data/zones/caves';
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
  cur.world = world;
  cur.ctx = ctx;
  const candidates = targetCandidates(world, ctx);
  slots = assignSlots(world, ctx);
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
    cur.e = e;
    cur.ai = ai;
    cur.dt = dt;
    field = ai.chasing !== undefined ? nav?.fields.get(ai.chasing) : undefined;
    ai.intent = undefined;
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
      // Nobody visible (player stealthed or dead): go and look where they were last seen, then give up.
      ai.chasing = undefined;
      if (ai.aggro && ai.lastSeen && search(ai, def, tr, mover, ctx, dt)) continue;
      ai.state = 'idle';
      continue;
    }
    const player = target.e;
    const ptr = target.tr;
    const dx = ptr.x - tr.x;
    const dz = ptr.z - tr.z;
    const dist = Math.hypot(dx, dz);

    if (!ai.aggro) {
      // Noticing takes a line of sight (rock and walls hide you) unless the target is right there;
      // Blind Hounds go by ear.
      if (dist < (def.hearing ? HEARING.notice : def.aggroRange) && (def.hearing || dist < 3 || lineOfSight(ctx, tr.x, tr.z, ptr.x, ptr.z))) {
        alert(world, ctx, e, tr);
      } else {
        wander(ai, tr, mover, ctx, dt);
        continue;
      }
    }
    if (ai.chasing !== player) {
      ai.chasing = player;
      field = nav?.fields.get(player);
    }
    if (dist < 4 || canSee(tr, ptr)) ai.lastSeen = { x: ptr.x, z: ptr.z, t: ctx.time };
    if (ai.search) {
      // Found again.
      ai.search = undefined;
      ai.spottedAt = ctx.time;
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
  const self = world.req(e, EnemyAI);
  self.aggro = true;
  self.spottedAt = ctx.time;
  for (const other of livingInCircle(world, ctx, tr.x, tr.z, ALERT_RADIUS, 'enemy')) {
    const ai = world.get(other, EnemyAI);
    if (ai && !ai.aggro) {
      ai.aggro = true;
      // The pack hears the shout a moment later.
      ai.spottedAt = ctx.time + 0.15;
    }
  }
}

function wander(ai: EnemyAIData, tr: Transform, mover: Mover, ctx: GameContext, dt: number): void {
  ai.timer -= dt;
  if (ai.timer <= 0) {
    ai.timer = ctx.rng.range(2, 5);
    ai.wanderX = tr.x + ctx.rng.range(-4, 4);
    ai.wanderZ = tr.z + ctx.rng.range(-4, 4);
    // Underground, mill about on open ground rather than nosing into the rock.
    const cave = ctx.instance || !ctx.zone ? null : caveGrid(ctx.zone.def);
    if (cave && !walkableAt(cave, ai.wanderX, ai.wanderZ)) {
      ai.wanderX = tr.x;
      ai.wanderZ = tr.z;
    }
  }
  steer(mover, tr, ai.wanderX - tr.x, ai.wanderZ - tr.z, mover.speed * WANDER_SPEED, 0.5);
}

// ---- Wayfinding -------------------------------------------------------------------------------

/** This tick's navigation (grid and flow fields), and the field toward the current enemy's target. */
let nav: NavService | undefined;
let field: NavField | undefined;
/** Melee attackers' places round their target this tick. */
let slots = new Map<Entity, { x: number; z: number }>();
/** The enemy being run: steering records its intent, keeps it out of the crowd and unsticks it. */
const cur = { world: null as unknown as World, ctx: null as unknown as GameContext, e: 0 as Entity, ai: null as unknown as EnemyAIData, dt: 0 };
const crowd: Entity[] = [];

/**
 * Set velocity toward (dx, dz) unless within `stopAt` metres. Heading for the target (or a spot right
 * next to it) round a wall, along a winding tunnel or past a fire follows its flow field.
 */
function steer(mover: Mover, tr: Transform, dx: number, dz: number, speed: number, stopAt: number): void {
  const d = Math.hypot(dx, dz);
  if (d <= stopAt) return;
  let gx = tr.x + dx;
  let gz = tr.z + dz;
  let mode: NavMode = 'direct';
  if (field && Math.hypot(gx - field.origin.x, gz - field.origin.z) < 3.5) {
    const wp = nextWaypoint(field, tr.x, tr.z);
    if (wp) {
      gx = wp.x;
      gz = wp.z;
      mode = 'field';
    }
  }
  drive(mover, tr, gx, gz, speed, mode);
}

/** Walk to any spot (a noise, a search point, the pack): straight when the way is free, else by A*. */
export function walkTo(mover: Mover, tr: Transform, x: number, z: number, speed: number, mode: NavMode = 'path'): void {
  const ai = cur.ai;
  const now = cur.ctx.time;
  const g = nav?.grid;
  if (!g || cellOf(g, tr.x, tr.z) < 0 || freeLine(g, tr.x, tr.z, x, z)) {
    ai.path = undefined;
    drive(mover, tr, x, z, speed, mode === 'path' ? 'direct' : mode);
    return;
  }
  const goal = ai.pathGoal;
  if (!ai.path || !goal || Math.hypot(goal.x - x, goal.z - z) > 1.5 || now - goal.t > 2) {
    ai.path = findPath(g, tr.x, tr.z, x, z) ?? undefined;
    ai.pathGoal = { x, z, t: now };
  }
  const path = ai.path;
  if (!path?.length) {
    drive(mover, tr, x, z, speed, mode);
    return;
  }
  // Drop waypoints reached, or skip ahead when a later one is already in a straight line.
  while (path.length > 1 && (Math.hypot(path[0]!.x - tr.x, path[0]!.z - tr.z) < 0.8 || freeLine(g, tr.x, tr.z, path[1]!.x, path[1]!.z))) path.shift();
  drive(mover, tr, path[0]!.x, path[0]!.z, speed, mode);
}

/** Melee: take its place in the ring round the target when it has one, else close straight in. */
function closeIn(mover: Mover, tr: Transform, ptr: Transform, speed: number, stopAt: number): void {
  const slot = slots.get(cur.e);
  if (slot && Math.hypot(ptr.x - tr.x, ptr.z - tr.z) < 9) {
    const sd = Math.hypot(slot.x - tr.x, slot.z - tr.z);
    if (sd < 0.4) {
      cur.ai.intent = { x: slot.x, z: slot.z, mode: 'slot' };
      return;
    }
    // A place on the far side: go round the target along the ring, not through it.
    const here = Math.atan2(tr.x - ptr.x, tr.z - ptr.z);
    const turn = angleDelta(here, Math.atan2(slot.x - ptr.x, slot.z - ptr.z));
    let gx = slot.x;
    let gz = slot.z;
    if (Math.abs(turn) > 0.9) {
      const a = here + Math.sign(turn) * 0.8;
      const r = Math.max(Math.hypot(slot.x - ptr.x, slot.z - ptr.z), Math.hypot(tr.x - ptr.x, tr.z - ptr.z)) + 0.4;
      gx = ptr.x + Math.sin(a) * r;
      gz = ptr.z + Math.cos(a) * r;
    }
    if (!nav || freeLine(nav.grid, tr.x, tr.z, gx, gz)) {
      drive(mover, tr, gx, gz, speed * (sd < 1.5 ? 0.7 : 1), 'slot');
      return;
    }
  }
  steer(mover, tr, ptr.x - tr.x, ptr.z - tr.z, speed, stopAt);
}

/** Back off from the target down the safety map: away from it, toward open ground, not into a corner. */
function retreat(mover: Mover, tr: Transform, ptr: Transform, speed: number): void {
  if (field && cellOf(field, tr.x, tr.z) >= 0) {
    const wp = downhill(field, fleeOf(field), tr.x, tr.z);
    if (wp) {
      drive(mover, tr, wp.x, wp.z, speed, 'flee');
      return;
    }
  }
  const dx = tr.x - ptr.x;
  const dz = tr.z - ptr.z;
  const d = Math.hypot(dx, dz) || 1;
  drive(mover, tr, tr.x + (dx / d) * 3, tr.z + (dz / d) * 3, speed, 'flee');
}

/** Can this enemy see its target (rock and walls block; crates don't)? */
function canSee(tr: Transform, ptr: Transform): boolean {
  if (field && cellOf(field, tr.x, tr.z) >= 0) return clearLine(field, tr.x, tr.z, ptr.x, ptr.z);
  return lineOfSight(cur.ctx, tr.x, tr.z, ptr.x, ptr.z);
}

/** Set the velocity toward (gx, gz), spaced from allies, and watch for getting stuck. */
function drive(mover: Mover, tr: Transform, gx: number, gz: number, speed: number, mode: NavMode): void {
  const ai = cur.ai;
  const now = cur.ctx.time;
  let dx = gx - tr.x;
  let dz = gz - tr.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  dx /= len;
  dz /= len;
  const esc = ai.stuck?.escape;
  if (esc && esc.until > now) {
    dx = esc.x;
    dz = esc.z;
    mode = 'escape';
  } else if (ai.aggro) {
    // Keep a little apart from allies so a pack fans out instead of walking in single file.
    const [sx, sz] = separation(tr);
    if (sx || sz) {
      const vx = dx + sx;
      const vz = dz + sz;
      const l = Math.hypot(vx, vz);
      if (l > 0.2 && (!nav || openAt(nav.grid, tr.x + (vx / l) * 0.9, tr.z + (vz / l) * 0.9))) {
        dx = vx / l;
        dz = vz / l;
      }
    }
  }
  mover.vx = dx * speed;
  mover.vz = dz * speed;
  ai.intent = { x: gx, z: gz, mode };
  watchStuck(ai, tr, speed, dx, dz, now);
}

function separation(tr: Transform): [number, number] {
  const { world, ctx, e } = cur;
  const r = world.get(e, Collider)?.radius ?? 0.5;
  let sx = 0;
  let sz = 0;
  for (const o of ctx.spatial.queryCircle(tr.x, tr.z, r + 1.4, crowd)) {
    if (o === e || !world.has(o, EnemyAI) || world.has(o, Dead)) continue;
    const ot = world.req(o, Transform);
    const lim = r + (world.get(o, Collider)?.radius ?? 0.5) + 0.6;
    const ox = tr.x - ot.x;
    const oz = tr.z - ot.z;
    const d = Math.hypot(ox, oz);
    if (d >= lim || d < 1e-4) continue;
    const w = (1 - d / lim) * 0.8;
    sx += (ox / d) * w;
    sz += (oz / d) * w;
  }
  return [sx, sz];
}

/** Meant to walk 2 m but barely moved: pressed against something. Slide off sideways for a moment. */
function watchStuck(ai: EnemyAIData, tr: Transform, speed: number, dx: number, dz: number, now: number): void {
  let st = ai.stuck;
  if (!st || now - st.last > 0.35) st = ai.stuck = { x: tr.x, z: tr.z, want: 0, last: now, escape: st?.escape };
  st.want += speed * cur.dt;
  st.last = now;
  if (st.want < 2.2) return;
  const escaping = st.escape !== undefined && st.escape.until > now;
  if (!escaping && Math.hypot(tr.x - st.x, tr.z - st.z) < 0.45) {
    const side = cur.e & 1 ? 1 : -1;
    let ex = -dz * side;
    let ez = dx * side;
    if (nav && !openAt(nav.grid, tr.x + ex * 1.5, tr.z + ez * 1.5)) {
      ex = -ex;
      ez = -ez;
      if (!openAt(nav.grid, tr.x + ex * 1.5, tr.z + ez * 1.5)) {
        ex = -dx;
        ez = -dz;
      }
    }
    st.escape = { x: ex, z: ez, until: now + 0.6 };
    ai.path = undefined;
  }
  st.x = tr.x;
  st.z = tr.z;
  st.want = 0;
}

/**
 * Melee attackers spread round their target instead of queueing on one side: each keeps roughly its
 * bearing, neighbours are pushed apart until they fit, and whoever doesn't fit the inner ring waits
 * a step further out. A place inside rock or a wall is dropped (in a tunnel they come straight on).
 */
function assignSlots(world: World, ctx: GameContext): Map<Entity, { x: number; z: number }> {
  const out = new Map<Entity, { x: number; z: number }>();
  type Member = { e: Entity; a: number; ring: number; w: number; d: number; pinned: boolean };
  const groups = new Map<Entity, Member[]>();
  for (const e of world.query(EnemyAI, Transform)) {
    const ai = world.req(e, EnemyAI);
    if (!ai.aggro || ai.chasing === undefined || ai.burrowed || world.has(e, Dead)) continue;
    const def = enemyDef(ai.defId);
    if (def.attack.kind !== 'melee' || !world.isAlive(ai.chasing)) continue;
    const tt = world.get(ai.chasing, Transform);
    if (!tt) continue;
    const tr = world.req(e, Transform);
    const d = Math.hypot(tr.x - tt.x, tr.z - tt.z);
    if (d > 9) continue;
    const me = world.get(e, Collider)?.radius ?? 0.5;
    const them = world.get(ai.chasing, Collider)?.radius ?? 0.4;
    const ring = Math.max(me + them + 0.1, def.attack.range * 0.8 + them * 0.5);
    let list = groups.get(ai.chasing);
    if (!list) groups.set(ai.chasing, (list = []));
    // Mid-swing it holds its ground; the others make room round it.
    list.push({ e, a: Math.atan2(tr.x - tt.x, tr.z - tt.z), ring, w: me * 2 + 0.35, d, pinned: ai.state === 'windup' || ai.state === 'recover' });
  }
  const TAU = Math.PI * 2;
  /**
   * Even places round the circle, in the order they already stand, turned to the rotation (and
   * starting member) that moves them least. Whoever is mid-swing keeps its spot this tick.
   */
  const spread = (ring: Member[], offset: number) => {
    const m = ring.length;
    if (m < 2) return;
    ring.sort((p, q) => p.a - q.a);
    let best = Infinity;
    let bestAngles: number[] = [];
    for (let r = 0; r < m; r++) {
      let sx = 0;
      let sz = 0;
      for (let i = 0; i < m; i++) {
        const o = ((i - r + m) % m) * (TAU / m) + offset;
        sx += Math.sin(ring[i]!.a - o);
        sz += Math.cos(ring[i]!.a - o);
      }
      const base = Math.atan2(sx, sz);
      let cost = 0;
      const angles: number[] = [];
      for (let i = 0; i < m; i++) {
        const a = base + ((i - r + m) % m) * (TAU / m) + offset;
        angles.push(a);
        cost += angleDelta(ring[i]!.a, a) ** 2;
      }
      if (cost < best) {
        best = cost;
        bestAngles = angles;
      }
    }
    ring.forEach((p, i) => {
      if (!p.pinned) p.a = bestAngles[i]!;
    });
  };
  for (const [t, list] of groups) {
    if (list.length < 2) continue;
    const tt = world.req(t, Transform);
    list.sort((p, q) => p.d - q.d);
    const inner: Member[] = [];
    const outer: Member[] = [];
    let used = 0;
    for (const m of list) {
      const span = (m.w / m.ring) * 1.15;
      if (used + span <= TAU) {
        inner.push(m);
        used += span;
      } else {
        m.ring += 1.4 + m.w * 0.5;
        outer.push(m);
      }
    }
    spread(inner, 0);
    spread(outer, Math.PI / Math.max(1, outer.length));
    for (const m of list) {
      const x = tt.x + Math.sin(m.a) * m.ring;
      const z = tt.z + Math.cos(m.a) * m.ring;
      if (ctx.nav && !openAt(ctx.nav.grid, x, z)) continue;
      out.set(m.e, { x, z });
    }
  }
  return out;
}

/** Lost the target: walk to where it was last seen, look round, check a couple of spots nearby, give up. */
function search(ai: EnemyAIData, def: EnemyDef, tr: Transform, mover: Mover, ctx: GameContext, dt: number): boolean {
  const seen = ai.lastSeen!;
  const now = ctx.time;
  if (!ai.search) {
    if (now - seen.t > 6) return giveUp(ai);
    const spots = [{ x: seen.x, z: seen.z }];
    const cave = ctx.instance || !ctx.zone ? null : caveGrid(ctx.zone.def);
    for (let i = 0; i < 2; i++) {
      const a = cur.e * 2.39996 + i * 2.4;
      const x = seen.x + Math.sin(a) * 5;
      const z = seen.z + Math.cos(a) * 5;
      if (nav ? nearestOpen(nav.grid, x, z, 1) >= 0 : !cave || walkableAt(cave, x, z)) spots.push({ x, z });
    }
    ai.search = { spots, until: now + 10, look: 0 };
  }
  const s = ai.search;
  if (now > s.until || !s.spots.length) return giveUp(ai);
  ai.state = 'chase';
  if (s.look > 0) {
    // Look round.
    s.look -= dt;
    tr.facing = angleDelta(0, tr.facing + dt * 2.6 * (cur.e & 1 ? 1 : -1));
    ai.intent = { x: tr.x, z: tr.z, mode: 'search' };
    return true;
  }
  const spot = s.spots[0]!;
  if (Math.hypot(spot.x - tr.x, spot.z - tr.z) < 1.2) {
    s.spots.shift();
    s.look = 0.9;
    return true;
  }
  face(tr, spot.x, spot.z, def.turnRate, dt);
  walkTo(mover, tr, spot.x, spot.z, mover.speed * 0.6, 'search');
  return true;
}

function giveUp(ai: EnemyAIData): false {
  ai.search = undefined;
  ai.lastSeen = undefined;
  ai.path = undefined;
  ai.aggro = false;
  ai.state = 'idle';
  return false;
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
  // In a pack, take its place in the ring before swinging (a lone attacker just swings).
  const slot = slots.get(e);
  const placed = !slot || Math.hypot(slot.x - tr.x, slot.z - tr.z) < 0.6;
  if (dist <= atk.range + playerRadius * 0.5 && ai.cooldown <= 0 && placed) {
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
  closeIn(mover, tr, ptr, mover.speed, atk.range * 0.7);
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
  if (dist < 3) retreat(mover, tr, ptr, mover.speed * 0.6);
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
  // No shooting into rock: a gunner without a clear line first finds a spot that has one.
  const sight = canSee(tr, ptr);
  if (ai.cooldown <= 0 && dist <= Math.min(atk.maxRange, maxR + 2) && sight) {
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
  if (!sight && field && cellOf(field, tr.x, tr.z) >= 0) {
    // Down the firing-spot layer: the nearest place in sight of the target at gun range.
    const wp = downhill(field, snipeOf(field), tr.x, tr.z);
    if (wp) {
      drive(mover, tr, wp.x, wp.z, mover.speed, 'snipe');
      return;
    }
  }
  if (dist > maxR || !sight) {
    steer(mover, tr, ptr.x - tr.x, ptr.z - tr.z, mover.speed, 0);
  } else if (dist < minR) {
    // Back away slowly (melee classes can still catch a drone that crowds them), toward open ground.
    retreat(mover, tr, ptr, mover.speed * 0.5);
  } else {
    ai.strafeTimer -= dt;
    if (ai.strafeTimer <= 0) {
      ai.strafeTimer = ctx.rng.range(1.5, 3);
      ai.strafeDir = ctx.rng.chance(0.5) ? 1 : -1;
    }
    // Turn back before strafing into a wall or out of sight.
    const sx = tr.x - nz * ai.strafeDir * 1.5;
    const sz = tr.z + nx * ai.strafeDir * 1.5;
    if (nav && (!openAt(nav.grid, sx, sz) || !clearLine(nav.grid, sx, sz, ptr.x, ptr.z))) ai.strafeDir = ai.strafeDir === 1 ? -1 : 1;
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
    retreat(mover, tr, ptr, mover.speed);
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
  if (allies.length === 0) steer(mover, tr, cx - tr.x, cz - tr.z, mover.speed, 1.5);
  else if (Math.hypot(cx - tr.x, cz - tr.z) > 1.5) walkTo(mover, tr, cx, cz, mover.speed);
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
