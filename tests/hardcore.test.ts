import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyAccount, loadAccount, saveAccount, stashOf } from '../src/core/account';
import { World } from '../src/core/ecs';
import { SAVE_VERSION, parseSave, serializeSave } from '../src/core/save';
import { buildSaveData } from '../src/systems/saveSnapshot';
import { createQuestRuntime } from '../src/systems/quests';
import { spawnPlayer } from '../src/world/spawn';
import { MemoryStorage } from './fixtures/memoryStorage';
import { makeCtx } from './helpers';

const item = (uid: string) => ({ uid, base: 'power_sword', rarity: 'rare', itemPower: 120, name: 'Sword', implicits: [], affixes: [], sockets: [] }) as never;

describe('A13 Hardcore characters', () => {
  it('a Hardcore character has a stash of its own', () => {
    const account = emptyAccount();
    stashOf(account, false).push(item('shared'));
    stashOf(account, true).push(item('hc'));
    expect(account.stash.map((i) => i?.uid)).toEqual(['shared']);
    expect(account.hardcoreStash.map((i) => i?.uid)).toEqual(['hc']);
    const storage = new MemoryStorage();
    saveAccount(storage, account);
    const back = loadAccount(storage).account;
    expect(stashOf(back, true)[0]?.uid).toBe('hc');
    expect(stashOf(back, false)[0]?.uid).toBe('shared');
  });

  it('an account from before the Hardcore stash loads with an empty one', () => {
    const storage = new MemoryStorage();
    storage.setItem('ashfall.account', readFileSync(new URL('./fixtures/account-v1.json', import.meta.url), 'utf8'));
    const { account, recovered } = loadAccount(storage);
    expect(recovered).toBe(false);
    expect(account.hardcoreStash).toEqual([]);
    expect(account.stash[0]?.uid).toBe('s1');
  });

  it('the save keeps the Hardcore and fallen marks; older saves have neither', () => {
    const world = new World();
    const ctx = makeCtx({ quests: createQuestRuntime() });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const base = { zoneId: 'zone.cinder_flats', name: 'Vex', position: { x: 0, z: 0 }, facing: 0 };
    const plain = buildSaveData(world, player, ctx, base);
    expect(plain.character).toEqual({ name: 'Vex', classId: 'bastion' });
    const hc = buildSaveData(world, player, ctx, { ...base, hardcore: true });
    expect(parseSave(serializeSave(hc)).character).toMatchObject({ hardcore: true });
    expect(parseSave(serializeSave(hc)).character.fallen).toBeUndefined();
    const dead = buildSaveData(world, player, ctx, { ...base, hardcore: true, fallen: true });
    expect(parseSave(serializeSave(dead)).character).toMatchObject({ hardcore: true, fallen: true });
    const old = parseSave(readFileSync(new URL('./fixtures/save-v8.json', import.meta.url), 'utf8'));
    expect(old.version).toBe(SAVE_VERSION);
    expect(old.character.hardcore).toBeUndefined();
  });
});
