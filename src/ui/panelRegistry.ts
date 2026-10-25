/**
 * Registers every game panel with the panel stack (src/ui/panelStack.ts), in one place: what its id is, how
 * it opens and closes through its own methods, which ones may stay beside each other, and which have a tab.
 * game.ts calls `registerGamePanels` once after building the panels. A new panel gets one entry here.
 */
import { t } from '../data/i18n';
import { panelStack } from './panelStack';

/**
 * A panel whose code is fetched the first time it is needed (C02). `ensure()` builds it once (the dynamic import
 * and `new`); until then `open` is false and `ifLoaded` does nothing, so per-frame refreshes cost nothing.
 */
export class LazyPanel<T> {
  private panel: T | null = null;
  private loading: Promise<T> | null = null;
  private readonly onLoad: ((panel: T) => void)[] = [];
  constructor(private readonly build: () => Promise<T>) {}

  get loaded(): T | null {
    return this.panel;
  }

  /** Runs after the panel is built, before `ensure()` resolves (the stack registration hangs here). */
  whenLoaded(fn: (panel: T) => void): void {
    this.onLoad.push(fn);
  }

  ensure(): Promise<T> {
    return (this.loading ??= this.build().then((panel) => {
      this.panel = panel;
      for (const fn of this.onLoad) fn(panel);
      return panel;
    }).catch((err) => {
      this.loading = null;
      throw err;
    }));
  }

  /** Runs `fn` on the panel if it exists already. */
  ifLoaded(fn: (panel: T) => void): void {
    if (this.panel) fn(this.panel);
  }

  /** Runs `fn` on the panel, loading it first when needed. */
  run(fn: (panel: T) => void): void {
    this.ensure().then(fn, (err) => console.warn('Panel failed to load', err));
  }
}

/** What the registry needs of a `LazyPanel` (methods only, so a `LazyPanel<ConcretePanel>` fits). */
export interface LazyHandle<T> {
  whenLoaded(fn: (panel: T) => void): void;
  ensure(): Promise<T>;
}

/** The parts of the panels this file needs; each class already has these methods. */
export interface GamePanels {
  inventory: { open: boolean; toggle(force?: boolean): void };
  character: LazyHandle<{ open: boolean; toggle(): void }>;
  skills: LazyHandle<{ open: boolean; toggle(): void }>;
  map: { open: boolean; toggle(): void };
  quests: { open: boolean; toggle(): void };
  settings: LazyHandle<{ element: HTMLElement; open: boolean; show(): void; close(): void }>;
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
  // Character, skills and settings are built on first use: their tabs exist now, the panels when first opened.
  p.character.whenLoaded((c) => panelStack.register({
    id: 'character', el: q('.character-panel'), kind: 'main', open: openIf(c), close: closeIf(c),
    tab: { icon: 'character', label: t('touch.menu.character') },
  }));
  panelStack.registerLazy({ id: 'character', tab: { icon: 'character', label: t('touch.menu.character') }, load: () => p.character.ensure().then(() => undefined) });
  p.skills.whenLoaded((s) => panelStack.register({
    id: 'skills', el: q('.tree-panel'), kind: 'main', hint: '.inv-hint', open: openIf(s), close: closeIf(s),
    tab: { icon: 'skills', label: t('touch.menu.skills') },
  }));
  panelStack.registerLazy({ id: 'skills', tab: { icon: 'skills', label: t('touch.menu.skills') }, load: () => p.skills.ensure().then(() => undefined) });
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
  p.settings.whenLoaded((st) => panelStack.register({
    id: 'settings', el: st.element, kind: 'main', open: () => st.show(), close: () => st.close(),
  }));
  panelStack.registerLazy({ id: 'settings', load: () => p.settings.ensure().then(() => undefined) });
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
