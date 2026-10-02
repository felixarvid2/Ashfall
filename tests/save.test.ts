import { describe, expect, it } from 'vitest';
import {
  SAVE_VERSION,
  SaveError,
  SaveStore,
  migrate,
  parseSave,
  serializeSave,
  type Migration,
  type SaveData,
} from '../src/core/save';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const sample = (): SaveData => ({
  version: SAVE_VERSION,
  savedAt: '2026-10-02T12:00:00.000Z',
  seed: 'abc123',
  rngState: [1, 2, 3, 4],
  tick: 600,
  character: { name: 'Vex', classId: 'spectre' },
  player: { position: { x: 3.5, y: 0, z: -2 }, facing: 1.2 },
  progression: { level: 3, xp: 40, skillPoints: 2 },
  inventory: { gold: 120, grid: [null, null], equipped: {} },
  loot: { seq: 7, rngState: [5, 6, 7, 8] },
  skills: { ranks: { 'n.hydraulic_strike': 2 }, slots: ['bastion.hydraulic_strike', null, null, null, null, null] },
  world: { zone: 'zone.cinder_flats', discovered: ['tp.ember', 'tp.impact'], revealed: 'AAE=', found: [], keycards: [] },
});

describe('save serialization', () => {
  it('round-trips through JSON', () => {
    expect(parseSave(serializeSave(sample()))).toEqual(sample());
  });

  it('rejects invalid JSON, missing version and newer versions', () => {
    expect(() => parseSave('{nope')).toThrow(SaveError);
    expect(() => parseSave('{"seed":"x"}')).toThrow(/missing version/);
    expect(() => parseSave(JSON.stringify({ ...sample(), version: SAVE_VERSION + 1 }))).toThrow(/newer version/);
  });

  it('reports which field failed validation', () => {
    const broken = { ...sample(), player: { position: { x: 'far', y: 0, z: 0 }, facing: 0 } };
    expect(() => parseSave(JSON.stringify(broken))).toThrow(/player\.position\.x/);
  });
});

describe('save migrations', () => {
  // A hypothetical chain v1 → v2 → v3, exercising the migration runner.
  const chain: Record<number, Migration> = {
    1: (d) => ({ ...d, version: 2, gold: 0 }),
    2: (d) => {
      const { gold, ...rest } = d as { gold: number };
      return { ...rest, version: 3, wallet: { gold } };
    },
  };

  it('runs every step in order up to the target version', () => {
    const out = migrate({ version: 1, seed: 's' }, chain, 3);
    expect(out).toEqual({ version: 3, seed: 's', wallet: { gold: 0 } });
  });

  it('starts from the save version, skipping earlier steps', () => {
    expect(migrate({ version: 2, gold: 50 }, chain, 3)).toEqual({ version: 3, wallet: { gold: 50 } });
  });

  it('fails clearly when a step is missing or wrong', () => {
    expect(() => migrate({ version: 1 }, {}, 2)).toThrow(/no migration from version 1/);
    expect(() => migrate({ version: 1 }, { 1: (d) => ({ ...d, version: 5 }) }, 2)).toThrow(/did not produce/);
  });

  it('upgrades a v3 save as a Bastion character', () => {
    const v3 = { ...sample(), version: 3 } as Record<string, unknown>;
    delete v3.character;
    delete v3.world;
    const save = parseSave(JSON.stringify(v3));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.character).toEqual({ name: 'Bastion', classId: 'bastion' });
  });

  it('upgrades a v4 save into the open world at the escape pod', () => {
    const v4 = { ...sample(), version: 4 } as Record<string, unknown>;
    delete v4.world;
    const save = parseSave(JSON.stringify(v4));
    expect(save.world.zone).toBe('zone.cinder_flats');
    expect(save.world.discovered).toContain('tp.ember');
    expect(save.player.position.x).toBeLessThan(-250);
  });

  it('upgrades a v2 save, refunding a skill point per level', () => {
    const v2 = {
      version: 2,
      savedAt: 'x',
      seed: 's',
      rngState: [1, 2, 3, 4],
      tick: 1,
      player: { position: { x: 0, y: 0, z: 0 }, facing: 0 },
      progression: { level: 5, xp: 10, skillPoints: 0 },
      inventory: null,
      loot: { seq: 0, rngState: [1, 2, 3, 4] },
    };
    const save = parseSave(JSON.stringify(v2));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.progression.skillPoints).toBe(4);
    expect(save.skills.ranks).toEqual({ 'n.hydraulic_strike': 1 });
  });

  it('upgrades a real v1 save all the way with progression defaults', () => {
    const v1 = {
      version: 1,
      savedAt: '2026-10-02T12:00:00.000Z',
      seed: 'abc',
      rngState: [1, 2, 3, 4],
      tick: 10,
      player: { position: { x: 1, y: 0, z: 2 }, facing: 0 },
    };
    const save = parseSave(JSON.stringify(v1));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.character.classId).toBe('bastion');
    expect(save.progression).toEqual({ level: 1, xp: 0, skillPoints: 0 });
    expect(save.inventory).toBeNull();
    expect(save.loot.rngState).toEqual([1, 2, 3, 4]);
  });

  it('leaves current-version saves untouched', () => {
    const data = { version: SAVE_VERSION, x: 1 };
    expect(migrate(data)).toEqual(data);
  });
});

describe('SaveStore', () => {
  it('writes, reads and removes a slot', () => {
    const store = new SaveStore(new MemoryStorage());
    expect(store.read('slot0')).toBeNull();
    store.write('slot0', sample());
    expect(store.read('slot0')).toEqual(sample());
    store.remove('slot0');
    expect(store.read('slot0')).toBeNull();
  });

  it('throws SaveError on a corrupt slot instead of returning garbage', () => {
    const storage = new MemoryStorage();
    storage.setItem('ashfall.save.slot0', '{"version":3}');
    expect(() => new SaveStore(storage).read('slot0')).toThrow(SaveError);
  });

  it('reports unavailable storage', () => {
    const store = new SaveStore(undefined);
    expect(store.available).toBe(false);
    expect(() => store.write('slot0', sample())).toThrow(SaveError);
  });
});
