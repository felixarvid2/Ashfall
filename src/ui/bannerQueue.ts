/**
 * The centre banner's queue (H062): a second banner ("Quest complete" a moment after "Level 12") waits for its
 * turn instead of overwriting the first. No DOM here, so it is testable; `Hud` renders `current`.
 */
export interface BannerItem {
  text: string;
  seconds: number;
  /** 'levelup' draws the gold banner with its sub-line button (H063). */
  variant?: 'levelup';
  sub?: string;
  onTap?: () => void;
}

/** Pause between two banners, so the second reads as a new message. */
export const BANNER_GAP = 0.15;
/** Waiting banners kept; the oldest is dropped beyond this. */
export const BANNER_QUEUE_MAX = 4;

export class BannerQueue {
  current: BannerItem | null = null;
  private readonly waiting: BannerItem[] = [];
  private left = 0;
  private gap = 0;

  get length(): number {
    return this.waiting.length;
  }

  /** Adds a banner. Returns false when the same text is already on screen or waiting. */
  push(item: BannerItem): boolean {
    const same = (b: BannerItem | null) => b !== null && b.text === item.text && b.variant === item.variant;
    if (same(this.current) || this.waiting.some(same)) return false;
    this.waiting.push(item);
    if (this.waiting.length > BANNER_QUEUE_MAX) this.waiting.shift();
    return true;
  }

  /** Advances the timers. Returns true when `current` changed (shown, swapped or cleared). */
  tick(dt: number): boolean {
    if (this.current) {
      this.left -= dt;
      if (this.left > 0) return false;
      this.current = null;
      this.gap = BANNER_GAP;
      return true;
    }
    if (this.gap > 0) this.gap -= dt;
    if (this.gap > 0) return false;
    const next = this.waiting.shift();
    if (!next) return false;
    this.current = next;
    this.left = next.seconds;
    return true;
  }

  clear(): void {
    this.current = null;
    this.waiting.length = 0;
    this.left = 0;
    this.gap = 0;
  }
}
