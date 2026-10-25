import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, migrate, parseSave } from '../src/core/save';

const baseItem = (uid: string) => ({ uid, base: 'conduit_ring', rarity: 'rare', itemPower: 50, name: 'Ring', implicits: [], affixes: [], sockets: [] });

const v7 = (inventory: unknown) => ({
  version: 7,
  savedAt: '2026-10-02T12:00:00.000Z',
  seed: 'abc',
  rngState: [1, 2, 3, 4],
  tick: 1,
  character: { name: 'Vex', classId: 'spectre' },
  player: { position: { x: 0, y: 0, z: 0 }, facing: 0 },
  progression: { level: 3, xp: 0, skillPoints: 0 },
  inventory,
  loot: { seq: 1, rngState: [1, 2, 3, 4] },
  skills: { ranks: {}, slots: [null, null, null, null, null, null] },
  world: { zone: 'zone.cinder_flats', zones: { 'zone.cinder_flats': { discovered: [], revealed: '' } } },
});

describe('save v8: item lock and junk flags (B002, B003)', () => {
  it('is version 8', () => {
    expect(SAVE_VERSION).toBe(8);
  });

  it('upgrades a v7 save: every carried item starts unlocked and unmarked', () => {
    const save = parseSave(JSON.stringify(v7({ gold: 5, grid: [baseItem('a-1'), null], equipped: { ring1: baseItem('a-2') }, aspects: [] })));
    expect(save.version).toBe(8);
    expect(save.inventory!.grid[0]).toMatchObject({ uid: 'a-1', locked: false, junk: false });
    expect(save.inventory!.grid[1]).toBeNull();
    expect(save.inventory!.equipped.ring1).toMatchObject({ uid: 'a-2', locked: false, junk: false });
  });

  it('keeps a flag that is already set and survives a character with no inventory', () => {
    const out = migrate(v7({ gold: 0, grid: [{ ...baseItem('a-3'), locked: true }], equipped: {} })) as { inventory: { grid: { locked: boolean; junk: boolean }[] } };
    expect(out.inventory.grid[0]).toMatchObject({ locked: true, junk: false });
    expect(parseSave(JSON.stringify(v7(null))).inventory).toBeNull();
  });

  it('a v8 save with flags round-trips and an item without flags still loads', () => {
    const save = parseSave(JSON.stringify({ ...v7({ gold: 0, grid: [{ ...baseItem('a-4'), junk: true }, baseItem('a-5')], equipped: {} }), version: 8 }));
    expect(save.inventory!.grid[0]!.junk).toBe(true);
    expect(save.inventory!.grid[1]!.locked).toBeUndefined();
  });
});
