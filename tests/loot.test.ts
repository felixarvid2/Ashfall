import { describe, expect, it } from 'vitest';
import { CombatStats, GroundGold, GroundItem, Health, Inventory, Progression, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { classDef } from '../src/data/db';
import { AFFIX_DEFS, BASE_ITEMS, PROGRESSION, dropTable } from '../src/data/loot/db';
import type { Item } from '../src/data/loot/schemas';
import {
  GREATER_MULTIPLIER,
  canEquip,
  generateCrystal,
  generateItem,
  itemPowerFor,
  itemStats,
  killXp,
  pickBase,
  powerScale,
  rollAffixes,
  rollDrops,
  rollRarity,
  salvageValue,
  xpToNext,
} from '../src/systems/loot/generate';
import { addToGrid, emptyInventory, equipFromGrid, salvage, socketCrystal, unequip } from '../src/systems/loot/inventory';
import { grantXp, pickupSystem, rewardSystem } from '../src/systems/loot/rewards';
import { computePlayerStats } from '../src/systems/stats';
import { kill } from '../src/systems/combat';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { fakeInput, makeCtx, run } from './helpers';

let uid = 0;
const nextUid = () => `t-${++uid}`;
const gen = (seed: string, over: Partial<Parameters<typeof generateItem>[1]> = {}) =>
  generateItem(new Rng(seed), { itemPower: 100, classId: 'bastion', uid: 'x', ...over });

describe('item generation', () => {
  it('is deterministic for a seed', () => {
    expect(gen('a')).toEqual(gen('a'));
    expect(gen('a')).not.toEqual(gen('b'));
  });

  it('rolls the affix count for its rarity', () => {
    for (let i = 0; i < 50; i++) {
      expect(gen(`c${i}`, { rarity: 'common' }).affixes).toHaveLength(0);
      const m = gen(`m${i}`, { rarity: 'magic' }).affixes.length;
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(2);
      const r = gen(`r${i}`, { rarity: 'rare' }).affixes.length;
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(4);
    }
  });

  it('only rolls affixes allowed for the item type, never the same affix twice', () => {
    for (let i = 0; i < 200; i++) {
      const item = gen(`s${i}`, { rarity: 'rare' });
      const type = BASE_ITEMS.get(item.base)!.type;
      const ids = item.affixes.map((a) => a.affix);
      expect(new Set(ids).size).toBe(ids.length);
      for (const a of item.affixes) expect(AFFIX_DEFS.get(a.affix!)!.types).toContain(type);
    }
  });

  it('greater affixes roll 1.5× the normal range', () => {
    const rolled = rollAffixes(new Rng('g'), 'ring', 4, 100, 1);
    for (const s of rolled) {
      const def = AFFIX_DEFS.get(s.affix!)!;
      expect(s.greater).toBe(true);
      expect(s.value).toBeGreaterThanOrEqual(def.min * GREATER_MULTIPLIER * powerScale(def.scaling, 100) - 0.01);
      expect(s.value).toBeLessThanOrEqual(def.max * GREATER_MULTIPLIER * powerScale(def.scaling, 100) + 0.01);
    }
  });

  it('values scale with item power', () => {
    const low = gen('w', { itemPower: 20, baseId: 'hydraulic_hammer', rarity: 'common' }).implicits[0]!.value;
    const high = gen('w', { itemPower: 400, baseId: 'hydraulic_hammer', rarity: 'common' }).implicits[0]!.value;
    expect(high).toBeGreaterThan(low * 3);
    expect(powerScale('none', 400)).toBe(1);
  });

  it('item power grows with monster level', () => {
    const rng = new Rng('ip');
    expect(itemPowerFor(50, rng)).toBeGreaterThan(itemPowerFor(1, rng) + 300);
  });

  it('about 85 % of class-restricted drops are for the player class', () => {
    const rng = new Rng('class');
    let own = 0;
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const base = pickBase(rng, 100, 'bastion', 'weapon');
      n++;
      if (canEquip(base, 'bastion')) own++;
    }
    // 85 % forced own-class + a share of the free 15 % that happens to be Bastion's.
    expect(own / n).toBeGreaterThan(0.85);
    expect(own / n).toBeLessThan(0.97);
  });

  it('disabled rarities (legendary+, Phase 3b) never drop yet', () => {
    const rng = new Rng('rarity');
    for (let i = 0; i < 5000; i++) expect(['common', 'magic', 'rare']).toContain(rollRarity(rng));
  });

  it('minimum rarity is respected', () => {
    const rng = new Rng('min');
    for (let i = 0; i < 500; i++) expect(rollRarity(rng, {}, 'magic')).not.toBe('common');
  });
});

describe('drop tables', () => {
  it('respect drop chances on average', () => {
    const rng = new Rng('drops');
    const table = dropTable('dt.spore_carrier');
    let items = 0;
    for (let i = 0; i < 2000; i++) items += rollDrops(rng, table, 5, 'bastion', nextUid).items.filter((it) => !it.crystal).length;
    expect(items / 2000).toBeCloseTo(table.itemChance, 1);
  });

  it('wave reward caches always drop magic or better', () => {
    const rng = new Rng('cache');
    for (let i = 0; i < 100; i++) {
      const drop = rollDrops(rng, dropTable('dt.wave_reward'), 3, 'bastion', nextUid);
      const gear = drop.items.filter((it) => !it.crystal);
      expect(gear.length).toBeGreaterThanOrEqual(2);
      for (const it of gear) expect(it.rarity).not.toBe('common');
      expect(drop.gold).toBeGreaterThan(0);
    }
  });

  it('XP scales with enemy level and the curve grows', () => {
    const table = dropTable('dt.infected_colonist');
    expect(killXp(table, 10)).toBeGreaterThan(killXp(table, 1));
    expect(xpToNext(10)).toBeGreaterThan(xpToNext(2));
  });
});

describe('inventory', () => {
  const hammer = () => gen('h', { baseId: 'hydraulic_hammer', rarity: 'rare' });

  it('equips from the grid and swaps the old item back', () => {
    const inv = emptyInventory(10);
    const a = { ...hammer(), uid: 'a' };
    const b = { ...hammer(), uid: 'b' };
    addToGrid(inv, a);
    addToGrid(inv, b);
    expect(equipFromGrid(inv, 0, 'bastion').ok).toBe(true);
    expect(inv.equipped.mainHand?.uid).toBe('a');
    expect(equipFromGrid(inv, 1, 'bastion').ok).toBe(true);
    expect(inv.equipped.mainHand?.uid).toBe('b');
    expect(inv.grid[1]?.uid).toBe('a');
  });

  it('refuses other classes\' gear', () => {
    const inv = emptyInventory(4);
    addToGrid(inv, gen('r', { baseId: 'marksman_rifle' }));
    expect(equipFromGrid(inv, 0, 'bastion')).toEqual({ ok: false, reason: 'class' });
  });

  it('fills both ring slots before swapping', () => {
    const inv = emptyInventory(4);
    addToGrid(inv, { ...gen('r1', { baseId: 'conduit_ring' }), uid: 'r1' });
    addToGrid(inv, { ...gen('r2', { baseId: 'conduit_ring' }), uid: 'r2' });
    equipFromGrid(inv, 0, 'bastion');
    equipFromGrid(inv, 1, 'bastion');
    expect(inv.equipped.ring1?.uid).toBe('r1');
    expect(inv.equipped.ring2?.uid).toBe('r2');
  });

  it('reports a full backpack and unequip needs space', () => {
    const inv = emptyInventory(1);
    expect(addToGrid(inv, hammer()).ok).toBe(true);
    expect(addToGrid(inv, hammer())).toEqual({ ok: false, reason: 'full' });
    inv.equipped.helm = gen('helm', { baseId: 'combat_helm' });
    expect(unequip(inv, 'helm')).toEqual({ ok: false, reason: 'full' });
  });

  it('salvages for gold based on rarity and item power', () => {
    const inv = emptyInventory(2);
    const item = gen('sv', { rarity: 'rare', itemPower: 200 });
    addToGrid(inv, item);
    const gold = salvage(inv, 0);
    expect(gold).toBe(salvageValue(item));
    expect(gold).toBe(Math.round(20 * 2.5));
    expect(inv.gold).toBe(gold);
    expect(inv.grid[0]).toBeNull();
  });

  it('sockets crystals and the crystal stat depends on the item type', () => {
    const inv = emptyInventory(4);
    const weapon: Item = { ...gen('sw', { baseId: 'hydraulic_hammer' }), sockets: [null] };
    const helm: Item = { ...gen('sh', { baseId: 'combat_helm' }), sockets: [null] };
    addToGrid(inv, weapon);
    addToGrid(inv, helm);
    addToGrid(inv, generateCrystal(new Rng('c'), 100, 'c1', 'ember'));
    addToGrid(inv, generateCrystal(new Rng('c'), 100, 'c2', 'ember'));
    expect(socketCrystal(inv, 2, { grid: 0 }).ok).toBe(true);
    expect(socketCrystal(inv, 3, { grid: 1 }).ok).toBe(true);
    expect(itemStats(weapon).some((s) => s.stat === 'damageVsBurning')).toBe(true);
    expect(itemStats(helm).some((s) => s.stat === 'maxLife')).toBe(true);
    expect(socketCrystal(inv, 0, { grid: 1 })).toEqual({ ok: false, reason: 'notCrystal' });
  });
});

describe('player stats', () => {
  const cls = classDef('bastion');

  it('grow with level', () => {
    const l1 = computePlayerStats(cls, 1, {});
    const l10 = computePlayerStats(cls, 10, {});
    expect(l10.maxLife).toBe(l1.maxLife + 9 * cls.lifePerLevel);
    expect(l10.combat.mainStat).toBe(l1.combat.mainStat + 9 * cls.attributes.perLevel.strength);
  });

  it('use the weapon\'s damage instead of fists, and sum affixes', () => {
    const weapon = gen('ps', { baseId: 'hydraulic_hammer', rarity: 'common' });
    const ring: Item = { ...gen('ring', { baseId: 'conduit_ring' }), affixes: [{ stat: 'damage', value: 0.1, affix: 'damage' }] };
    const s = computePlayerStats(cls, 1, { mainHand: weapon, ring1: ring });
    expect(s.combat.weaponDamage).toBe(weapon.implicits[0]!.value);
    expect(s.combat.additive).toContainEqual({ value: 0.1, source: 'damage' });
    expect(computePlayerStats(cls, 1, {}).combat.weaponDamage).toBe(cls.weaponDamage);
  });

  it('conditional affixes become conditional damage bonuses', () => {
    const gloves: Item = {
      ...gen('gl', { baseId: 'servo_gauntlets' }),
      affixes: [{ stat: 'damageVsVulnerable', value: 0.15, affix: 'dmg_vulnerable' }],
    };
    const s = computePlayerStats(cls, 1, { gloves });
    expect(s.combat.additive).toContainEqual({ value: 0.15, when: 'vulnerable', source: 'damageVsVulnerable' });
  });

  it('caps cooldown reduction and damage reduction at 50 %', () => {
    const amulet: Item = {
      ...gen('am', { baseId: 'signal_pendant' }),
      affixes: [
        { stat: 'cooldownReduction', value: 0.9, affix: 'cooldown' },
        { stat: 'damageReduction', value: 0.9, affix: 'damage_reduction' },
      ],
    };
    const s = computePlayerStats(cls, 1, { amulet });
    expect(s.combat.cooldownReduction).toBe(0.5);
    expect(s.combat.damageReduction).toBe(0.5);
  });
});

describe('rewards and pickup', () => {
  it('kills grant XP, level-ups grant skill points and full life', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    world.req(player, Health).current = 10;
    const gained = grantXp(world, ctx, player, xpToNext(1) + xpToNext(2));
    expect(gained).toBe(2);
    const prog = world.req(player, Progression);
    expect(prog.level).toBe(3);
    expect(prog.skillPoints).toBe(2);
    expect(world.req(player, Health).current).toBe(world.req(player, Health).max);
    expect(world.req(player, CombatStats).level).toBe(3);
  });

  it('enemy deaths queue rewards that spawn loot, and gold is picked up automatically', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    // A guaranteed cache right under the player.
    ctx.rewards.push({ table: 'dt.wave_reward', level: 3, x: 0.5, z: 0, xp: false });
    run(world, ctx, [rewardSystem], 1);
    expect(world.query(GroundItem).length).toBeGreaterThanOrEqual(2);
    expect(world.query(GroundGold)).toHaveLength(1);
    run(world, ctx, [pickupSystem], 40);
    expect(world.query(GroundGold)).toHaveLength(0);
    expect(world.req(player, Inventory).gold).toBeGreaterThan(0);

    const enemy = spawnEnemy(world, 'spore_carrier', 3, 0, { level: 4 });
    kill(world, ctx, enemy, 0);
    expect(ctx.rewards).toContainEqual(expect.objectContaining({ table: 'dt.spore_carrier', level: 4, xp: true }));
    run(world, ctx, [rewardSystem], 1);
    expect(world.req(player, Progression).xp).toBeGreaterThan(0);
  });

  it('the pickup key grabs the nearest item into the backpack', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    ctx.rewards.push({ table: 'dt.wave_reward', level: 3, x: 0.3, z: 0, xp: false });
    run(world, ctx, [rewardSystem], 1);
    const before = world.query(GroundItem).length;
    ctx.input = fakeInput(['pickup']);
    run(world, ctx, [pickupSystem], 1);
    expect(world.query(GroundItem).length).toBe(before - 1);
    expect(world.req(player, Inventory).grid.filter(Boolean)).toHaveLength(1);
  });

  it('enemies scale with level', () => {
    const world = new World();
    const lvl1 = spawnEnemy(world, 'infected_colonist', 0, 0, { level: 1 });
    const lvl10 = spawnEnemy(world, 'infected_colonist', 0, 0, { level: 10 });
    expect(world.req(lvl10, Health).max).toBeCloseTo(world.req(lvl1, Health).max * (1 + PROGRESSION.enemyLifePerLevel * 9));
    expect(world.req(lvl10, CombatStats).weaponDamage).toBeGreaterThan(world.req(lvl1, CombatStats).weaponDamage);
    expect(world.req(lvl10, Transform)).toBeTruthy();
  });
});
