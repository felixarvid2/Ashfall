/** D12 (feats) and D13 (cosmetic titles), plus the account loading without the new fields. */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Boss, Dead, Elite, Progression, SkillUser } from '../src/core/components';
import { World } from '../src/core/ecs';
import { emptyAccount, loadAccount, saveAccount } from '../src/core/account';
import type { GameEvent } from '../src/core/events';
import { FEATS } from '../src/data/feats';
import en from '../src/data/lang/en.json';
import { earnedTitles, featProgress, featValue, setTitle, trackFeats, wornTitle } from '../src/systems/feats';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { MemoryStorage } from './fixtures/memoryStorage';

const lang = (k: string) => k.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en);

function setup() {
  const world = new World();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, player, account: emptyAccount() };
}
const death = (id: number): GameEvent => ({ type: 'death', target: id, x: 0, z: 0, isPlayer: false }) as GameEvent;

describe('feat data', () => {
  it('has about twenty feats with unique ids, real icons and every string', () => {
    expect(FEATS.length).toBeGreaterThanOrEqual(18);
    expect(FEATS.length).toBeLessThanOrEqual(24);
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(FEATS.length);
    for (const f of FEATS) {
      expect(existsSync(new URL(`../public/assets/icons/${f.icon}.webp`, import.meta.url)), f.icon).toBe(true);
      expect(typeof lang(`feats.${f.id}.name`), f.id).toBe('string');
      expect(typeof lang(`feats.${f.id}.desc`), f.id).toBe('string');
      if (f.title) expect(typeof lang(`feats.${f.id}.title`), f.id).toBe('string');
    }
    expect(FEATS.filter((f) => f.title).length).toBeGreaterThanOrEqual(5);
  });
});

describe('trackFeats', () => {
  it('counts kills, elites and bosses, and reports a feat once', () => {
    const { world, player, account } = setup();
    const events: GameEvent[] = [];
    for (let i = 0; i < 100; i++) {
      const e = spawnEnemy(world, 'infected_colonist', 5, 5, { level: 1 });
      world.add(e, Dead, {} as never);
      events.push(death(e));
    }
    const first = trackFeats(world, account, player, events);
    expect(account.feats.stats.kills).toBe(100);
    expect(first.map((f) => f.id)).toEqual(['first_blood']);
    expect(trackFeats(world, account, player, [])).toEqual([]);
    expect(account.feats.done.first_blood).toBeGreaterThan(0);

    const elite = spawnEnemy(world, 'infected_colonist', 5, 5, { level: 1 });
    world.add(elite, Elite, { kind: 'rare', affixes: [], timers: {}, shieldUsed: false, mirrored: false, copy: false } as never);
    const copy = spawnEnemy(world, 'infected_colonist', 5, 5, { level: 1 });
    world.add(copy, Elite, { kind: 'rare', affixes: [], timers: {}, shieldUsed: false, mirrored: false, copy: true } as never);
    const boss = spawnEnemy(world, 'infected_colonist', 5, 5, { level: 1 });
    world.add(boss, Boss, {} as never);
    const got = trackFeats(world, account, player, [death(elite), death(copy), death(boss), { type: 'death', target: player, x: 0, z: 0, isPlayer: true } as GameEvent]);
    expect(account.feats.stats.elites).toBe(1);
    expect(account.feats.stats.bosses).toBe(1);
    expect(account.feats.stats.kills).toBe(102);
    expect(got.map((f) => f.id)).toEqual(['boss_slayer']);
  });

  it('counts uniques, mythics, rift clears (daily too) and quests', () => {
    const { world, player, account } = setup();
    const got = trackFeats(world, account, player, [
      { type: 'pickup', kind: 'item', rarity: 'unique', name: 'x' },
      { type: 'pickup', kind: 'item', rarity: 'mythic', name: 'y' },
      { type: 'pickup', kind: 'item', rarity: 'rare', name: 'z' },
      { type: 'interact', kind: 'riftCleared', id: '5' },
      { type: 'interact', kind: 'riftCleared', id: '9', detail: 'daily' },
      { type: 'quest', id: 'q', state: 'completed' },
      { type: 'quest', id: 'q2', state: 'progress' },
    ]);
    expect(account.feats.stats).toMatchObject({ uniques: 2, mythics: 1, riftsCleared: 2, dailyRifts: 1, quests: 1 });
    expect(got.map((f) => f.id).sort()).toEqual(['daily_grind', 'lucky_find', 'mythic_find', 'rift_runner']);
  });

  it('level and class feats follow the character, the best rift level follows the account', () => {
    const { world, player, account } = setup();
    world.req(player, Progression).level = 30;
    const got = trackFeats(world, account, player, []);
    expect(got.map((f) => f.id)).toContain('veteran');
    expect(account.feats.stats['class.bastion']).toBe(30);
    expect(featValue(account, 'classesAt10')).toBe(1);
    for (const c of ['spectre', 'xenomant', 'lightbearer']) account.feats.stats[`class.${c}`] = 10;
    expect(trackFeats(world, account, player, []).map((f) => f.id)).toEqual(['four_paths']);
    account.endgame.riftBest = 22;
    expect(trackFeats(world, account, player, []).map((f) => f.id)).toEqual(['deep_diver']);
    const veteran = FEATS.find((f) => f.id === 'veteran')!;
    expect(featProgress(account, veteran)).toEqual({ value: 30, done: true });
    expect(world.get(player, SkillUser)?.classId).toBe('bastion');
  });
});

describe('titles (D13)', () => {
  it('only an earned title can be worn, and it can be taken off', () => {
    const { account } = setup();
    expect(setTitle(account, 'ashwalker')).toBe(false);
    expect(setTitle(account, 'first_blood')).toBe(false); // earned but grants no title
    account.feats.done.ashwalker = 1;
    account.feats.done.first_blood = 1;
    expect(earnedTitles(account)).toEqual(['ashwalker']);
    expect(setTitle(account, 'first_blood')).toBe(false);
    expect(setTitle(account, 'ashwalker')).toBe(true);
    expect(wornTitle(account)).toBe('ashwalker');
    expect(setTitle(account, null)).toBe(true);
    expect(wornTitle(account)).toBeNull();
    // A stored title that is no longer valid is ignored.
    account.feats.title = 'collector';
    expect(wornTitle(account)).toBeNull();
    expect(wornTitle(undefined)).toBeNull();
  });
});

describe('account migration (feats, records)', () => {
  const V1 = readFileSync(new URL('./fixtures/account-v1.json', import.meta.url), 'utf8');

  it('an account saved before feats and records existed loads with empty defaults and keeps its data', () => {
    const raw = JSON.parse(V1);
    expect(raw.feats).toBeUndefined();
    expect(raw.riftRecords).toBeUndefined();
    const storage = new MemoryStorage();
    storage.setItem('ashfall.account', V1);
    const { account, recovered } = loadAccount(storage);
    expect(recovered).toBe(false);
    expect(account.stash[0]?.uid).toBe('s1');
    expect(account.endgame.tierUnlocked).toBe(2);
    expect(account.feats).toEqual({ done: {}, stats: {}, title: null });
    expect(account.riftRecords).toEqual({});
    expect(account.dailyRifts).toEqual({});
  });

  it('feats, records and the title survive a save and load', () => {
    const storage = new MemoryStorage();
    const { account } = loadAccount(storage);
    account.feats.done.ashwalker = 123;
    account.feats.stats.kills = 10001;
    account.feats.title = 'ashwalker';
    account.riftRecords.bastion = { '5': 200.5 };
    account.dailyRifts['2026-10-05'] = 321;
    expect(saveAccount(storage, account)).toEqual({ ok: true });
    expect(loadAccount(storage).account).toEqual(account);
  });

  it('a bad feats field is repaired without losing the rest of the account', () => {
    const storage = new MemoryStorage();
    storage.setItem('ashfall.account', JSON.stringify({ ...JSON.parse(V1), feats: 'oops', riftRecords: { bastion: { '5': 100 } } }));
    const { account, recovered } = loadAccount(storage);
    expect(recovered).toBe(true);
    expect(account.feats.done).toEqual({});
    expect(account.riftRecords.bastion?.['5']).toBe(100);
    expect(account.stash[0]?.uid).toBe('s1');
  });
});
