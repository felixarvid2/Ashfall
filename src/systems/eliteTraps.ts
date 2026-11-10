/**
 * The two later elite affixes that act on the battlefield (docs/world-and-gameplay.md §8.3):
 * - Force Wall (A05): a short wall of energy raised between the elite and the player after a telegraph. It is a row of
 *   static colliders (so it blocks walking and the enemy navigation grid) that also stops every projectile, and it
 *   fades after `duration` seconds.
 * - Laser Grid (A06): beams turn out of the elite after a telegraph, rotating for a few seconds; touching one hurts.
 * `eliteTrapSystem` runs inside `eliteSystem` (src/systems/elites.ts).
 */
import { Collider, Dead, Elite, PlayerControlled, Renderable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import { defineComponent, type Entity, type World } from '../core/ecs';
import { AFFIX_TUNING } from '../data/elites';
import { applyDamage, targetState } from './combat';
import { computeTaken } from './damage';

/** One piece of a raised wall: it carries the lifetime; the pieces of a wall expire together. */
export interface Barrier {
  remaining: number;
  radius: number;
}
export const Barrier = defineComponent<Barrier>('Barrier');

/** A wall that has been telegraphed and is not up yet. */
export interface PendingWall {
  fuse: number;
  x: number;
  z: number;
  /** Direction along the wall. */
  facing: number;
}
export const PendingWall = defineComponent<PendingWall>('PendingWall');

/** On the elite while its grid runs. */
export interface LaserGridState {
  phase: 'warn' | 'fire';
  /** Seconds left in the phase. */
  t: number;
  angle: number;
  dir: 1 | -1;
  /** Time to the next damage check / next telegraph refresh. */
  hit: number;
  draw: number;
  dmg: number;
  level: number;
}
export const LaserGridState = defineComponent<LaserGridState>('LaserGridState');

const WALL_COLOR = '#6ac8ff';
const GRID_COLOR = '#ff3a5a';

// ---- Force Wall ---------------------------------------------------------------------------------

/** Telegraph a wall between the elite and the player; it appears after the warning. */
export function raiseForceWall(world: World, ctx: GameContext, elite: Entity, px: number, pz: number): void {
  const w = AFFIX_TUNING.forceWall;
  const tr = world.req(elite, Transform);
  const dx = px - tr.x;
  const dz = pz - tr.z;
  const dist = Math.hypot(dx, dz) || 1;
  const along = Math.max(2.5, Math.min(dist - 3, dist * w.standOff));
  const x = tr.x + (dx / dist) * along;
  const z = tr.z + (dz / dist) * along;
  // The wall runs across the line between them.
  const facing = Math.atan2(dx, dz) + Math.PI / 2;
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z));
  world.add(e, PendingWall, { fuse: w.warning, x, z, facing });
  ctx.events.push({
    type: 'telegraph',
    owner: null,
    x: x - (Math.sin(facing) * w.length) / 2,
    z: z - (Math.cos(facing) * w.length) / 2,
    shape: { kind: 'line', length: w.length, width: w.radius * 2, facing },
    duration: w.warning,
    color: WALL_COLOR,
  });
}

function buildWall(world: World, ctx: GameContext, p: PendingWall): void {
  const w = AFFIX_TUNING.forceWall;
  const n = Math.max(2, Math.round(w.length / w.step));
  const dx = Math.sin(p.facing);
  const dz = Math.cos(p.facing);
  for (let i = 0; i < n; i++) {
    const d = (i - (n - 1) / 2) * (w.length / n);
    const piece = world.create();
    world.add(piece, Transform, makeTransform(p.x + dx * d, 0, p.z + dz * d, p.facing));
    world.add(piece, Collider, { radius: w.radius, mass: Infinity, layer: 'ground', isStatic: true });
    world.add(piece, Barrier, { remaining: w.duration, radius: w.radius });
    // One glowing panel in the middle; the other pieces are invisible blockers.
    if (i === Math.floor(n / 2)) world.add(piece, Renderable, { assetId: 'prop.barricade', scale: 1.1, glow: WALL_COLOR });
  }
  ctx.events.push({ type: 'vfx', kind: 'shield', x: p.x, z: p.z, radius: w.length / 2, facing: 0 });
}

/** Does a shot at (x, z) of this radius hit a raised wall? (Called by the projectile system with the walls it found.) */
export function hitsBarrier(world: World, walls: readonly Entity[], x: number, z: number, radius: number): boolean {
  for (const e of walls) {
    const b = world.req(e, Barrier);
    const t = world.req(e, Transform);
    if (Math.hypot(t.x - x, t.z - z) < b.radius + radius) return true;
  }
  return false;
}

// ---- Laser Grid ---------------------------------------------------------------------------------

/** Start a grid on this elite: beams telegraphed first, spun up after. */
export function startLaserGrid(world: World, ctx: GameContext, elite: Entity, facing: number, dmg: number, level: number): void {
  const g = AFFIX_TUNING.laserGrid;
  world.add(elite, LaserGridState, { phase: 'warn', t: g.warning, angle: facing, dir: ctx.rng.chance(0.5) ? 1 : -1, hit: 0, draw: 0, dmg, level });
  drawBeams(world, ctx, elite, world.req(elite, LaserGridState), g.warning);
}

/** Beam directions (radians, 0 = +z) at the grid's current angle. */
export function beamAngles(angle: number): number[] {
  const n = AFFIX_TUNING.laserGrid.beams;
  return Array.from({ length: n }, (_, i) => angle + (i / n) * Math.PI * 2);
}

/** Distance from a point to a beam segment starting at (ox, oz). */
export function distanceToBeam(ox: number, oz: number, a: number, length: number, px: number, pz: number): number {
  const dx = Math.sin(a);
  const dz = Math.cos(a);
  const t = Math.max(0, Math.min(length, (px - ox) * dx + (pz - oz) * dz));
  return Math.hypot(px - (ox + dx * t), pz - (oz + dz * t));
}

function drawBeams(world: World, ctx: GameContext, elite: Entity, st: LaserGridState, duration: number): void {
  const g = AFFIX_TUNING.laserGrid;
  const tr = world.req(elite, Transform);
  for (const a of beamAngles(st.angle)) {
    ctx.events.push({ type: 'telegraph', owner: null, x: tr.x, z: tr.z, shape: { kind: 'line', length: g.length, width: g.width, facing: a }, duration, color: GRID_COLOR });
  }
}

// ---- The system ---------------------------------------------------------------------------------

export function eliteTrapSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(PendingWall)) {
    const p = world.req(e, PendingWall);
    if ((p.fuse -= dt) > 0) continue;
    buildWall(world, ctx, p);
    world.destroyDeferred(e);
  }
  for (const e of world.query(Barrier)) {
    const b = world.req(e, Barrier);
    if ((b.remaining -= dt) <= 0) world.destroyDeferred(e);
  }
  const g = AFFIX_TUNING.laserGrid;
  const player = world.first(PlayerControlled, Transform);
  for (const e of world.query(LaserGridState, Elite, Transform)) {
    const st = world.req(e, LaserGridState);
    if (world.has(e, Dead)) {
      world.remove(e, LaserGridState);
      continue;
    }
    st.t -= dt;
    if (st.phase === 'warn') {
      if (st.t <= 0) {
        st.phase = 'fire';
        st.t = g.duration;
      }
      continue;
    }
    if (st.t <= 0) {
      world.remove(e, LaserGridState);
      continue;
    }
    st.angle += st.dir * g.spin * dt;
    const tr = world.req(e, Transform);
    if ((st.draw -= dt) <= 0) {
      st.draw = 0.2;
      drawBeams(world, ctx, e, st, 0.3);
    }
    if ((st.hit -= dt) > 0 || player === undefined || world.has(player, Dead)) continue;
    st.hit = g.tick;
    const pt = world.req(player, Transform);
    if (beamAngles(st.angle).some((a) => distanceToBeam(tr.x, tr.z, a, g.length, pt.x, pt.z) < g.width / 2 + 0.4)) {
      const amount = st.dmg * g.dpsOfDamage * g.tick;
      const taken = computeTaken(amount, 'energy', targetState(world, player, 'ranged'), st.level).final;
      applyDamage(world, ctx, player, taken, { crit: false, damageType: 'energy', dot: true, sourceTeam: 'enemy', source: e });
    }
  }
}

