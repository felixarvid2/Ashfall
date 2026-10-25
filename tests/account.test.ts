import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_MIGRATIONS,
  accountHeld,
  acknowledgeAccountRecovery,
  emptyAccount,
  loadAccount,
  migrateAccount,
  saveAccount,
} from '../src/core/account';
import { MemoryStorage } from './fixtures/memoryStorage';

const V1 = readFileSync(new URL('./fixtures/account-v1.json', import.meta.url), 'utf8');

describe('loadAccount', () => {
  it('returns an empty account for a fresh browser', () => {
    const { account, recovered } = loadAccount(new MemoryStorage());
    expect(recovered).toBe(false);
    expect(account).toEqual(emptyAccount());
    expect(loadAccount(undefined).recovered).toBe(false);
  });

  it('round-trips a valid v1 blob', () => {
    const storage = new MemoryStorage();
    storage.setItem('ashfall.account', V1);
    const { account, recovered } = loadAccount(storage);
    expect(recovered).toBe(false);
    expect(account.stash[0]?.uid).toBe('s1');
    expect(account.relics).toEqual({ 'relic.1': 'strength' });
    expect(account.endgame.tierUnlocked).toBe(2);
    expect(saveAccount(storage, account)).toEqual({ ok: true });
    expect(loadAccount(storage).account).toEqual(account);
  });

  it('keeps the stash when the blob has an unknown extra key', () => {
    const storage = new MemoryStorage();
    storage.setItem('ashfall.account', JSON.stringify({ ...JSON.parse(V1), futureThing: { a: 1 } }));
    const { account, recovered } = loadAccount(storage);
    expect(recovered).toBe(false);
    expect(account.stash[0]?.uid).toBe('s1');
  });

  it('backs up corrupt JSON, flags it and does not overwrite the stored blob', () => {
    const storage = new MemoryStorage();
    storage.setItem('ashfall.account', V1.slice(0, 120));
    const { account, recovered, reason } = loadAccount(storage);
    expect(recovered).toBe(true);
    expect(reason).toBe('corrupt');
    expect(storage.getItem('ashfall.account.bak')).toBe(V1.slice(0, 120));
    expect(accountHeld(account)).toBe(true);
    expect(saveAccount(storage, account)).toEqual({ ok: true });
    expect(storage.getItem('ashfall.account')).toBe(V1.slice(0, 120));
    // Once the player carries on, it may be saved; the backup is still there.
    acknowledgeAccountRecovery(account);
    saveAccount(storage, account);
    expect(storage.getItem('ashfall.account')).not.toBe(V1.slice(0, 120));
    expect(storage.getItem('ashfall.account.bak')).toBe(V1.slice(0, 120));
  });

  it('salvages the stash when only another field is bad', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ ...JSON.parse(V1), endgame: { tierUnlocked: 99 } });
    storage.setItem('ashfall.account', raw);
    const { account, recovered } = loadAccount(storage);
    expect(recovered).toBe(true);
    expect(storage.getItem('ashfall.account.bak')).toBe(raw);
    expect(account.stash[0]?.uid).toBe('s1');
    expect(account.relics).toEqual({ 'relic.1': 'strength' });
    expect(account.endgame.tierUnlocked).toBe(1);
  });

  it('keeps the last two backups', () => {
    const storage = new MemoryStorage();
    for (const bad of ['{one', '{two', '{three']) {
      storage.setItem('ashfall.account', bad);
      loadAccount(storage);
    }
    expect(storage.getItem('ashfall.account.bak')).toBe('{three');
    expect(storage.getItem('ashfall.account.bak.1')).toBe('{two');
  });

  it('never overwrites an account from a newer version, even after the player carries on', () => {
    const storage = new MemoryStorage();
    const newer = JSON.stringify({ ...JSON.parse(V1), version: 2 });
    storage.setItem('ashfall.account', newer);
    const { account, recovered, reason } = loadAccount(storage);
    expect(recovered).toBe(true);
    expect(reason).toBe('newer');
    acknowledgeAccountRecovery(account);
    saveAccount(storage, account);
    expect(storage.getItem('ashfall.account')).toBe(newer);
  });
});

describe('saveAccount', () => {
  it('reports a full storage instead of throwing', () => {
    const storage = new MemoryStorage();
    storage.failWith = 'QuotaExceededError';
    expect(saveAccount(storage, emptyAccount())).toEqual({ ok: false, reason: 'quota' });
    expect(saveAccount(undefined, emptyAccount())).toEqual({ ok: false, reason: 'blocked' });
  });
});

describe('migrateAccount', () => {
  it('runs a chain in order and leaves the current version alone', () => {
    const chain = { 1: (d: Record<string, unknown>) => ({ ...d, version: 2, extra: 1 }) };
    expect(migrateAccount({ version: 1 }, chain, 2)).toEqual({ version: 2, extra: 1 });
    expect(migrateAccount({ version: 1 })).toEqual({ version: 1 });
    expect(Object.keys(ACCOUNT_MIGRATIONS)).toEqual([]);
  });

  it('fails on a gap, a bad step, or a blob without a version', () => {
    expect(() => migrateAccount({ version: 1 }, {}, 2)).toThrow(/no account migration/);
    expect(() => migrateAccount({ version: 1 }, { 1: (d) => d }, 2)).toThrow(/did not produce/);
    expect(() => migrateAccount({})).toThrow(/no version/);
    expect(() => migrateAccount([])).toThrow(/not an object/);
  });
});
