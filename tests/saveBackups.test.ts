import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKUP_EVERY_MS, BACKUP_KEEP, SaveStore, SAVE_VERSION, SaveError, parseSave, serializeSave, type SaveData } from '../src/core/save';
import { checkImport, MAX_IMPORT_BYTES } from '../src/core/saveImport';
import { MemoryStorage } from './fixtures/memoryStorage';

const V8 = readFileSync(new URL('./fixtures/save-v8.json', import.meta.url), 'utf8');
const makeSave = (): SaveData => structuredClone(parseSave(V8));

const MemStorage = MemoryStorage;

const withLevel = (base: SaveData, level: number): SaveData => ({ ...base, progression: { ...base.progression, level } });

describe('save backups (round 4 B07)', () => {
  it('keeps the last three saves per slot, at least five minutes apart', () => {
    const mem = new MemStorage();
    const store = new SaveStore(mem);
    const base = makeSave();
    let now = 1_000_000;
    for (let level = 1; level <= 8; level++) {
      store.write('slot0', withLevel(base, level), now);
      now += BACKUP_EVERY_MS + 1;
    }
    const list = store.backups('slot0');
    expect(list).toHaveLength(BACKUP_KEEP);
    // Written 1..8: the backups hold the three saves before the last one.
    expect(list.map((b) => b.level)).toEqual([7, 6, 5]);
    expect(list[0]!.stamp).toBeGreaterThan(list[1]!.stamp);
    expect(store.read('slot0')!.progression.level).toBe(8);
  });

  it('does not rotate on every autosave', () => {
    const store = new SaveStore(new MemStorage());
    const base = makeSave();
    for (let i = 0; i < 20; i++) store.write('slot0', withLevel(base, i + 1), 5_000 + i * 1000);
    expect(store.backups('slot0')).toHaveLength(1);
  });

  it('slots keep separate backups, and removing a slot removes its backups', () => {
    const mem = new MemStorage();
    const store = new SaveStore(mem);
    const base = makeSave();
    store.write('slot0', withLevel(base, 1), 0);
    store.write('slot0', withLevel(base, 2), BACKUP_EVERY_MS + 1);
    store.write('slot1', withLevel(base, 9), 0);
    expect(store.backups('slot0')).toHaveLength(1);
    expect(store.backups('slot1')).toHaveLength(0);
    store.remove('slot0');
    expect(store.backups('slot0')).toHaveLength(0);
    expect(mem.keys().some((k) => k.includes('slot0'))).toBe(false);
  });

  it('restores a backup into the slot and keeps the replaced save as a backup', () => {
    const store = new SaveStore(new MemStorage());
    const base = makeSave();
    store.write('slot0', withLevel(base, 3), 0);
    store.write('slot0', withLevel(base, 4), BACKUP_EVERY_MS + 1);
    const [backup] = store.backups('slot0');
    expect(backup!.level).toBe(3);
    const restored = store.restoreBackup('slot0', backup!.stamp, 2 * BACKUP_EVERY_MS + 5);
    expect(restored.progression.level).toBe(3);
    expect(store.read('slot0')!.progression.level).toBe(3);
    expect(store.backups('slot0').map((b) => b.level)).toContain(4);
  });

  it('a backup that cannot be read is listed but refuses to restore, leaving the slot alone', () => {
    const mem = new MemStorage();
    const store = new SaveStore(mem);
    store.write('slot0', makeSave(), 0);
    mem.setItem('ashfall.save.slot0.bk.77', '{"version":' + SAVE_VERSION + ',"oops":true}');
    const bad = store.backups('slot0').find((b) => b.stamp === 77)!;
    expect(bad.level).toBeUndefined();
    const before = mem.getItem('ashfall.save.slot0');
    expect(() => store.restoreBackup('slot0', 77)).toThrow(SaveError);
    expect(() => store.restoreBackup('slot0', 99)).toThrow(/no longer exists/);
    expect(mem.getItem('ashfall.save.slot0')).toBe(before);
  });

  it('a full storage skips the backup, not the save', () => {
    const mem = new MemStorage();
    const store = new SaveStore(mem);
    store.write('slot0', makeSave(), 0);
    const realSet = mem.setItem.bind(mem);
    mem.setItem = (k, v) => {
      if (k.includes('.bk.')) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      realSet(k, v);
    };
    expect(store.write('slot0', withLevel(makeSave(), 5), BACKUP_EVERY_MS + 1).ok).toBe(true);
    expect(store.read('slot0')!.progression.level).toBe(5);
  });
});

describe('save import check (round 4 B08)', () => {
  it('summarises a good save: who, where, how far, and whether it is upgraded', () => {
    const json = serializeSave(withLevel(makeSave(), 12));
    const r = checkImport(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.level).toBe(12);
    expect(r.summary.migrated).toBe(false);
    expect(r.summary.dropped).toBe(0);
    expect(r.summary.name.length).toBeGreaterThan(0);
    expect(parseSave(serializeSave(r.data)).progression.level).toBe(12);
  });

  it.each([
    ['', 'empty'],
    ['{not json', 'notJson'],
    ['[1,2,3]', 'notSave'],
    ['{"hello":"world"}', 'notSave'],
    [JSON.stringify({ version: SAVE_VERSION + 5 }), 'newer'],
    [JSON.stringify({ version: SAVE_VERSION, seed: 3 }), 'broken'],
  ])('rejects %j as %s', (json, key) => {
    const r = checkImport(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe(key);
  });

  it('rejects an absurdly large file without parsing it', () => {
    const r = checkImport(' '.repeat(MAX_IMPORT_BYTES + 1) + '{}');
    expect(r.ok).toBe(false);
  });

  it('counts references this build no longer knows', () => {
    const save = makeSave();
    save.skills.ranks['n.does_not_exist'] = 2;
    const r = checkImport(serializeSave(save));
    expect(r.ok && r.summary.dropped).toBeGreaterThan(0);
  });
});
