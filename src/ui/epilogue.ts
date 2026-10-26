/**
 * The end of the game: a full-screen epilogue card, then a small scrolling credits panel. Text arrives already
 * translated; `onDone` runs when the credits end or are skipped.
 *
 * On a phone: the card advances on a tap anywhere (and on its Continue button), the credits pause while a finger
 * is held on them, scroll at a speed that follows their length, keep the screen awake (Screen Wake Lock) and
 * leave through Skip, Escape or the Back button (the stack treats the screen as a modal).
 */
import { t } from '../data/i18n';
import { panelStack } from './panelStack';

/** Seconds the credits take at least / at most; the actual time follows the text length. */
const CREDITS_MIN_SECONDS = 24;
const CREDITS_MAX_SECONDS = 90;
/** Characters read per second while the credits scroll. */
const CREDITS_CHARS_PER_SECOND = 11;

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export class EpilogueScreen {
  private readonly root: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private done: (() => void) | null = null;
  private stage: 'card' | 'credits' | null = null;
  private credits: { title: string; lines: string[] } | null = null;
  private wakeLock: WakeLockSentinelLike | null = null;
  /** Milliseconds of credits left, and when the current run of them started (for pausing). */
  private remaining = 0;
  private runStart = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'epilogue';
    this.root.hidden = true;
    this.root.dataset.testid = 'epilogue';
    parent.appendChild(this.root);
    // Back and Escape move the ending along instead of leaving the page.
    panelStack.register({ id: 'epilogue', el: this.root, kind: 'modal', header: false, close: () => this.advance() });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** The card (title and paragraphs), then the credits lines; `onDone` after both. */
  show(card: { title: string; text: string }, credits: { title: string; lines: string[] }, onDone: () => void): void {
    this.done = onDone;
    this.credits = credits;
    this.stage = 'card';
    const title = Object.assign(document.createElement('h1'), { textContent: card.title });
    const body = card.text.split('\n').map((line) => Object.assign(document.createElement('p'), { textContent: line }));
    const next = Object.assign(document.createElement('button'), { textContent: t('ending.continue'), type: 'button' });
    next.dataset.testid = 'epilogue-continue';
    next.addEventListener('click', (e) => {
      e.stopPropagation();
      this.advance();
    });
    const hint = Object.assign(document.createElement('div'), { className: 'epilogue-hint', textContent: t('ending.tapContinue') });
    const page = document.createElement('div');
    page.className = 'epilogue-card';
    page.append(title, ...body, next, hint);
    // A tap anywhere on the card moves on (a drag that scrolls a long card does not).
    let down: { x: number; y: number } | null = null;
    this.root.onpointerdown = (e) => (down = { x: e.clientX, y: e.clientY });
    this.root.onpointerup = (e) => {
      if (this.stage === 'card' && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) this.advance();
      down = null;
    };
    this.root.replaceChildren(page);
    this.root.hidden = false;
    this.keepAwake();
  }

  /** Card to credits, credits to the end. */
  private advance(): void {
    if (this.stage === 'card' && this.credits) this.showCredits(this.credits);
    else this.finish();
  }

  private showCredits(credits: { title: string; lines: string[] }): void {
    this.stage = 'credits';
    const chars = credits.lines.reduce((n, l) => n + l.length, credits.title.length);
    const seconds = Math.round(Math.min(CREDITS_MAX_SECONDS, Math.max(CREDITS_MIN_SECONDS, 8 + chars / CREDITS_CHARS_PER_SECOND)));
    const scroll = document.createElement('div');
    scroll.className = 'epilogue-credits';
    scroll.style.setProperty('--credits-time', `${seconds}s`);
    scroll.append(Object.assign(document.createElement('h1'), { textContent: credits.title }), ...credits.lines.map((l) => Object.assign(document.createElement('p'), { textContent: l })));
    scroll.addEventListener('animationend', () => this.finish());
    const skip = Object.assign(document.createElement('button'), { textContent: t('ending.skip'), className: 'epilogue-skip', type: 'button' });
    skip.dataset.testid = 'epilogue-skip';
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish();
    });
    const hint = Object.assign(document.createElement('div'), { className: 'epilogue-hint credits-hint', textContent: t('ending.creditsHint') });
    // Holding a finger on the credits pauses them (and the timer that closes them).
    this.root.onpointerdown = () => this.pause(scroll, true);
    this.root.onpointerup = () => this.pause(scroll, false);
    this.root.onpointercancel = () => this.pause(scroll, false);
    this.root.replaceChildren(scroll, hint, skip);
    this.remaining = (seconds + 2) * 1000;
    this.runStart = performance.now();
    this.timer = setTimeout(() => this.finish(), this.remaining);
  }

  private pause(scroll: HTMLElement, on: boolean): void {
    if (this.stage !== 'credits') return;
    scroll.classList.toggle('paused', on);
    this.root.classList.toggle('paused', on);
    if (on) {
      if (this.timer === undefined) return;
      clearTimeout(this.timer);
      this.timer = undefined;
      this.remaining -= performance.now() - this.runStart;
    } else if (this.timer === undefined) {
      this.runStart = performance.now();
      this.timer = setTimeout(() => this.finish(), Math.max(1000, this.remaining));
    }
  }

  /** Ask the browser to keep the screen on while the ending plays (long credits would let it dim). */
  private keepAwake(): void {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl || this.wakeLock) return;
    wl.request('screen')
      .then((lock) => {
        // The ending may already be over by the time the browser answers.
        if (this.open) this.wakeLock = lock;
        else void lock.release();
      })
      .catch(() => {
        // Denied (battery saver, hidden tab): the credits still play.
      });
  }

  private finish(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.stage = null;
    this.credits = null;
    this.root.onpointerdown = this.root.onpointerup = this.root.onpointercancel = null;
    this.root.classList.remove('paused');
    this.root.hidden = true;
    this.root.replaceChildren();
    void this.wakeLock?.release().catch(() => {}); // releasing a lock that is already gone is fine
    this.wakeLock = null;
    const done = this.done;
    this.done = null;
    done?.();
  }
}
