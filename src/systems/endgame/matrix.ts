/**
 * Neural Matrix and glyphs (docs/endgame.md): paragon progression after level 50. This file is the
 * shared entry point other endgame systems call (Deep Rifts upgrade glyphs, bosses grant them).
 *
 * State lives on `ctx.endgame` (saved with the character):
 *   matrixXp      progress towards the next point
 *   matrixPoints  points to spend (unspent); points ever earned = matrixPoints + nodes.length
 *   nodes         allocated node ids (the start node is free and implicit)
 *   boards        attached boards: { id, rotation (degrees), gate (the host's gate node) }
 *   glyphs        owned glyphs: { id, level, socket? (a socket node id) }
 * Respec (refund all) clears `nodes` and unsockets the glyphs but keeps the boards attached.
 */
import type { GameContext } from '../../core/context';
import { SaveDataSchema } from '../../core/save';
import type { Effect } from '../../data/effects';
import {
  BOARDS,
  BOARD_CENTER,
  BOARD_IDS,
  GLYPH_DEFS,
  GLYPH_LEVEL_SCALE,
  GLYPH_MAX_LEVEL,
  GLYPH_RADIUS,
  GLYPH_RIFT_DIVISOR,
  GLYPH_UPGRADE_FALLOFF,
  GLYPH_UPGRADE_FLOOR,
  MATRIX_COST,
  MATRIX_MAX_POINTS,
  MATRIX_NODES,
  MATRIX_RESPEC_GOLD,
  START_NODE,
  STARTER_GLYPHS,
  gateId,
  type GlyphDef,
  type MatrixNodeDef,
} from '../../data/endgame/matrix';
import { PROGRESSION } from '../../data/loot/db';
import type { StatKey } from '../../data/loot/schemas';
import { xpToNext } from '../loot/generate';

export type EndgameState = NonNullable<GameContext['endgame']>;
type BoardState = EndgameState['boards'][number];
type GlyphState = EndgameState['glyphs'][number];

/** The character's endgame state, created on first use (new characters start without one). */
export function ensureEndgame(ctx: GameContext): EndgameState {
  ctx.endgame ??= SaveDataSchema.shape.endgame.parse(undefined);
  return ctx.endgame;
}

// ---- Matrix experience --------------------------------------------------------------------------------

/** Points earned so far (spent and unspent). */
export function pointsEarned(e: EndgameState): number {
  return e.matrixPoints + e.nodes.length;
}

/** XP for the next point once `earned` points exist: 60 % of the last campaign level's XP, +2 % of that per point. */
export function matrixPointCost(earned: number): number {
  const lastLevel = xpToNext(PROGRESSION.maxLevel - 1);
  return Math.round(lastLevel * MATRIX_COST.base * (1 + MATRIX_COST.step * earned));
}

/** Adds experience past the level cap. Returns the points gained. */
export function grantMatrixXp(ctx: GameContext, amount: number): number {
  if (!(amount > 0)) return 0;
  const e = ensureEndgame(ctx);
  ensureMatrixStarted(ctx);
  if (pointsEarned(e) >= MATRIX_MAX_POINTS) {
    e.matrixXp = 0;
    return 0;
  }
  e.matrixXp += amount;
  let gained = 0;
  while (pointsEarned(e) < MATRIX_MAX_POINTS && e.matrixXp >= matrixPointCost(pointsEarned(e))) {
    e.matrixXp -= matrixPointCost(pointsEarned(e));
    e.matrixPoints++;
    gained++;
  }
  if (pointsEarned(e) >= MATRIX_MAX_POINTS) e.matrixXp = 0;
  if (gained > 0) {
    ctx.events.push({ type: 'banner', key: 'matrix.pointBanner', params: { points: gained, total: pointsEarned(e) }, seconds: 2.5 });
  }
  return gained;
}

/**
 * First time a character is at the level cap: the starting board is laid out and the first three glyphs
 * are given so the board is usable before any Deep Rift. Safe to call again.
 */
export function ensureMatrixStarted(ctx: GameContext): void {
  const e = ensureEndgame(ctx);
  if (e.boards.some((b) => b.id === 'start')) return;
  e.boards.unshift({ id: 'start', rotation: 0 });
  for (const id of STARTER_GLYPHS) grantGlyph(ctx, id, false);
}

// ---- Layout -------------------------------------------------------------------------------------------

/** Unit steps for the sides north, east, south, west. */
const SIDE_STEP: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
/** Distance between the centres of two attached boards: 4 + 1 (gap) + 1 (gap) + 4. */
const BOARD_PITCH = 10;

export interface Placement {
  id: string;
  /** Quarter turns clockwise (0–3). */
  turns: number;
  /** Centre cell of the board in matrix space (the start board is at 0,0). */
  cx: number;
  cy: number;
  /** The host's gate node this board hangs on; absent on the starting board. */
  gate?: string;
  /** Its own gate node facing the host. */
  entry?: string;
}

export type Layout = Map<string, Placement>;

function turnsOf(rotation: number): number {
  return ((Math.round(rotation / 90) % 4) + 4) % 4;
}

/** Rotates a board-local offset from the centre clockwise by `turns` quarter turns. */
function rotate(dx: number, dy: number, turns: number): [number, number] {
  let x = dx;
  let y = dy;
  for (let i = 0; i < turns; i++) [x, y] = [-y, x];
  return [x, y];
}

/** Which side (0–3) a gate node sits on. */
function gateSide(node: MatrixNodeDef): number {
  return node.side ?? 0;
}

/**
 * Places the attached boards in matrix space. A board hangs on a gate of its host: its centre is
 * `BOARD_PITCH` cells from the host's centre in the gate's direction, and the gate on its own side facing
 * the host (which one depends on the rotation) becomes its entry. Boards that cannot be placed (unknown
 * host, an occupied spot) are left out.
 */
export function layoutBoards(boards: readonly BoardState[]): Layout {
  const layout: Layout = new Map();
  layout.set('start', { id: 'start', turns: turnsOf(boards.find((b) => b.id === 'start')?.rotation ?? 0), cx: 0, cy: 0 });
  const taken = new Set(['0,0']);
  const pending = boards.filter((b) => b.id !== 'start' && BOARDS.has(b.id) && b.gate);
  let progress = true;
  while (pending.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const b = pending[i]!;
      const gate = MATRIX_NODES.get(b.gate!);
      const host = gate && gate.kind === 'gate' ? layout.get(gate.board) : undefined;
      if (!gate || !host) continue;
      pending.splice(i--, 1);
      progress = true;
      const dir = (gateSide(gate) + host.turns) % 4;
      const cx = host.cx + SIDE_STEP[dir]![0] * BOARD_PITCH;
      const cy = host.cy + SIDE_STEP[dir]![1] * BOARD_PITCH;
      const key = `${cx},${cy}`;
      if (taken.has(key) || layout.has(b.id)) continue;
      taken.add(key);
      const turns = turnsOf(b.rotation);
      const entrySide = (((dir + 2 - turns) % 4) + 4) % 4;
      layout.set(b.id, { id: b.id, turns, cx, cy, gate: gate.id, entry: gateId(b.id, entrySide) });
    }
  }
  return layout;
}

/** Position of a node in matrix space, or null if its board is not attached. */
export function nodePosition(layout: Layout, node: MatrixNodeDef): { x: number; y: number } | null {
  const p = layout.get(node.board);
  if (!p) return null;
  const [dx, dy] = rotate(node.x - BOARD_CENTER, node.y - BOARD_CENTER, p.turns);
  return { x: p.cx + dx, y: p.cy + dy };
}

/** Nodes adjacent to `id`: the four grid neighbours on its board, plus the other end of a board link. */
export function neighbors(layout: Layout, id: string): string[] {
  const n = MATRIX_NODES.get(id);
  if (!n || !layout.has(n.board)) return [];
  const out: string[] = [];
  for (const [dx, dy] of SIDE_STEP) {
    const other = `${n.board}:${n.x + dx},${n.y + dy}`;
    if (MATRIX_NODES.has(other)) out.push(other);
  }
  const own = layout.get(n.board)!;
  if (own.entry === id && own.gate) out.push(own.gate);
  for (const p of layout.values()) if (p.gate === id && p.entry) out.push(p.entry);
  return out;
}

// ---- Allocation ---------------------------------------------------------------------------------------

export function isAllocated(e: EndgameState, id: string): boolean {
  return id === START_NODE || e.nodes.includes(id);
}

export type AllocateResult = { ok: true } | { ok: false; reason: 'unknown' | 'owned' | 'points' | 'unreachable' };

/** Whether a node can be taken now: its board is attached, a point is free and it touches an owned node. */
export function canAllocate(e: EndgameState, id: string): AllocateResult {
  const node = MATRIX_NODES.get(id);
  const layout = layoutBoards(e.boards);
  if (!node || !layout.has(node.board)) return { ok: false, reason: 'unknown' };
  if (isAllocated(e, id)) return { ok: false, reason: 'owned' };
  if (e.matrixPoints < 1) return { ok: false, reason: 'points' };
  if (!neighbors(layout, id).some((n) => isAllocated(e, n))) return { ok: false, reason: 'unreachable' };
  return { ok: true };
}

export function allocateNode(ctx: GameContext, id: string): AllocateResult {
  const e = ensureEndgame(ctx);
  const r = canAllocate(e, id);
  if (!r.ok) return r;
  e.nodes.push(id);
  e.matrixPoints--;
  return r;
}

export function respecCost(e: EndgameState): number {
  return e.nodes.length === 0 ? 0 : MATRIX_RESPEC_GOLD.base + MATRIX_RESPEC_GOLD.perNode * e.nodes.length;
}

/** Refunds every allocated node (the gold is the caller's business) and unsockets all glyphs. */
export function respecMatrix(ctx: GameContext): number {
  const e = ensureEndgame(ctx);
  const refunded = e.nodes.length;
  e.matrixPoints += refunded;
  e.nodes = [];
  for (const g of e.glyphs) delete g.socket;
  return refunded;
}

// ---- Boards -------------------------------------------------------------------------------------------

export type AttachResult = { ok: true } | { ok: false; reason: 'gate' | 'used' | 'board' | 'space' | 'locked' };

/** Boards that are not attached yet. */
export function availableBoards(e: EndgameState): string[] {
  return BOARD_IDS.filter((id) => id !== 'start' && !e.boards.some((b) => b.id === id));
}

/** Gate nodes of attached boards that an owned gate offers: allocated, and nothing hangs on them. */
export function openGate(e: EndgameState, gate: string): boolean {
  const node = MATRIX_NODES.get(gate);
  if (!node || node.kind !== 'gate' || !isAllocated(e, gate)) return false;
  const layout = layoutBoards(e.boards);
  const own = layout.get(node.board);
  if (!own || own.entry === gate) return false;
  return ![...layout.values()].some((p) => p.gate === gate);
}

/** Attaches `board` to an allocated gate with a rotation of 0, 90, 180 or 270 degrees. */
export function attachBoard(ctx: GameContext, gate: string, board: string, rotation: number): AttachResult {
  const e = ensureEndgame(ctx);
  if (!BOARDS.has(board) || board === 'start' || e.boards.some((b) => b.id === board)) return { ok: false, reason: 'board' };
  if (!openGate(e, gate)) return { ok: false, reason: MATRIX_NODES.get(gate)?.kind === 'gate' && isAllocated(e, gate) ? 'used' : 'gate' };
  const next: BoardState = { id: board, rotation: turnsOf(rotation) * 90, gate };
  if (!layoutBoards([...e.boards, next]).has(board)) return { ok: false, reason: 'space' };
  e.boards.push(next);
  return { ok: true };
}

/** True while nothing on the board (or on boards hanging from it) is allocated or socketed. */
function boardUntouched(e: EndgameState, board: string): boolean {
  const layout = layoutBoards(e.boards);
  const inTree = new Set<string>([board]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of layout.values()) {
      const host = p.gate ? MATRIX_NODES.get(p.gate)?.board : undefined;
      if (host && inTree.has(host) && !inTree.has(p.id)) {
        inTree.add(p.id);
        grew = true;
      }
    }
  }
  if (inTree.size > 1) return false;
  return !e.nodes.some((id) => MATRIX_NODES.get(id)?.board === board);
}

/** Takes a board off its gate again (only while none of its nodes is allocated and nothing hangs on it). */
export function detachBoard(ctx: GameContext, board: string): AttachResult {
  const e = ensureEndgame(ctx);
  const i = e.boards.findIndex((b) => b.id === board);
  if (board === 'start' || i < 0) return { ok: false, reason: 'board' };
  if (!boardUntouched(e, board)) return { ok: false, reason: 'locked' };
  e.boards.splice(i, 1);
  return { ok: true };
}

/** Turns an attached board to another rotation (only while it is untouched). */
export function rotateBoard(ctx: GameContext, board: string, rotation: number): AttachResult {
  const e = ensureEndgame(ctx);
  const b = e.boards.find((x) => x.id === board);
  if (!b || !b.gate) return { ok: false, reason: 'board' };
  if (!boardUntouched(e, board)) return { ok: false, reason: 'locked' };
  const gate = b.gate;
  e.boards = e.boards.filter((x) => x.id !== board);
  const r = attachBoard(ctx, gate, board, rotation);
  if (!r.ok) e.boards.push(b);
  return r;
}

// ---- Glyphs -------------------------------------------------------------------------------------------

/** Gives the character a glyph at level 1 if it doesn't have it yet. Returns true if it was new. */
export function grantGlyph(ctx: GameContext, id: string, announce = true): boolean {
  const e = ensureEndgame(ctx);
  if (!GLYPH_DEFS.has(id) || e.glyphs.some((g) => g.id === id)) return false;
  e.glyphs.push({ id, level: 1 });
  if (announce) ctx.events.push({ type: 'banner', key: 'matrix.glyphBanner', keyParams: { name: `matrix.glyphs.${id}.name` }, seconds: 3 });
  return true;
}

/**
 * Chance that an upgrade attempt works: always while the glyph's level is at most rift level / 5, then
 * falling by 25 % for every level above that (never below 5 %).
 */
export function glyphUpgradeChance(glyphLevel: number, riftLevel: number): number {
  const over = glyphLevel - riftLevel / GLYPH_RIFT_DIVISOR;
  if (over <= 0) return 1;
  return Math.max(GLYPH_UPGRADE_FLOOR, 1 - GLYPH_UPGRADE_FALLOFF * over);
}

/**
 * One upgrade attempt for a glyph after a Deep Rift of `riftLevel`. Returns the new level, or null if
 * the attempt failed, the glyph is at the maximum or unknown.
 */
export function upgradeGlyph(ctx: GameContext, id: string, riftLevel: number): number | null {
  const g = ctx.endgame?.glyphs.find((x) => x.id === id);
  if (!g || g.level >= GLYPH_MAX_LEVEL) return null;
  if (!ctx.loot.rng.chance(glyphUpgradeChance(g.level, riftLevel))) return null;
  g.level += 1;
  return g.level;
}

/** Puts a glyph into an allocated socket node (or takes it out with `null`). The socket's old glyph is unsocketed. */
export function socketGlyph(ctx: GameContext, glyphId: string, socket: string | null): boolean {
  const e = ensureEndgame(ctx);
  const g = e.glyphs.find((x) => x.id === glyphId);
  if (!g) return false;
  if (socket === null) {
    delete g.socket;
    return true;
  }
  const node = MATRIX_NODES.get(socket);
  if (!node || node.kind !== 'socket' || !isAllocated(e, socket)) return false;
  for (const other of e.glyphs) if (other.socket === socket) delete other.socket;
  g.socket = socket;
  return true;
}

/** Nodes within the glyph radius of a socket (same board, Euclidean distance in cells), the socket itself excluded. */
export function nodesInRadius(socket: string, radius = GLYPH_RADIUS): MatrixNodeDef[] {
  const s = MATRIX_NODES.get(socket);
  if (!s) return [];
  return BOARDS.get(s.board)!.nodes.filter((n) => n.id !== socket && Math.hypot(n.x - s.x, n.y - s.y) <= radius);
}

export interface GlyphReport {
  glyph: GlyphDef;
  level: number;
  socket: string;
  /** Allocated normal and magic nodes in the radius that the glyph scales. */
  scaled: string[];
  /** Points of the glyph's attribute inside the radius (allocated normal nodes, before scaling). */
  attributePoints: number;
  bonusActive: boolean;
}

function nodeStat(n: MatrixNodeDef): { stat: StatKey; value: number } | null {
  const fx = n.effects[0];
  return fx && fx.kind === 'stat' ? { stat: fx.stat, value: typeof fx.value === 'number' ? fx.value : 0 } : null;
}

/** What each socketed glyph covers right now. */
export function glyphReports(e: EndgameState): GlyphReport[] {
  const out: GlyphReport[] = [];
  for (const g of e.glyphs) {
    const def = GLYPH_DEFS.get(g.id);
    if (!def || !g.socket || !isAllocated(e, g.socket)) continue;
    const scaled: string[] = [];
    let attributePoints = 0;
    for (const n of nodesInRadius(g.socket)) {
      if (!isAllocated(e, n.id) || (n.kind !== 'normal' && n.kind !== 'magic')) continue;
      const s = nodeStat(n);
      if (!s) continue;
      if (def.family.includes(s.stat)) scaled.push(n.id);
      if (n.kind === 'normal' && s.stat === def.attribute) attributePoints += s.value;
    }
    out.push({ glyph: def, level: g.level, socket: g.socket, scaled, attributePoints, bonusActive: attributePoints >= def.threshold });
  }
  return out;
}

/** The value multiplier glyphs give one node: 1 + 8 % per level of every glyph that covers it. */
export function glyphMultiplier(reports: readonly GlyphReport[], nodeId: string): number {
  let m = 1;
  for (const r of reports) if (r.scaled.includes(nodeId)) m += GLYPH_LEVEL_SCALE * r.level;
  return m;
}

// ---- Stats --------------------------------------------------------------------------------------------

function scaleEffect(fx: Effect, m: number): Effect {
  if (m === 1 || fx.kind !== 'stat' || typeof fx.value !== 'number') return fx;
  return { ...fx, value: Math.round(fx.value * m * 10000) / 10000 };
}

/** Everything the matrix gives the character: allocated nodes (glyph-scaled) and active glyph bonuses. */
export function matrixEffects(e: EndgameState | undefined): Effect[] {
  if (!e || e.nodes.length === 0) return [];
  const layout = layoutBoards(e.boards);
  const reports = glyphReports(e);
  const out: Effect[] = [];
  for (const id of e.nodes) {
    const node = MATRIX_NODES.get(id);
    if (!node || !layout.has(node.board)) continue;
    const m = node.kind === 'normal' || node.kind === 'magic' ? glyphMultiplier(reports, id) : 1;
    for (const fx of node.effects) out.push(scaleEffect(fx, m));
  }
  for (const r of reports) if (r.bonusActive) out.push(...r.glyph.bonus);
  return out;
}
