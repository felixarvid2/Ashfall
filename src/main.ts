import { validateGameData } from './data/validate';
import { Game } from './game';
import { t } from './data/i18n';

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
const loading = document.createElement('div');
loading.className = 'loading-screen';
loading.textContent = t('game.loading', { done: 0, total: '…' });
ui.appendChild(loading);
await game.loadAssets((done, total) => (loading.textContent = t('game.loading', { done, total })));
loading.remove();
game.start();

// Debug handle for the console and automated smoke tests (dev builds or ?debug).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { ashfall: Game }).ashfall = game;
}
