/**
 * Deep Rifts (docs/endgame.md): the Rift Obelisk's panel (pick a level among the open ones, see the best level
 * and time), the result panel after a clear (three glyph upgrade attempts, the player picks the glyph), and the
 * timer + progress bar shown while inside a rift.
 */
import { t } from '../data/i18n';
import { RIFT, RIFT_REWARDS } from '../data/endgame/rifts';
import { riftItemPower, riftScale, type RiftPhase, type RiftResult } from '../systems/endgame/rifts';
import { buzz, haptic } from './haptics';
import { GLYPH_MAX_LEVEL } from '../data/endgame/matrix';
import { glyphUpgradeChance } from '../systems/endgame/matrix';

export interface RiftPanelActions {
  /** Highest level the account may enter, the best cleared, and the best time (s, 0 = none). */
  levels(): { open: number; best: number; time: number };
  enter(level: number): void;
  /** The character's glyphs, for the upgrade attempts. */
  glyphs(): { id: string; name: string; level: number }[];
  /** Upgrade attempts left, and the last clear's summary (null outside a cleared rift). */
  attempts(): number;
  result(): RiftResult | null;
  upgrade(glyphId: string): { ok: boolean; level: number | null } | false;
}

/** m:ss */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Chance (0..100) that the next upgrade attempt on a glyph works after a rift of `riftLevel`; 0 for a glyph at the top level. */
export function glyphChancePercent(glyphLevel: number, riftLevel: number): number {
  if (glyphLevel >= GLYPH_MAX_LEVEL) return 0;
  return Math.round(glyphUpgradeChance(glyphLevel, riftLevel) * 100);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class RiftPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private mode: 'select' | 'result' | null = null;
  private level = 1;
  /** The last upgrade attempt per glyph, shown under its row. */
  private results = new Map<string, { text: string; ok: boolean }>();

  constructor(parent: HTMLElement, private readonly actions: RiftPanelActions) {
    this.root = el('div', 'panel rift-panel');
    this.root.hidden = true;
    this.root.dataset.testid = 'rift-panel';
    this.title = el('h2');
    const close = el('button', 'service-close', '×');
    close.addEventListener('click', () => this.close());
    this.body = el('div');
    this.root.append(close, this.title, this.body);
    parent.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  get current(): 'select' | 'result' | null {
    return this.open ? this.mode : null;
  }

  /** The obelisk: pick a level. Starts at the highest open one. */
  showSelect(): void {
    this.mode = 'select';
    this.level = this.actions.levels().open;
    this.root.hidden = false;
    this.refresh();
  }

  /** After a clear: glyph upgrades. */
  showResult(): void {
    if (this.mode !== 'result') this.results.clear();
    this.mode = 'result';
    this.root.hidden = false;
    this.refresh();
  }

  close(): void {
    this.root.hidden = true;
  }

  setLevel(level: number): void {
    const { open } = this.actions.levels();
    this.level = Math.max(1, Math.min(open, Math.round(level)));
    this.refresh();
  }

  refresh(): void {
    if (!this.open) return;
    if (this.mode === 'result') return this.renderResult();
    this.renderSelect();
  }

  private renderSelect(): void {
    this.title.textContent = t('rifts.title');
    const { open, best, time } = this.actions.levels();
    this.level = Math.max(1, Math.min(open, this.level));
    const rows: HTMLElement[] = [];
    rows.push(el('p', 'rift-note', t('rifts.intro', { minutes: RIFT.time / 60 })));
    rows.push(el('div', 'rift-best', best > 0 ? t('rifts.best', { level: best, time: time > 0 ? clock(time) : '–' }) : t('rifts.noBest')));
    rows.push(el('div', 'rift-open', t('rifts.open', { max: open })));

    const stepper = el('div', 'rift-stepper');
    const step = (label: string, delta: number, testid: string) => {
      const b = el('button', 'service-btn rift-step', label);
      b.dataset.testid = testid;
      b.disabled = (delta < 0 && this.level <= 1) || (delta > 0 && this.level >= open);
      b.addEventListener('click', () => this.setLevel(this.level + delta));
      return b;
    };
    const value = el('div', 'rift-level', String(this.level));
    value.dataset.testid = 'rift-level';
    stepper.append(step('−10', -10, 'rift-m10'), step('−', -1, 'rift-m1'), value, step('+', 1, 'rift-p1'), step('+10', 10, 'rift-p10'));
    rows.push(stepper);
    // Quick jumps: the best cleared level, the highest open one, five easier.
    const quick = el('div', 'rift-quick');
    const jump = (label: string, to: number, testid: string) => {
      const b = el('button', 'service-btn rift-jump', label);
      b.dataset.testid = testid;
      b.disabled = to < 1 || to > open || to === this.level;
      b.addEventListener('click', () => this.setLevel(to));
      return b;
    };
    quick.append(jump(t('rifts.quickBest', { level: best }), best, 'rift-best'), jump(t('rifts.quickHighest'), open, 'rift-highest'), jump(t('rifts.quickEasier'), this.level - 5, 'rift-easier'));
    rows.push(quick);

    const slider = el('input', 'rift-slider');
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(Math.max(1, open));
    slider.value = String(this.level);
    slider.disabled = open <= 1;
    slider.addEventListener('input', () => this.setLevel(Number(slider.value)));
    rows.push(slider);

    // What the level changes, as chips (the long sentence stays as the tooltip).
    const effects = el('div', 'rift-effects');
    effects.title = t('rifts.effects', { mul: riftScale(this.level).toFixed(2), power: riftItemPower(this.level) });
    effects.append(el('span', 'rift-chip', t('rifts.chipLife', { mul: riftScale(this.level).toFixed(2) })), el('span', 'rift-chip', t('rifts.chipPower', { power: riftItemPower(this.level) })));
    rows.push(effects);
    const go = el('button', 'service-btn rift-enter', t('rifts.enterTimed', { level: this.level, time: clock(RIFT.time) }));
    go.dataset.testid = 'rift-enter';
    go.addEventListener('click', () => {
      this.close();
      this.actions.enter(this.level);
    });
    rows.push(go);
    this.body.replaceChildren(...rows);
  }

  private renderResult(): void {
    const res = this.actions.result();
    this.title.textContent = t('rifts.cleared', { level: res?.level ?? 0 });
    const rows: HTMLElement[] = [];
    if (res) {
      rows.push(el('div', 'rift-best', t('rifts.resultTime', { time: clock(res.elapsed), open: res.open })));
      if (res.fast) rows.push(el('div', 'rift-open', t('rifts.fast')));
      for (const tier of res.tiers) rows.push(el('div', 'rift-tier', t('rifts.tierUnlocked', { tier: t(`worldTiers.${tier}.name`) })));
      if (res.grantedGlyph) rows.push(el('div', 'rift-open', t('rifts.glyphGranted', { name: this.glyphName(res.grantedGlyph) })));
    }
    const left = this.actions.attempts();
    // Attempts left as pips (the total is what a clear gives), then the sentence for the screen reader.
    const total = Math.max(left, RIFT_REWARDS.glyphAttempts);
    const pips = el('div', 'rift-pips');
    pips.setAttribute('role', 'img');
    pips.setAttribute('aria-label', left > 0 ? t('rifts.attempts', { n: left }) : t('rifts.attemptsDone'));
    for (let i = 0; i < total; i++) pips.append(el('span', i < left ? 'rift-pip on' : 'rift-pip'));
    rows.push(pips);
    rows.push(el('p', 'rift-note', left > 0 ? t('rifts.attempts', { n: left }) : t('rifts.attemptsDone')));
    for (const g of this.actions.glyphs()) {
      const chance = glyphChancePercent(g.level, res?.level ?? 1);
      const b = el('button', 'service-btn rift-glyph');
      b.dataset.testid = `rift-glyph-${g.id}`;
      b.disabled = left <= 0 || g.level >= GLYPH_MAX_LEVEL;
      b.append(
        el('span', 'rift-glyph-level', String(g.level)),
        el('span', 'rift-glyph-name', t('rifts.glyphRow', { name: g.name, level: g.level })),
        el('span', 'rift-glyph-chance', g.level >= GLYPH_MAX_LEVEL ? t('rifts.glyphMax') : `${chance}%`),
      );
      b.addEventListener('click', () => {
        const r = this.actions.upgrade(g.id);
        if (r === false) return;
        haptic(r.ok ? 'success' : 'error');
        this.results.set(g.id, { ok: r.ok, text: r.ok ? t('rifts.upgraded', { name: g.name, level: r.level ?? 0 }) : t('rifts.failed', { name: g.name }) });
        this.refresh();
      });
      rows.push(b);
      // The outcome of the last attempt shows right under the row, with a short animation.
      const result = this.results.get(g.id);
      if (result) rows.push(el('div', `rift-result ${result.ok ? 'ok' : 'fail'}`, result.text));
    }
    rows.push(el('p', 'rift-note', t('rifts.cacheHint')));
    const done = el('button', 'service-btn rift-done', t('rifts.done'));
    done.dataset.testid = 'rift-done';
    done.addEventListener('click', () => this.close());
    rows.push(done);
    this.body.replaceChildren(...rows);
  }

  private glyphName(id: string): string {
    return this.actions.glyphs().find((g) => g.id === id)?.name ?? id;
  }
}

/** Seconds left at which the rift timer buzzes once (H076). */
export const RIFT_BUZZ_AT = [60, 30, 10] as const;

/** The threshold to announce now, if any: the lowest one crossed that has not fired yet. Marks it as fired. */
export function riftTimeCue(left: number, fired: Set<number>): number | null {
  if (left > RIFT_BUZZ_AT[0]) {
    // A fresh rift (or a restart): everything can fire again.
    fired.clear();
    return null;
  }
  let cue: number | null = null;
  for (const at of RIFT_BUZZ_AT) {
    if (left <= at && !fired.has(at)) {
      fired.add(at);
      cue = at;
    }
  }
  return cue;
}

/** Timer and progress bar at the top of the screen while inside a rift (on a phone: a chip, see portrait/hud.css). */
export class RiftHud {
  private readonly root: HTMLDivElement;
  /** Phone layout: the timer pinned in the life bar and the progress as a strip under the XP bar (H075). */
  private readonly pin: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private readonly stripFill: HTMLDivElement;
  private readonly fired = new Set<number>();
  private readonly label: HTMLDivElement;
  private readonly time: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private key = '';

  /** `pinParent` is the HUD root that holds the phone's timer pin and progress strip. */
  constructor(parent: HTMLElement, pinParent: HTMLElement = parent) {
    this.pin = el('div', 'rift-pin');
    this.pin.hidden = true;
    this.pin.dataset.testid = 'rift-pin';
    this.strip = el('div', 'rift-strip');
    this.strip.hidden = true;
    this.stripFill = el('div', 'rift-strip-fill');
    this.strip.append(this.stripFill);
    pinParent.append(this.pin, this.strip);
    this.root = el('div', 'rift-hud');
    this.root.hidden = true;
    this.root.dataset.testid = 'rift-hud';
    this.label = el('div', 'rift-hud-label');
    this.time = el('div', 'rift-hud-time');
    const bar = el('div', 'rift-hud-bar');
    this.fill = el('div', 'rift-hud-fill');
    bar.append(this.fill);
    this.status = el('div', 'rift-hud-status');
    const head = el('div', 'rift-hud-head');
    head.append(this.label, this.time);
    this.root.append(head, bar, this.status);
    parent.append(this.root);
  }

  /** The row, for the phone's endgame chip. */
  get element(): HTMLElement {
    return this.root;
  }

  update(state: { level: number; left: number; progress: number; phase: RiftPhase } | null): void {
    if (!state) {
      this.root.hidden = true;
      this.pin.hidden = true;
      this.strip.hidden = true;
      this.fired.clear();
      return;
    }
    this.root.hidden = false;
    this.pin.hidden = false;
    this.strip.hidden = false;
    this.strip.dataset.phase = state.phase;
    this.root.dataset.phase = state.phase;
    const pct = Math.floor(state.progress * 100);
    const key = `${state.level}|${Math.ceil(state.left)}|${pct}|${state.phase}`;
    if (key === this.key) return;
    this.key = key;
    this.label.textContent = t('rifts.hud.level', { level: state.level });
    this.time.textContent = clock(state.left);
    const low = state.left < 60 && state.phase !== 'cleared' && state.phase !== 'failed';
    this.time.classList.toggle('low', low);
    this.pin.textContent = clock(state.left);
    this.pin.classList.toggle('low', low);
    this.pin.title = t('rifts.hud.level', { level: state.level });
    const width = `${state.phase === 'running' ? pct : 100}%`;
    this.fill.style.width = width;
    this.stripFill.style.width = width;
    // A short buzz as the clock passes a minute, half a minute and ten seconds.
    if (riftTimeCue(state.left, this.fired) !== null && low) buzz([40, 40, 40]);
    this.status.textContent = t(`rifts.hud.${state.phase}`, { percent: pct });
  }
}
