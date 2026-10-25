/**
 * Small pieces of game-feel UI that the game wires up in a few lines: the boss letterbox (F021), the zone-change
 * card with a tip (F013), and the rules for the guide to the first objective (F007). The DOM parts only toggle
 * classes (`src/ui/desktop/feel.css`); everything with a decision in it is a pure function, tested in tests/feel.test.ts.
 */
import { t } from '../data/i18n';
import { getPref, setPref } from '../core/localPrefs';

/** Number of `feel.tips.N` strings in the language file. */
export const TIP_COUNT = 15;

/** The tip for the `n`th zone change of this session, starting at a random offset so a returning player sees different ones. */
export function tipIndex(n: number, start: number): number {
  return (((start + n) % TIP_COUNT) + TIP_COUNT) % TIP_COUNT;
}

/** Milliseconds the screen must stay black after `elapsedMs`, so the card can be read (0 once `minBlackMs` has passed). */
export function blackHoldMs(elapsedMs: number, minBlackMs: number): number {
  return Math.max(0, minBlackMs - elapsedMs);
}

/** Clock, timers and frames the black hold runs on, so a test can drive it with a fake clock (and the game uses real time). */
export interface HoldEnv {
  now(): number;
  after(ms: number, fn: () => void): void;
  frames(n: number, fn: () => void): void;
}

/** Real time: `performance.now`, `setTimeout` and `requestAnimationFrame`. */
export const realHoldEnv: HoldEnv = {
  now: () => performance.now(),
  after: (ms, fn) => void setTimeout(fn, ms),
  frames: (n, fn) => {
    const step = (left: number): void => (left <= 0 ? fn() : void requestAnimationFrame(() => step(left - 1)));
    step(n);
  },
};

export interface HoldPlan {
  /** Real milliseconds the screen stays black counted from `started` (the card must be readable). */
  minBlackMs: number;
  /** After `settled`, the most real time spent waiting for two drawn frames. Under 1 fps they would take seconds. */
  frameCapMs: number;
  /** From the call, the latest the screen is released whatever else is pending. */
  hardCapMs: number;
  /** Resolves when the new place's models are in (already capped by the caller). */
  settled: Promise<unknown>;
}

/**
 * Release the black screen once `minBlackMs` of real time has passed since `started` and the new place has had two
 * frames, but never wait on frames longer than `frameCapMs` after `settled`, nor longer than `hardCapMs` overall. All
 * of it is wall-clock time (F013, F014), not frame counts: software rendering at 1 fps no longer stretches it.
 */
export function holdThenRelease(env: HoldEnv, started: number, plan: HoldPlan, release: () => void): void {
  const called = env.now();
  let done = false;
  let ready = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    release();
  };
  const onReady = (): void => {
    if (ready) return;
    ready = true;
    env.after(blackHoldMs(env.now() - started, plan.minBlackMs), finish);
  };
  void plan.settled.then(
    () => {
      env.frames(2, onReady);
      env.after(plan.frameCapMs, onReady);
    },
    () => onReady(),
  );
  env.after(Math.max(0, plan.hardCapMs - (env.now() - called)), finish);
}

/** The first main quest, whose objective gets the golden guide line (F007). */
export const GUIDE_QUEST = 'mq.wake_up';

/** The point the guide line leads to: the nearest marker of the tracked first quest, or null for any other quest. */
export function guideGoal(
  tracked: string | null,
  markers: readonly { quest: string; x: number; z: number }[],
  px: number,
  pz: number,
): { x: number; z: number } | null {
  if (tracked !== GUIDE_QUEST) return null;
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (const m of markers) {
    if (m.quest !== GUIDE_QUEST) continue;
    const d = Math.hypot(m.x - px, m.z - pz);
    if (d < bestD) {
      bestD = d;
      best = { x: m.x, z: m.z };
    }
  }
  return best;
}

const GUIDE_SEEN = 'ashfall.guideSeen';

export class FeelUi {
  private readonly letterbox: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly cardName: HTMLDivElement;
  private readonly cardTip: HTMLDivElement;
  private letterboxTimer: ReturnType<typeof setTimeout> | undefined;
  private zoneChanges = 0;
  private readonly tipStart = Math.floor(Math.random() * TIP_COUNT);

  /** `fade` is the black zone-change overlay; the card lives inside it so it shows exactly while the screen is dark. */
  constructor(root: HTMLElement, fade: HTMLElement) {
    this.letterbox = document.createElement('div');
    this.letterbox.className = 'feel-letterbox';
    this.letterbox.setAttribute('aria-hidden', 'true');
    root.append(this.letterbox);
    this.card = document.createElement('div');
    this.card.className = 'zone-card';
    this.cardName = document.createElement('div');
    this.cardName.className = 'zone-card-name';
    this.cardTip = document.createElement('div');
    this.cardTip.className = 'zone-card-tip';
    this.card.append(this.cardName, this.cardTip);
    fade.append(this.card);
  }

  /** Cinema bars for `seconds` (desktop only; the CSS hides them on touch). */
  bossBeat(seconds: number): void {
    this.letterbox.classList.add('on');
    clearTimeout(this.letterboxTimer);
    this.letterboxTimer = setTimeout(() => this.letterbox.classList.remove('on'), seconds * 1000);
  }

  /** Put the destination and the next tip on the dark screen. `name` may be empty (a respawn shows only its line). */
  setCard(name: string, tip: boolean): void {
    this.cardName.textContent = name;
    this.cardTip.textContent = tip ? t(`feel.tips.${tipIndex(this.zoneChanges++, this.tipStart)}`) : '';
    this.card.classList.toggle('empty', name === '' && !tip);
  }

  /** True the first time it is called on this browser: the one-time "follow the trail" banner (F007). */
  takeGuideBanner(): boolean {
    if (getPref(GUIDE_SEEN) === '1') return false;
    setPref(GUIDE_SEEN, '1');
    return true;
  }
}
