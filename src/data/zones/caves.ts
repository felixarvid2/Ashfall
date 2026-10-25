/**
 * Underground zones (the Deep Mines): only the tunnels (the zone's roads) and the caverns are
 * walkable; everything else is solid rock. The walkable area is rasterised once into a grid that the
 * collision step, the renderer (rock walls) and the layout code share.
 */
import type { Road } from './zoneTypes';

export interface Cavern {
  x: number;
  z: number;
  radius: number;
}

/** An energy bridge (The Core, Hanging Gardens): a walkable strip that can switch on and off. */
export interface Bridge {
  id: string;
  a: [number, number];
  b: [number, number];
  width: number;
  /** Absent: always on. */
  cycle?: BridgeCycle;
}

/** Seconds on, then off; the last `flicker` seconds of "on" flicker as a warning. `offset` shifts the phase. */
export interface BridgeCycle {
  on: number;
  off: number;
  flicker: number;
  offset: number;
}

export interface CaveDef {
  /** Open caverns joined by the tunnels. */
  caverns: Cavern[];
  /** Carved out of the open ground again (melt pools); never walkable, bolts fly over them. */
  holes?: Cavern[];
  /** Where unwalkable ground is open air, not rock (abyss, melt pools): bolts fly over it and no rock wall is drawn. */
  abyss?: Cavern[];
  /** Energy bridges between islands. */
  bridges?: Bridge[];
}

export interface CaveGrid {
  /** Cell size in metres. */
  cell: number;
  /** Cells per side. */
  n: number;
  half: number;
  /** 1 = walkable, row-major from (−half, −half). */
  data: Uint8Array;
  /** 1 = unwalkable open air (abyss, melt pools): bolts pass, no rock is drawn. Absent in plain caves. */
  air?: Uint8Array;
  /** Energy bridges: the cells only they make walkable, and whether each is on right now. */
  bridges?: { def: Bridge; cells: Int32Array; on: boolean }[];
}

export const CAVE_CELL = 2;

/** What `caveGrid` reads: any zone or arena definition (an arena without roads or hubs rasterises just its caves). */
export interface CaveSource {
  halfSize: number;
  roads?: Road[];
  hubs?: { x: number; z: number; radius: number }[];
  caves?: CaveDef;
}

const cache = new WeakMap<object, CaveGrid>();

/** Rasterise tunnels, caverns and hubs into the walkable grid (cached per zone definition). */
export function caveGrid(def: CaveSource): CaveGrid | null {
  if (!def.caves) return null;
  const hit = cache.get(def);
  if (hit) return hit;
  const cell = CAVE_CELL;
  const half = def.halfSize;
  const n = Math.ceil((half * 2) / cell);
  const data = new Uint8Array(n * n);
  const circle = (cx: number, cz: number, r: number, v = 1) => {
    const i0 = Math.max(0, Math.floor((cx - r + half) / cell));
    const i1 = Math.min(n - 1, Math.floor((cx + r + half) / cell));
    const j0 = Math.max(0, Math.floor((cz - r + half) / cell));
    const j1 = Math.min(n - 1, Math.floor((cz + r + half) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * cell - half;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cell - half;
        if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) data[j * n + i] = v;
      }
    }
  };
  const capsule = (ax: number, az: number, bx: number, bz: number, r: number) => {
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r + half) / cell));
    const i1 = Math.min(n - 1, Math.floor((Math.max(ax, bx) + r + half) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r + half) / cell));
    const j1 = Math.min(n - 1, Math.floor((Math.max(az, bz) + r + half) / cell));
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * cell - half;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cell - half;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
        if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 <= r * r) data[j * n + i] = 1;
      }
    }
  };
  for (const road of def.roads ?? []) {
    for (let k = 0; k < road.points.length - 1; k++) {
      const [ax, az] = road.points[k]!;
      const [bx, bz] = road.points[k + 1]!;
      capsule(ax, az, bx, bz, road.width / 2 + 1);
    }
  }
  for (const c of def.caves.caverns) circle(c.x, c.z, c.radius);
  for (const h of def.hubs ?? []) circle(h.x, h.z, h.radius + 4);
  const grid: CaveGrid = { cell, n, half, data };
  // Melt pools: carved out of whatever was painted.
  for (const h of def.caves.holes ?? []) circle(h.x, h.z, h.radius, 0);
  if (def.caves.bridges?.length) {
    grid.bridges = [];
    for (const b of def.caves.bridges) {
      // Cells only this bridge opens (the ends lie on islands that are open anyway).
      const before = data.slice();
      capsule(b.a[0], b.a[1], b.b[0], b.b[1], b.width / 2);
      const cells: number[] = [];
      for (let k = 0; k < data.length; k++) if (data[k] && !before[k]) cells.push(k);
      grid.bridges.push({ def: b, cells: Int32Array.from(cells), on: true });
    }
  }
  if (def.caves.abyss || def.caves.holes || def.caves.bridges) {
    const air = new Uint8Array(n * n);
    const mark = (cx: number, cz: number, r: number) => {
      const i0 = Math.max(0, Math.floor((cx - r + half) / cell));
      const i1 = Math.min(n - 1, Math.floor((cx + r + half) / cell));
      const j0 = Math.max(0, Math.floor((cz - r + half) / cell));
      const j1 = Math.min(n - 1, Math.floor((cz + r + half) / cell));
      for (let j = j0; j <= j1; j++) {
        const z = (j + 0.5) * cell - half;
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) * cell - half;
          if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) air[j * n + i] = 1;
        }
      }
    };
    for (const c of def.caves.abyss ?? []) mark(c.x, c.z, c.radius);
    for (const c of def.caves.holes ?? []) mark(c.x, c.z, c.radius);
    for (let k = 0; k < air.length; k++) if (data[k]) air[k] = 0;
    grid.air = air;
  }
  // Start in the state the cycle has at time 0.
  setBridges(grid, 0);
  cache.set(def, grid);
  return grid;
}

export function walkableAt(grid: CaveGrid, x: number, z: number): boolean {
  const i = Math.floor((x + grid.half) / grid.cell);
  const j = Math.floor((z + grid.half) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.n || j >= grid.n) return false;
  return grid.data[j * grid.n + i] === 1;
}

/** Walkable with a margin: every point within `pad` metres (sampled on a ring) is walkable too. */
export function openAt(grid: CaveGrid, x: number, z: number, pad: number): boolean {
  if (!walkableAt(grid, x, z)) return false;
  if (pad <= 0) return true;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (!walkableAt(grid, x + Math.sin(a) * pad, z + Math.cos(a) * pad)) return false;
  }
  return true;
}

/** The closest walkable point (searching outward ring by ring), or null if there is none nearby. */
export function nearestWalkable(grid: CaveGrid, x: number, z: number, maxRadius = 40): { x: number; z: number } | null {
  if (walkableAt(grid, x, z)) return { x, z };
  const ci = Math.floor((x + grid.half) / grid.cell);
  const cj = Math.floor((z + grid.half) / grid.cell);
  const maxR = Math.ceil(maxRadius / grid.cell);
  for (let r = 1; r <= maxR; r++) {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        if (i < 0 || j < 0 || i >= grid.n || j >= grid.n || grid.data[j * grid.n + i] !== 1) continue;
        const px = (i + 0.5) * grid.cell - grid.half;
        const pz = (j + 0.5) * grid.cell - grid.half;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: px, z: pz };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

export function airAt(grid: CaveGrid, x: number, z: number): boolean {
  if (!grid.air) return false;
  const i = Math.floor((x + grid.half) / grid.cell);
  const j = Math.floor((z + grid.half) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.n || j >= grid.n) return false;
  return grid.air[j * grid.n + i] === 1;
}

/** Is this bridge on at `time`? `flicker` is true during the warning at the end of the "on" span. */
export function bridgeState(cycle: BridgeCycle | undefined, time: number): { on: boolean; flicker: boolean } {
  if (!cycle) return { on: true, flicker: false };
  const period = cycle.on + cycle.off;
  const t = (((time + cycle.offset) % period) + period) % period;
  return { on: t < cycle.on, flicker: t >= cycle.on - cycle.flicker && t < cycle.on };
}

/**
 * Switch the grid's bridges to their state at `time` (the grid is shared and cached: this changes
 * it in place). Returns the bridges that just went off, so whoever stands on them can be moved.
 */
export function setBridges(grid: CaveGrid, time: number): CaveGrid['bridges'] {
  const switchedOff: NonNullable<CaveGrid['bridges']> = [];
  for (const b of grid.bridges ?? []) {
    const on = bridgeState(b.def.cycle, time).on;
    if (on === b.on) continue;
    b.on = on;
    for (const k of b.cells) {
      grid.data[k] = on ? 1 : 0;
      if (grid.air) grid.air[k] = on ? 0 : 1;
    }
    if (!on) switchedOff.push(b);
  }
  return switchedOff;
}

/** The grid as drawn: every bridge cell is open air (bridges are drawn on top as light). */
export function bridgeCellsOf(grid: CaveGrid): Set<number> {
  const out = new Set<number>();
  for (const b of grid.bridges ?? []) for (const k of b.cells) out.add(k);
  return out;
}
