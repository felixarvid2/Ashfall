// @vitest-environment happy-dom
/** The panel stack, the shared header and the lazy-panel registration (C02/C06), against a real DOM. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LazyPanel, registerGamePanels, type GamePanels } from '../src/ui/panelRegistry';
import { panelStack } from '../src/ui/panelStack';
import { enhanceScroll, panelHeader, preserveScroll, showPanelTip } from '../src/ui/panelHeader';

let root: HTMLElement;

beforeAll(() => {
  root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  panelStack.init(root);
});

/** A panel root the way the game's panels make one: hidden, with its own title and an optional hint line. */
function makePanel(cls: string, withHint = false): HTMLElement {
  const el = document.createElement('div');
  el.className = `${cls} panel`;
  el.hidden = true;
  el.append(Object.assign(document.createElement('h2'), { textContent: cls }));
  if (withHint) el.append(Object.assign(document.createElement('div'), { className: 'inv-hint', textContent: 'Drag items to move them' }));
  root.append(el);
  return el;
}

const flush = () => new Promise<void>((r) => queueMicrotask(r));

describe('panel stack', () => {
  it('tracks panels opened by code, closes the top one and reports changes', async () => {
    const a = makePanel('pa');
    const b = makePanel('pb');
    const seen: string[][] = [];
    panelStack.onChange((ids) => seen.push(ids));
    panelStack.register({ id: 'pa', el: a, kind: 'main', close: () => (a.hidden = true) });
    panelStack.register({ id: 'pb', el: b, kind: 'main', close: () => (b.hidden = true) });
    expect(() => panelStack.register({ id: 'pa', el: a, kind: 'main', close: () => {} })).toThrow(/already registered/);
    panelStack.open('pa');
    panelStack.open('pb');
    await flush();
    expect(panelStack.openIds()).toEqual(['pa', 'pb']);
    expect(panelStack.top()).toBe('pb');
    expect(root.classList.contains('has-panel')).toBe(true);
    expect(root.dataset.panelTop).toBe('pb');
    expect(panelStack.closeTop()).toBe(true);
    expect(panelStack.isOpen('pb')).toBe(false);
    panelStack.toggle('pa');
    expect(panelStack.isOpen('pa')).toBe(false);
    expect(panelStack.closeTop()).toBe(false);
    expect(seen.length).toBeGreaterThan(2);
    expect(root.classList.contains('has-panel')).toBe(false);
  });

  it('gives every panel the shared header and a close button that dismisses it', async () => {
    const el = makePanel('pc');
    panelStack.register({ id: 'pc', el, kind: 'main', close: () => (el.hidden = true) });
    expect(el.querySelector('.panel-header h2')?.textContent).toBe('pc');
    expect(el.dataset.panel).toBe('pc');
    panelStack.open('pc');
    el.querySelector<HTMLButtonElement>('[data-testid=panel-close]')!.click();
    // The close slides the panel down for 120 ms first.
    await vi.waitFor(() => expect(panelStack.isOpen('pc')).toBe(false));
  });

  it('Escape closes the top panel, and runs the fallback when nothing is open', () => {
    const el = makePanel('pd');
    panelStack.register({ id: 'pd', el, kind: 'main', close: () => (el.hidden = true) });
    const fallback = vi.fn(() => true);
    panelStack.setEscapeFallback(fallback);
    panelStack.open('pd');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(panelStack.isOpen('pd')).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(fallback).toHaveBeenCalledTimes(1);
    panelStack.setEscapeFallback(null);
  });

  it('key capture takes the key before Escape handling and can be released', () => {
    const got: string[] = [];
    const release = panelStack.captureKeys((e) => (got.push(e.key), true));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', cancelable: true }));
    release();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', cancelable: true }));
    expect(got).toEqual(['x']);
  });

  it('badges mark a tab, and closeAll can leave some panels open', async () => {
    const e1 = makePanel('pe');
    const e2 = makePanel('pf');
    panelStack.register({ id: 'pe', el: e1, kind: 'main', close: () => (e1.hidden = true), tab: { icon: 'inventory', label: 'E' } });
    panelStack.register({ id: 'pf', el: e2, kind: 'service', close: () => (e2.hidden = true) });
    panelStack.setBadge('pe', true);
    expect(root.querySelector('[data-testid=panel-tab-pe]')?.classList.contains('has-dot')).toBe(true);
    panelStack.setBadge('pe', false);
    panelStack.open('pe');
    panelStack.open('pf');
    panelStack.closeAll((id) => id === 'pf');
    await flush();
    expect(panelStack.openIds()).toEqual(['pf']);
    panelStack.closeAll();
    expect(panelStack.container).toBe(root);
  });

  it('on a portrait phone one main panel replaces the other, and the tab bar follows', () => {
    root.classList.add('touch-ui', 'portrait');
    const g1 = makePanel('pg');
    const g2 = makePanel('ph');
    panelStack.register({ id: 'pg', el: g1, kind: 'main', close: () => (g1.hidden = true), tab: { icon: 'map', label: 'G' } });
    panelStack.register({ id: 'ph', el: g2, kind: 'main', close: () => (g2.hidden = true), tab: { icon: 'quests', label: 'H' } });
    panelStack.open('pg');
    panelStack.open('ph');
    expect(panelStack.isOpen('pg')).toBe(false);
    expect(panelStack.isOpen('ph')).toBe(true);
    expect(root.classList.contains('has-tabbar')).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-testid=panel-tab-pg]')!.click();
    expect(panelStack.isOpen('pg')).toBe(true);
    panelStack.closeAll();
    root.classList.remove('touch-ui', 'portrait');
  });
});

describe('lazy panels (C02)', () => {
  it('a lazy tab opens the panel through its loader, once, and later opens are direct', async () => {
    const el = makePanel('pl');
    let built = 0;
    const lazy = new LazyPanel(async () => {
      built++;
      return { open: false, toggle() {} };
    });
    lazy.whenLoaded(() => panelStack.register({ id: 'pl', el, kind: 'main', close: () => (el.hidden = true) }));
    panelStack.registerLazy({ id: 'pl', tab: { icon: 'skills', label: 'L' }, load: () => lazy.ensure().then(() => undefined) });
    expect(panelStack.has('pl')).toBe(true);
    expect(panelStack.isOpen('pl')).toBe(false);
    expect(lazy.loaded).toBeNull();
    panelStack.open('pl');
    panelStack.open('pl');
    await vi.waitFor(() => expect(panelStack.isOpen('pl')).toBe(true));
    expect(built).toBe(1);
    expect(lazy.loaded).not.toBeNull();
    panelStack.close('pl');
    panelStack.open('pl');
    expect(panelStack.isOpen('pl')).toBe(true);
    expect(built).toBe(1);
    expect(root.querySelectorAll('[data-testid=panel-tab-pl]')).toHaveLength(1);
  });

  it('a failed load warns, keeps the panel closed and can be retried', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let tries = 0;
    const lazy = new LazyPanel(async () => {
      if (++tries === 1) throw new Error('offline');
      return { n: 1 };
    });
    await expect(lazy.ensure()).rejects.toThrow('offline');
    await expect(lazy.ensure()).resolves.toEqual({ n: 1 });
    lazy.ifLoaded((p) => expect(p.n).toBe(1));
    const bad = new LazyPanel<{ n: number }>(async () => {
      throw new Error('nope');
    });
    bad.run(() => {});
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  it('registerGamePanels wires keys-before-load: the character, skills and settings tabs exist, the panels do not', () => {
    for (const cls of ['inventory-panel', 'character-panel', 'tree-panel', 'quest-log', 'map-panel', 'tier-panel', 'rift-panel', 'lore-panel', 'dialogue-panel']) makePanel(cls);
    const pause = makePanel('pause-panel');
    const mk = <T extends { open: boolean }>(panel: T) => new LazyPanel<T>(async () => panel);
    const panels = {
      inventory: { open: false, toggle: () => {} },
      character: mk({ open: false, toggle() {} }),
      skills: mk({ open: false, toggle() {} }),
      map: { open: false, toggle: () => {} },
      quests: { open: false, toggle: () => {} },
      settings: mk({ element: makePanel('settings-panel'), open: false, show() {}, close() {} }),
      pause: { element: pause, open: false, show: () => (pause.hidden = false), close: () => (pause.hidden = true), canOpen: () => true },
      tier: { open: false, close() {} },
      rift: { open: false, close() {} },
      lore: { open: false, close() {} },
      closeDialogue() {},
    } satisfies GamePanels as unknown as GamePanels;
    registerGamePanels(root, panels);
    for (const id of ['character', 'skills', 'settings', 'inventory', 'map', 'quests', 'pause']) expect(panelStack.has(id), id).toBe(true);
    expect(panelStack.isOpen('character')).toBe(false);
    expect(panelStack.isOpen('skills')).toBe(false);
  });
});

describe('panel header helpers', () => {
  it('panelHeader has a title, an extra slot and a working close button', () => {
    const onClose = vi.fn();
    const header = panelHeader('Bag', onClose, { panel: document.createElement('div') });
    expect(header.querySelector('.panel-title')?.textContent).toBe('Bag');
    header.querySelector<HTMLButtonElement>('.panel-close')!.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('preserveScroll restores the scroll offset after a rebuild', () => {
    const el = document.createElement('div');
    el.scrollTop = 120;
    let rebuilt = false;
    preserveScroll(el, () => (rebuilt = true));
    expect(rebuilt).toBe(true);
  });

  it('enhanceScroll adds the back-to-top chip and showPanelTip leaves desktop alone', () => {
    const el = makePanel('pi', true);
    enhanceScroll(el, () => true);
    expect(el.querySelector('.panel-top')).not.toBeNull();
    el.dispatchEvent(new Event('scroll'));
    showPanelTip({ id: 'pi', el, kind: 'main', close() {}, hint: '.inv-hint' });
    expect(el.querySelector('.panel-tip')).toBeNull();
  });

  it('on a touch screen the permanent hint becomes a dismissible first-open tip', () => {
    root.classList.add('touch-ui');
    const el = makePanel('pj', true);
    el.prepend(panelHeader('pj', () => {}));
    showPanelTip({ id: 'pj', el, kind: 'main', close() {}, hint: '.inv-hint' });
    const tip = el.querySelector('.panel-tip');
    expect(tip?.textContent).toContain('Drag items');
    tip!.querySelector('button')!.click();
    expect(el.querySelector('.panel-tip')).toBeNull();
    expect(el.querySelector('.panel-help')).not.toBeNull();
    root.classList.remove('touch-ui');
  });
});
