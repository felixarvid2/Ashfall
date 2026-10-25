/**
 * First-run coach marks. Touch: move, attack, menu, interact. Desktop (F006, F025, F004): click to move, attack, then
 * tips keyed to what happens (low life -> potion, a telegraph -> dodge, loot dropped -> pick up, first item -> bag,
 * a skill point -> spend it). Each one points at the real control, shows once, and is done when the player does the
 * thing (or after a few seconds). "Skip tips" turns all of them off.
 * Progress lives in localStorage (`ashfall.hints`); the page works without it.
 *
 * Usage: `new CoachMarks(uiRoot)` once; it polls twice a second. Desktop tips are fed by `observe` (the HUD state, once
 * per frame) and `signalEvent` (game events); `HintScript` holds the order and is pure, so it is tested alone.
 */
import { t } from '../data/i18n';
import { getJsonPref, setJsonPref } from '../core/localPrefs';
import type { GameEvent } from '../core/events';

type TouchHint = 'move' | 'attack' | 'menu' | 'interact';
export type DesktopHint = 'click' | 'strike' | 'skill' | 'potion' | 'dodge' | 'loot' | 'bag';
type Hint = TouchHint | DesktopHint | 'quest';
const ORDER: TouchHint[] = ['move', 'attack', 'menu', 'interact'];
/** Desktop tips in the order they win when several are waiting: events first, then the two basics. */
export const DESKTOP_ORDER: DesktopHint[] = ['skill', 'potion', 'dodge', 'loot', 'bag', 'click', 'strike'];
const KNOWN: Hint[] = [...ORDER, ...DESKTOP_ORDER, 'quest'];

/** What can happen to start or finish a desktop tip. */
export type HintSignal =
  | 'clicked'
  | 'attacked'
  | 'lowLife'
  | 'telegraph'
  | 'dodged'
  | 'potionUsed'
  | 'lootDropped'
  | 'pickedUp'
  | 'bagOpened'
  | 'skillPoint'
  | 'skillSpent';

/** Which tips are waiting and which are done; `next` is the one to show. */
export class HintScript {
  readonly done: Set<Hint>;
  readonly pending = new Set<DesktopHint>();

  constructor(done: Iterable<Hint> = []) {
    this.done = new Set(done);
    if (!this.done.has('click')) this.pending.add('click');
    else if (!this.done.has('strike')) this.pending.add('strike');
  }

  private start(h: DesktopHint): void {
    if (!this.done.has(h)) this.pending.add(h);
  }

  private finish(h: DesktopHint): void {
    this.done.add(h);
    this.pending.delete(h);
  }

  /** Apply a signal; returns true when the set of finished tips changed (so the caller saves). */
  signal(s: HintSignal): boolean {
    const before = this.done.size;
    switch (s) {
      case 'clicked':
        this.finish('click');
        this.start('strike');
        break;
      case 'attacked':
        this.finish('strike');
        this.finish('click');
        break;
      case 'lowLife':
        this.start('potion');
        break;
      case 'potionUsed':
        this.finish('potion');
        break;
      case 'telegraph':
        this.start('dodge');
        break;
      case 'dodged':
        this.finish('dodge');
        break;
      case 'lootDropped':
        this.start('loot');
        break;
      case 'pickedUp':
        this.finish('loot');
        this.start('bag');
        break;
      case 'bagOpened':
        // Only a pending bag tip is ended by opening a panel; opening one earlier must not use the tip up.
        if (this.pending.has('bag')) this.finish('bag');
        break;
      case 'skillPoint':
        this.start('skill');
        break;
      case 'skillSpent':
        this.finish('skill');
        break;
    }
    return this.done.size !== before;
  }

  /** The tip to show now (not one in `skip`), or null. The basics wait for the event tips. */
  next(skip?: ReadonlySet<DesktopHint>): DesktopHint | null {
    return DESKTOP_ORDER.find((h) => this.pending.has(h) && !this.done.has(h) && !skip?.has(h)) ?? null;
  }
}

/** The slice of the HUD state the desktop tips watch. */
export interface HintObservation {
  life: { current: number; max: number };
  slots: { cooldown: number }[];
  dodge: { cooldown: number };
  potion: { charges: number };
  xp: { skillPoints: number };
  dead: boolean;
}

/**
 * Turn two consecutive HUD observations into signals: a skill on cooldown means an attack, a dodge on cooldown a dodge,
 * a lost potion charge a potion, life under half a reason to drink one, unspent points a reason to spend them.
 */
export function signalsFrom(prev: HintObservation | null, now: HintObservation): HintSignal[] {
  const out: HintSignal[] = [];
  if (now.dead) return out;
  if (now.slots.some((s) => s.cooldown > 0)) out.push('attacked');
  if (now.dodge.cooldown > 0) out.push('dodged');
  if (prev && now.potion.charges < prev.potion.charges) out.push('potionUsed');
  if (now.life.max > 0 && now.life.current / now.life.max < 0.5 && now.potion.charges > 0) out.push('lowLife');
  if (now.xp.skillPoints > 0) out.push('skillPoint');
  if (prev && now.xp.skillPoints < prev.xp.skillPoints) out.push('skillSpent');
  return out;
}

const KEY = 'ashfall.hints';
/** Seconds of stick input that count as "moved". */
const MOVE_SECONDS = 3;
/** A shown tip fades for good after this long even if the player ignores it. */
const SHOWN_SECONDS = 12;

interface Stored {
  done: Hint[];
  skipped: boolean;
}

/** Seconds a desktop tip stays up before it gives way (the skill tip comes back with the next point). */
const DESKTOP_SHOWN_SECONDS = 10;

function load(): Stored {
  const raw = getJsonPref<Partial<Stored>>(KEY, {});
  return { done: (Array.isArray(raw.done) ? raw.done : []).filter((h): h is Hint => KNOWN.includes(h)), skipped: !!raw.skipped };
}

function save(s: Stored): void {
  // Storage blocked: the tips just come back next visit.
  setJsonPref(KEY, s);
}

export interface CoachOptions {
  /** Shows a one-line message (the first quest done, F025). */
  toast?: (message: string) => void;
}

export class CoachMarks {
  private state = load();
  private readonly script = new HintScript(this.state.done);
  private readonly el: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private current: Hint | null = null;
  private shownFor = 0;
  private moveSeconds = 0;
  private lastPoll = performance.now();
  private prevObservation: HintObservation | null = null;
  /** Desktop tips that timed out this visit (shown again only if their trigger happens again). */
  private readonly snoozed = new Set<DesktopHint>();

  constructor(
    private readonly root: HTMLElement,
    private readonly options: CoachOptions = {},
  ) {
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
        // Desktop: a click on the playfield (the canvas) is the first move.
        if (target instanceof HTMLCanvasElement && !this.isTouch()) this.signal('clicked');
      },
      true,
    );
    setInterval(() => this.poll(), 500);
  }

  /** The tip being shown, if any (tests). */
  get showing(): Hint | null {
    return this.current;
  }

  private isTouch(): boolean {
    return this.root.classList.contains('touch-ui');
  }

  /** A desktop tip trigger or completion (see `HintScript`). Saves when a tip is finished. */
  signal(s: HintSignal): void {
    if (this.isTouch()) return;
    // A fresh event (not a level) brings back a tip that timed out earlier.
    const again = s === 'telegraph' ? 'dodge' : s === 'lootDropped' ? 'loot' : s === 'pickedUp' ? 'bag' : null;
    if (again) this.snoozed.delete(again);
    if (this.script.signal(s)) this.persist();
  }

  private persist(): void {
    this.state.done = [...new Set<Hint>([...this.state.done, ...this.script.done])];
    save(this.state);
  }

  /** Game events that start a tip (a telegraph, loot on the ground, an item picked up) or end one (the first quest done). */
  signalEvent(event: GameEvent): void {
    if (this.isTouch()) return;
    switch (event.type) {
      case 'telegraph':
        this.signal('telegraph');
        break;
      case 'loot':
        this.signal('lootDropped');
        break;
      case 'pickup':
        if (event.kind === 'item') this.signal('pickedUp');
        break;
      case 'quest':
        if (event.state === 'completed' && !this.state.done.includes('quest') && !this.state.skipped) {
          this.state.done.push('quest');
          this.persist();
          this.options.toast?.(t('onboarding.quest'));
        }
        break;
      default:
        break;
    }
  }

  /** Feed the HUD state once per frame (desktop tips watch life, cooldowns, the potion count and skill points). */
  observe(now: HintObservation): void {
    if (this.isTouch() || this.state.skipped) return;
    for (const s of signalsFrom(this.prevObservation, now)) this.signal(s);
    this.prevObservation = now;
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
    this.root.querySelectorAll('.coach-pulse').forEach((el) => el.classList.remove('coach-pulse'));
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
      case 'strike':
        return q('.slots .slot');
      case 'skill':
        return this.root.querySelectorAll<HTMLElement>('.slots .slot')[1] ?? null;
      case 'potion':
        return q('.slots .slot:last-child');
      case 'dodge':
        return q('.slots .slot:nth-last-child(2)');
      default:
        // click, loot, bag: over the playfield, above the action bar.
        return q('.action-bar');
    }
  }

  private poll(): void {
    const now = performance.now();
    const dt = (now - this.lastPoll) / 1000;
    this.lastPoll = now;
    const r = this.root;
    const touch = this.isTouch();
    const playing = !r.querySelector('.char-select') && !r.querySelector('.epilogue:not([hidden])') && !r.classList.contains('dead') && !r.classList.contains('hud-dead');
    if (!playing || this.state.skipped) return this.hide();
    if (!touch) return this.pollDesktop(dt);
    // Stick input counts towards "moved", whether or not the tip is up.
    if (r.querySelector('.touch-stick-base.active')) {
      this.moveSeconds += dt;
      if (this.moveSeconds >= MOVE_SECONDS) this.finish('move');
    }
    if (r.classList.contains('has-panel') || r.classList.contains('has-sheet')) {
      this.finish('menu');
      return this.hide();
    }
    const pending = ORDER.filter((h) => !this.state.done.includes(h));
    const next = pending.find((h) => (h === 'interact' ? this.anchor(h) !== null : true));
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

  /** Desktop: one tip at a time from `HintScript`, hidden while a panel is open; the bag tip ends when one opens. */
  private pollDesktop(dt: number): void {
    const r = this.root;
    const panel = r.classList.contains('has-panel') || r.classList.contains('has-sheet');
    if (panel) {
      this.signal('bagOpened');
      return this.hide();
    }
    const showable = this.script.next(this.snoozed);
    if (!showable) return this.hide();
    if (showable !== this.current) {
      this.current = showable;
      this.shownFor = 0;
      this.text.textContent = t(`onboarding.${showable}`);
    }
    this.shownFor += dt;
    // The skill tip stays until the point is spent (it hides while the skill panel is open).
    if (showable !== 'skill' && this.shownFor > DESKTOP_SHOWN_SECONDS) {
      // Timed out: the basics are done for good; an event tip waits for its trigger to happen again.
      if (showable === 'click' || showable === 'strike') this.signal(showable === 'click' ? 'clicked' : 'attacked');
      else {
        this.snoozed.add(showable);
        this.script.pending.delete(showable);
      }
      return this.hide();
    }
    const anchor = this.anchor(showable);
    if (!anchor) return this.hide();
    // The skill tip also pulses the slot a new skill will land in (F004).
    this.root.querySelectorAll('.coach-pulse').forEach((el) => el !== anchor && el.classList.remove('coach-pulse'));
    anchor.classList.toggle('coach-pulse', showable === 'skill');
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
