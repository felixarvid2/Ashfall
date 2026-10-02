import { describe, expect, it } from 'vitest';
import { CombatStats, Hazard, Health, Inventory, Resource, SkillUser, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import type { GameContext } from '../src/core/context';
import { Rng } from '../src/core/rng';
import { resolveEffects, type Effect } from '../src/data/effects';
import { ASPECT_DEFS, UNIQUE_DEFS, baseItem } from '../src/data/loot/db';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { hasStatus } from '../src/systems/combat';
import { generateItem, generateUnique, itemEffects, powerScale } from '../src/systems/loot/generate';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem } from '../src/systems/projectiles';
import { RANK_DAMAGE, compileSkill, compileSkills } from '../src/systems/skillCompile';
import { delayedStrikeSystem, forcedMoveSystem, skillSystem } from '../src/systems/skills';
import {
  canLearn,
  learn,
  learnedSkills,
  newTreeState,
  pointsSpent,
  resetTree,
  respecCost,
  tree,
  treeEffects,
} from '../src/systems/skillTree';
import { recomputePlayer } from '../src/systems/stats';
import { statusSystem } from '../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { learnSkills, makeCtx, run, type SystemFn } from './helpers';

const T = tree('bastion');
const SYSTEMS: SystemFn[] = [
  spatialSystem,
  skillSystem,
  statusSystem,
  movementSystem,
  forcedMoveSystem,
  delayedStrikeSystem,
  hazardSystem,
  collisionSystem,
];

function setup(skills: (string | null)[]) {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  learnSkills(world, player, skills);
  Object.assign(world.req(player, CombatStats), { critChance: 0, weaponDamage: 14, mainStat: 20, resourceGen: 0 });
  return { world, ctx, player };
}

function cast(world: World, ctx: GameContext, player: Entity, slot: number, aimX: number, aimZ: number, ticks = 30) {
  world.req(player, SkillUser).request = { slot, aimX, aimZ, ttl: 0.25 };
  run(world, ctx, SYSTEMS, ticks);
}

describe('skill tree rules', () => {
  it('starts with the free starting skill', () => {
    const s = newTreeState(T);
    expect(s.ranks[T.startingNode]).toBe(1);
    expect(pointsSpent(T, s)).toBe(0);
    expect([...learnedSkills(T, s).keys()]).toEqual(['bastion.hydraulic_strike']);
  });

  it('locks branches until enough points are in the tree', () => {
    const s = newTreeState(T);
    expect(canLearn(T, s, 'n.seismic_shock', 5)).toEqual({ ok: false, reason: 'locked' });
    expect(learn(T, s, 'n.piston_jab', 5).ok).toBe(true);
    expect(canLearn(T, s, 'n.seismic_shock', 4).ok).toBe(true);
  });

  it('needs points, respects max rank and requirements', () => {
    const s = newTreeState(T);
    expect(canLearn(T, s, 'n.piston_jab', 0)).toEqual({ ok: false, reason: 'noPoints' });
    expect(canLearn(T, s, 'e.piston_jab', 3)).toEqual({ ok: false, reason: 'requires' });
    for (let i = 0; i < 4; i++) learn(T, s, 'n.hydraulic_strike', 9);
    expect(s.ranks['n.hydraulic_strike']).toBe(5);
    expect(canLearn(T, s, 'n.hydraulic_strike', 9)).toEqual({ ok: false, reason: 'maxed' });
    expect(canLearn(T, s, 'm.hydraulic_strike.searing', 9)).toEqual({ ok: false, reason: 'requires' });
  });

  it('allows only one modifier per skill and one key passive', () => {
    const s = newTreeState(T);
    learn(T, s, 'e.hydraulic_strike', 9);
    expect(learn(T, s, 'm.hydraulic_strike.searing', 9).ok).toBe(true);
    expect(canLearn(T, s, 'm.hydraulic_strike.crushing', 9)).toEqual({ ok: false, reason: 'exclusive' });
    for (let i = 0; i < 30; i++) s.ranks[`fake${i}`] = 1; // pad points to open the key branch
    expect(learn(T, s, 'k.reactor_core', 9).ok).toBe(true);
    expect(canLearn(T, s, 'k.bulwark_protocol', 9)).toEqual({ ok: false, reason: 'exclusive' });
  });

  it('reset refunds everything but the starting skill; respec costs gold per level', () => {
    const s = newTreeState(T);
    learn(T, s, 'n.hydraulic_strike', 9);
    learn(T, s, 'e.hydraulic_strike', 9);
    learn(T, s, 'p.hydraulic_power', 9);
    expect(resetTree(T, s)).toBe(3);
    expect(s.ranks).toEqual({ [T.startingNode]: 1 });
    expect(respecCost(T, 10)).toBe(250);
  });

  it('passive effects scale with rank', () => {
    const s = newTreeState(T);
    s.ranks['p.hydraulic_power'] = 3;
    s.ranks['p.heat_tolerance'] = 2;
    const effects = treeEffects(T, s);
    const dmg = effects.find((e) => e.kind === 'stat' && e.stat === 'damage');
    expect(dmg && dmg.kind === 'stat' && dmg.value).toBeCloseTo(0.12);
    const oh = effects.find((e) => e.kind === 'overheat');
    expect(oh && oh.kind === 'overheat' && oh.graceDelta).toBeCloseTo(1);
  });
});

describe('skill compilation', () => {
  it('ranks raise damage by 10% per rank above 1', () => {
    const c = compileSkill('bastion.furnace_cleave', 3, []);
    const e = c.def.effect as { coefficient: number };
    expect(e.coefficient).toBeCloseTo(2.4 * (1 + 2 * RANK_DAMAGE));
  });

  it('applies (base + add) × (1 + mul), then set', () => {
    const c = compileSkill('bastion.furnace_cleave', 1, [
      { op: 'add', field: 'resourceCost', value: -10 },
      { op: 'mul', field: 'resourceCost', value: -0.5 },
      { op: 'set', field: 'arcDeg', value: 360 },
    ]);
    expect(c.def.resourceCost).toBeCloseTo(15);
    expect((c.def.effect as { arcDeg: number }).arcDeg).toBe(360);
  });

  it('does not change the shared base data', () => {
    compileSkill('bastion.furnace_cleave', 5, [{ op: 'set', field: 'resourceCost', value: 0 }]);
    expect(compileSkill('bastion.furnace_cleave', 1, []).def.resourceCost).toBe(40);
  });

  it('collects per-skill damage bonuses, extra statuses and hazards from tree nodes', () => {
    const s = newTreeState(T);
    Object.assign(s.ranks, {
      'e.hydraulic_strike': 1,
      'm.hydraulic_strike.crushing': 1,
      'n.seismic_shock': 1,
      'e.seismic_shock': 1,
      'm.seismic_shock.rupture': 1,
    });
    const compiled = compileSkills(learnedSkills(T, s), treeEffects(T, s));
    const strike = compiled['bastion.hydraulic_strike']!;
    expect(strike.def.resourceGain).toBe(11 + 4);
    expect(strike.bonuses.additive.map((b) => b.when)).toEqual(['stunned', 'vulnerable']);
    const shock = compiled['bastion.seismic_shock']!;
    expect((shock.def.effect as { radius: number }).radius).toBeCloseTo(4.2 * 1.15);
    expect(shock.hazards).toHaveLength(1);
  });
});

describe('aspects and unique items', () => {
  it('legendaries always carry an aspect that fits the item type', () => {
    const rng = new Rng('aspects');
    for (let i = 0; i < 300; i++) {
      const item = generateItem(rng, { itemPower: 100, classId: 'bastion', uid: `u${i}`, rarity: 'legendary' });
      if (item.rarity === 'rare') continue; // no aspect fits this base type
      expect(item.rarity).toBe('legendary');
      const def = ASPECT_DEFS.get(item.aspect!.id)!;
      expect(def.types).toContain(baseItem(item.base).type);
      const scale = powerScale(def.scaling, 100);
      expect(item.aspect!.value).toBeGreaterThanOrEqual(def.min * scale - 0.01);
      expect(item.aspect!.value).toBeLessThanOrEqual(def.max * scale + 0.01);
    }
  });

  it('aspect effects substitute the rolled value', () => {
    const effects = resolveEffects(ASPECT_DEFS.get('momentum')!.effects as Effect[], 0.3);
    expect(effects[0]).toMatchObject({ kind: 'skillMod', mods: [{ op: 'mul', field: 'cooldown', value: -0.3 }] });
    const item = generateItem(new Rng('x'), { itemPower: 100, classId: 'bastion', uid: 'a', rarity: 'common' });
    item.aspect = { id: 'unbroken', value: 0.06 };
    expect(itemEffects(item)).toEqual([{ kind: 'stat', stat: 'damageReduction', value: 0.06 }]);
  });

  it('unique drops use their fixed base; mythic affixes are always greater', () => {
    const rng = new Rng('uniques');
    const u = generateItem(rng, { itemPower: 120, classId: 'bastion', uid: 'u', rarity: 'unique' });
    expect(u.rarity).toBe('unique');
    expect(u.base).toBe(UNIQUE_DEFS.get(u.unique!)!.base);
    const m = generateUnique(rng, UNIQUE_DEFS.get('heart_of_lumen')!, 120, 'm');
    expect(m.rarity).toBe('mythic');
    expect(m.affixes.every((a) => a.greater)).toBe(true);
  });

  it('equipped uniques change skills and overheat rules', () => {
    const { world, player } = setup(['bastion.hydraulic_strike', 'bastion.seismic_shock']);
    const inv = world.req(player, Inventory);
    const rng = new Rng('eq');
    inv.equipped.chest = generateUnique(rng, UNIQUE_DEFS.get('governors_crucible')!, 100, 'c');
    inv.equipped.amulet = generateUnique(rng, UNIQUE_DEFS.get('heart_of_lumen')!, 100, 'h');
    recomputePlayer(world, player);
    const shock = world.req(player, SkillUser).compiled['bastion.seismic_shock']!;
    expect(shock.def.resourceCost).toBe(0);
    expect(shock.def.cooldown).toBeCloseTo(3.5);
    expect(world.req(player, Resource).config.overheat!.damagePerSecond).toBe(0);
    expect(world.req(player, CombatStats).multiplicative.some((b) => b.value === 0.35 && !b.when)).toBe(true);
  });
});

describe('new Bastion skills', () => {
  it('only learned skills can be used', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const user = world.req(player, SkillUser);
    expect(user.slots.filter(Boolean)).toEqual(['bastion.hydraulic_strike']);
    user.slots[1] = 'bastion.seismic_shock'; // not learned
    world.req(player, Resource).current = 80;
    const enemy = spawnEnemy(world, 'infected_colonist', 2, 0);
    cast(world, ctx, player, 1, 2, 0);
    expect(world.req(enemy, Health).current).toBe(45);
  });

  it('Magnetic Pull drags enemies in without pulling them through the caster', () => {
    const { world, ctx, player } = setup(['bastion.magnetic_pull']);
    const enemy = spawnEnemy(world, 'spore_carrier', 5.5, 0);
    cast(world, ctx, player, 0, 1, 0);
    const x = world.req(enemy, Transform).x;
    expect(x).toBeLessThan(4);
    expect(x).toBeGreaterThan(0.5);
    expect(hasStatus(world, enemy, 'stunned') || world.req(enemy, Health).current < 70).toBe(true);
  });

  it('Heat Vent spends all Heat, scales with it, and needs at least 20', () => {
    const low = setup(['bastion.heat_vent']);
    low.world.req(low.player, Resource).current = 10;
    const e0 = spawnEnemy(low.world, 'spore_carrier', 2, 0);
    cast(low.world, low.ctx, low.player, 0, 1, 0);
    expect(low.world.req(e0, Health).current).toBe(70);

    const hits: number[] = [];
    for (const heat of [20, 100]) {
      const { world, ctx, player } = setup(['bastion.heat_vent']);
      world.req(player, Resource).current = heat;
      world.req(player, Resource).sinceCombat = 0;
      const enemy = spawnEnemy(world, 'spore_carrier', 2, 0);
      world.req(enemy, Health).max = world.req(enemy, Health).current = 10000;
      cast(world, ctx, player, 0, 1, 0, 20);
      expect(world.req(player, Resource).current).toBe(0);
      hits.push(10000 - world.req(enemy, Health).current);
    }
    expect(hits[1]!).toBeGreaterThan(hits[0]! * 2);
  });

  it('Orbital Strike lands at the cursor only after its delay', () => {
    const { world, ctx, player } = setup(['bastion.orbital_strike']);
    const enemy = spawnEnemy(world, 'spore_carrier', 0, 10);
    world.req(enemy, Health).max = world.req(enemy, Health).current = 10000;
    cast(world, ctx, player, 0, 0, 10, 30); // 0.3 s cast + a little
    expect(world.req(enemy, Health).current).toBe(10000);
    expect(ctx.events.peek().some((e) => e.type === 'telegraph')).toBe(true);
    run(world, ctx, SYSTEMS, 60);
    expect(world.req(enemy, Health).current).toBeLessThan(10000 - 50);
    expect(hasStatus(world, enemy, 'vulnerable')).toBe(true);
  });

  it('Coolant Flush vents Heat, heals and shields', () => {
    const { world, ctx, player } = setup(['bastion.coolant_flush']);
    world.req(player, Resource).current = 90;
    const life = world.req(player, Health);
    life.current = 100;
    cast(world, ctx, player, 0, 0, 1, 15);
    expect(world.req(player, Resource).current).toBe(50);
    expect(life.current).toBeGreaterThan(100);
    expect(hasStatus(world, player, 'barrier')).toBe(true);
  });

  it('a Rupture modifier leaves a burning hazard that hurts enemies', () => {
    const { world, ctx, player } = setup(['bastion.hydraulic_strike', 'bastion.seismic_shock']);
    const user = world.req(player, SkillUser);
    Object.assign(user.tree.ranks, { 'e.seismic_shock': 1, 'm.seismic_shock.rupture': 1 });
    recomputePlayer(world, player);
    Object.assign(world.req(player, CombatStats), { critChance: 0, weaponDamage: 14, mainStat: 20 });
    world.req(player, Resource).current = 50;
    cast(world, ctx, player, 1, 1, 0, 20);
    const hazards = world.query(Hazard).filter((e) => world.req(e, Hazard).team === 'player');
    expect(hazards).toHaveLength(1);
    const enemy = spawnEnemy(world, 'spore_carrier', 0.5, 0.5);
    run(world, ctx, SYSTEMS, 60);
    expect(hasStatus(world, enemy, 'burning') || world.req(enemy, Health).current < 70).toBe(true);
  });
});
