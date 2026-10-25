/** Fade timing of the desktop title and control hints (A019): pure state, so it can be tested without a DOM. */

/** The title fades after this many seconds of play. */
export const TITLE_FADE_AFTER = 8;
/** The control hints fade after this many seconds of play, or at the first skill use. */
export const HINT_FADE_AFTER = 20;
/** F1 / ? show the hints again for this long. */
export const HINT_RECALL_FOR = 12;
/**
 * Largest step one update may add (s). The HUD feeds real elapsed time, not the simulation's clamped frame time:
 * a slow renderer (a software-GL headless browser at under 4 fps) would otherwise keep the hints up for minutes.
 * The cap only stops a long stall (a hidden tab) from counting in full.
 */
export const MAX_FADE_STEP = 5;

export class HintFade {
  playTime = 0;
  /** True once the hints have been seen (persisted by the caller). */
  seen: boolean;
  private recallLeft = 0;

  constructor(seen = false) {
    this.seen = seen;
  }

  /** F1 / ?: show the hints for 12 s. */
  recall(): void {
    this.recallLeft = HINT_RECALL_FOR;
  }

  /** Advance by `dt` real seconds; returns true on the update that marks the hints seen (the caller stores it). */
  step(dt: number, dead: boolean, skillUsed: boolean): boolean {
    const d = Math.min(Math.max(dt, 0), MAX_FADE_STEP);
    if (!dead) this.playTime += d;
    let newlySeen = false;
    if (!this.seen && (this.playTime > HINT_FADE_AFTER || skillUsed)) {
      this.seen = true;
      newlySeen = true;
    }
    this.recallLeft = Math.max(0, this.recallLeft - d);
    return newlySeen;
  }

  get hintFaded(): boolean {
    return this.seen && this.recallLeft <= 0;
  }

  get titleFaded(): boolean {
    return this.playTime > TITLE_FADE_AFTER;
  }
}
