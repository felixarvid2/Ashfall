// Styles: the base sheet, then the portrait touch layout overrides (one file per area, in this order).
import './ui/style.css';
import './ui/portrait/base.css';
import './ui/portrait/controls.css';
import './ui/portrait/hud.css';
import './ui/portrait/world.css';
import './ui/portrait/items.css';
import './ui/portrait/skills.css';
import './ui/portrait/services.css';
import './ui/desktop/hud.css';
import './ui/desktop/feedback.css';
import './ui/desktop/feel.css';
import './ui/desktop/world.css';
import './ui/desktop/combat.css';
import './ui/desktop/inventory.css';
import './ui/desktop/services.css';
import './ui/desktop/menus.css';
import { Game } from './game';
import { START_ZONE } from './data/zones';
import { t } from './data/i18n';
import { CharacterSelect } from './ui/characterSelect';
import { registerFonts } from './ui/fonts';
import { audio } from './audio/engine';
import { guardStartup, installRuntimeGuards } from './bootGuard';

registerFonts();
// Listen for the first click or key press while the game loads, so the title music can start with it.
audio.install();

if (import.meta.env.DEV) {
  // Dev-only (it also reads the full Meshy manifest), so it stays out of the production bundle.
  const { validateGameData } = await import('./data/validate');
  const errors = validateGameData();
  if (errors.length > 0) {
    console.error(`[ashfall] ${errors.length} data error(s):\n` + errors.join('\n'));
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const ui = document.querySelector<HTMLElement>('#ui');
if (!canvas || !ui) throw new Error('Missing #game canvas or #ui root');

const game = guardStartup(ui, () => new Game(canvas, ui));
const loading = document.createElement('div');
loading.className = 'loading-screen';
loading.textContent = t('game.loading', { done: 0, total: '…' });
ui.appendChild(loading);
await guardStartup(ui, () => game.loadAssets((done, total) => (loading.textContent = t('game.loading', { done, total }))));
installRuntimeGuards(game, canvas, ui);
loading.remove();

// Debug handle for the console and automated smoke tests (dev builds or ?debug).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { ashfall: Game }).ashfall = game;
}

// Character select, then the game loop starts. The class's and the zone's models load first, behind the
// loading screen, so the select itself appears at once.
let starting = false;
const startWith = async (prepare: () => Promise<void>, begin: () => boolean): Promise<void> => {
  if (starting) return;
  starting = true;
  loading.textContent = t('game.loading', { done: 0, total: '…' });
  ui.appendChild(loading);
  const progress = (done: number, total: number) => (loading.textContent = t('game.loading', { done, total }));
  try {
    await prepare();
    if (!begin()) return;
    // Models for what the zone spawned that the data sets don't name (NPCs, set pieces, bosses).
    await game.settleAssets(progress);
    select.close();
    game.start();
  } finally {
    starting = false;
    loading.remove();
  }
};
const select = new CharacterSelect(ui, () => game.characterSlots(), {
  play: (slot) => {
    const start = game.slotStart(slot);
    void startWith(
      () => game.prepareZone(start?.zoneId ?? START_ZONE.id, start?.classId, (done, total) => (loading.textContent = t('game.loading', { done, total }))),
      () => game.playCharacter(slot),
    );
  },
  create: (slot, classId, name) => {
    void startWith(
      () => game.prepareZone(START_ZONE.id, classId),
      () => {
        game.newCharacter(slot, classId, name);
        return true;
      },
    );
  },
  remove: (slot) => game.deleteCharacter(slot),
  portraitUrl: (classId) => game.renderer.assets.iconUrl(`icon.portrait_${classId}`, import.meta.env.BASE_URL),
});
