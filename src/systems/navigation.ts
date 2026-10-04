/**
 * Enemy pathfinding: a flow field around the player, rebuilt a few times a second. Rock (the
 * underground walkable grid) and static colliders (dungeon walls, crates, barricades, rubble) block
 * cells; a Dijkstra pass from the player's cell gives every reachable cell its walking distance.
 * An enemy chasing the player walks straight at them while it has a clear line; otherwise it follows
 * the field down toward the player, round corners and along winding tunnels.
 */
import { Collider, Dead, EnemyAI, PlayerControlled, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { caveGrid, walkableAt } from '../data/zones/caves';

export const NAV = {
  /** Cell size (m) and window half-size (cells) around the player. */
  cell: 1.5,
  half: 36,
  /** Seconds between rebuilds (sooner when the player crosses into another cell). */
  every: 0.3,
  /** Extra clearance around static colliders, so enemies don't graze corners. */
  clearance: 0.45,
};

export interface NavField {
  /** World position of cell (0, 0)'s corner. */
  x0: number;
  z0: number;
  /** Cells per side. */
  n: number;
  cell: number;
  /** 1 = blocked. */
  blocked: Uint8Array;
  /** Walking distance to the origin in cells × 10 (Infinity = unreachable). */
  dist: Float32Array;
  /** The player the field leads to, and where they stood when it was built. */
  origin: { x: number; z: number };
  builtAt: number;
}

const scratch: Entity[] = [];

/** Rebuild the field around the player when it is stale. */
export function navigationSystem(world: World, _dt: number, ctx: GameContext): void {
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined || world.has(player, Dead)) {
    ctx.nav = undefined;
    return;
  }
  // Nothing is chasing anyone: no field needed.
  if (!world.query(EnemyAI).some((e) => world.req(e, EnemyAI).aggro && !world.has(e, Dead))) {
    ctx.nav = undefined;
    return;
  }
  const pt = world.req(player, Transform);
  const f = ctx.nav;
  const moved = !f || Math.floor(pt.x / NAV.cell) !== Math.floor(f.origin.x / NAV.cell) || Math.floor(pt.z / NAV.cell) !== Math.floor(f.origin.z / NAV.cell);
  if (f && !moved && ctx.time - f.builtAt < NAV.every) return;
  if (f && moved && ctx.time - f.builtAt < NAV.every / 3) return;
  ctx.nav = buildField(world, ctx, pt.x, pt.z);
}

export function buildField(world: World, ctx: GameContext, px: number, pz: number): NavField {
  const { cell, half } = NAV;
  const n = half * 2 + 1;
  const ci = Math.floor(px / cell);
  const cj = Math.floor(pz / cell);
  const x0 = (ci - half) * cell;
  const z0 = (cj - half) * cell;
  const blocked = new Uint8Array(n * n);
  // Rock.
  const cave = ctx.instance || !ctx.zone ? null : caveGrid(ctx.zone.def);
  if (cave) {
    for (let j = 0; j < n; j++) {
      const z = z0 + (j + 0.5) * cell;
      for (let i = 0; i < n; i++) if (!walkableAt(cave, x0 + (i + 0.5) * cell, z)) blocked[j * n + i] = 1;
    }
  }
  // Static colliders in the window.
  const cx = x0 + (n * cell) / 2;
  const cz = z0 + (n * cell) / 2;
  for (const e of ctx.spatial.queryCircle(cx, cz, (n * cell) / 1.4, scratch)) {
    const c = world.get(e, Collider);
    if (!c || !c.isStatic || world.has(e, Dead)) continue;
    const t = world.req(e, Transform);
    const r = c.radius + NAV.clearance;
    const i0 = Math.max(0, Math.floor((t.x - r - x0) / cell));
    const i1 = Math.min(n - 1, Math.floor((t.x + r - x0) / cell));
    const j0 = Math.max(0, Math.floor((t.z - r - z0) / cell));
    const j1 = Math.min(n - 1, Math.floor((t.z + r - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * cell;
        if ((x - t.x) ** 2 + (z - t.z) ** 2 <= r * r) blocked[j * n + i] = 1;
      }
    }
  }
  // Dijkstra from the player's cell (8-way, no cutting blocked corners).
  const dist = new Float32Array(n * n).fill(Infinity);
  const start = half * n + half;
  dist[start] = 0;
  const heap = new MinHeap();
  heap.push(start, 0);
  const steps: [number, number, number][] = [
    [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
    [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
  ];
  while (heap.size) {
    const [k, d] = heap.pop();
    if (d > dist[k]!) continue;
    const i = k % n;
    const j = (k - i) / n;
    for (const [di, dj, cost] of steps) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nk = nj * n + ni;
      if (blocked[nk]) continue;
      if (di !== 0 && dj !== 0 && (blocked[j * n + ni] || blocked[nj * n + i])) continue;
      const nd = d + cost;
      if (nd < dist[nk]!) {
        dist[nk] = nd;
        heap.push(nk, nd);
      }
    }
  }
  return { x0, z0, n, cell, blocked, dist, origin: { x: px, z: pz }, builtAt: ctx.time };
}

function cellOf(f: NavField, x: number, z: number): number {
  const i = Math.floor((x - f.x0) / f.cell);
  const j = Math.floor((z - f.z0) / f.cell);
  if (i < 0 || j < 0 || i >= f.n || j >= f.n) return -1;
  return j * f.n + i;
}

/** Is the straight line between two points free of blocked cells? */
export function clearLine(f: NavField, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len / (f.cell * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const k = cellOf(f, ax + (bx - ax) * t, az + (bz - az) * t);
    if (k < 0) return true;
    if (f.blocked[k]) return false;
  }
  return true;
}

/**
 * Where an enemy at (x, z) should head to reach the field's origin: the origin itself when the way
 * is clear, otherwise a point a few cells down the flow field. Null when the field can't help (out
 * of the window or unreachable): walk straight.
 */
export function nextWaypoint(f: NavField, x: number, z: number): { x: number; z: number } | null {
  if (clearLine(f, x, z, f.origin.x, f.origin.z)) return null;
  let k = cellOf(f, x, z);
  if (k < 0) return null;
  // Standing in a blocked cell (grazing a wall): start from the best open neighbour.
  if (f.blocked[k] || !Number.isFinite(f.dist[k]!)) {
    k = bestNeighbour(f, k);
    if (k < 0) return null;
  }
  // Walk down the field a few cells and aim at the furthest one still in sight.
  let target = k;
  let cur = k;
  for (let s = 0; s < 4; s++) {
    const next = bestNeighbour(f, cur);
    if (next < 0 || f.dist[next]! >= f.dist[cur]!) break;
    cur = next;
    const p = centre(f, cur);
    if (clearLine(f, x, z, p.x, p.z)) target = cur;
    else break;
  }
  if (target !== k) return centre(f, target);
  const nb = bestNeighbour(f, k);
  return nb >= 0 ? centre(f, nb) : null;
}

function bestNeighbour(f: NavField, k: number): number {
  const i = k % f.n;
  const j = (k - i) / f.n;
  let best = -1;
  let bestD = f.blocked[k] ? Infinity : f.dist[k]!;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= f.n || nj >= f.n) continue;
      const nk = nj * f.n + ni;
      if (f.blocked[nk]) continue;
      if (di && dj && (f.blocked[j * f.n + ni] || f.blocked[nj * f.n + i])) continue;
      if (f.dist[nk]! < bestD) {
        bestD = f.dist[nk]!;
        best = nk;
      }
    }
  }
  return best;
}

function centre(f: NavField, k: number): { x: number; z: number } {
  const i = k % f.n;
  const j = (k - i) / f.n;
  return { x: f.x0 + (i + 0.5) * f.cell, z: f.z0 + (j + 0.5) * f.cell };
}

/** A small binary heap of (cell, distance). */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, v: number): void {
    const keys = this.keys;
    const vals = this.vals;
    keys.push(k);
    vals.push(v);
    let i = keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (vals[p]! <= v) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  pop(): [number, number] {
    const keys = this.keys;
    const vals = this.vals;
    const top: [number, number] = [keys[0]!, vals[0]!];
    const k = keys.pop()!;
    const v = vals.pop()!;
    if (keys.length) {
      let i = 0;
      const n = keys.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mv = v;
        if (l < n && vals[l]! < mv) {
          m = l;
          mv = vals[l]!;
        }
        if (r < n && vals[r]! < mv) m = r;
        if (m === i) break;
        keys[i] = keys[m]!;
        vals[i] = vals[m]!;
        i = m;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }
}
