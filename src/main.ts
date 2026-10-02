import { validateGameData } from './data/validate';
import { Game } from './game';

if (import.meta.env.DEV) {
  const errors = validateGameData();
  if (errors.length > 0) {
    console.error(`[ashfall] ${errors.length} data error(s):\n` + errors.join('\n'));
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const ui = document.querySelector<HTMLElement>('#ui');
if (!canvas || !ui) throw new Error('Missing #game canvas or #ui root');

const game = new Game(canvas, ui);
game.start();

// Debug handle for the console and automated smoke tests (dev builds or ?debug).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { ashfall: Game }).ashfall = game;
}
