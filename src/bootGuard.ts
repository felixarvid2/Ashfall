/**
 * Wires the error handling in src/core/errors.ts to the page: a start-up failure message, WebGL
 * context loss and restore, uncaught errors, and a throwing game loop.
 */
import { classifyStartupError, describeError, ErrorTracker, installGlobalErrorHandlers, watchContextLoss } from './core/errors';
import { hideErrorScreen, showErrorScreen } from './core/errorScreen';
import type { Game } from './game';

/** Shows why the game could not start (no WebGL, a failed asset load, ...) and rethrows for the console. */
export function failStartup(ui: HTMLElement, err: unknown): never {
  console.error('[ashfall] start-up failed', err);
  showErrorScreen(ui, classifyStartupError(err), describeError(err), undefined, err instanceof Error ? err.stack : undefined);
  throw err;
}

/** Runs a start-up step; a throw shows the error screen instead of leaving the page blank. */
export function guardStartup<T>(ui: HTMLElement, step: () => T): T {
  try {
    const out = step();
    // Async steps (loadAssets) fail later: attach the same handling to the promise.
    if (out instanceof Promise) return out.catch((err: unknown) => failStartup(ui, err)) as T;
    return out;
  } catch (err) {
    return failStartup(ui, err);
  }
}

/** Call once the game exists and its assets are loaded. */
export function installRuntimeGuards(game: Game, canvas: HTMLCanvasElement, ui: HTMLElement): void {
  let crashed = false;
  const crash = (err: unknown): void => {
    if (crashed) return;
    crashed = true;
    game.loop.stop();
    showErrorScreen(ui, 'crash', describeError(err), undefined, err instanceof Error ? err.stack : undefined);
  };

  // A throwing tick is reported and skipped; five in a second stop the loop with the message.
  game.loop.guard = { onError: (err) => console.error('[ashfall] tick failed', err), onFatal: crash };

  let resumeLoop = false;
  watchContextLoss(canvas, {
    onLost: () => {
      resumeLoop = game.loop.isRunning;
      game.loop.stop();
      game.saveNow();
      showErrorScreen(ui, 'contextLost');
    },
    onRestored: () => {
      if (crashed) return;
      hideErrorScreen(ui);
      // three.js re-uploads its textures and buffers on the next draw; the size handler rebuilds the
      // post-processing targets for the new context.
      window.dispatchEvent(new Event('resize'));
      if (resumeLoop) game.loop.start();
    },
    onGiveUp: () => crash(new Error('The graphics context was not restored')),
  });

  installGlobalErrorHandlers(window, { onFirstError: () => game.saveNow(), onFatal: crash }, new ErrorTracker());
}
