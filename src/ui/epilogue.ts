/**
 * The end of the game: a full-screen epilogue card, then a small scrolling credits panel. Text arrives already
 * translated; `onDone` runs when the credits end or are skipped.
 */
import { t } from '../data/i18n';

/** Seconds the credits take to scroll; a timer closes them too, in case the page never runs the animation. */
const CREDITS_SECONDS = 28;

export class EpilogueScreen {
  private readonly root: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private done: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'epilogue';
    this.root.hidden = true;
    this.root.dataset.testid = 'epilogue';
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** The card (title and paragraphs), then the credits lines; `onDone` after both. */
  show(card: { title: string; text: string }, credits: { title: string; lines: string[] }, onDone: () => void): void {
    this.done = onDone;
    const title = Object.assign(document.createElement('h1'), { textContent: card.title });
    const body = card.text.split('\n').map((line) => Object.assign(document.createElement('p'), { textContent: line }));
    const next = Object.assign(document.createElement('button'), { textContent: t('ending.continue') });
    next.dataset.testid = 'epilogue-continue';
    next.addEventListener('click', () => this.showCredits(credits));
    const page = document.createElement('div');
    page.className = 'epilogue-card';
    page.append(title, ...body, next);
    this.root.replaceChildren(page);
    this.root.hidden = false;
  }

  private showCredits(credits: { title: string; lines: string[] }): void {
    const scroll = document.createElement('div');
    scroll.className = 'epilogue-credits';
    scroll.style.setProperty('--credits-time', `${CREDITS_SECONDS}s`);
    scroll.append(Object.assign(document.createElement('h1'), { textContent: credits.title }), ...credits.lines.map((l) => Object.assign(document.createElement('p'), { textContent: l })));
    scroll.addEventListener('animationend', () => this.finish());
    const skip = Object.assign(document.createElement('button'), { textContent: t('ending.skip'), className: 'epilogue-skip' });
    skip.dataset.testid = 'epilogue-skip';
    skip.addEventListener('click', () => this.finish());
    this.root.replaceChildren(scroll, skip);
    this.timer = setTimeout(() => this.finish(), (CREDITS_SECONDS + 2) * 1000);
  }

  private finish(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.root.hidden = true;
    this.root.replaceChildren();
    const done = this.done;
    this.done = null;
    done?.();
  }
}
