/**
 * C09: the checked-in save and account fixtures are what the game's own export path writes after a seeded sim
 * run (scripts/sim/fixtures.ts). A schema or data change that alters them fails here: refresh with
 * `npm run fixtures:build` (or run this test with UPDATE_FIXTURES=1) and review the diff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadAccount } from '../src/core/account';
import { SAVE_VERSION, parseSave, serializeSave } from '../src/core/save';
import { sanitizeSave } from '../src/core/saveRefs';
import { FIXTURE_FILES, buildFixtures } from '../scripts/sim/fixtures';
import { MemoryStorage } from './fixtures/memoryStorage';

const update = !!process.env.UPDATE_FIXTURES;
const fixtures = buildFixtures();
if (update) {
  writeFileSync(FIXTURE_FILES.save, `${fixtures.save}\n`);
  writeFileSync(FIXTURE_FILES.account, `${fixtures.account}\n`);
}
const onDisk = {
  save: readFileSync(FIXTURE_FILES.save, 'utf8').trimEnd(),
  account: readFileSync(FIXTURE_FILES.account, 'utf8').trimEnd(),
};

describe('sim-produced fixtures (C09)', () => {
  it('the run did real work', () => {
    expect(fixtures.summary.ticks).toBe(10800);
    expect(fixtures.summary.kills).toBeGreaterThan(5);
    expect(fixtures.summary.level).toBeGreaterThanOrEqual(2);
    expect(fixtures.summary.items).toBeGreaterThan(0);
  });

  it('the checked-in files match a fresh run (npm run fixtures:build refreshes them)', () => {
    expect(onDisk.save).toBe(fixtures.save);
    expect(onDisk.account).toBe(fixtures.account);
  });

  it('the save parses at the current version, keeps its references and round-trips byte for byte', () => {
    const data = parseSave(onDisk.save);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.character.classId).toBe('bastion');
    expect(data.tick).toBe(fixtures.summary.ticks);
    expect(data.inventory!.grid.some((i) => i !== null)).toBe(true);
    expect(sanitizeSave(data).data).toEqual(data);
    expect(serializeSave(data, true)).toBe(onDisk.save);
  });

  it('the account loads clean from storage and carries the run', () => {
    const storage = new MemoryStorage();
    storage.setItem('ashfall.account', onDisk.account);
    const loaded = loadAccount(storage);
    expect(loaded.recovered).toBe(false);
    expect(loaded.account.feats.stats.kills).toBe(fixtures.summary.kills);
    expect(loaded.account.stash.some((i) => i !== null)).toBe(true);
  });
});
