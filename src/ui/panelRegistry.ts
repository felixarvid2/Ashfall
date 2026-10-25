/**
 * Registers every game panel with the panel stack (src/ui/panelStack.ts), in one place: what its id is, how
 * it opens and closes through its own methods, which ones may stay beside each other, and which have a tab.
 * game.ts calls `registerGamePanels` once after building the panels. A new panel gets one entry here.
 */
import { t } from '../data/i18n';
import { panelStack } from './panelStack';

/** The parts of the panels this file needs; each class already has these methods. */
export interface GamePanels {
  inventory: { open: boolean; toggle(force?: boolean): void };
  character: { open: boolean; toggle(): void };
  skills: { open: boolean; toggle(): void };
  map: { open: boolean; toggle(): void };
  quests: { open: boolean; toggle(): void };
  settings: { element: HTMLElement; open: boolean; show(): void; close(): void };
  /** The Escape pause menu (B041). */
  pause: { element: HTMLElement; open: boolean; show(): void; close(): void; canOpen(): boolean };
  tier: { open: boolean; close(): void };
  rift: { open: boolean; close(): void };
  lore: { open: boolean; close(): void };
  /** Ends a conversation (the dialogue panel's own buttons do the same). */
  closeDialogue: () => void;
}

function panelRoot(root: HTMLElement, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`panel root not found: ${selector}`);
  return el;
}

/**
 * The hub services panel is built when the first service opens (src/game.ts `loadServicePanel`), so it registers
 * with the stack then rather than in `registerGamePanels`. Hub services show their own backpack beside them.
 */
export function registerServicePanel(root: HTMLElement, service: { close(): void }): void {
  panelStack.register({
    id: 'service', el: panelRoot(root, '.service-panel'), kind: 'service', companions: ['inventory'], hint: '.inv-hint',
    close: () => service.close(),
  });
}

export function registerGamePanels(root: HTMLElement, p: GamePanels): void {
  const q = (selector: string): HTMLElement => panelRoot(root, selector);
  /** Panels whose toggle() flips: close only when open. */
  const closeIf = (panel: { open: boolean; toggle(): void }) => () => {
    if (panel.open) panel.toggle();
  };
  const openIf = (panel: { open: boolean; toggle(): void }) => () => {
    if (!panel.open) panel.toggle();
  };

  panelStack.register({
    id: 'inventory', el: q('.inventory-panel'), kind: 'main', hint: '.inv-hint',
    open: () => p.inventory.toggle(true), close: () => p.inventory.toggle(false),
    tab: { icon: 'inventory', label: t('touch.menu.inventory') },
  });
  panelStack.register({
    id: 'character', el: q('.character-panel'), kind: 'main',
    open: openIf(p.character), close: closeIf(p.character),
    tab: { icon: 'character', label: t('touch.menu.character') },
  });
  panelStack.register({
    id: 'skills', el: q('.tree-panel'), kind: 'main', hint: '.inv-hint',
    open: openIf(p.skills), close: closeIf(p.skills),
    tab: { icon: 'skills', label: t('touch.menu.skills') },
  });
  panelStack.register({
    id: 'map', el: q('.map-panel'), kind: 'main', title: t('map.title'),
    open: openIf(p.map), close: closeIf(p.map),
    tab: { icon: 'map', label: t('touch.menu.map') },
  });
  panelStack.register({
    id: 'quests', el: q('.quest-log'), kind: 'main',
    open: openIf(p.quests), close: closeIf(p.quests),
    tab: { icon: 'quests', label: t('touch.menu.quests') },
  });
  panelStack.register({
    id: 'settings', el: p.settings.element, kind: 'main',
    open: () => p.settings.show(), close: () => p.settings.close(),
  });
  panelStack.register({
    id: 'pause', el: p.pause.element, kind: 'main',
    open: () => p.pause.show(), close: () => p.pause.close(),
  });
  // Escape with nothing open pauses (desktop; touch screens have no Escape key).
  panelStack.setEscapeFallback(() => {
    if (!p.pause.canOpen()) return false;
    panelStack.open('pause');
    return true;
  });
  panelStack.register({ id: 'tier', el: q('.tier-panel'), kind: 'service', scrim: true, close: () => p.tier.close() });
  panelStack.register({ id: 'rift', el: q('.rift-panel'), kind: 'service', scrim: true, close: () => p.rift.close() });
  panelStack.register({ id: 'lore', el: q('.lore-panel'), kind: 'service', scrim: true, close: () => p.lore.close() });
  panelStack.register({
    id: 'dialogue', el: q('.dialogue-panel'), kind: 'service', scrim: true, header: false,
    close: () => p.closeDialogue(),
  });
}
