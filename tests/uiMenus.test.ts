import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  DEFAULT_KEYBINDINGS,
  SettingsSchema,
  bindingConflicts,
  defaultSettings,
  isBindableKey,
  rebindKey,
  resetBinding,
  resolveKeybindings,
  tabDefaults,
  type Settings,
} from '../src/data/settings';
import { keyLabel } from '../src/ui/hud';
import { meanItemPower, slotDetail } from '../src/ui/characterSelect';
import { KEY_GROUPS } from '../src/ui/settingsPanel';
import { t } from '../src/data/i18n';

function withBindings(keybindings: Settings['keybindings']): Settings {
  return { ...defaultSettings(), keybindings };
}

describe('key rebinding (B042)', () => {
  it('rebinds the inventory to B: the free key just works and is stored as an override', () => {
    // B is the mount key by default, so the first press is a conflict...
    const s = defaultSettings();
    const first = rebindKey(s, 'inventory', 0, 'KeyB');
    expect(first.keybindings).toBeNull();
    expect(first.conflicts).toEqual(['mount']);
    // ...and a free key rebinds at once.
    const free = rebindKey(s, 'inventory', 0, 'KeyU');
    expect(free.keybindings).toEqual({ inventory: ['KeyU', 'Tab'] });
    const next = { ...s, keybindings: free.keybindings! };
    expect(resolveKeybindings(next).inventory).toEqual(['KeyU', 'Tab']);
    expect(resolveKeybindings(next).mount).toEqual(['KeyB']);
  });

  it('a forced rebind swaps keys with the conflicting action, so nothing is left unbound', () => {
    const s = defaultSettings();
    const r = rebindKey(s, 'inventory', 0, 'KeyB', true);
    expect(r.keybindings).toEqual({ inventory: ['KeyB', 'Tab'], mount: ['KeyI'] });
    const resolved = resolveKeybindings({ ...s, keybindings: r.keybindings! });
    for (const a of ACTIONS) expect(resolved[a].length).toBeGreaterThan(0);
    expect(bindingConflicts(resolved, 'inventory', 'KeyB')).toEqual([]);
  });

  it('adds a secondary key and never keeps more than two or a duplicate', () => {
    const s = defaultSettings();
    const added = rebindKey(s, 'dodge', 1, 'KeyX').keybindings!;
    expect(added.dodge).toEqual(['Space', 'KeyX']);
    const again = rebindKey({ ...s, keybindings: added }, 'dodge', 0, 'KeyX').keybindings!;
    expect(again.dodge).toEqual(['KeyX']);
  });

  it('rebinding to the default key drops the override', () => {
    const changed = withBindings(rebindKey(defaultSettings(), 'potion', 0, 'KeyZ').keybindings!);
    expect(changed.keybindings.potion).toEqual(['KeyZ']);
    const back = rebindKey(changed, 'potion', 0, 'KeyQ').keybindings!;
    expect(back.potion).toBeUndefined();
  });

  it('reset puts one action back, including a key another action took meanwhile', () => {
    let s = defaultSettings();
    s = { ...s, keybindings: rebindKey(s, 'inventory', 0, 'KeyB', true).keybindings! };
    const reset = resetBinding(s, 'inventory');
    expect(reset).toEqual({});
    const resolved = resolveKeybindings({ ...s, keybindings: reset });
    expect(resolved.inventory).toEqual(DEFAULT_KEYBINDINGS.inventory);
    expect(resolved.mount).toEqual(DEFAULT_KEYBINDINGS.mount);
  });

  it('Escape and browser keys cannot be bound', () => {
    expect(isBindableKey('Escape')).toBe(false);
    expect(isBindableKey('MetaLeft')).toBe(false);
    expect(isBindableKey('KeyB')).toBe(true);
    expect(isBindableKey('ShiftLeft')).toBe(true);
  });

  it('the key list covers every action exactly once', () => {
    const listed = KEY_GROUPS.flatMap((g) => g.actions).sort();
    expect(listed).toEqual([...ACTIONS].sort());
    for (const a of ACTIONS) expect(t(`settings.actions.${a}`)).not.toBe(`settings.actions.${a}`);
  });

  it('key labels are readable', () => {
    expect(keyLabel('KeyB')).toBe('B');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('AltLeft')).toBe('Alt');
    expect(keyLabel('Numpad5')).toBe('Num 5');
    expect(keyLabel('Semicolon')).toBe(';');
  });
});

describe('reset to defaults (B047)', () => {
  it('the display tab goes back to High graphics and the accessibility defaults', () => {
    const patch = tabDefaults('display');
    expect(patch.graphics).toBe('high');
    expect(patch.reduceFlashing).toBe(false);
    expect(patch.colorblind).toBe('off');
    expect(patch.brightness).toBe(1);
    expect(patch.lootLabelMin).toBe('magic');
  });

  it('phones keep their own graphics and FPS defaults', () => {
    expect(tabDefaults('display', true).graphics).toBe('medium');
    expect(tabDefaults('display', true).showFps).toBe(false);
  });

  it('the controls tab clears the key overrides', () => {
    expect(tabDefaults('controls').keybindings).toEqual({});
    expect(tabDefaults('controls').moveMode).toBe('click');
  });

  it('every default patch is valid settings', () => {
    for (const tab of ['display', 'controls'] as const) {
      expect(SettingsSchema.safeParse({ ...defaultSettings(), ...tabDefaults(tab) }).success).toBe(true);
    }
  });
});

describe('accessibility settings (B044, B045, B046)', () => {
  it('accepts the colour-blind modes, the loot threshold and the brightness range', () => {
    for (const colorblind of ['off', 'protanopia', 'deuteranopia', 'tritanopia']) expect(SettingsSchema.safeParse({ colorblind }).success).toBe(true);
    for (const lootLabelMin of ['all', 'magic', 'rare', 'legendary']) expect(SettingsSchema.safeParse({ lootLabelMin }).success).toBe(true);
    expect(SettingsSchema.safeParse({ brightness: 1.4 }).success).toBe(true);
    expect(SettingsSchema.safeParse({ brightness: 3 }).success).toBe(false);
  });

  it('loot labels default to magic and better, as before the option existed', () => {
    expect(defaultSettings().lootLabelMin).toBe('magic');
  });
});

describe('character slot cards (B049)', () => {
  it('shows the zone name and the mean gear power', () => {
    expect(slotDetail({ zoneKey: 'cinderFlats', gear: 55 })).toBe('Cinder Flats · Gear 55');
    expect(slotDetail({ zoneKey: 'cinderFlats' })).toBe('Cinder Flats');
    expect(slotDetail({})).toBe('');
  });

  it('averages item power over the equipped items', () => {
    expect(meanItemPower([])).toBeUndefined();
    expect(meanItemPower([{ itemPower: 50 }, { itemPower: 61 }])).toBe(56);
  });
});
