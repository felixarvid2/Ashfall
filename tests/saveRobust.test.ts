import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NewerSaveError,
  SAVE_VERSION,
  SaveStore,
  parseSave,
  serializeSave,
  type SaveData,
} from '../src/core/save';
import { runSaveApply, sanitizeSave, type SaveRefs } from '../src/core/saveRefs';
import { MemoryStorage } from './fixtures/memoryStorage';

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const V7 = fixture('save-v7.json');
const V8 = fixture('save-v8.json');
const PREFIX = 'ashfall.save.';

describe('old save fixtures', () => {
  it('loads a v8 save unchanged', () => {
    const data = parseSave(V8);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data).toEqual(JSON.parse(V8));
    expect(data.inventory?.grid[0]?.locked).toBe(false);
    // Re-serializing and parsing again is stable.
    expect(parseSave(serializeSave(data))).toEqual(data);
  });

  it('migrates a v7 save: items gain the lock/junk flags, everything else is kept', () => {
    const data = parseSave(V7);
    const old = JSON.parse(V7);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.character).toEqual(old.character);
    expect(data.progression).toEqual(old.progression);
    expect(data.inventory?.gold).toBe(4521);
    expect(data.inventory?.grid[0]).toMatchObject({ uid: 'i1', locked: false, junk: false });
    expect(data.inventory?.equipped.mainHand).toMatchObject({ uid: 'i3', locked: false, junk: false });
    expect(data.world).toEqual(old.world);
    expect(data.endgame.ashShards).toBe(0);
  });
});

describe('compact serialization', () => {
  it('is shorter than the pretty form and parses to the same save', () => {
    const data = parseSave(V8);
    const compact = serializeSave(data);
    const pretty = serializeSave(data, true);
    expect(compact.length).toBeLessThan(pretty.length);
    expect(compact).not.toContain('\n');
    expect(parseSave(compact)).toEqual(parseSave(pretty));
  });
});

describe('SaveStore.write', () => {
  it('maps a full storage to quota, a blocked one to blocked, anything else to unknown', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    const data = parseSave(V8);
    expect(store.write('slot0', data)).toEqual({ ok: true });
    storage.failWith = 'QuotaExceededError';
    expect(store.write('slot0', data)).toEqual({ ok: false, reason: 'quota' });
    storage.failWith = 'SecurityError';
    expect(store.write('slot0', data)).toEqual({ ok: false, reason: 'blocked' });
    storage.failWith = 'Weird';
    expect(store.write('slot0', data)).toEqual({ ok: false, reason: 'unknown' });
    // The last good save is still there.
    storage.failWith = null;
    expect(store.read('slot0')).toEqual(data);
  });

  it('writes compact JSON', () => {
    const storage = new MemoryStorage();
    new SaveStore(storage).write('slot0', parseSave(V8));
    expect(storage.getItem(`${PREFIX}slot0`)).not.toContain('\n');
  });
});

describe('corrupt and newer saves', () => {
  it('keeps garbage in a .corrupt.* key before the slot is overwritten, and only the last two copies', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    storage.setItem(`${PREFIX}slot0`, '{garbage');
    expect(store.quarantineIfUnreadable('slot0', 1000)).toBe(true);
    expect(storage.getItem(`${PREFIX}slot0.corrupt.1000`)).toBe('{garbage');
    store.quarantineIfUnreadable('slot0', 2000);
    store.quarantineIfUnreadable('slot0', 3000);
    const copies = storage.keys().filter((k) => k.includes('.corrupt.')).sort();
    expect(copies).toEqual([`${PREFIX}slot0.corrupt.2000`, `${PREFIX}slot0.corrupt.3000`]);
  });

  it('does not copy a healthy or empty slot', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    expect(store.quarantineIfUnreadable('slot0')).toBe(false);
    storage.setItem(`${PREFIX}slot0`, V8);
    expect(store.quarantineIfUnreadable('slot0')).toBe(false);
    expect(storage.keys()).toEqual([`${PREFIX}slot0`]);
  });

  it('tells a newer save from a corrupt one and keeps it too', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    const newer = JSON.stringify({ ...JSON.parse(V8), version: SAVE_VERSION + 1 });
    storage.setItem(`${PREFIX}slot1`, newer);
    expect(() => store.read('slot1')).toThrow(NewerSaveError);
    storage.setItem(`${PREFIX}slot2`, '{"version":3}');
    expect(() => store.read('slot2')).not.toThrow(NewerSaveError);
    expect(store.quarantineIfUnreadable('slot1', 5)).toBe(true);
    expect(storage.getItem(`${PREFIX}slot1.corrupt.5`)).toBe(newer);
  });
});

describe('migration backups', () => {
  it('writes the original v7 string to slot0.v7.bak once', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${PREFIX}slot0`, V7);
    const store = new SaveStore(storage);
    expect(store.read('slot0')?.version).toBe(SAVE_VERSION);
    expect(storage.getItem(`${PREFIX}slot0.v7.bak`)).toBe(V7);
    // A later autosave replaces the slot with a v8 save; the backup stays the original.
    store.write('slot0', parseSave(V7));
    store.read('slot0');
    expect(storage.getItem(`${PREFIX}slot0.v7.bak`)).toBe(V7);
    expect(storage.getItem(`${PREFIX}slot0`)).not.toBe(V7);
  });

  it('writes no backup for a current-version save', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${PREFIX}slot0`, V8);
    new SaveStore(storage).read('slot0');
    expect(storage.keys()).toEqual([`${PREFIX}slot0`]);
  });

  it('still reads when the backup cannot be written', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${PREFIX}slot0`, V7);
    storage.failWith = 'QuotaExceededError';
    expect(new SaveStore(storage).read('slot0')?.version).toBe(SAVE_VERSION);
  });
});

describe('sanitizeSave', () => {
  const refs: SaveRefs = {
    base: (id) => id !== 'removed_base',
    unique: (id) => id !== 'gone_unique',
    aspect: (id) => id !== 'gone_aspect',
    crystal: () => true,
    skillNode: (id) => id !== 'n.nope',
    skill: () => true,
  };

  it('reports an unknown base and an unknown skill node, drops them and refunds the rank', () => {
    const save = parseSave(V8);
    save.inventory!.grid[1] = { ...save.inventory!.grid[0]!, uid: 'bad', base: 'removed_base' };
    save.skills.ranks['n.nope'] = 3;
    const points = save.progression.skillPoints;
    const { data, dropped } = sanitizeSave(save, refs);
    expect(dropped).toHaveLength(2);
    expect(data.inventory!.grid[1]).toBeNull();
    expect(data.inventory!.grid).toHaveLength(save.inventory!.grid.length);
    expect(data.skills.ranks).toEqual({ 'n.hydraulic_strike': 2 });
    expect(data.progression.skillPoints).toBe(points + 3);
    // The input is not mutated.
    expect(save.inventory!.grid[1]?.base).toBe('removed_base');
  });

  it('removes bad equipped items, clears unknown uniques and aspects but keeps the item', () => {
    const save = parseSave(V8);
    save.inventory!.equipped.mainHand = { ...save.inventory!.equipped.mainHand!, base: 'removed_base' };
    save.inventory!.grid[0] = { ...save.inventory!.grid[0]!, unique: 'gone_unique', aspect: { id: 'gone_aspect', value: 1 } };
    const { data, dropped } = sanitizeSave(save, refs);
    expect(data.inventory!.equipped.mainHand).toBeUndefined();
    expect(data.inventory!.grid[0]).toMatchObject({ uid: 'i1' });
    expect(data.inventory!.grid[0]!.unique).toBeUndefined();
    expect(data.inventory!.grid[0]!.aspect).toBeUndefined();
    expect(dropped).toHaveLength(3);
  });

  it('leaves a v8 fixture alone with the real game data', () => {
    const save = parseSave(V8);
    const { data, dropped } = sanitizeSave(save);
    expect(dropped).toEqual([]);
    expect(data).toEqual(save);
  });
});

describe('runSaveApply', () => {
  const good = parseSave(V8);
  const bad = { ...good, seed: 'bad' };

  it('puts the previous state back when a step throws', () => {
    let live: SaveData = good;
    const result = runSaveApply(
      {
        snapshot: () => live,
        apply: (d) => {
          if (d.seed === 'bad') {
            live = { ...live, tick: -1 };
            throw new Error('half way');
          }
          live = d;
        },
      },
      bad,
    );
    expect(result).toMatchObject({ ok: false, restored: true });
    expect(live).toEqual(good);
  });

  it('reports not restored (autosave must stay off) when there is nothing to restore or restoring fails', () => {
    const boom = (): void => {
      throw new Error('boom');
    };
    expect(runSaveApply({ snapshot: () => null, apply: boom }, bad)).toMatchObject({ ok: false, restored: false });
    expect(runSaveApply({ snapshot: () => good, apply: boom }, bad)).toMatchObject({ ok: false, restored: false });
  });

  it('succeeds without touching the snapshot result', () => {
    expect(runSaveApply({ snapshot: () => good, apply: () => undefined }, good)).toEqual({ ok: true });
  });
});
