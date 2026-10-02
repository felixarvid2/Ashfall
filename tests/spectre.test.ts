import { describe, expect, it } from 'vitest';
import {
  CombatStats,
  DelayedStrike,
  EnemyAI,
  Health,
  Projectile,
  Resource,
  SkillUser,
  Summon,
  Transform,
  Trap,
} from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import type { GameContext } from '../src/core/context';
import { applyStatus, dealHit, hasStatus } from '../src/systems/combat';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem, projectileSystem, summonSystem, trapSystem } from '../src/systems/projectiles';
import { resourceSystem } from '../src/systems/resource';
import { delayedStrikeSystem, forcedMoveSystem, skillSystem } from '../src/systems/skills';
import { recomputePlayer } from '../src/systems/stats';
import { statusSystem } from '../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { learnSkills, makeCtx, run, type SystemFn } from './helpers';

const SYSTEMS: SystemFn[] = [
  spatialSystem,
  skillSystem,
  statusSystem,
  movementSystem,
  forcedMoveSystem,
  delayedStrikeSystem,
  collisionSystem,
  projectileSystem,
  trapSystem,
  summonSystem,
  hazardSystem,
  resourceSystem,
];

function setup(skills: (string | null)[]) {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'spectre', 0, 0);
  learnSkills(world, player, skills);
  Object.assign(world.req(player, CombatStats), { critChance: 0, weaponDamage: 14, mainStat: 20, resourceGen: 0 });
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

describe('Spectre class', () => {
  it('starts with Quick Shot, 60 Focus and Focus regenerates on its own', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'spectre', 0, 0);
    const user = world.req(player, SkillUser);
    expect(user.slots[0]).toBe('spectre.quick_shot');
    const r = world.req(player, Resource);
    expect(r.current).toBe(60);
    run(world, ctx, [resourceSystem], 60);
    expect(r.current).toBeCloseTo(64, 0);
  });

  it('uses Dexterity as its primary attribute', () => {
    const world = new World();
    const player = spawnPlayer(world, 'spectre', 0, 0);
    recomputePlayer(world, player);
    expect(world.req(player, CombatStats).mainStat).toBe(20);
  });
});

describe('Spectre skills', () => {
  it('Quick Shot fires a projectile that hits the first enemy and builds Focus', () => {
    const { world, ctx, player } = setup(['spectre.quick_shot']);
    world.req(player, Resource).current = 0;
    const near = tough(world, spawnEnemy(world, 'spore_carrier', 0, 6));
    const far = tough(world, spawnEnemy(world, 'spore_carrier', 0, 9));
    cast(world, ctx, player, 0, 0, 10, 40);
    expect(world.req(near, Health).current).toBeLessThan(10000);
    expect(world.req(far, Health).current).toBe(10000);
    expect(world.req(player, Resource).current).toBeGreaterThanOrEqual(6);
    expect(world.query(Projectile)).toHaveLength(0);
  });

  it('Piercing Shot passes through every enemy in a line', () => {
    const { world, ctx, player } = setup(['spectre.piercing_shot']);
    world.req(player, Resource).current = 100;
    const a = tough(world, spawnEnemy(world, 'spore_carrier', 0, 5));
    const b = tough(world, spawnEnemy(world, 'spore_carrier', 0, 9));
    const c = tough(world, spawnEnemy(world, 'spore_carrier', 0, 13));
    cast(world, ctx, player, 0, 0, 20, 50);
    for (const e of [a, b, c]) expect(world.req(e, Health).current).toBeLessThan(10000);
  });

  it('Pistol Barrage fires a fan of five rounds', () => {
    const { world, ctx, player } = setup(['spectre.pistol_barrage']);
    world.req(player, Resource).current = 100;
    world.req(player, SkillUser).request = { slot: 0, aimX: 0, aimZ: 5, ttl: 0.25 };
    run(world, ctx, SYSTEMS, 10);
    expect(world.query(Projectile)).toHaveLength(5);
  });

  it('Minefield places mines that arm and explode when an enemy steps close', () => {
    const { world, ctx, player } = setup(['spectre.minefield']);
    cast(world, ctx, player, 0, 0, 6, 20);
    expect(world.query(Trap)).toHaveLength(3);
    const trapPos = world.req(world.query(Trap)[0]!, Transform);
    const enemy = tough(world, spawnEnemy(world, 'spore_carrier', trapPos.x, trapPos.z));
    run(world, ctx, SYSTEMS, 60);
    expect(world.req(enemy, Health).current).toBeLessThan(10000);
    expect(world.query(Trap).length).toBeLessThan(3);
  });

  it('Cluster Grenade lands after its flight time and scatters bomblets', () => {
    const { world, ctx, player } = setup(['spectre.cluster_grenade']);
    const enemy = tough(world, spawnEnemy(world, 'spore_carrier', 0, 8));
    cast(world, ctx, player, 0, 0, 8, 40); // 0.25 s throw + part of the 0.7 s flight
    expect(world.req(enemy, Health).current).toBe(10000);
    run(world, ctx, SYSTEMS, 20);
    expect(world.req(enemy, Health).current).toBeLessThan(10000);
    expect(hasStatus(world, enemy, 'burning')).toBe(true);
    expect(world.query(DelayedStrike).length).toBeGreaterThan(0); // bomblets in flight
  });

  it('Phase Shift teleports toward the cursor and makes you evasive', () => {
    const { world, ctx, player } = setup(['spectre.phase_shift']);
    cast(world, ctx, player, 0, 20, 0, 5);
    expect(world.req(player, Transform).x).toBeCloseTo(7, 0);
    expect(hasStatus(world, player, 'evasive')).toBe(true);
  });

  it('Smoke Cloak hides you from enemies and guarantees a crit on the next hit', () => {
    const { world, ctx, player } = setup(['spectre.smoke_cloak', 'spectre.quick_shot']);
    const enemy = tough(world, spawnEnemy(world, 'infected_colonist', 0, 3, { aggro: true }));
    cast(world, ctx, player, 0, 0, 1, 10);
    expect(hasStatus(world, player, 'stealth')).toBe(true);
    run(world, ctx, [enemyAISystem], 1);
    expect(world.req(enemy, EnemyAI).state).toBe('idle');
    const hits: boolean[] = [];
    ctx.events.drain();
    cast(world, ctx, player, 1, 0, 3, 30);
    for (const e of ctx.events.drain()) if (e.type === 'damage' && e.target === enemy) hits.push(e.crit);
    expect(hits[0]).toBe(true);
    expect(hasStatus(world, player, 'stealth')).toBe(false);
  });

  it('Holo Decoy draws enemies that are near it', () => {
    const { world, ctx, player } = setup(['spectre.holo_decoy']);
    const enemy = spawnEnemy(world, 'infected_colonist', 8, 0, { aggro: true });
    cast(world, ctx, player, 0, 6, 0, 10);
    const decoy = world.query(Summon)[0]!;
    expect(decoy).toBeDefined();
    const before = Math.hypot(world.req(enemy, Transform).x - world.req(decoy, Transform).x, world.req(enemy, Transform).z);
    run(world, ctx, [spatialSystem, enemyAISystem, movementSystem], 30);
    const etr = world.req(enemy, Transform);
    const dtr = world.req(decoy, Transform);
    expect(Math.hypot(etr.x - dtr.x, etr.z - dtr.z)).toBeLessThan(before);
    run(world, ctx, SYSTEMS, 60 * 7);
    expect(world.query(Summon)).toHaveLength(0); // expired
  });

  it('Death Mark marks enemies; marked enemies take more damage and refund Focus on death', () => {
    const { world, ctx, player } = setup(['spectre.death_mark', 'spectre.quick_shot']);
    const a = spawnEnemy(world, 'infected_colonist', 0, 8);
    cast(world, ctx, player, 0, 0, 8, 30);
    expect(hasStatus(world, a, 'marked')).toBe(true);
    const r = world.req(player, Resource);
    r.current = 0;
    world.req(a, Health).current = 1;
    cast(world, ctx, player, 1, 0, 8, 40);
    expect(world.req(a, Health).current).toBe(0);
    expect(r.current).toBeGreaterThanOrEqual(15);
  });

  it('dodging an attack refunds Focus', () => {
    const { world, ctx, player } = setup(['spectre.quick_shot']);
    const r = world.req(player, Resource);
    r.current = 0;
    world.req(player, SkillUser).dodgeRequested = { x: 1, z: 0 };
    run(world, ctx, SYSTEMS, 1);
    const enemy = spawnEnemy(world, 'infected_colonist', 0, 0);
    applyStatus(world, ctx, player, { status: 'burning', duration: 1, dps: 5 }, { team: 'enemy', level: 1 });
    // A direct (non-DoT) hit while invulnerable is avoided.
    dealHit(world, ctx, enemy, player, { coefficient: 1, damageType: 'physical', knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'melee' });
    expect(r.current).toBeGreaterThanOrEqual(10);
  });
});
