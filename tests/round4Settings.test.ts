// @vitest-environment happy-dom
/** Round 4 settings (C01, C04, C05, C09, C15): defaults, old saves, the Display tab controls and reset to defaults. */
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, SettingsSchema, tabDefaults, UI_SCALE_RANGE, type Settings } from '../src/data/settings';
import { applyAccessibility, SettingsPanel } from '../src/ui/settingsPanel';
import { SoundUi } from '../src/ui/soundPanel';

describe('round 4 settings model', () => {
  it('defaults keep the game as it was', () => {
    const d = defaultSettings();
    expect(d.hideLowLoot).toBe(false);
    expect(d.rarityShapes).toBe(false);
    expect(d.uiScale).toBe(1);
    expect(d.damageNumbers).toBe('full');
    expect(d.subtitles).toBe(true);
  });

  it('settings saved before round 4 still load, and bad values are rejected', () => {
    const store = { getItem: () => JSON.stringify({ textScale: 1.15, graphics: 'low' }), setItem: () => {} } as unknown as Storage;
    const s = loadSettings(store);
    expect(s.graphics).toBe('low');
    expect(s.uiScale).toBe(1);
    expect(SettingsSchema.safeParse({ uiScale: 3 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ uiScale: 0.5 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ damageNumbers: 'loud' }).success).toBe(false);
    expect(UI_SCALE_RANGE).toMatchObject({ min: 0.8, max: 1.4 });
  });

  it('the Display tab reset restores the new settings too', () => {
    const d = tabDefaults('display');
    expect(d).toMatchObject({ hideLowLoot: false, rarityShapes: false, uiScale: 1, damageNumbers: 'full', subtitles: true });
  });
});

describe('Display tab controls', () => {
  let root: HTMLElement;
  let settings: Settings;
  let patches: Partial<Settings>[];
  beforeEach(() => {
    document.body.replaceChildren();
    root = document.createElement('div');
    root.id = 'ui';
    document.body.append(root);
    settings = defaultSettings();
    patches = [];
    const soundUi = new SoundUi(root, () => settings.audio, { apply: () => {}, save: () => {}, toggleMute: () => {}, muteKey: () => 'N' });
    const panel = new SettingsPanel(root, {
      settings: () => settings,
      apply: (p) => {
        patches.push(p);
        Object.assign(settings, p);
      },
      soundUi,
      toggleMute: () => {},
    });
    panel.show('display');
  });

  const q = (id: string) => root.querySelector<HTMLElement>(`[data-testid=${id}]`)!;

  it('has a UI scale slider from 80 to 140 percent that sends uiScale', () => {
    const slider = q('setting-ui-scale') as HTMLInputElement;
    expect(slider.min).toBe('0.8');
    expect(slider.max).toBe('1.4');
    slider.value = '1.4';
    slider.dispatchEvent(new Event('input'));
    expect(patches.at(-1)).toEqual({ uiScale: 1.4 });
    expect(slider.closest('.settings-row')!.querySelector('.settings-value')!.textContent).toBe('140%');
  });

  it('has switches for hiding low loot, rarity shapes and subtitles, and a three-way damage number choice', () => {
    for (const [id, key] of [['hide-low-loot', 'hideLowLoot'], ['rarity-shapes', 'rarityShapes'], ['subtitles', 'subtitles']] as const) {
      const row = q(`setting-${id}`);
      expect(row, id).toBeTruthy();
      row.click();
      expect(patches.at(-1), id).toEqual({ [key]: !defaultSettings()[key] });
    }
    const modes = [...q('setting-damage-numbers').querySelectorAll<HTMLButtonElement>('button')];
    expect(modes.map((b) => b.dataset.value)).toEqual(['off', 'compact', 'full']);
    modes[0]!.click();
    expect(patches.at(-1)).toEqual({ damageNumbers: 'off' });
  });

  it('rarity shapes is a class on the UI root through the game, and colour-blind mode is untouched', () => {
    applyAccessibility(root, { colorblind: 'protanopia' });
    expect(root.classList.contains('colorblind')).toBe(true);
  });
});
