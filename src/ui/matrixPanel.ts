/**
 * Neural Matrix view (docs/endgame.md): the boards as an SVG you can zoom (wheel, pinch, buttons) and pan
 * (drag), node tooltips, allocation by click or tap, board attaching at gates and glyph socketing.
 * It lives inside the skill panel (K) once the character is at the level cap.
 */
import { t } from '../data/i18n';
import {
  BOARDS,
  BOARD_SIZE,
  GLYPH_DEFS,
  GLYPH_LEVEL_SCALE,
  GLYPH_MAX_LEVEL,
  GLYPH_RADIUS,
  MATRIX_MAX_POINTS,
  MATRIX_NODES,
  type GlyphDef,
  type MatrixNodeDef,
} from '../data/endgame/matrix';
import type { Effect } from '../data/effects';
import { PERCENT_STATS, type StatKey } from '../data/loot/schemas';
import {
  availableBoards,
  canAllocate,
  glyphMultiplier,
  glyphReports,
  isAllocated,
  layoutBoards,
  matrixPointCost,
  neighbors,
  nodePosition,
  nodesInRadius,
  openGate,
  pointsEarned,
  respecCost,
  type AllocateResult,
  type EndgameState,
  type Layout,
} from '../systems/endgame/matrix';
import { placeTooltipForPortrait } from './itemTooltip';

export interface MatrixView {
  endgame: EndgameState;
  gold: number;
}

export interface MatrixActions {
  allocate(nodeId: string): void;
  respec(): void;
  attach(gate: string, board: string, rotation: number): void;
  rotate(board: string, rotation: number): void;
  detach(board: string): void;
  socket(glyphId: string, nodeId: string | null): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Size of one grid cell in SVG units. */
const CELL = 44;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
/** Pixels a pointer may travel before a press counts as a drag. */
const DRAG_SLOP = 6;
const RADIUS: Record<MatrixNodeDef['kind'], number> = { start: 15, normal: 10, magic: 12, rare: 15, legendary: 19, socket: 17, gate: 14 };

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, cls?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (cls) el.setAttribute('class', cls);
  return el;
}

function div(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}

function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/** "+12 Strength", "+3.5% Critical Strike Chance". */
export function statText(stat: StatKey, value: number): string {
  const label = t(`stats.${stat}`);
  if (PERCENT_STATS.has(stat)) return `+${+(value * 100).toFixed(1)}% ${label}`;
  return `+${Math.round(value)} ${label}`;
}

/** One effect as a tooltip line. */
export function effectText(fx: Effect, mult = 1): string {
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  switch (fx.kind) {
    case 'stat':
      return statText(fx.stat, num(fx.value) * mult);
    case 'damage': {
      const pct = +(num(fx.value) * 100 * mult).toFixed(1);
      const text = t(fx.multiplicative ? 'matrix.fx.damageMul' : 'matrix.fx.damage', { pct });
      return fx.when ? `${text} ${t(`matrix.when.${fx.when}`)}` : text;
    }
    case 'overheat':
      return t('matrix.fx.overheat', { sec: num(fx.graceDelta) });
    default:
      return '';
  }
}

export class MatrixPanel {
  readonly element: HTMLDivElement;
  /** Set by the skill panel: go back to the skill tree. */
  onBack: () => void = () => {};

  private readonly head: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly glyphBar: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private world: SVGGElement | null = null;
  private selected: string | null = null;
  private selectedGlyph: string | null = null;
  private hover: string | null = null;
  /** Gate attach form: the board and rotation picked. */
  private attachBoard: string | null = null;
  private attachRotation = 0;
  private tx = 0;
  private ty = 0;
  private scale = 1;
  private fitted = false;
  private bounds = { x0: -200, y0: -200, x1: 200, y1: 200 };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private press: { id: number; x: number; y: number; node: string | null; moved: boolean; mouse: boolean } | null = null;
  private pinch: { dist: number } | null = null;

  constructor(
    parent: HTMLElement,
    private readonly view: () => MatrixView,
    private readonly actions: MatrixActions,
  ) {
    this.element = div('matrix');
    this.head = div('matrix-head');
    this.viewport = div('matrix-viewport');
    this.detail = div('matrix-detail');
    this.glyphBar = div('matrix-glyphs');
    this.element.append(this.head, this.viewport, this.detail, this.glyphBar);
    this.tooltip = div('item-tooltip');
    this.tooltip.hidden = true;
    parent.appendChild(this.tooltip);
    this.bindViewport();
  }

  /** Redraws everything, keeping the camera. */
  refresh(): void {
    const v = this.view();
    this.drawHead(v);
    this.drawBoards(v.endgame);
    this.drawDetail(v.endgame);
    this.drawGlyphBar(v.endgame);
    this.tooltip.hidden = true;
  }

  /** Called when the view becomes visible, so it fits to the boards once its size is known. */
  show(): void {
    this.fitted = false;
    this.selected = null;
    this.selectedGlyph = null;
    this.refresh();
    requestAnimationFrame(() => {
      this.fit();
      this.applyTransform();
    });
  }

  hide(): void {
    this.tooltip.hidden = true;
  }

  // ---- Header ----------------------------------------------------------------------------------------

  private drawHead(v: MatrixView): void {
    const e = v.endgame;
    const earned = pointsEarned(e);
    const left = div('matrix-points');
    const pts = div(e.matrixPoints > 0 ? 'matrix-count has' : 'matrix-count', t('matrix.points', { points: e.matrixPoints }));
    const xp = div('matrix-xp muted');
    xp.textContent =
      earned >= MATRIX_MAX_POINTS
        ? t('matrix.maxed', { max: MATRIX_MAX_POINTS })
        : `${t('matrix.xp', { xp: Math.floor(e.matrixXp).toLocaleString('en'), next: matrixPointCost(earned).toLocaleString('en') })} · ${t('matrix.earned', { earned, max: MATRIX_MAX_POINTS })}`;
    left.append(pts, xp);
    const cost = respecCost(e);
    const reset = button(t('matrix.reset', { gold: cost }), () => {
      if (confirm(t('matrix.resetConfirm', { gold: cost }))) this.actions.respec();
    });
    reset.disabled = e.nodes.length === 0 || v.gold < cost;
    const tools = div('matrix-tools');
    tools.append(button(t('matrix.back'), () => this.onBack(), 'matrix-tab'), reset);
    this.head.replaceChildren(left, tools);
  }

  // ---- Boards ----------------------------------------------------------------------------------------

  private pos(layout: Layout, n: MatrixNodeDef): { x: number; y: number } {
    const p = nodePosition(layout, n)!;
    return { x: p.x * CELL, y: p.y * CELL };
  }

  private drawBoards(e: EndgameState): void {
    const layout = layoutBoards(e.boards);
    const reports = glyphReports(e);
    const root = svg('svg', { class: 'matrix-svg', width: '100%', height: '100%' });
    const world = svg('g', {}, 'matrix-world');
    root.appendChild(world);
    this.world = world;

    // Highlight: nodes a selected socket (with its glyph) or a selected glyph covers.
    const focusSocket = this.focusSocket(e);
    const covered = new Set<string>();
    if (focusSocket) for (const n of nodesInRadius(focusSocket)) covered.add(n.id);

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of layout.values()) {
      const half = (BOARD_SIZE / 2) * CELL;
      const bx = p.cx * CELL - half;
      const by = p.cy * CELL - half;
      world.appendChild(svg('rect', { x: bx, y: by, width: BOARD_SIZE * CELL, height: BOARD_SIZE * CELL, rx: 14 }, 'matrix-board'));
      const label = svg('text', { x: bx + 10, y: by + 16 }, 'matrix-board-label');
      label.textContent = t(`matrix.boards.${p.id}`);
      world.appendChild(label);
      x0 = Math.min(x0, bx);
      y0 = Math.min(y0, by);
      x1 = Math.max(x1, bx + BOARD_SIZE * CELL);
      y1 = Math.max(y1, by + BOARD_SIZE * CELL);
    }
    this.bounds = { x0, y0, x1, y1 };

    // Glyph reach rings for socketed glyphs.
    for (const r of reports) {
      const s = MATRIX_NODES.get(r.socket)!;
      const c = this.pos(layout, s);
      const ring = svg('circle', { cx: c.x, cy: c.y, r: GLYPH_RADIUS * CELL + CELL / 2 }, `matrix-reach${r.bonusActive ? ' active' : ''}`);
      world.appendChild(ring);
    }

    // Edges first so nodes sit on top.
    const drawn = new Set<string>();
    for (const board of layout.keys()) {
      for (const n of BOARDS.get(board)!.nodes) {
        for (const other of neighbors(layout, n.id)) {
          const key = n.id < other ? `${n.id}|${other}` : `${other}|${n.id}`;
          if (drawn.has(key)) continue;
          drawn.add(key);
          const o = MATRIX_NODES.get(other)!;
          const a = this.pos(layout, n);
          const b = this.pos(layout, o);
          const on = isAllocated(e, n.id) && isAllocated(e, o.id);
          world.appendChild(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, `matrix-edge${on ? ' on' : ''}${n.board !== o.board ? ' link' : ''}`));
        }
      }
    }

    for (const board of layout.keys()) {
      for (const n of BOARDS.get(board)!.nodes) {
        const c = this.pos(layout, n);
        const owned = isAllocated(e, n.id);
        const can = !owned && canAllocate(e, n.id).ok;
        const sock = n.kind === 'socket' ? e.glyphs.find((g) => g.socket === n.id) : undefined;
        const cls = [
          'matrix-node',
          `k-${n.kind}`,
          owned ? 'owned' : can ? 'can' : 'locked',
          this.selected === n.id ? 'selected' : '',
          covered.has(n.id) ? 'covered' : '',
          sock ? 'filled' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const g = svg('g', { transform: `translate(${c.x} ${c.y})`, 'data-node': n.id }, cls);
        const r = RADIUS[n.kind];
        // Hit area larger than the glyph so small nodes stay tappable.
        g.appendChild(svg('circle', { r: Math.max(r + 6, 16) }, 'matrix-hit'));
        if (n.kind === 'gate') g.appendChild(svg('rect', { x: -r, y: -r, width: r * 2, height: r * 2, transform: 'rotate(45)' }, 'matrix-shape'));
        else if (n.kind === 'socket') g.appendChild(svg('rect', { x: -r, y: -r, width: r * 2, height: r * 2, rx: 4 }, 'matrix-shape'));
        else if (n.kind === 'legendary') g.appendChild(svg('polygon', { points: starPoints(r) }, 'matrix-shape'));
        else g.appendChild(svg('circle', { r }, 'matrix-shape'));
        if (sock) {
          const txt = svg('text', { y: 4, 'text-anchor': 'middle' }, 'matrix-glyph-level');
          txt.textContent = String(sock.level);
          g.appendChild(txt);
        }
        world.appendChild(g);
      }
    }

    this.viewport.replaceChildren(root, this.zoomButtons());
    if (!this.fitted) this.fit();
    this.applyTransform();
  }

  private zoomButtons(): HTMLElement {
    const box = div('matrix-zoom');
    box.append(
      button('+', () => this.zoomBy(1.3)),
      button('−', () => this.zoomBy(1 / 1.3)),
      button('⌖', () => {
        this.fit();
        this.applyTransform();
      }),
    );
    box.firstElementChild?.setAttribute('aria-label', t('matrix.zoomIn'));
    box.children[1]?.setAttribute('aria-label', t('matrix.zoomOut'));
    box.children[2]?.setAttribute('aria-label', t('matrix.recenter'));
    return box;
  }

  // ---- Camera ----------------------------------------------------------------------------------------

  /** Fits all attached boards in view (first draw, recenter button). */
  private fit(): void {
    const w = this.viewport.clientWidth || 360;
    const h = this.viewport.clientHeight || 360;
    const b = this.bounds;
    const bw = b.x1 - b.x0 + 20;
    const bh = b.y1 - b.y0 + 20;
    this.scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(w / bw, h / bh)));
    this.tx = w / 2 - ((b.x0 + b.x1) / 2) * this.scale;
    this.ty = h / 2 - ((b.y0 + b.y1) / 2) * this.scale;
    this.fitted = this.viewport.clientWidth > 0;
  }

  private applyTransform(): void {
    this.world?.setAttribute('transform', `translate(${this.tx} ${this.ty}) scale(${this.scale})`);
  }

  /** Zooms about a viewport point (default: the centre). */
  private zoomBy(factor: number, px?: number, py?: number): void {
    const cx = px ?? this.viewport.clientWidth / 2;
    const cy = py ?? this.viewport.clientHeight / 2;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.scale * factor));
    const k = next / this.scale;
    this.tx = cx - (cx - this.tx) * k;
    this.ty = cy - (cy - this.ty) * k;
    this.scale = next;
    this.applyTransform();
  }

  private bindViewport(): void {
    const vp = this.viewport;
    const local = (e: MouseEvent) => {
      const r = vp.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = local(e);
        this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      },
      { passive: false },
    );
    vp.addEventListener('contextmenu', (e) => e.preventDefault());
    vp.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('.matrix-zoom')) return;
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      vp.setPointerCapture(e.pointerId);
      if (this.pointers.size === 1) {
        const node = (e.target as Element).closest?.('[data-node]')?.getAttribute('data-node') ?? null;
        this.press = { id: e.pointerId, x: p.x, y: p.y, node, moved: false, mouse: e.pointerType === 'mouse' };
      } else {
        // A second finger: pinch, not a tap.
        if (this.press) this.press.moved = true;
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
      }
    });
    vp.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (!this.pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') this.onHover((e.target as Element).closest?.('[data-node]')?.getAttribute('data-node') ?? null, e);
        return;
      }
      const prev = this.pointers.get(e.pointerId)!;
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size >= 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const mx = (a!.x + b!.x) / 2;
        const my = (a!.y + b!.y) / 2;
        if (this.pinch.dist > 0 && dist > 0) this.zoomBy(dist / this.pinch.dist, mx, my);
        // Two fingers also pan with their midpoint.
        this.tx += (p.x - prev.x) / 2;
        this.ty += (p.y - prev.y) / 2;
        this.pinch.dist = dist;
        this.applyTransform();
        return;
      }
      const press = this.press;
      if (!press || press.id !== e.pointerId) return;
      if (!press.moved && Math.hypot(p.x - press.x, p.y - press.y) > DRAG_SLOP) press.moved = true;
      if (press.moved) {
        this.tx += p.x - prev.x;
        this.ty += p.y - prev.y;
        this.tooltip.hidden = true;
        this.applyTransform();
      }
    });
    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size < 2) this.pinch = null;
      const press = this.press;
      if (press && press.id === e.pointerId) {
        this.press = null;
        if (!press.moved && e.type === 'pointerup') this.onTap(press.node, press.mouse);
      }
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.onHover(null, e);
    });
  }

  // ---- Interaction -----------------------------------------------------------------------------------

  private onHover(id: string | null, e: PointerEvent): void {
    if (id === this.hover) return;
    this.hover = id;
    if (!id) {
      this.tooltip.hidden = true;
      return;
    }
    const node = MATRIX_NODES.get(id);
    if (!node) return;
    const anchor = (e.target as Element).closest('[data-node]')?.getBoundingClientRect();
    if (!anchor) return;
    this.tooltip.replaceChildren(this.describe(node));
    this.tooltip.hidden = false;
    if (placeTooltipForPortrait(this.tooltip, anchor)) return;
    const tr = this.tooltip.getBoundingClientRect();
    let left = anchor.right + 10;
    if (left + tr.width > window.innerWidth - 8) left = anchor.left - tr.width - 10;
    this.tooltip.style.left = `${Math.max(8, left)}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - tr.height - 8, anchor.top))}px`;
  }

  /** A click (mouse) or tap (touch) on a node. Touch selects first, a second tap allocates. */
  private onTap(id: string | null, mouse: boolean): void {
    if (!id) {
      this.selected = null;
      this.refresh();
      return;
    }
    const e = this.view().endgame;
    const wasSelected = this.selected === id;
    if (this.selected !== id) this.attachBoard = null;
    this.selected = id;
    const can = canAllocate(e, id).ok;
    if (can && (mouse || wasSelected)) {
      this.actions.allocate(id);
      return;
    }
    this.refresh();
  }

  private focusSocket(e: EndgameState): string | null {
    const sel = this.selected ? MATRIX_NODES.get(this.selected) : undefined;
    if (sel?.kind === 'socket') return sel.id;
    if (this.selectedGlyph) return e.glyphs.find((g) => g.id === this.selectedGlyph)?.socket ?? null;
    return null;
  }

  // ---- Descriptions ----------------------------------------------------------------------------------

  private describe(node: MatrixNodeDef): HTMLElement {
    const e = this.view().endgame;
    const tip = div('item-tip');
    tip.style.setProperty('--rarity', KIND_COLOR[node.kind]);
    const name =
      node.kind === 'legendary'
        ? t(`matrix.legendary.${node.board}`)
        : node.kind === 'gate'
          ? t('matrix.kinds.gate')
          : t(`matrix.kinds.${node.kind}`);
    tip.append(div('item-tip-name', name), div('item-tip-type', `${t(`matrix.boards.${node.board}`)}${node.kind === 'legendary' ? ` · ${t('matrix.kinds.legendary')}` : ''}`));
    const mult = node.kind === 'normal' || node.kind === 'magic' ? glyphMultiplier(glyphReports(e), node.id) : 1;
    for (const fx of node.effects) {
      const line = effectText(fx, mult);
      if (line) tip.appendChild(div('item-tip-stats', line));
    }
    if (mult > 1) tip.appendChild(div('muted', t('matrix.glyphBoost', { pct: Math.round((mult - 1) * 100) })));
    if (node.kind === 'gate') tip.appendChild(div('muted', t('matrix.gateHint')));
    if (node.kind === 'socket') {
      const g = e.glyphs.find((x) => x.socket === node.id);
      tip.appendChild(div('item-tip-aspect', g ? `${t(`matrix.glyphs.${g.id}.name`)} ${t('matrix.glyphLevel', { level: g.level })}` : t('matrix.socketEmpty')));
    }
    if (node.kind === 'start') tip.appendChild(div('muted', t('matrix.startHint')));
    const owned = isAllocated(e, node.id);
    if (owned) tip.appendChild(div('item-tip-equipped', t('matrix.state.owned')));
    else {
      const r = canAllocate(e, node.id);
      tip.appendChild(div(r.ok ? 'item-tip-stats' : 'item-tip-req', r.ok ? t('matrix.state.available') : t(`matrix.cannot.${(r as Extract<AllocateResult, { ok: false }>).reason}`)));
    }
    return tip;
  }

  private drawDetail(e: EndgameState): void {
    const sel = this.selected ? MATRIX_NODES.get(this.selected) : undefined;
    const rows: HTMLElement[] = [];
    if (!sel) {
      const glyph = this.selectedGlyph ? GLYPH_DEFS.get(this.selectedGlyph) : undefined;
      if (glyph) rows.push(this.glyphCard(e, glyph));
      else rows.push(div('muted', t('matrix.hint')));
    } else {
      rows.push(this.describe(sel));
      if (sel.kind === 'gate') rows.push(...this.gateControls(e, sel));
      if (sel.kind === 'socket' && isAllocated(e, sel.id)) rows.push(...this.socketControls(e, sel));
    }
    this.detail.replaceChildren(...rows);
  }

  private glyphCard(e: EndgameState, def: GlyphDef): HTMLElement {
    const g = e.glyphs.find((x) => x.id === def.id)!;
    const card = div('glyph-card');
    card.append(div('item-tip-name', `${t(`matrix.glyphs.${def.id}.name`)} · ${t('matrix.glyphLevel', { level: g.level })}`));
    card.append(div('muted', t('matrix.glyphDesc', { pct: Math.round(GLYPH_LEVEL_SCALE * 100), stats: def.family.map((s) => t(`stats.${s}`)).join(', '), radius: GLYPH_RADIUS })));
    const report = glyphReports(e).find((r) => r.glyph.id === def.id);
    const attr = t(`stats.${def.attribute}`);
    const have = report ? Math.round(report.attributePoints) : 0;
    card.append(div(report?.bonusActive ? 'item-tip-stats' : 'muted', t('matrix.glyphBonus', { need: def.threshold, attr, have, bonus: def.bonus.map((b) => effectText(b)).join(', ') })));
    card.append(div('muted', g.socket ? t('matrix.glyphSocketed') : t('matrix.glyphFree')));
    if (g.level >= GLYPH_MAX_LEVEL) card.append(div('muted', t('matrix.glyphMax')));
    return card;
  }

  private socketControls(e: EndgameState, sock: MatrixNodeDef): HTMLElement[] {
    const out: HTMLElement[] = [];
    const current = e.glyphs.find((g) => g.socket === sock.id);
    if (current) {
      out.push(this.glyphCard(e, GLYPH_DEFS.get(current.id)!));
      out.push(button(t('matrix.unsocket'), () => this.actions.socket(current.id, null)));
    }
    out.push(div('muted', t('matrix.pickGlyph')));
    const list = div('glyph-pick');
    for (const g of e.glyphs) {
      if (g.id === current?.id) continue;
      const label = `${t(`matrix.glyphs.${g.id}.name`)} ${t('matrix.glyphLevel', { level: g.level })}${g.socket ? ' ·' : ''}`;
      list.appendChild(button(label, () => this.actions.socket(g.id, sock.id), g.socket ? 'in-use' : ''));
    }
    if (!list.childElementCount) list.appendChild(div('muted', t('matrix.noGlyphs')));
    out.push(list);
    return out;
  }

  private gateControls(e: EndgameState, gate: MatrixNodeDef): HTMLElement[] {
    const layout = layoutBoards(e.boards);
    const out: HTMLElement[] = [];
    const child = [...layout.values()].find((p) => p.gate === gate.id);
    if (child) {
      const bar = div('gate-form');
      bar.append(div('item-tip-name', t('matrix.attached', { board: t(`matrix.boards.${child.id}`) })));
      const rot = div('gate-rot');
      for (const deg of [0, 90, 180, 270]) {
        const b = button(`${deg}°`, () => this.actions.rotate(child.id, deg), child.turns * 90 === deg ? 'on' : '');
        rot.appendChild(b);
      }
      bar.append(rot, button(t('matrix.detach'), () => this.actions.detach(child.id)));
      bar.append(div('muted', t('matrix.rotateHint')));
      out.push(bar);
      return out;
    }
    if (!isAllocated(e, gate.id)) return out;
    if (!openGate(e, gate.id)) {
      out.push(div('muted', t('matrix.gateEntry')));
      return out;
    }
    const boards = availableBoards(e);
    if (boards.length === 0) {
      out.push(div('muted', t('matrix.noBoards')));
      return out;
    }
    if (!this.attachBoard || !boards.includes(this.attachBoard)) this.attachBoard = boards[0]!;
    const form = div('gate-form');
    form.append(div('muted', t('matrix.attachHint')));
    const list = div('glyph-pick');
    for (const b of boards) {
      list.appendChild(
        button(t(`matrix.boards.${b}`), () => {
          this.attachBoard = b;
          this.refresh();
        }, this.attachBoard === b ? 'on' : ''),
      );
    }
    const rot = div('gate-rot');
    for (const deg of [0, 90, 180, 270]) {
      rot.appendChild(
        button(`${deg}°`, () => {
          this.attachRotation = deg;
          this.refresh();
        }, this.attachRotation === deg ? 'on' : ''),
      );
    }
    form.append(list, rot, button(t('matrix.attach', { board: t(`matrix.boards.${this.attachBoard}`) }), () => this.actions.attach(gate.id, this.attachBoard!, this.attachRotation)));
    out.push(form);
    return out;
  }

  private drawGlyphBar(e: EndgameState): void {
    const bar: HTMLElement[] = [div('matrix-glyphs-title', t('matrix.glyphsTitle'))];
    for (const g of e.glyphs) {
      const def = GLYPH_DEFS.get(g.id);
      if (!def) continue;
      const chip = button(`${t(`matrix.glyphs.${g.id}.name`)} ${g.level}`, () => {
        this.selectedGlyph = this.selectedGlyph === g.id ? null : g.id;
        // Pick a glyph to see it; selecting a socket then fills it from the list.
        this.selected = null;
        this.refresh();
      }, `glyph-chip${g.socket ? ' socketed' : ''}${this.selectedGlyph === g.id ? ' on' : ''}`);
      bar.push(chip);
    }
    if (e.glyphs.length === 0) bar.push(div('muted', t('matrix.noGlyphs')));
    this.glyphBar.replaceChildren(...bar);
  }
}

const KIND_COLOR: Record<MatrixNodeDef['kind'], string> = {
  start: '#c8b89a',
  normal: '#9aa4ad',
  magic: '#6aa7ff',
  rare: '#e8c86a',
  legendary: '#ff8a2a',
  socket: '#b57aff',
  gate: '#6bff7a',
};

function starPoints(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.5;
    pts.push(`${(Math.cos(a) * rad).toFixed(1)},${(Math.sin(a) * rad).toFixed(1)}`);
  }
  return pts.join(' ');
}
