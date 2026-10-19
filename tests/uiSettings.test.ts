import { describe, expect, it } from 'vitest';
import { SettingsSchema, defaultSettings, loadSettings } from '../src/data/settings';
import { TEXT_SIZES } from '../src/ui/settingsPanel';

describe('settings used by the settings panel', () => {
  it('has phone-friendly defaults', () => {
    const s = defaultSettings();
    expect(s.haptics).toBe(true);
    expect(s.pauseInMenus).toBe(true);
    expect(s.touchLayout).toBe('right');
    expect(s.buttonScale).toBe(1);
  });

  it('old saved settings load with the new fields filled in', () => {
    const store = new Map<string, string>([['ashfall.settings', JSON.stringify({ graphics: 'low', textScale: 1.15 })]]);
    const loaded = loadSettings({ getItem: (k: string) => store.get(k) ?? null } as Storage);
    expect(loaded.graphics).toBe('low');
    expect(loaded.haptics).toBe(true);
    expect(loaded.touchLayout).toBe('right');
  });

  it('rejects a thumb button scale outside the supported range', () => {
    expect(SettingsSchema.safeParse({ buttonScale: 3 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ buttonScale: 1.2 }).success).toBe(true);
  });

  it('every text size step is a valid text scale', () => {
    for (const { scale } of TEXT_SIZES) expect(SettingsSchema.safeParse({ textScale: scale }).success).toBe(true);
    expect(TEXT_SIZES.map((s) => s.scale)).toEqual([0.9, 1, 1.15, 1.35]);
  });
});
