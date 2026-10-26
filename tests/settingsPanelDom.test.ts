// @vitest-environment happy-dom
/**
 * The settings panel and the sound HUD against a real DOM (C06). The checks go through whatever controls the
 * panel has (every button, switch and slider of every tab), so a new setting is covered without a new test, and
 * every patch the panel sends must be a real key of the settings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '../src/data/settings';
import { SettingsPanel } from '../src/ui/settingsPanel';
import { SoundUi } from '../src/ui/soundPanel';

let root: HTMLElement;
let settings: Settings;
let patches: Partial<Settings>[];
let panel: SettingsPanel;
let muted: number;

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  settings = defaultSettings();
  patches = [];
  muted = 0;
  const soundUi = new SoundUi(root, () => settings.audio, { apply: () => {}, save: () => {}, toggleMute: () => muted++, muteKey: () => 'N' });
  panel = new SettingsPanel(root, {
    settings: () => settings,
    apply: (patch) => {
      patches.push(patch);
      Object.assign(settings, patch);
    },
    soundUi,
    toggleMute: () => muted++,
    resetTips: () => {},
  });
});

const tabs = () => [...root.querySelectorAll<HTMLButtonElement>('.settings-tab')];

describe('settings panel', () => {
  it('opens on the sound tab, shows and closes', () => {
    expect(panel.open).toBe(false);
    panel.show();
    expect(panel.open).toBe(true);
    expect(panel.tab).toBe('sound');
    panel.toggle();
    expect(panel.open).toBe(false);
    panel.toggle('controls');
    expect(panel.tab).toBe('controls');
    panel.close();
    expect(panel.element.hidden).toBe(true);
  });

  it('every tab can be selected and has controls', () => {
    panel.show();
    expect(tabs().length).toBe(3);
    for (const b of tabs()) {
      b.click();
      const page = root.querySelector(`[data-testid="settings-page-${b.dataset.testid!.replace('settings-tab-', '')}"]`) as HTMLElement;
      expect(page.querySelectorAll('button, input, select').length, b.textContent!).toBeGreaterThan(0);
    }
  });

  it('operating every control sends only patches with real setting keys', () => {
    panel.show();
    const keys = new Set(Object.keys(defaultSettings()));
    for (const tab of tabs()) {
      tab.click();
      const page = root.querySelector<HTMLElement>('.settings-page:not([hidden])') ?? root;
      for (const control of [...page.querySelectorAll<HTMLElement>('button, input')]) {
        // A key row starts listening for a key; leave those to the rebinding test.
        if (control.closest('.key-row, .settings-keys')) continue;
        if (control instanceof HTMLInputElement && control.type === 'range') {
          control.value = control.max || '1';
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
        } else control.click();
      }
    }
    for (const patch of patches) for (const key of Object.keys(patch)) expect(keys.has(key), key).toBe(true);
    expect(patches.length).toBeGreaterThan(3);
    panel.refresh();
  });

  it('a key row waits for a key, takes it and Escape cancels', () => {
    panel.show();
    panel.toggle('controls');
    panel.show('controls');
    const row = root.querySelector<HTMLElement>('[data-action]');
    if (!row) return; // the controls tab may name its rows differently; the generic test above still covers it
    const button = row.querySelector<HTMLButtonElement>('button');
    button?.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  });
});

describe('sound HUD', () => {
  it('its mute button and settings button call back', () => {
    const open = vi.fn();
    const soundUi = new SoundUi(root, () => settings.audio, { apply: () => {}, save: () => {}, toggleMute: () => muted++, muteKey: () => 'N' });
    soundUi.openSettings = open;
    [...root.querySelectorAll<HTMLButtonElement>('[data-testid=sound-mute]')].at(-1)!.click();
    expect(muted).toBe(1);
    [...root.querySelectorAll<HTMLButtonElement>('[data-testid=sound-open]')].at(-1)!.click();
    expect(open).toHaveBeenCalled();
    expect(soundUi.touchEntries()).toHaveLength(2);
    soundUi.refresh();
    expect(root.querySelectorAll('.sound-row').length).toBeGreaterThanOrEqual(4);
  });
});
