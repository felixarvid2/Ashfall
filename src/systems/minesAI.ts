/**
 * Deep Mines behaviours (docs/regions/deep-mines.md), on top of the shared enemy AI:
 * burrowing ambushers, teleporting Echoes, dynamite, drones that harden allies, shield domes,
 * and hounds that hunt by sound. Combat-side rules (reflect, crystal shells, light vulnerability,
 * domes) live in combat.ts next to the hit they change.
 */
import { Blast, CombatStats, Dead, EnemyAI, Health, PlayerControlled, Transform, makeTransform, type EnemyAI as EnemyAIData, type Mover } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { EnemyDef } from '../data/schemas';
import { caveGrid, nearestWalkable, walkableAt } from '../data/zones/caves';
import { applyStatus } from './combat';
import { livingInCircle } from './targeting';
import { walkTo } from './enemyAI';

/** How close a Blind Hound must be to notice someone without a sound to follow. */
export const HEARING = { notice: 6, noiseRange: 34, confuse: 14 };

function grid(ctx: GameContext) {
  return ctx.zone && !ctx.instance ? caveGrid(ctx.zone.def) : null;
}

/** Freshest noise this hound can hear, if any. */
export function heardNoise(ctx: GameContext, x: number, z: number, range: number): { x: number; z: number } | null {
  const noises = ctx.zone?.underground?.noises ?? [];
  let best: { x: number; z: number } | null = null;
  let bestD = range;
  for (const n of noises) {
    if (n.until <= ctx.time) continue;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/**
 * Runs before the normal attack logic. Returns true when it has taken control of the enemy this
 * tick (underground, teleporting, running to a noise).
 */
export function minesBehaviours(world: World, ctx: GameContext, e: Entity, ai: EnemyAIData, def: EnemyDef, tr: Transform, mover: Mover, dt: number): boolean {
  const level = world.get(e, CombatStats)?.level ?? 1;
  const player = world.first(PlayerControlled, Transform);
  const ptr = player !== undefined && !world.has(player, Dead) ? world.req(player, Transform) : null;

  if (def.shell && ai.shell === undefined) ai.shell = world.req(e, Health).max * def.shell.fraction;

  if (def.shieldAlly && ai.aggro) {
    const s = def.shieldAlly;
    ai.shieldAllyTimer = (ai.shieldAllyTimer ?? s.every * 0.5) - dt;
    if (ai.shieldAllyTimer <= 0) {
      ai.shieldAllyTimer = s.every;
      let best: Entity | null = null;
      let bestD = Infinity;
      for (const ally of livingInCircle(world, ctx, tr.x, tr.z, s.radius, 'enemy')) {
        if (ally === e || !world.has(ally, EnemyAI)) continue;
        const at = world.req(ally, Transform);
        const d = Math.hypot(at.x - tr.x, at.z - tr.z);
        if (d < bestD) {
          bestD = d;
          best = ally;
        }
      }
      if (best !== null) {
        applyStatus(world, ctx, best, { status: 'chitin', duration: s.duration }, { team: 'enemy', level });
        const bt = world.req(best, Transform);
        ctx.events.push({ type: 'vfx', kind: 'shield', x: bt.x, z: bt.z, radius: 1.4, facing: 0 });
      }
    }
  }

  if (def.dome && ai.aggro) {
    const d = def.dome;
    ai.domeTimer = (ai.domeTimer ?? d.every * 0.3) - dt;
    if (ai.domeTimer <= 0) {
      ai.domeTimer = d.every;
      ai.domeUntil = ctx.time + d.duration;
      ctx.events.push({ type: 'telegraph', owner: e, x: tr.x, z: tr.z, shape: { kind: 'circle', radius: d.radius }, duration: d.duration, color: '#6ab8ff' });
      ctx.events.push({ type: 'vfx', kind: 'shield', x: tr.x, z: tr.z, radius: d.radius, facing: 0 });
    }
  }

  if (def.dynamite) {
    const d = def.dynamite;
    ai.bombs ??= [];
    for (const b of ai.bombs) b.t -= dt;
    for (const b of ai.bombs.filter((q) => q.t <= 0)) {
      const blast = world.create();
      world.add(blast, Transform, makeTransform(b.x, 0, b.z));
      const weapon = world.get(e, CombatStats)?.weaponDamage ?? 20;
      world.add(blast, Blast, { fuse: 0, radius: d.radius, owner: null, coefficient: 0, flat: 0, hurtsEnemies: false, player: { fraction: 0, damage: weapon * d.coefficient, level } });
      ctx.events.push({ type: 'vfx', kind: 'explosion', x: b.x, z: b.z, radius: d.radius, facing: 0 });
      const st = ctx.zone?.underground;
      if (st) st.noises.push({ x: b.x, z: b.z, until: ctx.time + 5 });
    }
    ai.bombs = ai.bombs.filter((q) => q.t > 0);
    ai.dynamiteTimer = (ai.dynamiteTimer ?? d.every * 0.5) - dt;
    if (ai.aggro && ai.dynamiteTimer <= 0 && ptr && Math.hypot(ptr.x - tr.x, ptr.z - tr.z) <= d.range) {
      ai.dynamiteTimer = d.every;
      ai.bombs.push({ x: ptr.x, z: ptr.z, t: d.fuse });
      ctx.events.push({ type: 'telegraph', owner: null, x: ptr.x, z: ptr.z, shape: { kind: 'circle', radius: d.radius }, duration: d.fuse, color: '#ffb23a' });
    }
  }

  if (def.teleport && ai.aggro && ptr) {
    const t = def.teleport;
    ai.teleportTimer = (ai.teleportTimer ?? t.every * ctx.rng.range(0.4, 1)) - dt;
    const d = Math.hypot(ptr.x - tr.x, ptr.z - tr.z);
    if (ai.teleportTimer <= 0 && d <= t.range && d > 3 && ai.state !== 'windup') {
      ai.teleportTimer = t.every;
      const a = ctx.rng.range(0, Math.PI * 2);
      let x = ptr.x + Math.sin(a) * 2.4;
      let z = ptr.z + Math.cos(a) * 2.4;
      const g = grid(ctx);
      if (g && !walkableAt(g, x, z)) ({ x, z } = nearestWalkable(g, x, z, 8) ?? { x: tr.x, z: tr.z });
      ctx.events.push({ type: 'vfx', kind: 'blink', x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
      tr.x = tr.prevX = x;
      tr.z = tr.prevZ = z;
      ctx.events.push({ type: 'vfx', kind: 'blink', x, z, radius: 1.2, facing: 0 });
      return true;
    }
  }

  if (def.burrow && ai.aggro && ptr) return burrow(world, ctx, e, ai, def.burrow, tr, mover, ptr, level, dt);

  // Blind Hounds go for fresh noise nearby instead of a target that is not right next to them.
  if (def.hearing) {
    const noise = heardNoise(ctx, tr.x, tr.z, ai.aggro ? HEARING.confuse : HEARING.noiseRange);
    const near = ptr ? Math.hypot(ptr.x - tr.x, ptr.z - tr.z) : Infinity;
    if (noise && near > 4) {
      ai.investigate = { x: noise.x, z: noise.z };
    }
    if (ai.investigate) {
      const dx = ai.investigate.x - tr.x;
      const dz = ai.investigate.z - tr.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5 || near <= 4) ai.investigate = undefined;
      else {
        ai.state = 'chase';
        // Round the rock to the noise, not into it.
        walkTo(mover, tr, ai.investigate.x, ai.investigate.z, mover.speed);
        tr.facing = Math.atan2(dx, dz);
        return true;
      }
    }
  }
  return false;
}

/** Burrowers dive, travel under the target, warn, and burst up with a bite; then fight a while. */
function burrow(
  world: World,
  ctx: GameContext,
  e: Entity,
  ai: EnemyAIData,
  b: NonNullable<EnemyDef['burrow']>,
  tr: Transform,
  mover: Mover,
  ptr: Transform,
  level: number,
  dt: number,
): boolean {
  if (!ai.burrowed) {
    ai.burrowTimer = (ai.burrowTimer ?? b.surfaced * 0.3) - dt;
    if (ai.burrowTimer > 0) return false;
    ai.burrowed = true;
    ai.surfaceAt = null;
    ai.state = 'idle';
    tr.y = tr.prevY = -3;
    ctx.events.push({ type: 'vfx', kind: 'dust', x: tr.x, z: tr.z, radius: 1.6, facing: 0 });
    return true;
  }
  if (!ai.surfaceAt) {
    // Travel underground toward the target; a dust trail gives it away.
    const dx = ptr.x - tr.x;
    const dz = ptr.z - tr.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2) {
      mover.vx = (dx / dist) * b.speed;
      mover.vz = (dz / dist) * b.speed;
      if (ctx.rng.next() < dt * 3) ctx.events.push({ type: 'vfx', kind: 'dust', x: tr.x, z: tr.z, radius: 0.8, facing: 0 });
    }
    if (dist < 2.5) {
      ai.surfaceAt = { x: ptr.x, z: ptr.z, t: b.warning };
      ctx.events.push({ type: 'telegraph', owner: null, x: ptr.x, z: ptr.z, shape: { kind: 'circle', radius: b.radius }, duration: b.warning, color: '#c8a070' });
    }
    return true;
  }
  ai.surfaceAt.t -= dt;
  if (ai.surfaceAt.t > 0) return true;
  // Up: everything on the player's side in the circle is bitten.
  const at = ai.surfaceAt;
  tr.x = tr.prevX = at.x;
  tr.z = tr.prevZ = at.z;
  tr.y = tr.prevY = 0;
  ai.burrowed = false;
  ai.surfaceAt = null;
  ai.burrowTimer = b.every;
  const weapon = world.get(e, CombatStats)?.weaponDamage ?? 20;
  const blast = world.create();
  world.add(blast, Transform, makeTransform(at.x, 0, at.z));
  world.add(blast, Blast, { fuse: 0, radius: b.radius, owner: null, coefficient: 0, flat: 0, hurtsEnemies: false, player: { fraction: 0, damage: weapon * b.coefficient, level } });
  ctx.events.push({ type: 'vfx', kind: 'raise', x: at.x, z: at.z, radius: b.radius, facing: 0 });
  ctx.events.push({ type: 'shake', trauma: 0.25 });
  return true;
}

/** Underground burrowers cannot be hit (they also have no collider while down). */
export function isBurrowed(world: World, e: Entity): boolean {
  return world.get(e, EnemyAI)?.burrowed === true;
}
