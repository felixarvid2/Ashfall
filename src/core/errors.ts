/**
 * Error handling that has to work when the game itself does not: WebGL context loss, errors nobody
 * caught, and failures while starting up. Pure logic on `EventTarget`s so it can be tested without a
 * browser; the full-screen message lives in errorScreen.ts and main.ts wires the two to the game.
 */

export type StartupFailure = 'webgl' | 'startup';

/** Tells "this device has no usable WebGL" from any other start-up failure, for the message shown. */
export function classifyStartupError(err: unknown): StartupFailure {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /webgl|web gl|gl context|getcontext|canvas context/i.test(text) ? 'webgl' : 'startup';
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return typeof err === 'string' ? err : 'Unknown error';
}

export interface ContextLossHandlers {
  /** The context was lost (the page default is already prevented, so a restore event can follow). */
  onLost(): void;
  onRestored(): void;
  /** No restore event arrived within `restoreTimeoutMs`: the caller should offer a reload. */
  onGiveUp?(): void;
}

/**
 * Listens for `webglcontextlost` / `webglcontextrestored` on the canvas. Returns a function that
 * removes the listeners. A lost context that is not restored in time calls `onGiveUp`.
 */
export function watchContextLoss(target: EventTarget, handlers: ContextLossHandlers, restoreTimeoutMs = 5000): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lost = false;
  const lostListener = (event: Event): void => {
    // Without this the browser never fires webglcontextrestored.
    event.preventDefault();
    if (lost) return;
    lost = true;
    handlers.onLost();
    if (handlers.onGiveUp) timer = setTimeout(() => lost && handlers.onGiveUp?.(), restoreTimeoutMs);
  };
  const restoredListener = (): void => {
    if (!lost) return;
    lost = false;
    clearTimeout(timer);
    handlers.onRestored();
  };
  target.addEventListener('webglcontextlost', lostListener);
  target.addEventListener('webglcontextrestored', restoredListener);
  return () => {
    clearTimeout(timer);
    target.removeEventListener('webglcontextlost', lostListener);
    target.removeEventListener('webglcontextrestored', restoredListener);
  };
}

/** Errors that mean the page cannot go on, whatever else is happening. */
const FATAL_MESSAGE = /out of memory|allocation failed|context lost|invalid array length/i;

/**
 * Counts uncaught errors. One stray error (a failed audio decode, a rejected fetch) is not fatal; an
 * error storm (`limit` within `windowMs`) or an out-of-memory type error is.
 */
export class ErrorTracker {
  private stamps: number[] = [];

  constructor(
    private readonly limit = 3,
    private readonly windowMs = 2000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Records an error and returns whether it is fatal. */
  record(err: unknown): boolean {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < this.windowMs);
    this.stamps.push(t);
    return this.stamps.length >= this.limit || FATAL_MESSAGE.test(describeError(err));
  }
}

export interface GlobalErrorHandlers {
  /** Called once, on the first uncaught error: a last-chance save. */
  onFirstError(): void;
  /** Called for every fatal error (more than once is fine; the screen shows the first). */
  onFatal(err: unknown): void;
}

/** Hooks `error` and `unhandledrejection` on a window-like target. Returns the remover. */
export function installGlobalErrorHandlers(
  target: EventTarget,
  handlers: GlobalErrorHandlers,
  tracker: ErrorTracker = new ErrorTracker(),
): () => void {
  let first = true;
  const handle = (err: unknown): void => {
    console.error('[ashfall] uncaught error', err);
    if (first) {
      first = false;
      try {
        handlers.onFirstError();
      } catch (saveErr) {
        // The save itself failed: the overlay below is still worth showing.
        console.error('[ashfall] saving after an error failed', saveErr);
      }
    }
    if (tracker.record(err)) handlers.onFatal(err);
  };
  const onError = (e: Event): void => handle((e as ErrorEvent).error ?? (e as ErrorEvent).message);
  const onRejection = (e: Event): void => handle((e as PromiseRejectionEvent).reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
