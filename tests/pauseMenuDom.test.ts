// @vitest-environment happy-dom
/** The pause menu hands over to Settings, which loads lazily (C02), and comes back when Settings closes. */
import { beforeAll, describe, expect, it } from 'vitest';
import { panelStack } from '../src/ui/panelStack';
import { PauseMenu } from '../src/ui/pauseMenu';

let root: HTMLElement;
let pause: PauseMenu;
let settings: HTMLElement;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeAll(() => {
  root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  panelStack.init(root);
  pause = new PauseMenu(root, { exportSave: () => {}, toCharacterSelect: () => {}, canOpen: () => true });
  settings = document.createElement('div');
  settings.hidden = true;
  root.append(settings);
  // Like the real Settings panel: registered on first open, after an async load.
  panelStack.registerLazy({
    id: 'settings',
    load: async () => {
      await tick();
      panelStack.register({ id: 'settings', el: settings, kind: 'main', open: () => { settings.hidden = false; }, close: () => { settings.hidden = true; } });
    },
  });
  panelStack.register({ id: 'pause', el: pause.element, kind: 'main', open: () => pause.show(), close: () => pause.close() });
});

describe('pause menu and lazy Settings', () => {
  it('Settings replaces the menu once it has loaded, and closing it brings the menu back', async () => {
    panelStack.open('pause');
    expect(pause.open).toBe(true);
    pause.element.querySelector<HTMLButtonElement>('[data-testid="pause-settings"]')!.click();
    await tick();
    await tick();
    expect(panelStack.isOpen('settings')).toBe(true);
    expect(pause.open).toBe(false);
    panelStack.close('settings');
    await tick();
    expect(pause.open).toBe(true);
    // Opened again, now already loaded.
    pause.element.querySelector<HTMLButtonElement>('[data-testid="pause-settings"]')!.click();
    await tick();
    expect(panelStack.isOpen('settings')).toBe(true);
    expect(pause.open).toBe(false);
  });
});
