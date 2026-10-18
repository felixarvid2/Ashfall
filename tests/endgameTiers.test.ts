import { afterEach, describe, expect, it } from 'vitest';
import { CombatStats, EnemyAI, GroundGold, Health, Progression, Resource, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { Rng } from '../src/core/rng';
import { World } from '../src/core/ecs';
import { TIER_BEACONS } from '../src/data/endgame/beacons';
import { SCALE_TO_PLAYER_FROM_TIER, TIER_TABLE, WORLD_TIERS } from '../src/data/endgame/tiers';
import { t } from '../src/data/i18n';
import { dropTable } from '../src/data/loot/db';
import { NPCS } from '../src/data/quests/db';
import { STASH_POSITION } from '../src/data/quests/cinderFlats';
import { ZONES } from '../src/data/zones';
import { LUMEN_HEART, THE_CORE } from '../src/data/zones/theCore';
import { spatialSystem } from '../src/systems/collision';
import { monsterLevel } from '../src/systems/encounter';
import { chooseTier, currentTier, monsterLevelCap, playerInCombat, setEnemyScaling, tickPlaytime, tierMods, unlockTier } from '../src/systems/endgame/tiers';
import { bossSystem } from '../src/systems/boss';
import { kill } from '../src/systems/combat';
import { generateItem, rollDrops, rollRarity } from '../src/systems/loot/generate';
import { rewardSystem } from '../src/systems/loot/rewards';
import { createQuestRuntime } from '../src/systems/quests';
import { tierBadgeText, tierEffectLines } from '../src/ui/tierPanel';
import { setPieceSystem, syncSetPieces } from '../src/world/setPieces';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function accountCtx(unlocked: number, tier: number, overrides: Parameters<typeof makeCtx>[0] = {}) {
  const account = emptyAccount();
  account.endgame.tierUnlocked = unlocked;
  account.endgame.tier = tier;
  return makeCtx({ account, ...overrides });
}

afterEach(() => setEnemyScaling(TIER_TABLE[1]));

describe('World Tier table', () => {
  it('matches docs/endgame.md', () => {
    const rows = WORLD_TIERS.map((n) => TIER_TABLE[n]);
    expect(rows.map((r) => [r.enemyLife, r.enemyDamage, r.xp, r.gold, r.itemPower, r.greaterChance, r.rareDrops])).toEqual([
      [1, 1, 1, 1, 0, 0, 1],
      [1.5, 1.25, 1.5, 1.5, 40, 0.1, 1.5],
      [3, 1.75, 2.5, 2, 80, 0.25, 2.5],
      [6, 2.5, 4, 3, 120, 0.45, 4],
    ]);
    expect(rows.map((r) => r.tier)).toEqual([1, 2, 3, 4]);
    expect(SCALE_TO_PLAYER_FROM_TIER).toBe(2);
  });

  it('has a name, an unlock text, effect lines and a badge for every tier', () => {
    for (const n of WORLD_TIERS) {
      expect(t(`worldTiers.${n}.name`)).not.toBe(`worldTiers.${n}.name`);
      expect(t(`worldTiers.${n}.unlock`)).not.toBe(`worldTiers.${n}.unlock`);
      expect(tierEffectLines(n).join(' ')).not.toMatch(/worldTiers|\{/);
    }
    expect(tierBadgeText(2)).toBe('WT II Veteran');
  });
});

describe('tierMods', () => {
  it('is neutral without an account and at tier 1', () => {
    expect(tierMods(makeCtx())).toEqual(TIER_TABLE[1]);
    expect(tierMods(accountCtx(1, 1))).toEqual(TIER_TABLE[1]);
  });

  it('returns the chosen tier clamped to what is unlocked', () => {
    expect(tierMods(accountCtx(2, 2))).toEqual(TIER_TABLE[2]);
    expect(tierMods(accountCtx(2, 4)).tier).toBe(2);
    expect(tierMods(accountCtx(4, 3)).tier).toBe(3);
    expect(tierMods(accountCtx(3, 1)).tier).toBe(1);
  });

  it('unlockTier raises the unlocked tier and never lowers it', () => {
    const ctx = accountCtx(1, 1);
    unlockTier(ctx, 3);
    unlockTier(ctx, 2);
    expect(ctx.account!.endgame.tierUnlocked).toBe(3);
    expect(ctx.account!.endgame.tier).toBe(1);
    unlockTier(makeCtx(), 2); // no account: no-op
  });

  it('does not apply inside a Deep Rift', () => {
    const ctx = accountCtx(4, 4);
    ctx.instance = { def: { kind: 'rift' } } as never;
    expect(tierMods(ctx).tier).toBe(1);
  });
});

describe('monster level', () => {
  function levelWorld(level: number) {
    const world = new World();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    world.req(player, Progression).level = level;
    return world;
  }

  it('stays within the zone range at tier 1', () => {
    const ctx = accountCtx(2, 1, { zoneLevels: [1, 10] });
    expect(monsterLevel(levelWorld(50), ctx)).toBe(10);
    expect(monsterLevel(levelWorld(5), ctx)).toBe(5);
    expect(monsterLevelCap(ctx)).toBe(10);
  });

  it.each([2, 3, 4])('follows the player everywhere at tier %i, never below the zone', (tier) => {
    const ctx = accountCtx(4, tier, { zoneLevels: [20, 30] });
    expect(monsterLevel(levelWorld(50), ctx)).toBe(50);
    expect(monsterLevel(levelWorld(32), ctx)).toBe(32);
    expect(monsterLevel(levelWorld(5), ctx)).toBe(20);
    expect(monsterLevelCap(ctx)).toBe(Infinity);
  });
});

describe('enemy life and damage', () => {
  it.each(WORLD_TIERS)('tier %i scales spawned enemies', (n) => {
    const world = new World();
    setEnemyScaling(TIER_TABLE[1]);
    const base = spawnEnemy(world, 'infected_colonist', 0, 0, { level: 10 });
    setEnemyScaling(tierMods(accountCtx(4, n)));
    const scaled = spawnEnemy(world, 'infected_colonist', 5, 0, { level: 10 });
    expect(world.req(scaled, Health).max).toBeCloseTo(world.req(base, Health).max * TIER_TABLE[n].enemyLife);
    expect(world.req(scaled, CombatStats).weaponDamage).toBeCloseTo(world.req(base, CombatStats).weaponDamage * TIER_TABLE[n].enemyDamage);
  });
});

describe('experience, gold and loot', () => {
  function reward(tier: number, table = 'dt.sergeant', n = 1) {
    const world = new World();
    const ctx = accountCtx(4, tier, { zoneLevels: [1, 50] });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    world.req(player, Progression).level = 30;
    for (let i = 0; i < n; i++) ctx.rewards.push({ table, level: 10, x: 0, z: 0, xp: true });
    run(world, ctx, [rewardSystem], 1);
    const gold = world.query(GroundGold).reduce((sum, e) => sum + world.req(e, GroundGold).amount, 0);
    return { xp: world.req(player, Progression).xp, gold };
  }

  it.each([2, 3, 4])('tier %i multiplies kill XP', (n) => {
    expect(reward(n).xp).toBeCloseTo(reward(1).xp * TIER_TABLE[n as 2 | 3 | 4].xp, 5);
  });

  it.each([2, 3, 4])('tier %i multiplies gold drops', (n) => {
    const base = reward(1, 'dt.sergeant', 200).gold;
    const gold = reward(n, 'dt.sergeant', 200).gold;
    expect(gold / base).toBeGreaterThan(TIER_TABLE[n as 2 | 3 | 4].gold * 0.9);
    expect(gold / base).toBeLessThan(TIER_TABLE[n as 2 | 3 | 4].gold * 1.1);
  });

  it.each([2, 3, 4])('tier %i raises item power, even above the level cap', (n) => {
    const row = TIER_TABLE[n as 2 | 3 | 4];
    const table = dropTable('dt.boss');
    const plain = rollDrops(new Rng('ip'), table, 50, 'bastion', () => 'u1');
    const boosted = rollDrops(new Rng('ip'), table, 50, 'bastion', () => 'u1', undefined, row);
    expect(boosted.items[0]!.itemPower - plain.items[0]!.itemPower).toBe(row.itemPower);
    expect(boosted.items[0]!.itemPower).toBeGreaterThan(300);
  });

  it('greater affix chance rises by the tier bonus', () => {
    const greater = (bonus: number) => {
      const rng = new Rng('greater');
      let hits = 0;
      let total = 0;
      for (let i = 0; i < 400; i++) {
        const item = generateItem(rng, { itemPower: 200, classId: 'bastion', uid: `g${i}`, rarity: 'rare', greaterBonus: bonus });
        for (const a of item.affixes) {
          total++;
          if (a.greater) hits++;
        }
      }
      return hits / total;
    };
    const base = greater(0);
    expect(base).toBeLessThan(0.07);
    expect(greater(TIER_TABLE[4].greaterChance)).toBeGreaterThan(base + 0.35);
  });

  it('unique and mythic weights are multiplied', () => {
    const share = (k: number) => {
      const rng = new Rng('rare');
      let hits = 0;
      for (let i = 0; i < 4000; i++) if (rollRarity(rng, { unique: 100 }, 'common', k) === 'unique') hits++;
      return hits / 4000;
    };
    expect(share(1)).toBeLessThan(0.28);
    expect(share(TIER_TABLE[4].rareDrops)).toBeGreaterThan(0.5);
  });
});

describe('Lumen unlocks World Tier 2', () => {
  function fight() {
    const world = new World();
    const zone = createZoneRuntime(THE_CORE);
    const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize, zoneLevels: [40, 50] });
    const player = spawnPlayer(world, 'bastion', LUMEN_HEART.x, LUMEN_HEART.z - 20);
    world.req(player, Health).max = world.req(player, Health).current = 1e9;
    syncSetPieces(world, zone);
    run(world, ctx, [spatialSystem, setPieceSystem, bossSystem], 2);
    return { world, ctx, zone };
  }

  it('unlocks tier 2 for the account when Lumen falls, and tells the game', () => {
    const { world, ctx, zone } = fight();
    expect(ctx.account!.endgame.tierUnlocked).toBe(1);
    ctx.events.drain();
    kill(world, ctx, zone.setPieces.lumen!.boss!, 0);
    run(world, ctx, [spatialSystem, setPieceSystem, bossSystem], 2);
    expect(zone.setPieces.lumen!.state).toBe('defeated');
    expect(ctx.account!.endgame.tierUnlocked).toBe(2);
    expect(ctx.account!.endgame.tier).toBe(1);
    expect([...ctx.events.peek()]).toContainEqual({ type: 'interact', kind: 'tierUnlock', id: '2' });
  });

  it('does not lower a tier unlocked further, nor announce twice', () => {
    const { world, ctx, zone } = fight();
    ctx.account!.endgame.tierUnlocked = 3;
    ctx.events.drain();
    kill(world, ctx, zone.setPieces.lumen!.boss!, 0);
    run(world, ctx, [spatialSystem, setPieceSystem, bossSystem], 2);
    expect(ctx.account!.endgame.tierUnlocked).toBe(3);
    expect([...ctx.events.peek()].some((e) => e.type === 'interact' && e.kind === 'tierUnlock')).toBe(false);
  });
});

describe('Tier Beacon', () => {
  it('stands in every region hub, clear of its NPCs, stash and teleporter', () => {
    expect(Object.keys(TIER_BEACONS).sort()).toEqual(ZONES.map((z) => z.id).sort());
    for (const zone of ZONES) {
      const b = TIER_BEACONS[zone.id]!;
      expect(Math.hypot(b.x, b.z)).toBeLessThan(zone.halfSize);
      const others = [
        ...[...NPCS.values()].filter((n) => n.zone === zone.id),
        ...zone.teleporters,
        zone.id === 'zone.cinder_flats' ? STASH_POSITION : (zone.stash ?? { x: 1e9, z: 1e9 }),
      ];
      for (const o of others) expect(Math.hypot(o.x - b.x, o.z - b.z), `${zone.id} beacon near ${JSON.stringify(o)}`).toBeGreaterThan(3);
    }
  });

  function beaconWorld() {
    const world = new World();
    const ctx = accountCtx(3, 1);
    const player = spawnPlayer(world, 'bastion', 0, 0);
    return { world, ctx, player };
  }

  it('switches to any unlocked tier, never a locked one', () => {
    const { world, ctx } = beaconWorld();
    expect(chooseTier(world, ctx, 3)).toBe(true);
    expect(currentTier(ctx)).toBe(3);
    expect(chooseTier(world, ctx, 4)).toBe(false);
    expect(chooseTier(world, ctx, 1)).toBe(true);
    expect(currentTier(ctx)).toBe(1);
  });

  it('is disabled while the player was just hit or is hunted by a nearby enemy', () => {
    const { world, ctx, player } = beaconWorld();
    run(world, ctx, [spatialSystem], 1);
    expect(playerInCombat(world, ctx)).toBe(false);
    world.req(player, Resource).sinceCombat = 1;
    expect(playerInCombat(world, ctx)).toBe(true);
    expect(chooseTier(world, ctx, 2)).toBe(false);
    world.req(player, Resource).sinceCombat = 999;
    const enemy = spawnEnemy(world, 'infected_colonist', 6, 0);
    run(world, ctx, [spatialSystem], 1);
    expect(playerInCombat(world, ctx)).toBe(false); // asleep
    world.req(enemy, EnemyAI).aggro = true;
    expect(playerInCombat(world, ctx)).toBe(true);
    expect(chooseTier(world, ctx, 2)).toBe(false);
    world.destroyDeferred(enemy);
    world.flushDestroyed();
    run(world, ctx, [spatialSystem], 1);
    expect(chooseTier(world, ctx, 2)).toBe(true);
  });
});

describe('play time', () => {
  it('accrues real time on the account', () => {
    const ctx = accountCtx(1, 1);
    for (let i = 0; i < 120; i++) tickPlaytime(ctx, 1 / 60);
    expect(ctx.account!.endgame.playtime).toBeCloseTo(2, 5);
    tickPlaytime(ctx, -5);
    tickPlaytime(ctx, 0);
    expect(ctx.account!.endgame.playtime).toBeCloseTo(2, 5);
    expect(() => tickPlaytime(makeCtx(), 1)).not.toThrow();
  });
});
