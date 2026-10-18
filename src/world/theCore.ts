/**
 * The Core's mechanics (docs/regions/the-core.md):
 * - Energy bridges (Hanging Gardens): some switch off on a cycle, the last second of "on" flickers as a
 *   warning. Whoever stands on a bridge when it goes off is put on the nearest island edge (never hurt).
 * - Unstable Gravity (Gardens and Heart): a field shimmers for 1.5 s, then pulls everything inside for 4 s
 *   at about a third of walking speed. Walls and drops still block (the pull only moves things, the rock
 *   system keeps them on the ground), and bolts curve. `gravityPull` is the pure step.
 */
import { Collider, Dead, ForcedMove, Hazard, Mover, PlayerControlled, Projectile, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { CAVE_CELL, airAt, caveGrid, nearestWalkable, setBridges, type CaveGrid } from '../data/zones/caves';
import type { EnvFeature, ZoneDef } from '../data/zones/zoneTypes';
import type { ZoneRuntime } from './zone';

export const CORE_TUNING = {
  gravity: {
    /** Seconds of visible shimmer before the pull. */
    shimmer: 1.5,
    /** Seconds of pull. */
    pull: 4,
    /** Pull speed as a share of the creature's own walking speed. */
    speedShare: 1 / 3,
    /** Bolts inside a pulling field gain this much sideways speed per second (m/s²). */
    boltAccel: 9,
    /** How far an `abyss` field looks for the nearest drop (m). */
    lookFor: 70,
    /** Fields further than this from the player stay quiet. */
    range: 110,
    /** Drifting hazards (Shade Smelter's fire pools) slide at this speed (m/s) while a field pulls. */
    driftSpeed: 1.2,
  },
};

export type Gravity = Extract<EnvFeature, { kind: 'gravity' }>;
export type GravityPhase = 'idle' | 'shimmer' | 'pull';

export function gravityFields(def: Pick<ZoneDef, 'env'>): Gravity[] {
  return (def.env ?? []).filter((f): f is Gravity => f.kind === 'gravity');
}

export function inGravityField(f: Gravity, x: number, z: number): boolean {
  if (f.rect) return Math.abs(x - f.x) <= f.rect.hx && Math.abs(z - f.z) <= f.rect.hz;
  return Math.hypot(x - f.x, z - f.z) <= f.radius;
}

/** Where a field is in its cycle: idle, then 1.5 s of shimmer, then 4 s of pull, at the end of every period. */
export function gravityPhase(f: Gravity, time: number): { phase: GravityPhase; cycle: number; t: number } {
  const G = CORE_TUNING.gravity;
  const local = time + f.offset;
  const cycle = Math.floor(local / f.period);
  const t = local - cycle * f.period;
  const shimmerAt = f.period - G.shimmer - G.pull;
  const phase: GravityPhase = t < shimmerAt ? 'idle' : t < shimmerAt + G.shimmer ? 'shimmer' : 'pull';
  return { phase, cycle, t };
}

/** Unit vector from (x, z) towards the nearest open air within `maxRadius`, or null if there is none. */
export function towardsAbyss(grid: CaveGrid, x: number, z: number, maxRadius = CORE_TUNING.gravity.lookFor): { x: number; z: number } | null {
  const ci = Math.floor((x + grid.half) / grid.cell);
  const cj = Math.floor((z + grid.half) / grid.cell);
  const maxR = Math.ceil(maxRadius / grid.cell);
  for (let r = 1; r <= maxR; r++) {
    let best = Infinity;
    let bx = 0;
    let bz = 0;
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const px = (i + 0.5) * grid.cell - grid.half;
        const pz = (j + 0.5) * grid.cell - grid.half;
        if (!airAt(grid, px, pz)) continue;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < best) {
          best = d;
          bx = px - x;
          bz = pz - z;
        }
      }
    }
    if (best < Infinity) {
      const len = Math.sqrt(best) || 1;
      return { x: bx / len, z: bz / len };
    }
  }
  return null;
}

/**
 * The pull on something standing at (x, z) at `time`: the phase and a unit direction. Direction is zero unless
 * the field is pulling and the spot lies inside it. Deterministic: the same time and place give the same pull.
 */
export function gravityPull(f: Gravity, time: number, x: number, z: number, grid?: CaveGrid | null): { phase: GravityPhase; dx: number; dz: number } {
  const { phase, cycle } = gravityPhase(f, time);
  if (phase !== 'pull' || !inGravityField(f, x, z)) return { phase, dx: 0, dz: 0 };
  if (f.mode === 'rotate') {
    const a = (f.dir ?? 0) + cycle * (f.turn ?? Math.PI / 2);
    return { phase, dx: Math.sin(a), dz: Math.cos(a) };
  }
  const drop = grid ? towardsAbyss(grid, x, z) : null;
  if (drop) return { phase, dx: drop.x, dz: drop.z };
  const a = f.dir ?? 0;
  return { phase, dx: Math.sin(a), dz: Math.cos(a) };
}

export interface CoreState {
  /** Gravity field id → the cycle whose shimmer was already shown. */
  warned: Map<string, number>;
}

export function coreState(zone: ZoneRuntime): CoreState {
  return (zone.core ??= { warned: new Map() });
}

/** Gravity: shimmer telegraph, then the pull on creatures and bolts. Runs before the rock system. */
export function gravitySystem(world: World, dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone || ctx.instance) return;
  const fields = gravityFields(zone.def);
  if (!fields.length) return;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return;
  const pt = world.req(player, Transform);
  const G = CORE_TUNING.gravity;
  const st = coreState(zone);
  const grid = caveGrid(zone.def);
  const near = fields.filter((f) => Math.hypot(f.x - pt.x, f.z - pt.z) < G.range + f.radius);
  if (!near.length) return;

  for (const f of near) {
    const { phase, cycle } = gravityPhase(f, ctx.time);
    if (phase !== 'shimmer' || st.warned.get(f.id) === cycle) continue;
    st.warned.set(f.id, cycle);
    // Ground ripples and floating dust over the whole field.
    const shape = f.rect
      ? ({ kind: 'line', length: f.rect.hz * 2, width: f.rect.hx * 2, facing: 0 } as const)
      : ({ kind: 'circle', radius: f.radius } as const);
    ctx.events.push({ type: 'telegraph', owner: null, x: f.x, z: f.z, shape, duration: G.shimmer, color: '#b48cff' });
    ctx.events.push({ type: 'vfx', kind: 'dust', x: f.x, z: f.z, radius: f.radius, facing: 0 });
  }

  for (const e of world.query(Mover, Transform)) {
    if (world.has(e, Dead) || world.has(e, ForcedMove) || world.get(e, Collider)?.layer === 'air') continue;
    const tr = world.req(e, Transform);
    for (const f of near) {
      const pull = gravityPull(f, ctx.time, tr.x, tr.z, grid);
      if (pull.dx === 0 && pull.dz === 0) continue;
      const speed = world.req(e, Mover).speed * G.speedShare;
      tr.x += pull.dx * speed * dt;
      tr.z += pull.dz * speed * dt;
      break;
    }
  }
  // Fire pools left by shades slide along with the pull.
  for (const e of world.query(Hazard, Transform)) {
    if (!world.req(e, Hazard).drift) continue;
    const tr = world.req(e, Transform);
    for (const f of near) {
      const pull = gravityPull(f, ctx.time, tr.x, tr.z, grid);
      if (pull.dx === 0 && pull.dz === 0) continue;
      tr.prevX = tr.x;
      tr.prevZ = tr.z;
      tr.x += pull.dx * G.driftSpeed * dt;
      tr.z += pull.dz * G.driftSpeed * dt;
      break;
    }
  }
  for (const e of world.query(Projectile, Transform)) {
    const tr = world.req(e, Transform);
    const p = world.req(e, Projectile);
    for (const f of near) {
      const pull = gravityPull(f, ctx.time, tr.x, tr.z, grid);
      if (pull.dx === 0 && pull.dz === 0) continue;
      p.vx += pull.dx * G.boltAccel * dt;
      p.vz += pull.dz * G.boltAccel * dt;
      break;
    }
  }
}

/**
 * Energy bridges follow their cycle. Whoever stands on one when it goes off is put on the nearest
 * walkable spot (an island edge). Runs before the rock system.
 */
export function bridgeSystem(world: World, _dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone || ctx.instance) return;
  const grid = caveGrid(zone.def);
  if (!grid?.bridges?.length) return;
  const off = setBridges(grid, ctx.time);
  if (!off?.length) return;
  for (const e of world.query(Mover, Transform)) {
    const tr = world.req(e, Transform);
    if (nearBridge(grid, off, tr.x, tr.z)) pushOffBridge(grid, tr);
  }
}

function nearBridge(grid: CaveGrid, bridges: NonNullable<CaveGrid['bridges']>, x: number, z: number): boolean {
  const i = Math.floor((x + grid.half) / grid.cell);
  const j = Math.floor((z + grid.half) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.n || j >= grid.n) return false;
  const k = j * grid.n + i;
  return bridges.some((b) => b.cells.includes(k));
}

/** Put something that stands over a switched-off bridge on the nearest island edge. */
export function pushOffBridge(grid: CaveGrid, tr: Transform): boolean {
  const p = nearestWalkable(grid, tr.x, tr.z, CAVE_CELL * 60);
  if (!p) return false;
  tr.x = tr.prevX = p.x;
  tr.z = tr.prevZ = p.z;
  return true;
}
