/**
 * Enemy wayfinding.
 *
 * One navigation grid around the player, rebuilt a few times a second while anything is hunting:
 * rock (the underground walkable grid) and static colliders (dungeon walls, crates, barricades,
 * rubble, boss gates) block cells; danger costs extra: the player's burning ground and spore clouds,
 * lit fuses, molten metal, a vent, a tunnel about to cave in, and (a little) wading water.
 *
 * On that grid each hunted target (the player, and the decoys and minions most enemies chase) gets a
 * flow field: a Dijkstra pass from the target gives every cell its walking cost. Three more layers
 * are worked out only when an enemy asks for them:
 *  - sight:  which cells see the target (rays cast out from it);
 *  - snipe:  walking cost to the nearest firing spot (in sight, at gun range) for gunners behind rock;
 *  - flee:   a "safety map" (the flow field scaled by −1.2 and relaxed again) that leads away from the
 *            target toward open ground instead of into a dead end.
 *
 * A* on the same grid takes an enemy anywhere else (a noise, the spot it last saw you, a search
 * point). Walking lines ("can I go straight there?") avoid danger as well as walls; sight lines only
 * care about rock and solid walls, not crates.
 */
import { Blast, Collider, Dead, EnemyAI, Hazard, PlayerControlled, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { caveGrid, walkableAt } from '../data/zones/caves';

export const NAV = {
  /** Cell size (m) and window half-size (cells) around the player. */
  cell: 1.5,
  half: 40,
  /** Seconds between rebuilds (sooner when the player crosses into another cell). */
  every: 0.3,
  /** Extra clearance around static colliders, so enemies don't graze corners. */
  clearance: 0.45,
  /** Colliders at least this wide (radius, m) also block sight; smaller props (crates) don't. */
  solid: 1,
  /** Flow fields at most: the player plus the decoys and minions most enemies are chasing. */
  maxTargets: 3,
  /** Extra cost of entering a dangerous cell (one plain step costs 10). */
  hazardCost: 90,
  waterCost: 6,
  /** Gunners behind rock look for a spot in sight of the target this far from it (m). */
  ring: [5, 11] as [number, number],
  /** Cells looked ahead along a field when choosing the next waypoint. */
  lookahead: 8,
  /** A* gives up after expanding this many cells. */
  maxSearch: 4000,
};

/** Why an enemy is heading where it is (the debug overlay colours it; tests read it). */
export type NavMode = 'direct' | 'field' | 'slot' | 'snipe' | 'flee' | 'path' | 'search' | 'escape';

/** Cell flags. */
const WALK = 1;
const SIGHT = 2;

export interface NavGrid {
  /** World position of cell (0, 0)'s corner. */
  x0: number;
  z0: number;
  /** Cells per side. */
  n: number;
  cell: number;
  /** Bit 1: can't walk here. Bit 2: blocks sight too (rock, walls). */
  blocked: Uint8Array;
  /** Extra cost of entering a cell (danger, water); 0 for plain ground. */
  cost: Uint8Array;
  builtAt: number;
}

export interface NavField extends NavGrid {
  grid: NavGrid;
  /** The entity the field leads to (null: a bare point, in tests), and where it stood. */
  target: Entity | null;
  origin: { x: number; z: number };
  /** Walking cost to the origin, 10 per straight cell (Infinity = unreachable). */
  dist: Float32Array;
  sight?: Uint8Array;
  snipe?: Float32Array;
  flee?: Float32Array;
}

export interface NavService {
  grid: NavGrid;
  /** One field per hunted target. */
  fields: Map<Entity, NavField>;
  player: NavField;
  /** Milliseconds the last rebuild took (debug overlay). */
  buildMs: number;
}

// ---- The system -------------------------------------------------------------------------------

/** Rebuild the grid and fields when they are stale. */
export function navigationSystem(world: World, _dt: number, ctx: GameContext): void {
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined || world.has(player, Dead)) {
    ctx.nav = undefined;
    return;
  }
  // Who is being hunted, and by how many.
  let hunting = false;
  const chased = new Map<Entity, number>();
  for (const e of world.query(EnemyAI)) {
    const ai = world.req(e, EnemyAI);
    if (!ai.aggro || world.has(e, Dead)) continue;
    hunting = true;
    const t = ai.chasing;
    if (t !== undefined && t !== player && world.isAlive(t) && world.has(t, Transform) && !world.has(t, Dead)) chased.set(t, (chased.get(t) ?? 0) + 1);
  }
  if (!hunting) {
    ctx.nav = undefined;
    return;
  }
  const others = [...chased].sort((a, b) => b[1] - a[1]).slice(0, NAV.maxTargets - 1).map(([t]) => t);
  const pt = world.req(player, Transform);
  const nav = ctx.nav;
  if (nav) {
    const age = ctx.time - nav.grid.builtAt;
    const o = nav.player.origin;
    const moved = Math.floor(pt.x / NAV.cell) !== Math.floor(o.x / NAV.cell) || Math.floor(pt.z / NAV.cell) !== Math.floor(o.z / NAV.cell);
    const newTarget = others.some((t) => !nav.fields.has(t));
    if (age < NAV.every / 3) return;
    if (age < NAV.every && !moved && !newTarget) return;
  }
  ctx.nav = buildNav(world, ctx, player, others);
}

export function buildNav(world: World, ctx: GameContext, player: Entity, others: readonly Entity[] = []): NavService {
  const t0 = performance.now();
  const pt = world.req(player, Transform);
  const grid = buildGrid(world, ctx, pt.x, pt.z);
  const fields = new Map<Entity, NavField>();
  const pf = fieldOn(grid, player, pt.x, pt.z);
  fields.set(player, pf);
  for (const t of others) {
    const tt = world.req(t, Transform);
    if (cellOf(grid, tt.x, tt.z) >= 0) fields.set(t, fieldOn(grid, t, tt.x, tt.z));
  }
  return { grid, fields, player: pf, buildMs: performance.now() - t0 };
}

/** A grid round (px, pz) with one field leading to that point (tests, tools). */
export function buildField(world: World, ctx: GameContext, px: number, pz: number): NavField {
  return fieldOn(buildGrid(world, ctx, px, pz), null, px, pz);
}

// ---- The grid ---------------------------------------------------------------------------------

const scratch: Entity[] = [];

export function buildGrid(world: World, ctx: GameContext, px: number, pz: number): NavGrid {
  const { cell, half } = NAV;
  const n = half * 2 + 1;
  const x0 = (Math.floor(px / cell) - half) * cell;
  const z0 = (Math.floor(pz / cell) - half) * cell;
  const blocked = new Uint8Array(n * n);
  const cost = new Uint8Array(n * n);
  const grid: NavGrid = { x0, z0, n, cell, blocked, cost, builtAt: ctx.time };
  // Rock.
  const cave = ctx.instance || !ctx.zone ? null : caveGrid(ctx.zone.def);
  if (cave) {
    for (let j = 0; j < n; j++) {
      const z = z0 + (j + 0.5) * cell;
      for (let i = 0; i < n; i++) if (!walkableAt(cave, x0 + (i + 0.5) * cell, z)) blocked[j * n + i] = WALK | SIGHT;
    }
  }
  // Static colliders: their footprint plus clearance can't be walked; big ones also block sight.
  const cx = x0 + (n * cell) / 2;
  const cz = z0 + (n * cell) / 2;
  for (const e of ctx.spatial.queryCircle(cx, cz, (n * cell) / 1.4, scratch)) {
    const c = world.get(e, Collider);
    if (!c || !c.isStatic || c.layer === 'air' || world.has(e, Dead)) continue;
    const t = world.req(e, Transform);
    stamp(grid, t.x, t.z, c.radius + NAV.clearance, (k) => (blocked[k]! |= WALK));
    if (c.radius >= NAV.solid) stamp(grid, t.x, t.z, c.radius, (k) => (blocked[k]! |= SIGHT));
  }
  // Danger.
  // Padded by a body's width so walkers pass the edge instead of grazing it.
  const danger = (x: number, z: number, r: number, add: number) =>
    stamp(grid, x, z, r + 1, (k) => (cost[k] = Math.min(255, Math.max(cost[k]!, add))));
  for (const e of world.query(Hazard, Transform)) {
    const h = world.req(e, Hazard);
    // Only what hurts enemies (the player's side); a ring that only hurts its outer band is skipped.
    if (h.team !== 'player' || h.inner !== undefined || world.has(e, Dead)) continue;
    const t = world.req(e, Transform);
    danger(t.x, t.z, h.radius, NAV.hazardCost);
  }
  for (const e of world.query(Blast, Transform)) {
    const b = world.req(e, Blast);
    if (!b.hurtsEnemies || b.fuse <= 0) continue;
    const t = world.req(e, Transform);
    danger(t.x, t.z, b.radius, NAV.hazardCost);
  }
  const env = ctx.instance ? ctx.instance.extra.env : ctx.zone?.def.env;
  const falling = ctx.instance ? undefined : ctx.zone?.underground?.caveIns;
  for (const f of env ?? []) {
    if (f.kind === 'molten' || f.kind === 'vent') danger(f.x, f.z, f.radius, NAV.hazardCost);
    else if (f.kind === 'water') danger(f.x, f.z, f.radius - 0.5, NAV.waterCost);
    else if (f.kind === 'caveIn' && falling?.get(f.id)?.fallsAt != null) danger(f.x, f.z, f.radius, NAV.hazardCost);
  }
  return grid;
}

/** Visit the cells whose centre lies within r of (x, z). */
function stamp(g: NavGrid, x: number, z: number, r: number, fn: (k: number) => void): void {
  const { x0, z0, n, cell } = g;
  const i0 = Math.max(0, Math.floor((x - r - x0) / cell));
  const i1 = Math.min(n - 1, Math.floor((x + r - x0) / cell));
  const j0 = Math.max(0, Math.floor((z - r - z0) / cell));
  const j1 = Math.min(n - 1, Math.floor((z + r - z0) / cell));
  const r2 = r * r;
  for (let j = j0; j <= j1; j++) {
    const dz = z0 + (j + 0.5) * cell - z;
    for (let i = i0; i <= i1; i++) {
      const dx = x0 + (i + 0.5) * cell - x;
      if (dx * dx + dz * dz <= r2) fn(j * n + i);
    }
  }
}

// ---- Fields -----------------------------------------------------------------------------------

const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
const STEP = [10, 10, 10, 10, 14, 14, 14, 14];

function fieldOn(grid: NavGrid, target: Entity | null, x: number, z: number): NavField {
  const dist = new Float32Array(grid.n * grid.n).fill(Infinity);
  const heap = new MinHeap();
  const k = cellOf(grid, x, z);
  if (k >= 0) {
    dist[k] = 0;
    heap.push(k, 0);
    relax(grid, dist, heap);
  }
  return { ...grid, grid, target, origin: { x, z }, dist };
}

/** Dijkstra from whatever is in the heap (8-way, no cutting blocked corners). */
function relax(g: NavGrid, dist: Float32Array, heap: MinHeap): void {
  const { n, blocked, cost } = g;
  while (heap.size) {
    const d = heap.topValue;
    const k = heap.pop();
    if (d > dist[k]!) continue;
    const i = k % n;
    const j = (k - i) / n;
    for (let s = 0; s < 8; s++) {
      const ni = i + DI[s]!;
      const nj = j + DJ[s]!;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nk = nj * n + ni;
      if (blocked[nk]! & WALK) continue;
      if (s >= 4 && (blocked[j * n + ni]! & WALK || blocked[nj * n + i]! & WALK)) continue;
      const nd = d + STEP[s]! + cost[nk]!;
      if (nd < dist[nk]!) {
        dist[nk] = nd;
        heap.push(nk, nd);
      }
    }
  }
}

/** Cells that can see the field's target: rays from the target to every cell on the window's edge. */
export function sightOf(f: NavField): Uint8Array {
  if (f.sight) return f.sight;
  const { n, cell, x0, z0, blocked } = f;
  const sight = new Uint8Array(n * n);
  const ox = (f.origin.x - x0) / cell;
  const oz = (f.origin.z - z0) / cell;
  const ray = (ex: number, ez: number) => {
    const dx = ex - ox;
    const dz = ez - oz;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) * 2);
    for (let s = 0; s <= steps; s++) {
      const i = Math.floor(ox + (dx * s) / steps);
      const j = Math.floor(oz + (dz * s) / steps);
      if (i < 0 || j < 0 || i >= n || j >= n) return;
      const k = j * n + i;
      if (blocked[k]! & SIGHT) return;
      sight[k] = 1;
    }
  };
  for (let t = 0; t < n; t++) {
    const c = t + 0.5;
    ray(c, 0.01);
    ray(c, n - 0.01);
    ray(0.01, c);
    ray(n - 0.01, c);
  }
  return (f.sight = sight);
}

/** Walking cost to the nearest firing spot: a reachable cell in sight of the target, at gun range. */
export function snipeOf(f: NavField): Float32Array {
  if (f.snipe) return f.snipe;
  const sight = sightOf(f);
  const { n, cell, x0, z0, blocked, dist } = f;
  const snipe = new Float32Array(n * n).fill(Infinity);
  const heap = new MinHeap();
  const [lo, hi] = NAV.ring;
  for (let k = 0; k < n * n; k++) {
    if (!sight[k] || blocked[k]! & WALK || !Number.isFinite(dist[k]!)) continue;
    const i = k % n;
    const j = (k - i) / n;
    const d = Math.hypot(x0 + (i + 0.5) * cell - f.origin.x, z0 + (j + 0.5) * cell - f.origin.z);
    if (d < lo || d > hi) continue;
    snipe[k] = 0;
    heap.push(k, 0);
  }
  relax(f, snipe, heap);
  return (f.snipe = snipe);
}

/** The safety map: lower is safer. Running downhill gets away from the target without cornering. */
export function fleeOf(f: NavField): Float32Array {
  if (f.flee) return f.flee;
  const { n, dist } = f;
  const flee = new Float32Array(n * n).fill(Infinity);
  const heap = new MinHeap();
  for (let k = 0; k < n * n; k++) {
    if (!Number.isFinite(dist[k]!)) continue;
    flee[k] = dist[k]! * -1.2;
    heap.push(k, flee[k]!);
  }
  relax(f, flee, heap);
  return (f.flee = flee);
}

// ---- Queries ----------------------------------------------------------------------------------

export function cellOf(g: NavGrid, x: number, z: number): number {
  const i = Math.floor((x - g.x0) / g.cell);
  const j = Math.floor((z - g.z0) / g.cell);
  if (i < 0 || j < 0 || i >= g.n || j >= g.n) return -1;
  return j * g.n + i;
}

export function centre(g: NavGrid, k: number): { x: number; z: number } {
  const i = k % g.n;
  const j = (k - i) / g.n;
  return { x: g.x0 + (i + 0.5) * g.cell, z: g.z0 + (j + 0.5) * g.cell };
}

/** Can one cell be walked? (Outside the window counts as open.) */
export function openAt(g: NavGrid, x: number, z: number): boolean {
  const k = cellOf(g, x, z);
  return k < 0 || !(g.blocked[k]! & WALK);
}

/** Is the straight line free of rock and solid walls (not crates)? */
export function clearLine(g: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  return line(g, ax, az, bx, bz, SIGHT, false);
}

/** Can an enemy walk the straight line: no blocked cells, and no danger it isn't already standing in? */
export function freeLine(g: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  return line(g, ax, az, bx, bz, WALK, true);
}

function line(g: NavGrid, ax: number, az: number, bx: number, bz: number, flag: number, careful: boolean): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len / (g.cell * 0.5));
  const end = cellOf(g, bx, bz);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const k = cellOf(g, ax + (bx - ax) * t, az + (bz - az) * t);
    if (k < 0) return true;
    if (g.blocked[k]! & flag) return false;
    // Don't stroll into fire on a straight line (the field finds the cheap way round, or the way out).
    // The first step is let off: it may stand on the edge of the danger already.
    if (careful && k !== end && g.cost[k]! >= NAV.hazardCost && t * len > g.cell) return false;
  }
  return true;
}

/** Can a point be seen from another? Uses the grid when both lie on it, else the rock alone. */
export function lineOfSight(ctx: GameContext, ax: number, az: number, bx: number, bz: number): boolean {
  const g = ctx.nav?.grid;
  if (g && cellOf(g, ax, az) >= 0 && cellOf(g, bx, bz) >= 0) return clearLine(g, ax, az, bx, bz);
  const cave = ctx.instance || !ctx.zone ? null : caveGrid(ctx.zone.def);
  if (!cave) return true;
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!walkableAt(cave, ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

/**
 * Where an enemy at (x, z) should head to reach the field's target: null when it can walk straight
 * there, otherwise a point down the flow field.
 */
export function nextWaypoint(f: NavField, x: number, z: number): { x: number; z: number } | null {
  if (freeLine(f, x, z, f.origin.x, f.origin.z)) return null;
  return downhill(f, f.dist, x, z);
}

/**
 * Follow a layer downhill from (x, z): walk up to `lookahead` cells and aim at the furthest one that
 * can be walked to in a straight line (string pulling). Null at the bottom or off the window.
 */
export function downhill(g: NavGrid, layer: Float32Array, x: number, z: number): { x: number; z: number } | null {
  let k = cellOf(g, x, z);
  if (k < 0) return null;
  // Standing in a blocked cell (grazing a wall): start from the best open neighbour.
  if (g.blocked[k]! & WALK || !Number.isFinite(layer[k]!)) {
    k = bestNeighbour(g, layer, k);
    if (k < 0) return null;
  }
  let target = k;
  let cur = k;
  for (let s = 0; s < NAV.lookahead; s++) {
    const next = bestNeighbour(g, layer, cur);
    if (next < 0 || layer[next]! >= layer[cur]!) break;
    cur = next;
    const p = centre(g, cur);
    if (freeLine(g, x, z, p.x, p.z)) target = cur;
    else break;
  }
  if (target !== k) return centre(g, target);
  const nb = bestNeighbour(g, layer, k);
  if (nb >= 0 && layer[nb]! < layer[k]!) return centre(g, nb);
  // At the bottom, or the cell itself is the way in: head for its centre.
  const c = centre(g, k);
  return Math.hypot(c.x - x, c.z - z) > g.cell * 0.35 && layer[k]! > 0 ? c : null;
}

/** The neighbouring cell a layer flows to from cell k (-1 at the bottom): the debug overlay's arrows. */
export const flowNext = (g: NavGrid, layer: Float32Array, k: number): number => bestNeighbour(g, layer, k);

function bestNeighbour(g: NavGrid, layer: Float32Array, k: number): number {
  const { n, blocked } = g;
  const i = k % n;
  const j = (k - i) / n;
  let best = -1;
  let bestD = blocked[k]! & WALK ? Infinity : layer[k]!;
  for (let s = 0; s < 8; s++) {
    const ni = i + DI[s]!;
    const nj = j + DJ[s]!;
    if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
    const nk = nj * n + ni;
    if (blocked[nk]! & WALK) continue;
    if (s >= 4 && (blocked[j * n + ni]! & WALK || blocked[nj * n + i]! & WALK)) continue;
    if (layer[nk]! < bestD) {
      bestD = layer[nk]!;
      best = nk;
    }
  }
  return best;
}

/** The open cell nearest to (x, z) within `radius` cells, or -1. */
export function nearestOpen(g: NavGrid, x: number, z: number, radius = 4): number {
  const k = cellOf(g, x, z);
  if (k >= 0 && !(g.blocked[k]! & WALK)) return k;
  const ci = Math.floor((x - g.x0) / g.cell);
  const cj = Math.floor((z - g.z0) / g.cell);
  let best = -1;
  let bestD = Infinity;
  for (let dj = -radius; dj <= radius; dj++) {
    for (let di = -radius; di <= radius; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= g.n || j >= g.n) continue;
      const nk = j * g.n + i;
      if (g.blocked[nk]! & WALK) continue;
      const d = di * di + dj * dj;
      if (d < bestD) {
        bestD = d;
        best = nk;
      }
    }
  }
  return best;
}

/**
 * A* from a to b on the grid (octile distance, danger costs), string-pulled into a few waypoints.
 * Null when b is off the window or can't be reached.
 */
export function findPath(g: NavGrid, ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] | null {
  const start = nearestOpen(g, ax, az, 2);
  const goal = nearestOpen(g, bx, bz, 4);
  if (start < 0 || goal < 0) return null;
  const { n, blocked, cost } = g;
  const gi = goal % n;
  const gj = (goal - gi) / n;
  const h = (k: number) => {
    const i = k % n;
    const j = (k - i) / n;
    const dx = Math.abs(i - gi);
    const dz = Math.abs(j - gj);
    return 10 * Math.max(dx, dz) + 4 * Math.min(dx, dz);
  };
  const gs = new Map<number, number>([[start, 0]]);
  const from = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new MinHeap();
  heap.push(start, h(start));
  let found = false;
  while (heap.size && closed.size < NAV.maxSearch) {
    const k = heap.pop();
    if (closed.has(k)) continue;
    if (k === goal) {
      found = true;
      break;
    }
    closed.add(k);
    const i = k % n;
    const j = (k - i) / n;
    const gk = gs.get(k)!;
    for (let s = 0; s < 8; s++) {
      const ni = i + DI[s]!;
      const nj = j + DJ[s]!;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nk = nj * n + ni;
      if (blocked[nk]! & WALK || closed.has(nk)) continue;
      if (s >= 4 && (blocked[j * n + ni]! & WALK || blocked[nj * n + i]! & WALK)) continue;
      const ng = gk + STEP[s]! + cost[nk]!;
      if (ng < (gs.get(nk) ?? Infinity)) {
        gs.set(nk, ng);
        from.set(nk, k);
        heap.push(nk, ng + h(nk));
      }
    }
  }
  if (!found) return null;
  const cells: number[] = [goal];
  for (let k = goal; k !== start; ) {
    k = from.get(k)!;
    cells.push(k);
  }
  cells.reverse();
  // String pulling: from each kept point, skip ahead to the furthest cell walkable in a straight line.
  const out: { x: number; z: number }[] = [];
  let px = ax;
  let pz = az;
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    for (; j > i + 1; j--) {
      const c = centre(g, cells[j]!);
      if (freeLine(g, px, pz, c.x, c.z)) break;
    }
    const c = centre(g, cells[j]!);
    out.push(c);
    px = c.x;
    pz = c.z;
    i = j;
  }
  if (!out.length) out.push(centre(g, goal));
  // End on the asked-for point itself when it is open.
  if (goal === cellOf(g, bx, bz)) out[out.length - 1] = { x: bx, z: bz };
  return out;
}

// ---- Heap -------------------------------------------------------------------------------------

/** A small binary heap of (cell, cost). */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  /** The smallest cost, read before pop(). */
  get topValue(): number {
    return this.vals[0]!;
  }
  push(k: number, v: number): void {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(k);
    vals.push(v);
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
  pop(): number {
    const keys = this.keys;
    const vals = this.vals;
    const top = keys[0]!;
    const k = keys.pop()!;
    const v = vals.pop()!;
    const n = keys.length;
    if (n) {
      let i = 0;
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
