/**
 * First-run coach marks for touch play: move, attack, menu, interact. Each one points at the real control, shows
 * once, and is done when the player does the thing (or after a few seconds). "Skip tips" turns all of them off.
 * Progress lives in localStorage (`ashfall.hints`); the page works without it.
 *
 * Usage: `new CoachMarks(uiRoot)` once; it polls twice a second and does nothing outside touch play.
 */
import { t } from '../data/i18n';

type Hint = 'move' | 'attack' | 'menu' | 'interact';
const ORDER: Hint[] = ['move', 'attack', 'menu', 'interact'];
const KEY = 'ashfall.hints';
/** Seconds of stick input that count as "moved". */
const MOVE_SECONDS = 3;
/** A shown tip fades for good after this long even if the player ignores it. */
const SHOWN_SECONDS = 12;

interface Stored {
  done: Hint[];
  skipped: boolean;
}

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Stored>;
    return { done: (raw.done ?? []).filter((h): h is Hint => ORDER.includes(h)), skipped: !!raw.skipped };
  } catch {
    return { done: [], skipped: false };
  }
}

function save(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the tips just come back next visit.
  }
}

export class CoachMarks {
  private state = load();
  private readonly el: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private current: Hint | null = null;
  private shownFor = 0;
  private moveSeconds = 0;
  private lastPoll = performance.now();

  constructor(private readonly root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'coach-mark';
    this.el.hidden = true;
    this.el.dataset.testid = 'coach-mark';
    this.text = document.createElement('span');
    const skip = Object.assign(document.createElement('button'), { type: 'button', className: 'coach-skip', textContent: t('onboarding.skip') });
    skip.addEventListener('click', () => {
      this.state.skipped = true;
      save(this.state);
      this.hide();
    });
    this.el.append(this.text, skip);
    root.append(this.el);
    // Doing the thing finishes its tip.
    document.addEventListener(
      'pointerdown',
      (e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('.slots .slot')) this.finish('attack');
        if (target?.closest('.interact-prompt')) this.finish('interact');
      },
      true,
    );
    if (!this.state.skipped && ORDER.some((h) => !this.state.done.includes(h))) setInterval(() => this.poll(), 500);
  }

  /** The tip being shown, if any (tests). */
  get showing(): Hint | null {
    return this.current;
  }

  private finish(hint: Hint): void {
    if (this.state.done.includes(hint)) return;
    this.state.done.push(hint);
    save(this.state);
    if (this.current === hint) this.hide();
  }

  private hide(): void {
    this.current = null;
    this.el.hidden = true;
  }

  private anchor(hint: Hint): HTMLElement | null {
    const q = (s: string) => this.root.querySelector<HTMLElement>(s);
    switch (hint) {
      case 'move':
        return q('.touch-stick-base') ?? q('.touch-stick-zone');
      case 'attack':
        return q('.slots .slot');
      case 'menu':
        return q('.touch-menu');
      case 'interact': {
        const p = q('.interact-prompt');
        return p && !p.hidden ? p : null;
      }
    }
  }

  private poll(): void {
    const now = performance.now();
    const dt = (now - this.lastPoll) / 1000;
    this.lastPoll = now;
    const r = this.root;
    const touch = r.classList.contains('touch-ui');
    const playing = !r.querySelector('.char-select') && !r.querySelector('.epilogue:not([hidden])') && !r.classList.contains('dead');
    if (!touch || !playing || this.state.skipped) return this.hide();
    // Stick input counts towards "moved", whether or not the tip is up.
    if (r.querySelector('.touch-stick-base.active')) {
      this.moveSeconds += dt;
      if (this.moveSeconds >= MOVE_SECONDS) this.finish('move');
    }
    if (r.classList.contains('has-panel') || r.classList.contains('has-sheet')) {
      this.finish('menu');
      return this.hide();
    }
    const next = ORDER.find((h) => !this.state.done.includes(h) && (h === 'interact' ? this.anchor(h) !== null : true));
    // The menu tip waits for the attack tip; interact can come at any time a prompt is on screen.
    if (!next) return this.hide();
    if (next !== this.current) {
      this.current = next;
      this.shownFor = 0;
      this.text.textContent = t(`onboarding.${next}`);
    }
    this.shownFor += dt;
    if (this.shownFor > SHOWN_SECONDS && next !== 'move') {
      this.finish(next);
      return this.hide();
    }
    const anchor = this.anchor(next);
    if (!anchor) return this.hide();
    this.place(anchor);
  }

  private place(anchor: HTMLElement): void {
    const a = anchor.getBoundingClientRect();
    this.el.hidden = false;
    const w = Math.min(240, window.innerWidth - 16);
    this.el.style.width = `${w}px`;
    const h = this.el.offsetHeight;
    // Above the control when there is room, else below it; the arrow points at the control.
    const above = a.top - h - 14 > 8;
    const top = above ? a.top - h - 12 : a.bottom + 12;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, a.left + a.width / 2 - w / 2));
    this.el.classList.toggle('below', !above);
    this.el.style.top = `${Math.max(8, top)}px`;
    this.el.style.left = `${left}px`;
    this.el.style.setProperty('--arrow-x', `${Math.max(14, Math.min(w - 14, a.left + a.width / 2 - left))}px`);
  }
}
