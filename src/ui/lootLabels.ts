/** Clickable name labels over loot on the ground (always for magic+, all while Alt is held). */
import { GroundGold, GroundItem, Transform } from '../core/components';
import type { Entity, World } from '../core/ecs';
import { t } from '../data/i18n';
import { CRYSTAL_DEFS, rarityDef } from '../data/loot/db';
import { itemDisplayName } from './itemTooltip';

type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

const MAX_DISTANCE = 24;
/** Touch: labels shown at once; the rest collapse into one "+N items" chip. */
export const TOUCH_MAX_LABELS = 6;
/** Touch: common and magic items this close to the hero are picked up without a tap. */
export const AUTO_PICKUP_RADIUS = 2.5;
/** Rarity tiers from legendary up always keep their own label. */
const ALWAYS_SHOWN = new Set(['legendary', 'unique', 'mythic']);
/** Gap kept between stacked labels and to the screen edge, in px. */
const GAP = 2;
const EDGE = 4;

export interface LabelCandidate {
  key: number;
  dist: number;
  /** Legendary and better: never collapsed into the chip. */
  always: boolean;
}

/** Which candidates keep a label: every `always` one, then the nearest until `max` labels are used. */
export function chooseLabels(cands: LabelCandidate[], max: number): { shown: Set<number>; hidden: LabelCandidate[] } {
  const shown = new Set<number>();
  for (const c of cands) if (c.always) shown.add(c.key);
  const rest = cands.filter((c) => !c.always).sort((a, b) => a.dist - b.dist);
  const hidden: LabelCandidate[] = [];
  for (const c of rest) {
    if (shown.size < max) shown.add(c.key);
    else hidden.push(c);
  }
  return { shown, hidden };
}

/** Keeps a label of width `w` centred on `x` inside [EDGE, width - EDGE]. */
export function clampLabelX(x: number, w: number, width: number): number {
  const half = w / 2;
  if (width <= w + EDGE * 2) return width / 2;
  return Math.min(width - EDGE - half, Math.max(EDGE + half, x));
}

/**
 * Stacks overlapping labels upward, lowest on screen first. `h` is the label height (the step between
 * two stacked labels is `h + GAP`). Returns the y of each label in input order.
 */
export function stackLabels(items: { x: number; y: number; w: number }[], h: number): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[b]!.y - items[a]!.y);
  const placed: { x: number; y: number; w: number }[] = [];
  const out = new Array<number>(items.length).fill(0);
  const step = h + GAP;
  for (const i of order) {
    const p = items[i]!;
    let y = p.y;
    for (let guard = 0; guard < 40; guard++) {
      const hit = placed.find((q) => Math.abs(q.x - p.x) < (q.w + p.w) / 2 + 4 && Math.abs(q.y - y) < step);
      if (!hit) break;
      y = hit.y - step;
    }
    placed.push({ x: p.x, y, w: p.w });
    out[i] = y;
  }
  return out;
}

/**
 * A pile that grew past the top of the band (the left HUD column can leave little room) goes back inside it:
 * labels keep their order and hang from the band's top edge, one step apart, no lower than `bottom`.
 * `ys` are label bottoms (the labels are drawn upward from them), as `stackLabels` returns.
 */
export function fitBand(ys: number[], h: number, top: number, bottom: number): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a]! - ys[b]!);
  if (order.length === 0 || ys[order[0]!]! - h >= top) return ys;
  const out = [...ys];
  let y = top + h;
  for (const i of order) {
    out[i] = Math.min(bottom, y);
    y += h + GAP;
  }
  return out;
}

/** Touch label height (world.css) and the room a label band needs per label. */
const TOUCH_LABEL_H = 44;

/** How many labels fit in a band of this height, leaving one slot for the "+N items" chip. */
export function labelSlots(bandHeight: number, max = TOUCH_MAX_LABELS): number {
  return Math.max(2, Math.min(max, Math.floor(bandHeight / (TOUCH_LABEL_H + GAP)) - 1));
}

export class LootLabels {
  private readonly layer: HTMLDivElement;
  private readonly labels = new Map<Entity, HTMLDivElement>();
  private readonly screen = { x: 0, y: 0 };
  private chip: HTMLDivElement | null = null;
  private chipTarget: Entity | null = null;
  /** Touch auto-pickup: items asked for (with the time), and how many were taken since the last toast. */
  private readonly asked = new Map<Entity, number>();
  private taken = 0;
  private takenAt = 0;
  private band = { top: 0, bottom: 0, key: '' };

  constructor(
    private readonly root: HTMLElement,
    private readonly onPick: (e: Entity) => void,
    /** Grouped "Picked up N items" message after an auto-pickup burst. */
    private readonly onAutoPicked: (message: string) => void = () => {},
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'loot-labels';
    root.appendChild(this.layer);
  }

  /** The strip of the screen the labels may use: the layer minus the insets of its clip-path (world.css). */
  private labelBand(): { top: number; bottom: number } {
    const height = this.layer.clientHeight || window.innerHeight;
    // The top of the band follows the left HUD column (hud.ts sets --left-bottom as it grows and shrinks).
    const key = `${height}|${this.root.style.getPropertyValue('--left-bottom')}`;
    if (this.band.key !== key) {
      const m = /inset\(([\d.]+)px\s+[\d.]+px\s+([\d.]+)px/.exec(getComputedStyle(this.layer).clipPath);
      this.band = { top: m ? Number(m[1]) : 0, bottom: height - (m ? Number(m[2]) : 0), key };
    }
    return this.band;
  }

  private makeLabel(cls: string, text: string): HTMLDivElement {
    const label = document.createElement('div');
    label.className = cls;
    label.textContent = text;
    return label;
  }

  update(world: World, playerX: number, playerZ: number, showAll: boolean, project: Project): void {
    const touch = this.root.classList.contains('touch-ui');
    const now = performance.now();
    const seen = new Set<Entity>();
    const cands: (LabelCandidate & { e: Entity; g: GroundItem; sx: number; sy: number })[] = [];
    const autoPick: Entity[] = [];
    for (const e of world.query(GroundItem, Transform)) {
      const g = world.req(e, GroundItem);
      const tr = world.req(e, Transform);
      const dist = Math.hypot(tr.x - playerX, tr.z - playerZ);
      if (touch && g.age > 0.35 && dist <= AUTO_PICKUP_RADIUS && !g.item.crystal && (g.item.rarity === 'common' || g.item.rarity === 'magic')) autoPick.push(e);
      const visible = g.age > 0.35 && dist < MAX_DISTANCE && (showAll || g.item.rarity !== 'common' || g.item.crystal || dist < 5);
      if (!visible || !project(tr.x, 0.4, tr.z, this.screen)) continue;
      cands.push({ key: e, e, g, dist, always: ALWAYS_SHOWN.has(g.item.rarity), sx: this.screen.x, sy: this.screen.y - 18 });
    }
    // Touch: a few labels near the hero, the rest folded into "+N items".
    let shownSet: Set<number> | null = null;
    let hidden: LabelCandidate[] = [];
    const band = touch ? this.labelBand() : null;
    if (touch && band) {
      const pick = chooseLabels(cands, labelSlots(band.bottom - band.top));
      shownSet = pick.shown;
      hidden = pick.hidden;
    }
    const pending: { label: HTMLDivElement; x: number; y: number; w: number }[] = [];
    for (const c of cands) {
      if (shownSet && !shownSet.has(c.key)) continue;
      const { e, g } = c;
      seen.add(e);
      let label = this.labels.get(e);
      if (!label) {
        label = this.makeLabel('loot-label', itemDisplayName(g.item));
        label.style.color = g.item.crystal ? (CRYSTAL_DEFS.get(g.item.crystal.id)?.color ?? '#fff') : rarityDef(g.item.rarity).color;
        label.dataset.rarity = g.item.crystal ? 'crystal' : g.item.rarity;
        label.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.onPick(e);
        });
        this.layer.appendChild(label);
        this.labels.set(e, label);
        label.dataset.w = String(label.offsetWidth || 120);
        label.dataset.h = String(label.offsetHeight || 19);
      }
      pending.push({ label, x: c.sx, y: c.sy, w: Number(label.dataset.w) });
    }
    // The chip sits where the nearest folded item is and joins the stack like a label.
    if (hidden.length > 0) {
      const nearest = hidden[0]!;
      const at = cands.find((c) => c.key === nearest.key)!;
      if (!this.chip) {
        this.chip = this.makeLabel('loot-label loot-more', '');
        this.chip.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (this.chipTarget !== null) this.onPick(this.chipTarget);
        });
      }
      this.chipTarget = nearest.key;
      const text = t('loot.more', { n: hidden.length });
      if (this.chip.textContent !== text) {
        this.chip.textContent = text;
        this.chip.dataset.w = '';
      }
      if (!this.chip.isConnected) this.layer.appendChild(this.chip);
      if (!this.chip.dataset.w) this.chip.dataset.w = String(this.chip.offsetWidth || 80);
      pending.push({ label: this.chip, x: at.sx, y: at.sy, w: Number(this.chip.dataset.w) });
    } else if (this.chip?.isConnected) {
      this.chip.remove();
      this.chipTarget = null;
    }
    // Stack overlapping labels upward (touch labels are 44 px tall), then keep them on the screen.
    const height = touch ? TOUCH_LABEL_H : 19;
    // On touch the pile stays inside the band (the layer is clipped to it), growing upward from its lowest label.
    if (band) for (const p of pending) p.y = Math.min(band.bottom, Math.max(band.top + height, p.y));
    const stacked = stackLabels(pending, height);
    const ys = band ? fitBand(stacked, height, band.top, band.bottom) : stacked;
    const width = this.layer.clientWidth || window.innerWidth;
    pending.forEach((p, i) => {
      const x = clampLabelX(p.x, p.w, width);
      p.label.style.transform = `translate(${x}px, ${ys[i]}px) translate(-50%, -100%)`;
    });
    if (showAll) {
      for (const e of world.query(GroundGold, Transform)) {
        const tr = world.req(e, Transform);
        if (Math.hypot(tr.x - playerX, tr.z - playerZ) > MAX_DISTANCE || !project(tr.x, 0.3, tr.z, this.screen)) continue;
        seen.add(e);
        let label = this.labels.get(e);
        if (!label) {
          label = this.makeLabel('loot-label gold', t('ui.gold', { gold: world.req(e, GroundGold).amount }));
          this.layer.appendChild(label);
          this.labels.set(e, label);
        }
        label.style.transform = `translate(${this.screen.x}px, ${this.screen.y - 14}px) translate(-50%, -100%)`;
      }
    }
    for (const [e, label] of this.labels) {
      if (seen.has(e)) continue;
      label.remove();
      this.labels.delete(e);
    }
    this.autoPickup(world, autoPick, now);
  }

  /** Touch: take near common and magic items without a tap, and say so once ("Picked up 4 items"). */
  private autoPickup(world: World, near: Entity[], now: number): void {
    // Requests are made after the query loop: picking up destroys entities.
    for (const e of near) {
      const at = this.asked.get(e);
      if (at !== undefined && now - at < 8000) continue; // asked recently (a full backpack must not retry every frame)
      this.asked.set(e, now);
      this.onPick(e);
    }
    for (const [e, at] of this.asked) {
      if (!world.has(e, GroundItem)) {
        this.asked.delete(e);
        this.taken++;
        this.takenAt = now;
      } else if (now - at > 12000) this.asked.delete(e);
    }
    if (this.taken > 0 && now - this.takenAt > 350) {
      this.onAutoPicked(this.taken === 1 ? t('loot.pickedUpOne') : t('loot.pickedUp', { n: this.taken }));
      this.taken = 0;
    }
  }
}
