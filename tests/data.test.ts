import { describe, expect, it } from 'vitest';
import { validateGameData } from '../src/data/validate';
import { scatterInstances } from '../src/world/arena';
import { TEST_ARENA } from '../src/data/zones/testArena';
import { SettingsSchema, defaultSettings, resolveKeybindings, ACTIONS } from '../src/data/settings';

describe('game data', () => {
  it('validates without errors', () => {
    expect(validateGameData()).toEqual([]);
  });

  it('scatter is deterministic and keeps the spawn clear', () => {
    const a = scatterInstances(TEST_ARENA, 0);
    const b = scatterInstances(TEST_ARENA, 0);
    expect(a).toEqual(b);
    expect(a.length).toBe(TEST_ARENA.scatter[0]!.count);
    for (const p of a) expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(3);
  });
});

describe('settings', () => {
  it('defaults bind every action', () => {
    const bindings = resolveKeybindings(defaultSettings());
    for (const action of ACTIONS) expect(bindings[action].length).toBeGreaterThan(0);
  });

  it('user overrides replace only the overridden action', () => {
    const s = SettingsSchema.parse({ keybindings: { dodge: ['ShiftLeft'] } });
    const bindings = resolveKeybindings(s);
    expect(bindings.dodge).toEqual(['ShiftLeft']);
    expect(bindings.moveUp).toContain('KeyW');
  });

  it('rejects invalid values', () => {
    expect(SettingsSchema.safeParse({ moveMode: 'teleport' }).success).toBe(false);
  });
});
