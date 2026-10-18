/**
 * Deep Rifts (docs/endgame.md): the Rift Obelisk's panel (pick a level among the open ones, see the best level
 * and time), the result panel after a clear (three glyph upgrade attempts, the player picks the glyph), and the
 * timer + progress bar shown while inside a rift.
 */
import { t } from '../data/i18n';
import { RIFT } from '../data/endgame/rifts';
import { riftItemPower, riftScale, type RiftPhase, type RiftResult } from '../systems/endgame/rifts';

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
  /** Lines of the upgrade attempts made so far. */
  private log: string[] = [];

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
    if (this.mode !== 'result') this.log = [];
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

    const slider = el('input', 'rift-slider');
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(Math.max(1, open));
    slider.value = String(this.level);
    slider.disabled = open <= 1;
    slider.addEventListener('input', () => this.setLevel(Number(slider.value)));
    rows.push(slider);

    rows.push(el('div', 'rift-effects', t('rifts.effects', { mul: riftScale(this.level).toFixed(2), power: riftItemPower(this.level) })));
    const go = el('button', 'service-btn rift-enter', t('rifts.enter', { level: this.level }));
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
    rows.push(el('p', 'rift-note', left > 0 ? t('rifts.attempts', { n: left }) : t('rifts.attemptsDone')));
    for (const g of this.actions.glyphs()) {
      const b = el('button', 'service-btn rift-glyph', t('rifts.glyphRow', { name: g.name, level: g.level }));
      b.dataset.testid = `rift-glyph-${g.id}`;
      b.disabled = left <= 0;
      b.addEventListener('click', () => {
        const r = this.actions.upgrade(g.id);
        if (r === false) return;
        this.log.push(r.ok ? t('rifts.upgraded', { name: g.name, level: r.level ?? 0 }) : t('rifts.failed', { name: g.name }));
        this.refresh();
      });
      rows.push(b);
    }
    if (this.log.length) rows.push(el('div', 'rift-log', this.log.join('\n')));
    rows.push(el('p', 'rift-note', t('rifts.cacheHint')));
    this.body.replaceChildren(...rows);
  }

  private glyphName(id: string): string {
    return this.actions.glyphs().find((g) => g.id === id)?.name ?? id;
  }
}

/** Timer and progress bar at the top of the screen while inside a rift. */
export class RiftHud {
  private readonly root: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly time: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private key = '';

  constructor(parent: HTMLElement) {
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

  update(state: { level: number; left: number; progress: number; phase: RiftPhase } | null): void {
    if (!state) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    this.root.dataset.phase = state.phase;
    const pct = Math.floor(state.progress * 100);
    const key = `${state.level}|${Math.ceil(state.left)}|${pct}|${state.phase}`;
    if (key === this.key) return;
    this.key = key;
    this.label.textContent = t('rifts.hud.level', { level: state.level });
    this.time.textContent = clock(state.left);
    this.time.classList.toggle('low', state.left < 60 && state.phase !== 'cleared');
    this.fill.style.width = `${state.phase === 'running' ? pct : 100}%`;
    this.status.textContent = t(`rifts.hud.${state.phase}`, { percent: pct });
  }
}
