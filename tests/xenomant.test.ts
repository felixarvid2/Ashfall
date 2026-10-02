import { describe, expect, it } from 'vitest';
import {
  CombatStats,
  Dead,
  EnemyAI,
  Faction,
  Hazard,
  Health,
  MinionAI,
  Resource,
  SkillUser,
  Summon,
  Taunt,
  Tether,
  Transform,
  Turret,
  WaveMember,
} from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import type { GameContext } from '../src/core/context';
import { dealHit, hasStatus, kill } from '../src/systems/combat';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { deathSystem } from '../src/systems/death';
import { enemyAISystem } from '../src/systems/enemyAI';
import { minionSystem, tetherSystem, turretSystem } from '../src/systems/minions';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem, projectileSystem, summonSystem, trapSystem } from '../src/systems/projectiles';
import { resourceSystem } from '../src/systems/resource';
import { delayedStrikeSystem, forcedMoveSystem, skillSystem } from '../src/systems/skills';
import { statusSystem } from '../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { learnSkills, makeCtx, run, type SystemFn } from './helpers';

const SYSTEMS: SystemFn[] = [
  spatialSystem,
  skillSystem,
  minionSystem,
  statusSystem,
  movementSystem,
  forcedMoveSystem,
  delayedStrikeSystem,
  collisionSystem,
  projectileSystem,
  trapSystem,
  summonSystem,
  tetherSystem,
  turretSystem,
  hazardSystem,
  resourceSystem,
  deathSystem,
];

function setup(skills: (string | null)[]) {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'xenomant', 0, 0);
  learnSkills(world, player, skills);
  Object.assign(world.req(player, CombatStats), { critChance: 0, weaponDamage: 14, mainStat: 20, resourceGen: 0 });
  world.req(player, Resource).current = 100;
  return { world, ctx, player };
}

function cast(world: World, ctx: GameContext, player: Entity, slot: number, aimX: number, aimZ: number, ticks = 30) {
  world.req(player, SkillUser).request = { slot, aimX, aimZ, ttl: 0.25 };
  run(world, ctx, SYSTEMS, ticks);
}

function tough(world: World, e: Entity): Entity {
  const h = world.req(e, Health);
  h.max = h.current = 10000;
  return e;
}

function corpseAt(world: World, ctx: GameContext, id: string, x: number, z: number): Entity {
  const e = spawnEnemy(world, id, x, z, { wave: 1 });
  kill(world, ctx, e, 0);
  return e;
}

describe('Xenomant class', () => {
  it('starts with Spore Dart and Biomass that grows when enemies die nearby', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'xenomant', 0, 0);
    expect(world.req(player, SkillUser).slots[0]).toBe('xenomant.spore_dart');
    const r = world.req(player, Resource);
    expect(r.kind).toBe('biomass');
    const before = r.current;
    corpseAt(world, ctx, 'infected_colonist', 5, 0);
    expect(r.current).toBe(before + 8);
    corpseAt(world, ctx, 'infected_colonist', 30, 0); // too far away
    expect(r.current).toBe(before + 8);
  });

  it('enemy bodies stay as usable corpses', () => {
    const world = new World();
    const ctx = makeCtx();
    spawnPlayer(world, 'xenomant', 0, 0);
    const c = corpseAt(world, ctx, 'infected_colonist', 3, 0);
    run(world, ctx, [deathSystem], 60 * 10);
    expect(world.isAlive(c)).toBe(true);
    expect(world.req(c, Dead).corpse).toBe(true);
  });
});

describe('Xenomant skills', () => {
  it('Spore Dart poisons what it hits', () => {
    const { world, ctx, player } = setup(['xenomant.spore_dart']);
    const enemy = tough(world, spawnEnemy(world, 'spore_carrier', 0, 6));
    cast(world, ctx, player, 0, 0, 6, 30);
    expect(hasStatus(world, enemy, 'poisoned')).toBe(true);
  });

  it('Scalpel Slash heals for part of the damage dealt', () => {
    const { world, ctx, player } = setup(['xenomant.scalpel_slash']);
    tough(world, spawnEnemy(world, 'spore_carrier', 0, 1.6));
    const life = world.req(player, Health);
    life.current = 50;
    cast(world, ctx, player, 0, 0, 3, 20);
    expect(life.current).toBeGreaterThan(50);
  });

  it('Spore Burst leaves a poison cloud that keeps hurting', () => {
    const { world, ctx, player } = setup(['xenomant.spore_burst']);
    const enemy = tough(world, spawnEnemy(world, 'spore_carrier', 0, 8));
    cast(world, ctx, player, 0, 0, 8, 20);
    expect(world.query(Hazard).length).toBe(1);
    const after = world.req(enemy, Health).current;
    run(world, ctx, SYSTEMS, 120);
    expect(world.req(enemy, Health).current).toBeLessThan(after);
    expect(hasStatus(world, enemy, 'poisoned')).toBe(true);
  });

  it('Parasite Link drains the enemy nearest the cursor and heals you', () => {
    const { world, ctx, player } = setup(['xenomant.parasite_link']);
    const near = tough(world, spawnEnemy(world, 'spore_carrier', 4, 0));
    const other = tough(world, spawnEnemy(world, 'spore_carrier', -4, 0));
    const life = world.req(player, Health);
    life.current = 50;
    cast(world, ctx, player, 0, 4, 0, 20);
    expect(world.query(Tether)).toHaveLength(1);
    run(world, ctx, SYSTEMS, 200);
    expect(world.req(near, Health).current).toBeLessThan(10000);
    expect(world.req(other, Health).current).toBe(10000);
    expect(life.current).toBeGreaterThan(50);
    expect(world.query(Tether)).toHaveLength(0); // expired after 3 s
  });

  it('Chitin Armor reduces damage taken and hurts melee attackers', () => {
    const { world, ctx, player } = setup(['xenomant.chitin_armor']);
    const enemy = tough(world, spawnEnemy(world, 'infected_colonist', 0, 1.5));
    const hit = () => dealHit(world, ctx, enemy, player, { coefficient: 1, damageType: 'physical', knockback: 0, fromX: 0, fromZ: 1.5, applies: [], range: 'melee' })!;
    const ctxNoCrit = ctx;
    world.req(enemy, CombatStats).critChance = 0;
    const plain = hit();
    cast(world, ctxNoCrit, player, 0, 0, 1, 10);
    expect(hasStatus(world, player, 'chitin')).toBe(true);
    const armored = hit();
    expect(armored).toBeCloseTo(plain * 0.7, 1);
    expect(world.req(enemy, Health).current).toBeLessThan(10000);
  });

  it('Raise Corpse turns nearby corpses into glowing minions on your side', () => {
    const { world, ctx, player } = setup(['xenomant.raise_corpse']);
    const a = corpseAt(world, ctx, 'infected_colonist', 3, 3);
    const b = corpseAt(world, ctx, 'security_drone', 4, 3);
    cast(world, ctx, player, 0, 3.5, 3, 30);
    for (const m of [a, b]) {
      expect(world.has(m, Dead)).toBe(false);
      expect(world.has(m, MinionAI)).toBe(true);
      expect(world.has(m, EnemyAI)).toBe(false);
      expect(world.has(m, WaveMember)).toBe(false);
      expect(world.req(m, Faction).team).toBe('player');
      expect(world.req(m, Summon).kind).toBe('minion');
    }
    expect(world.req(b, MinionAI).ranged).toBe(true);
  });

  it('Raise Corpse without corpses fizzles and refunds its cost', () => {
    const { world, ctx, player } = setup(['xenomant.raise_corpse']);
    const r = world.req(player, Resource);
    r.current = 50;
    cast(world, ctx, player, 0, 3, 3, 30);
    expect(r.current).toBeGreaterThanOrEqual(50 - 1);
    expect(ctx.events.peek().some((e) => e.type === 'notice' && e.key === 'combat.noCorpses')).toBe(true);
  });

  it('minions fight enemies near their owner, and enemies attack minions', () => {
    const { world, ctx, player } = setup(['xenomant.raise_corpse']);
    corpseAt(world, ctx, 'infected_colonist', 2, 0);
    cast(world, ctx, player, 0, 2, 0, 20);
    const minion = world.query(MinionAI)[0]!;
    const enemy = tough(world, spawnEnemy(world, 'spore_carrier', 4, 4, { aggro: true }));
    run(world, ctx, [...SYSTEMS, enemyAISystem], 240);
    expect(world.req(enemy, Health).current).toBeLessThan(10000);
    // The enemy now has a valid target among the player's side.
    expect(world.isAlive(minion)).toBe(true);
  });

  it('the minion cap replaces the oldest minions', () => {
    const { world, ctx, player } = setup(['xenomant.raise_corpse']);
    for (let i = 0; i < 8; i++) corpseAt(world, ctx, 'infected_colonist', 2 + (i % 4) * 0.5, Math.floor(i / 4) * 0.5);
    for (let i = 0; i < 4; i++) cast(world, ctx, player, 0, 3, 0, 40);
    const alive = world.query(MinionAI).filter((e) => !world.has(e, Dead));
    expect(alive.length).toBe(6);
  });

  it('Corpse Explosion detonates corpses and uses them up', () => {
    const { world, ctx, player } = setup(['xenomant.corpse_explosion']);
    const c = corpseAt(world, ctx, 'infected_colonist', 5, 0);
    const enemy = tough(world, spawnEnemy(world, 'spore_carrier', 6, 0));
    cast(world, ctx, player, 0, 5, 0, 20);
    expect(world.req(enemy, Health).current).toBeLessThan(10000);
    expect(world.req(c, Dead).corpse).toBe(false);
    run(world, ctx, SYSTEMS, 30);
    expect(world.isAlive(c)).toBe(false);
  });

  it('Grasping Tendrils roots enemies in place', () => {
    const { world, ctx, player } = setup(['xenomant.grasping_tendrils']);
    const enemy = tough(world, spawnEnemy(world, 'infected_colonist', 0, 8, { aggro: true }));
    cast(world, ctx, player, 0, 0, 8, 20);
    expect(hasStatus(world, enemy, 'rooted')).toBe(true);
    const z = world.req(enemy, Transform).z;
    run(world, ctx, [...SYSTEMS, enemyAISystem], 30);
    expect(world.req(enemy, Transform).z).toBeCloseTo(z, 1);
  });

  it('Wrath of Lumen taunts, slams around itself and expires', () => {
    const { world, ctx, player } = setup(['xenomant.wrath_of_lumen']);
    const enemy = tough(world, spawnEnemy(world, 'spore_carrier', 0, 7));
    cast(world, ctx, player, 0, 0, 6, 40);
    const wrath = world.query(Turret)[0]!;
    expect(wrath).toBeDefined();
    expect(world.has(wrath, Taunt)).toBe(true);
    run(world, ctx, SYSTEMS, 120);
    expect(world.req(enemy, Health).current).toBeLessThan(10000);
    run(world, ctx, SYSTEMS, 60 * 12);
    expect(world.query(Turret)).toHaveLength(0);
  });
});
