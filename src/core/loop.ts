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

export class GameLoop {
  readonly tickRate: number;
  readonly dt: number;
  /** Multiplier on simulated time (0 = paused). Used later for hit-stop. */
  timeScale = 1;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  /** Cap per frame so a long stall (tab switch, breakpoint) can't spiral. */
  private readonly maxFrameTime = 0.25;

  constructor(
    private readonly callbacks: LoopCallbacks,
    tickRate = 60,
  ) {
    this.tickRate = tickRate;
    this.dt = 1 / tickRate;
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
    while (this.accumulator >= this.dt) {
      this.callbacks.update(this.dt);
      this.accumulator -= this.dt;
    }
    this.callbacks.render(this.accumulator / this.dt, clamped);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.step(frameTime);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
