/** Progression pass (G018-G024, C011): death toll, kill-XP fall-off, quest XP, ranged packs, strongholds, elites, Deep Rifts. */
import { describe, expect, it, afterEach } from 'vitest';
import { CombatStats, Health, Inventory, Progression, SkillUser } from '../src/core/components';
import { World } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { emptyAccount } from '../src/core/account';
import { strongholdLifeMul } from '../src/data/bosses';
import { ENEMY_DEFS } from '../src/data/db';
import { TIER_TABLE } from '../src/data/endgame/tiers';
import { RIFT, RIFT_REWARDS } from '../src/data/endgame/rifts';
import { eliteDamageMul, eliteLifeMul, rareAffixCount } from '../src/data/elites';
import { dropTable } from '../src/data/loot/db';
import { packTemplate } from '../src/data/packs';
import { QUESTS } from '../src/data/quests/db';
import { ZONES } from '../src/data/zones';
import { applyDeathPenalty, DEATH_PENALTY } from '../src/systems/death';
import { setEnemyScaling } from '../src/systems/endgame/tiers';
import { riftDamageScale, riftExtraChances, riftItemPower, riftScale } from '../src/systems/endgame/rifts';
import { killXp, xpFalloff, xpToNext } from '../src/systems/loot/generate';
import { rewardSystem } from '../src/systems/loot/rewards';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeElite } from '../src/world/zone';
import { makeCtx, run } from './helpers';

afterEach(() => setEnemyScaling(TIER_TABLE[1]));

describe('G018 death toll', () => {
  function hero(gold: number, level: number, potions: number) {
    const world = new World();
    const p = spawnPlayer(world, 'bastion', 0, 0);
    world.req(p, Inventory).gold = gold;
    world.req(p, Progression).level = level;
    world.req(p, SkillUser).potionCharges = potions;
    return { world, p };
  }

  it('takes 5 % of carried gold, rounded down', () => {
    const { world, p } = hero(1000, 20, 4);
    expect(applyDeathPenalty(world, p).gold).toBe(50);
    expect(world.req(p, Inventory).gold).toBe(950);
    const poor = hero(19, 5, 4);
    expect(applyDeathPenalty(poor.world, poor.p).gold).toBe(0);
  });

  it('caps the gold loss at 40 per character level', () => {
    const { world, p } = hero(1_000_000, 10, 4);
    expect(applyDeathPenalty(world, p).gold).toBe(DEATH_PENALTY.goldCapPerLevel * 10);
    expect(world.req(p, Inventory).gold).toBe(1_000_000 - 400);
  });

  it('halves potion charges, rounded down, keeping at least one; none stays none', () => {
    const cases: [number, number][] = [[4, 2], [5, 2], [3, 1], [2, 1], [1, 1], [0, 0]];
    for (const [before, after] of cases) {
      const { world, p } = hero(0, 1, before);
      applyDeathPenalty(world, p);
      expect(world.req(p, SkillUser).potionCharges, `from ${before}`).toBe(after);
    }
  });
});

describe('G019 kill XP fall-off above the zone cap', () => {
  const table = dropTable('dt.infected_colonist');

  it('is 1x at or under the cap, then -30 % per level over it, never under 0.1x', () => {
    expect(xpFalloff(10, 10)).toBe(1);
    expect(xpFalloff(3, 10)).toBe(1);
    expect(xpFalloff(11, 10)).toBeCloseTo(0.7, 10);
    expect(xpFalloff(12, 10)).toBeCloseTo(0.4, 10);
    expect(xpFalloff(14, 10)).toBe(0.1);
    expect(xpFalloff(40, 10)).toBe(0.1);
  });

  it('killXp applies it only when the caller passes the cap', () => {
    const full = killXp(table, 10);
    expect(killXp(table, 10, { playerLevel: 10, zoneMaxLevel: 10 })).toBe(full);
    expect(killXp(table, 10, { playerLevel: 14, zoneMaxLevel: 10 })).toBe(Math.round(full * 0.1));
  });

  function xpFor(playerLevel: number, ctxOver: Parameters<typeof makeCtx>[0] = {}, tierUnlocked = 1) {
    const world = new World();
    const account = emptyAccount();
    account.endgame.tierUnlocked = tierUnlocked;
    account.endgame.tier = tierUnlocked;
    const ctx = makeCtx({ zoneLevels: [1, 10], account, ...ctxOver });
    const p = spawnPlayer(world, 'bastion', 0, 0);
    world.req(p, Progression).level = playerLevel;
    ctx.rewards.push({ table: 'dt.infected_colonist', level: 10, x: 1, z: 1, xp: true });
    run(world, ctx, [rewardSystem]);
    let gained = world.req(p, Progression).xp;
    for (let l = playerLevel; l < world.req(p, Progression).level; l++) gained += xpToNext(l);
    return gained;
  }

  it('rewardSystem: 0.1x at level 14 in a zone capped at 10, 1x at the cap', () => {
    const full = xpFor(10);
    expect(full).toBe(killXp(table, 10));
    expect(xpFor(14)).toBe(Math.round(full * 0.1));
  });

  it('World Tier 2+ (monsters follow the player) is unaffected', () => {
    expect(xpFor(14, {}, 2)).toBeCloseTo(killXp(table, 10) * TIER_TABLE[2].xp, 6);
  });
});

describe('G020 quest XP stays within the XP the levels need', () => {
  it('the Deep Mines and the Core give 60-100 % of their level band', () => {
    for (const z of ZONES.filter((x) => x.id === 'zone.deep_mines' || x.id === 'zone.the_core')) {
      let quests = 0;
      for (const q of QUESTS.values()) if (q.zone === z.id) quests += q.rewards.xp ?? 0;
      let band = 0;
      for (let l = z.levels[0]; l < z.levels[1]; l++) band += xpToNext(l);
      expect(quests / band, z.id).toBeGreaterThanOrEqual(0.6);
      expect(quests / band, z.id).toBeLessThanOrEqual(1);
    }
  });
});

describe('G021 ranged enemies in regions 2-4', () => {
  it('10-20 % of weighted open-world pack members shoot in each of regions 2-4', () => {
    for (const z of ZONES.slice(1, 4)) {
      let all = 0;
      let shooting = 0;
      for (const pack of z.packs) {
        for (const m of packTemplate(pack.template).members) {
          const n = (m.chance ?? 1) * ((m.count[0] + m.count[1]) / 2);
          all += n;
          if (ENEMY_DEFS.get(m.enemy)!.attack.kind === 'projectile') shooting += n;
        }
      }
      expect(shooting / all, z.id).toBeGreaterThanOrEqual(0.1);
      expect(shooting / all, z.id).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('G022 strongholds against the zone boss', () => {
  const life = (enemy: string, level: number, lifeMul: number) => {
    const world = new World();
    return world.req(spawnEnemy(world, enemy, 0, 0, { level, lifeMul }), Health).max;
  };

  it('multiplier grows 3.5 % per level', () => {
    expect(strongholdLifeMul(1)).toBe(1);
    expect(strongholdLifeMul(31)).toBeCloseTo(2.05, 10);
  });

  it('at each region top level the stronghold boss has 0.4-1.0x the zone boss life', () => {
    const pairs: [string, string, number][] = [
      ['commandant_hale', 'the_first', 10],
      ['brother_ash', 'vire', 20],
      ['gamma_bloom', 'warden', 30],
      ['security_chief_holm', 'governor_kade', 40],
    ];
    for (const [mid, boss, level] of pairs) {
      const ratio = life(mid, level, strongholdLifeMul(level)) / life(boss, level, 1);
      expect(ratio, mid).toBeGreaterThanOrEqual(0.4);
      expect(ratio, mid).toBeLessThanOrEqual(1);
    }
  });
});

describe('G023 elite strength scales over levels', () => {
  it('rare life x(4 + 0.05 level), damage x(1.5 + 0.01 level); champion life x(2 + 0.02 level)', () => {
    expect(eliteLifeMul('rare', 45)).toBeCloseTo(6.25, 10);
    expect(eliteLifeMul('rare', 45)).toBeGreaterThanOrEqual(6);
    expect(eliteDamageMul('rare', 45)).toBeCloseTo(1.95, 10);
    expect(eliteLifeMul('champion', 40)).toBeCloseTo(2.8, 10);
    expect(eliteDamageMul('champion', 40)).toBe(1.25);
  });

  it('rare elites roll 5 affixes from level 30 (and keep 2 / 3 / 4 below)', () => {
    expect([1, 5, 9, 29, 30, 50].map(rareAffixCount)).toEqual([2, 3, 4, 4, 5, 5]);
  });

  it('makeElite applies the level-based multipliers', () => {
    const world = new World();
    const base = world.req(spawnEnemy(world, 'infected_colonist', 0, 0, { level: 45 }), Health).max;
    const baseDmg = ENEMY_DEFS.get('infected_colonist')!.damage * (1 + 0.12 * 44);
    const e = spawnEnemy(world, 'infected_colonist', 5, 5, { level: 45 });
    makeElite(world, e, 'rare', new Rng('scale'));
    expect(world.req(e, Health).max / base).toBeCloseTo(6.25, 6);
    expect(world.req(e, CombatStats).weaponDamage / baseDmg).toBeCloseTo(1.95, 6);
    const c = spawnEnemy(world, 'infected_colonist', 9, 9, { level: 20 });
    const cBase = world.req(c, Health).max;
    makeElite(world, c, 'champion', new Rng('c'), ['fast']);
    expect(world.req(c, Health).max / cBase).toBeCloseTo(2.4, 6);
  });
});

describe('G024 Deep Rift damage scaling', () => {
  it('damage grows 3.5 % per rift level, life still 6 %', () => {
    expect(riftDamageScale(40)).toBeGreaterThan(3.5);
    expect(riftDamageScale(40)).toBeLessThan(4.5);
    expect(riftScale(40)).toBeCloseTo(10.29, 2);
    expect(riftDamageScale(100)).toBeCloseTo(31.19, 1);
    expect(RIFT.damagePerLevel).toBeLessThan(RIFT.perLevel);
  });
});

describe('C011 Deep Rift rewards keep growing to level 100', () => {
  it('cache item power rises strictly from 65 to 100', () => {
    for (let l = 65; l < 100; l++) expect(riftItemPower(l + 1), `rift ${l + 1}`).toBeGreaterThan(riftItemPower(l));
    expect(riftItemPower(100)).toBe(RIFT_REWARDS.itemPower.base + 2 * 100);
  });

  it('the extra unique gets likelier with the level and a mythic appears from rift 61', () => {
    for (let l = 1; l < 100; l++) expect(riftExtraChances(l + 1).unique).toBeGreaterThan(riftExtraChances(l).unique);
    expect(riftExtraChances(60).mythic).toBe(0);
    expect(riftExtraChances(100).mythic).toBeCloseTo(0.04, 10);
    expect(riftExtraChances(100).unique).toBeCloseTo(0.45, 10);
  });
});
