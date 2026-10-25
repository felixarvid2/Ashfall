/**
 * Fixed-timestep game loop.
 *
 * Logic runs at a constant rate (default 60 Hz) so combat, AI and RNG are
 * frame-rate independent. Rendering runs once per animation frame and gets an
 * `alpha` in [0, 1) to interpolate between the previous and current tick.
 */

export interface LoopCallbacks {
  /** Advance game logic by exactly `dt` seconds. */
  update(dt: number): void;
  /** Draw. `alpha` is how far we are between the last two ticks; `frameDt` is real elapsed time. */
  render(alpha: number, frameDt: number): void;
}

/** Opt-in protection against a throwing tick (see `GameLoop.guard`). */
export interface LoopGuard {
  /** Called for every exception from update or render. */
  onError(err: unknown): void;
  /** Called once after `maxErrors` exceptions within `windowMs`; the loop has stopped by then. */
  onFatal(err: unknown): void;
  maxErrors?: number;
  windowMs?: number;
  /** Clock for the error window; tests pass their own. */
  now?: () => number;
}

export class GameLoop {
  readonly tickRate: number;
  readonly dt: number;
  /** Multiplier on simulated time (0 = paused). Used later for hit-stop. */
  timeScale = 1;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  /**
   * When set, an exception in update or render is reported and swallowed (the loop keeps going), and
   * the loop stops with `onFatal` after too many in a short time. Unset, exceptions propagate, which
   * is what tests and headless tools want.
   */
  guard: LoopGuard | null = null;
  private errorStamps: number[] = [];
  /** Cap per frame so a long stall (tab switch, breakpoint) can't spiral. */
  private readonly maxFrameTime = 0.25;
  /** At most this many ticks per frame; whatever time is left over is dropped (the game slows down instead of freezing). */
  readonly maxTicksPerFrame = 5;
  /** Stop catching up once the ticks of one frame have used this much wall time (ms), whatever the tick count. */
  readonly tickBudgetMs = 12;
  /** Frames that dropped time because the device could not keep up, and the ticks dropped (for the debug panel). */
  slowFrames = 0;
  droppedTicks = 0;

  constructor(
    private readonly callbacks: LoopCallbacks,
    tickRate = 60,
    /** Wall clock in ms; tests pass a fake. */
    private readonly now: () => number = () => performance.now(),
  ) {
    this.tickRate = tickRate;
    this.dt = 1 / tickRate;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Advance the loop manually (tests, headless tools). */
  step(frameTime: number): void {
    const clamped = Math.min(frameTime, this.maxFrameTime);
    this.accumulator += clamped * this.timeScale;
    const started = this.now();
    let ticks = 0;
    while (this.accumulator >= this.dt) {
      if (!this.run(() => this.callbacks.update(this.dt))) {
        // A failed tick still consumes its time, so a throwing update cannot spin this loop forever.
        this.accumulator = 0;
        return;
      }
      this.accumulator -= this.dt;
      ticks++;
      if (ticks >= this.maxTicksPerFrame || this.now() - started >= this.tickBudgetMs) break;
    }
    if (this.accumulator >= this.dt) {
      // Still behind: forget the backlog rather than chase it next frame (the spiral of death).
      this.droppedTicks += Math.floor(this.accumulator / this.dt);
      this.slowFrames++;
      this.accumulator = 0;
    }
    this.run(() => this.callbacks.render(this.accumulator / this.dt, clamped));
  }

  /** Runs one callback under the guard. Returns false when it threw (guarded) or the loop was stopped. */
  private run(fn: () => void): boolean {
    const guard = this.guard;
    if (!guard) {
      fn();
      return true;
    }
    try {
      fn();
      return true;
    } catch (err) {
      this.reportError(guard, err);
      return false;
    }
  }

  private reportError(guard: LoopGuard, err: unknown): void {
    const now = (guard.now ?? performance.now.bind(performance))();
    const windowMs = guard.windowMs ?? 1000;
    this.errorStamps = this.errorStamps.filter((t) => now - t < windowMs);
    this.errorStamps.push(now);
    try {
      guard.onError(err);
    } catch {
      // The reporter must not take the loop down with it.
    }
    if (this.errorStamps.length >= (guard.maxErrors ?? 5)) {
      this.stop();
      this.errorStamps = [];
      guard.onFatal(err);
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    try {
      this.step(frameTime);
    } finally {
      // Re-arm even when step throws (no guard set), so one bad tick is not the end of the loop.
      if (this.running) this.rafId = requestAnimationFrame(this.frame);
    }
  };
}
