/**
 * B16: first-run graphics preset from a short benchmark. For the first two seconds of play the frame times are
 * collected; a device that cannot keep a steady frame rate at the starting preset steps down once. It never steps
 * up (phones start on medium on purpose) and runs only once per browser (`ashfall.gfxProbed`), never after the player
 * has touched the graphics setting.
 */
import type { GraphicsQuality } from './postfx';

/** How long the benchmark measures (seconds), after a short warm-up that skips shader compiles and first loads. */
export const PROBE_SECONDS = 2;
export const PROBE_WARMUP = 0.5;

export interface FrameStats {
  frames: number;
  /** Median frame time in ms. */
  median: number;
  /** 90th percentile frame time in ms. */
  p90: number;
}

/** Frame time statistics of a list of frame times in ms. */
export function frameStats(times: readonly number[]): FrameStats {
  if (times.length === 0) return { frames: 0, median: 0, p90: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return { frames: sorted.length, median: at(0.5), p90: at(0.9) };
}

/** Frames under this count are too few to judge (a hidden tab, a stall). */
export const MIN_FRAMES = 20;

const ORDER: GraphicsQuality[] = ['low', 'medium', 'high'];

/**
 * The preset to use, given the one the benchmark ran on. Median over 28 ms (under about 36 fps) goes to low; median
 * over 19 ms (under about 52 fps on a 60 Hz screen) or a bad 90th percentile goes one step down. A device that keeps
 * up stays where it is. Too few frames means no verdict.
 */
export function chooseGraphics(start: GraphicsQuality, stats: FrameStats): GraphicsQuality {
  if (stats.frames < MIN_FRAMES) return start;
  let target: GraphicsQuality = start;
  if (stats.median >= 28) target = 'low';
  else if (stats.median >= 19 || stats.p90 >= 60) target = ORDER[Math.max(0, ORDER.indexOf(start) - 1)]!;
  return ORDER.indexOf(target) < ORDER.indexOf(start) ? target : start;
}

/** Collects frame times (seconds) during play and reports the verdict once. */
export class GraphicsProbe {
  private elapsed = 0;
  private readonly times: number[] = [];
  private finished = false;

  constructor(
    private readonly start: GraphicsQuality,
    private readonly done: (choice: GraphicsQuality, stats: FrameStats) => void,
  ) {}

  get active(): boolean {
    return !this.finished;
  }

  /** Stop without a verdict (the player changed the setting). */
  cancel(): void {
    this.finished = true;
  }

  /** One drawn frame of `frameDt` real seconds. Long stalls (a tab switch) are not counted. */
  frame(frameDt: number): void {
    if (this.finished) return;
    this.elapsed += frameDt;
    if (this.elapsed >= PROBE_WARMUP && frameDt < 0.25) this.times.push(frameDt * 1000);
    if (this.elapsed >= PROBE_WARMUP + PROBE_SECONDS) {
      this.finished = true;
      const stats = frameStats(this.times);
      this.done(chooseGraphics(this.start, stats), stats);
    }
  }
}
