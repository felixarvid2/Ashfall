/**
 * Enemy life bars and elite nameplates (A020, A021, A025), pooled DOM like DamageNumbers.
 *
 * - A small bar (3 x 28 px, 2 x 22 on touch) over an enemy that has been hurt: within 16 m, for 3 s after the last
 *   hit (the targeted enemy keeps it), at most 24 at once (12 on touch; an upright phone hides them all in a crowd).
 *   Full-life enemies and bosses (they have the boss frame) get none.
 * - Elite plates: the name, affix chips and a 4 px bar under every champion/rare within 28 m, always shown, kept
 *   above the HUD band at the bottom of the screen.
 * The selection is pure (`selectBars`, `clampPlateY`); the DOM is written only when a value changes.
 */
import type { GameEvent } from '../core/events';

export type EnemyTier = 'normal' | 'champion' | 'rare' | 'named' | 'boss';

export interface EnemyBarInfo {
  id: number;
  /** World position of the head (the plate sits above it). */
  x: number;
  y: number;
  z: number;
  /** Metres from the player. */
  dist: number;
  /** Life 0..1. */
  frac: number;
  tier: EnemyTier;
  /** The enemy the target frame shows. */
  targeted?: boolean;
  /** Elites: the plate's name, its colour and its affixes. */
  name?: string;
  color?: string;
  affixes?: { id: string; name: string }[];
}

/**
 * A list of reusable objects for per-frame scratch data: `reset()` at the start of a frame, then `next()` hands out the
 * same objects again (one is built only when a frame needs more than any before it). The caller overwrites every field.
 */
export class FramePool<T> {
  private readonly items: T[] = [];
  private used = 0;

  constructor(private readonly make: () => T) {}

  reset(): void {
    this.used = 0;
  }

  next(): T {
    return (this.items[this.used++] ??= this.make());
  }

  /** Objects ever built (tests). */
  get capacity(): number {
    return this.items.length;
  }
}

/** A blank info for `FramePool`; the filler sets every field. */
export const newBarInfo = (): EnemyBarInfo => ({ id: 0, x: 0, y: 0, z: 0, dist: 0, frac: 1, tier: 'normal' });

/** Gives a pooled info the elite's affix chips, rebuilding the list only when they differ from last frame's. */
export function setInfoAffixes(info: EnemyBarInfo, ids: readonly string[], nameOf: (id: string) => string): void {
  const have = info.affixes;
  if (have && have.length === ids.length && have.every((a, i) => a.id === ids[i])) return;
  info.affixes = ids.map((id) => ({ id, name: nameOf(id) }));
}

export const BAR_RANGE = 16;
/** Seconds a bar stays after the last hit, the last `BAR_FADE` of them fading out. */
export const BAR_HOLD = 3;
export const BAR_FADE = 0.6;
export const BAR_MAX = 24;
export const BAR_MAX_TOUCH = 12;
export const ELITE_RANGE = 28;
/** Plates are kept this far above the bottom edge: the action bar and orbs live there (590 at 720p). */
export const PLATE_BOTTOM_MARGIN = 130;

/** Bar colour by tier (elites: the audit's blue and gold). */
export const BAR_COLORS: Record<EnemyTier, string> = {
  normal: '#c22a1f',
  champion: '#6fb3ff',
  rare: '#ffd23a',
  named: '#ff9a3a',
  boss: '#ffd23a',
};

export interface BarOptions {
  touch: boolean;
  portrait: boolean;
}

export interface BarShow {
  info: EnemyBarInfo;
  /** 0..1 */
  alpha: number;
  /** An elite plate (name, chips, bar) rather than a plain bar. */
  plate: boolean;
}

export const isElite = (tier: EnemyTier): boolean => tier === 'champion' || tier === 'rare' || tier === 'named';

/** Opacity of a hurt enemy's bar `since` seconds after its last hit: full, then fading to 0 at `BAR_HOLD`. */
export function barAlpha(since: number): number {
  if (since >= BAR_HOLD) return 0;
  return since <= BAR_HOLD - BAR_FADE ? 1 : (BAR_HOLD - since) / BAR_FADE;
}

/**
 * Which enemies get a bar or plate. `since(id)` is the seconds since the enemy last took a hit (undefined: never).
 * Elites within `ELITE_RANGE` always get a plate. Others get a bar when hurt (life under 100 %), within `BAR_RANGE`
 * and hit lately (or targeted); nearest first, capped. An upright phone hides the plain bars when the crowd exceeds
 * the cap (the elite plates stay).
 */
export function selectBars(infos: readonly EnemyBarInfo[], since: (id: number) => number | undefined, opts: BarOptions): BarShow[] {
  const cap = opts.touch ? BAR_MAX_TOUCH : BAR_MAX;
  const plates: BarShow[] = [];
  const hurt: BarShow[] = [];
  for (const info of infos) {
    if (info.tier === 'boss' || info.frac <= 0) continue;
    if (isElite(info.tier)) {
      if (info.dist <= ELITE_RANGE) plates.push({ info, alpha: 1, plate: true });
      continue;
    }
    if (info.frac >= 1 || info.dist > BAR_RANGE) continue;
    const s = since(info.id);
    const alpha = info.targeted ? 1 : s === undefined ? 0 : barAlpha(s);
    if (alpha > 0) hurt.push({ info, alpha, plate: false });
  }
  hurt.sort((a, b) => a.info.dist - b.info.dist);
  const bars = opts.touch && opts.portrait && hurt.length > cap ? [] : hurt.slice(0, cap);
  return [...plates, ...bars];
}

/** Keeps a plate's anchor above the bottom HUD band (and not off the top of the screen). */
export function clampPlateY(y: number, viewportH: number): number {
  return Math.min(viewportH - PLATE_BOTTOM_MARGIN, Math.max(40, y));
}

const statusIconUrl = (id: string): string => `${import.meta.env.BASE_URL}assets/ui/status/${id}.svg`;

/** Affix chips: an existing status icon where one fits, else a two-letter glyph. */
export const AFFIX_CHIPS: Record<string, { icon?: string; glyph: string }> = {
  shielded: { icon: 'barrier', glyph: 'SH' },
  burning: { icon: 'burning', glyph: 'BU' },
  teleporting: { glyph: 'TP' },
  snaring: { icon: 'rooted', glyph: 'SN' },
  sporeSpreader: { icon: 'poisoned', glyph: 'SP' },
  explodesOnDeath: { glyph: 'EX' },
  vampiric: { glyph: 'VA' },
  fast: { glyph: 'FA' },
  freezing: { icon: 'chilled', glyph: 'FR' },
  mirroring: { glyph: 'MI' },
  forceWall: { glyph: 'FW' },
  laserGrid: { glyph: 'LG' },
};

/** The two-letter glyph of an affix (its first letters when unknown). */
export const affixGlyph = (id: string): string => AFFIX_CHIPS[id]?.glyph ?? id.slice(0, 2).toUpperCase();

/** One 14 px (12 px on touch, by CSS) affix chip; `title` carries the full name. */
export function affixChip(id: string, name: string, color: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.className = 'affix-chip';
  chip.title = name;
  chip.setAttribute('aria-label', name);
  chip.style.setProperty('--chip', color);
  const icon = AFFIX_CHIPS[id]?.icon;
  if (icon) {
    chip.classList.add('has-icon');
    chip.style.setProperty('--chip-icon', `url("${statusIconUrl(icon)}")`);
  } else chip.textContent = affixGlyph(id);
  return chip;
}

/** Rebuilds `host` as a row of chips unless it already shows exactly these. */
export function setAffixChips(host: HTMLElement, affixes: { id: string; name: string }[], color: string): void {
  const key = `${color}|${affixes.map((a) => `${a.id}:${a.name}`).join(',')}`;
  if (host.dataset.key === key) return;
  host.dataset.key = key;
  host.replaceChildren(...affixes.map((a) => affixChip(a.id, a.name, color)));
}

interface Entry {
  el: HTMLDivElement;
  fill: HTMLElement;
  plate: boolean;
  chips: HTMLElement | null;
  nameEl: HTMLElement | null;
  /** Last written values (write only on change). */
  tx: number;
  ty: number;
  pct: number;
  alpha: number;
  key: string;
  shown: boolean;
}

type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

export class EnemyBars {
  private readonly layer: HTMLDivElement;
  private readonly live = new Map<number, Entry>();
  private readonly freeBars: Entry[] = [];
  private readonly freePlates: Entry[] = [];
  /** Clock time of each enemy's last hit. */
  private readonly hits = new Map<number, number>();
  private readonly screen = { x: 0, y: 0 };
  private readonly seen = new Set<number>();
  private clock = 0;

  constructor(private readonly root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'enemy-bars';
    this.layer.setAttribute('aria-hidden', 'true');
    root.appendChild(this.layer);
  }

  /** Remembers who was hurt (the player's hits and damage over time alike). */
  handle(event: GameEvent): void {
    if (event.type === 'damage') {
      if (!event.toPlayer && event.amount + event.absorbed > 0) this.hits.set(event.target, this.clock);
    } else if (event.type === 'death') this.hits.delete(event.target);
  }

  /** Seconds since the enemy's last hit, or undefined. */
  private since = (id: number): number | undefined => {
    const at = this.hits.get(id);
    return at === undefined ? undefined : this.clock - at;
  };

  update(dt: number, infos: readonly EnemyBarInfo[], project: Project): void {
    this.clock += dt;
    for (const [id, at] of this.hits) if (this.clock - at > BAR_HOLD + 1) this.hits.delete(id);
    const touch = this.root.classList.contains('touch-ui');
    const portrait = this.root.classList.contains('portrait');
    const show = selectBars(infos, this.since, { touch, portrait });
    const h = window.innerHeight;
    const seen = this.seen;
    seen.clear();
    for (const s of show) {
      const i = s.info;
      if (!project(i.x, i.y, i.z, this.screen)) continue;
      seen.add(i.id);
      let e = this.live.get(i.id);
      if (e && e.plate !== s.plate) {
        this.release(i.id, e);
        e = undefined;
      }
      if (!e) {
        e = this.acquire(s.plate);
        this.live.set(i.id, e);
      }
      const tier = i.tier;
      const color = BAR_COLORS[tier];
      const key = s.plate ? `${i.name ?? ''}|${i.color ?? ''}|${color}|${(i.affixes ?? []).map((a) => a.id).join(',')}` : color;
      if (e.key !== key) {
        e.key = key;
        e.fill.style.background = color;
        if (e.plate && e.nameEl && e.chips) {
          e.nameEl.textContent = i.name ?? '';
          e.nameEl.style.color = i.color ?? '';
          setAffixChips(e.chips, i.affixes ?? [], i.color ?? color);
          e.chips.hidden = !i.affixes?.length;
        }
      }
      const pct = Math.round(Math.max(0, Math.min(1, i.frac)) * 100);
      if (pct !== e.pct) {
        e.pct = pct;
        e.fill.style.transform = `scaleX(${pct / 100})`;
      }
      const alpha = Math.round(s.alpha * 10) / 10;
      if (alpha !== e.alpha) {
        e.alpha = alpha;
        e.el.style.opacity = String(alpha);
      }
      const tx = Math.round(this.screen.x);
      const ty = Math.round(s.plate ? clampPlateY(this.screen.y, h) : this.screen.y);
      if (tx !== e.tx || ty !== e.ty) {
        e.tx = tx;
        e.ty = ty;
        e.el.style.transform = s.plate ? `translate(${tx}px, ${ty}px) translate(-50%, -100%)` : `translate(${tx}px, ${ty}px) translate(-50%, -50%)`;
      }
      if (!e.shown) {
        e.shown = true;
        e.el.hidden = false;
      }
    }
    for (const [id, e] of this.live) if (!seen.has(id)) this.release(id, e);
  }

  /** Number of bars and plates on screen (tests, debugging). */
  get count(): number {
    return this.live.size;
  }

  private release(id: number, e: Entry): void {
    this.live.delete(id);
    e.el.hidden = true;
    e.shown = false;
    e.key = '';
    e.tx = e.ty = e.pct = e.alpha = -1;
    (e.plate ? this.freePlates : this.freeBars).push(e);
  }

  private acquire(plate: boolean): Entry {
    const free = (plate ? this.freePlates : this.freeBars).pop();
    if (free) return free;
    const el = document.createElement('div');
    el.className = plate ? 'enemy-plate' : 'enemy-bar';
    el.hidden = true;
    const fill = document.createElement('i');
    const track = document.createElement('div');
    track.className = 'enemy-bar-track';
    track.append(fill);
    let nameEl: HTMLElement | null = null;
    let chips: HTMLElement | null = null;
    if (plate) {
      nameEl = Object.assign(document.createElement('div'), { className: 'npc-name enemy-plate-name' });
      chips = Object.assign(document.createElement('div'), { className: 'enemy-chips' });
      el.append(nameEl, chips, track);
    } else el.append(track);
    this.layer.appendChild(el);
    return { el, fill, plate, chips, nameEl, tx: -1, ty: -1, pct: -1, alpha: -1, key: '', shown: false };
  }
}
