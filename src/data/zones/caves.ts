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

export interface CaveDef {
  /** Open caverns joined by the tunnels. */
  caverns: Cavern[];
}

export interface CaveGrid {
  /** Cell size in metres. */
  cell: number;
  /** Cells per side. */
  n: number;
  half: number;
  /** 1 = walkable, row-major from (−half, −half). */
  data: Uint8Array;
}

export const CAVE_CELL = 2;

interface CaveSource {
  halfSize: number;
  roads: Road[];
  hubs: { x: number; z: number; radius: number }[];
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
  const circle = (cx: number, cz: number, r: number) => {
    const i0 = Math.max(0, Math.floor((cx - r + half) / cell));
    const i1 = Math.min(n - 1, Math.floor((cx + r + half) / cell));
    const j0 = Math.max(0, Math.floor((cz - r + half) / cell));
    const j1 = Math.min(n - 1, Math.floor((cz + r + half) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * cell - half;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cell - half;
        if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) data[j * n + i] = 1;
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
  for (const road of def.roads) {
    for (let k = 0; k < road.points.length - 1; k++) {
      const [ax, az] = road.points[k]!;
      const [bx, bz] = road.points[k + 1]!;
      capsule(ax, az, bx, bz, road.width / 2 + 1);
    }
  }
  for (const c of def.caves.caverns) circle(c.x, c.z, c.radius);
  for (const h of def.hubs) circle(h.x, h.z, h.radius + 4);
  const grid = { cell, n, half, data };
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
