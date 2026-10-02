import { describe, expect, it } from 'vitest';
import {
  CombatStats,
  ForcedMove,
  Health,
  Invulnerable,
  Resource,
  SkillUser,
  StatusEffects,
  Transform,
} from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import type { GameContext } from '../src/core/context';
import { applyStatus, hasStatus } from '../src/systems/combat';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { movementSystem } from '../src/systems/movement';
import { forcedMoveSystem, skillSystem } from '../src/systems/skills';
import { statusSystem } from '../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { learnSkills, makeCtx, run, type SystemFn } from './helpers';

const SYSTEMS: SystemFn[] = [spatialSystem, skillSystem, statusSystem, movementSystem, forcedMoveSystem, collisionSystem];

function setup() {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  learnSkills(world, player);
  Object.assign(world.req(player, CombatStats), { critChance: 0, weaponDamage: 14, mainStat: 20, resourceGen: 0 });
  return { world, ctx, player };
}

function cast(world: World, ctx: GameContext, player: Entity, slot: number, aimX: number, aimZ: number, ticks = 30) {
  world.req(player, SkillUser).request = { slot, aimX, aimZ, ttl: 0.25 };
  run(world, ctx, SYSTEMS, ticks);
}

describe('Hydraulic Strike (basic)', () => {
  it('hits enemies in front within the arc, not behind', () => {
    const { world, ctx, player } = setup();
    const front = spawnEnemy(world, 'infected_colonist', 0, 1.8);
    const behind = spawnEnemy(world, 'infected_colonist', 0, -1.8);
    cast(world, ctx, player, 0, 0, 5);
    expect(world.req(front, Health).current).toBeLessThan(45);
    expect(world.req(behind, Health).current).toBe(45);
  });

  it('generates heat only when it hits', () => {
    const { world, ctx, player } = setup();
    cast(world, ctx, player, 0, 0, 5);
    expect(world.req(player, Resource).current).toBe(0);
    spawnEnemy(world, 'infected_colonist', 0, 1.8);
    cast(world, ctx, player, 0, 0, 5);
    expect(world.req(player, Resource).current).toBe(11);
  });

  it('sets enemies on fire above 70 heat', () => {
    const { world, ctx, player } = setup();
    const enemy = spawnEnemy(world, 'spore_carrier', 0, 1.8);
    world.req(player, Resource).current = 80;
    world.req(player, Resource).sinceCombat = 0;
    cast(world, ctx, player, 0, 0, 5, 12);
    expect(hasStatus(world, enemy, 'burning')).toBe(true);
  });

  it('roots the caster and emits hit-stop and shake on hit', () => {
    const { world, ctx, player } = setup();
    spawnEnemy(world, 'infected_colonist', 0, 1.8);
    cast(world, ctx, player, 0, 0, 5, 10);
    const kinds = ctx.events.peek().map((e) => e.type);
    expect(kinds).toContain('hitstop');
    expect(kinds).toContain('shake');
    expect(kinds).toContain('vfx');
  });
});

describe('Seismic Shock (core)', () => {
  it('costs heat, hits all around and applies vulnerable', () => {
    const { world, ctx, player } = setup();
    world.req(player, Resource).current = 50;
    world.req(player, Resource).sinceCombat = 0;
    const a = spawnEnemy(world, 'infected_colonist', 3, 0);
    const b = spawnEnemy(world, 'infected_colonist', -3, 0);
    const far = spawnEnemy(world, 'infected_colonist', 8, 0);
    cast(world, ctx, player, 1, 1, 0);
    expect(world.req(player, Resource).current).toBe(15);
    expect(hasStatus(world, a, 'vulnerable')).toBe(true);
    expect(hasStatus(world, b, 'vulnerable')).toBe(true);
    expect(world.req(far, Health).current).toBe(45);
  });

  it('refuses without enough heat and says so', () => {
    const { world, ctx, player } = setup();
    world.req(player, Resource).current = 10;
    const enemy = spawnEnemy(world, 'infected_colonist', 2, 0);
    cast(world, ctx, player, 1, 1, 0);
    expect(world.req(enemy, Health).current).toBe(45);
    expect(ctx.events.peek().some((e) => e.type === 'notice')).toBe(true);
  });

  it('knocks enemies away from the caster', () => {
    const { world, ctx, player } = setup();
    world.req(player, Resource).current = 50;
    const enemy = spawnEnemy(world, 'infected_colonist', 2, 0);
    cast(world, ctx, player, 1, 1, 0);
    expect(world.req(enemy, Transform).x).toBeGreaterThan(3);
  });
});

describe('Rocket Leap', () => {
  it('flies to the target (max range), lands and stuns, then goes on cooldown', () => {
    const { world, ctx, player } = setup();
    const enemy = spawnEnemy(world, 'infected_colonist', 0, 10.5);
    cast(world, ctx, player, 2, 0, 30, 10);
    expect(world.has(player, ForcedMove)).toBe(true);
    expect(world.req(player, Transform).y).toBeGreaterThan(0);
    run(world, ctx, SYSTEMS, 40);
    const tr = world.req(player, Transform);
    expect(tr.z).toBeGreaterThan(8.5); // capped at 9 m, nudged by collision
    expect(tr.y).toBe(0);
    expect(hasStatus(world, enemy, 'stunned')).toBe(true);
    expect(world.req(player, SkillUser).cooldowns['bastion.rocket_leap']).toBeGreaterThan(5);
  });
});

describe('Energy Shield', () => {
  it('grants a barrier and cleanses stuns', () => {
    const { world, ctx, player } = setup();
    applyStatus(world, ctx, player, { status: 'chilled', duration: 5 }, { team: 'enemy', level: 1 });
    cast(world, ctx, player, 3, 0, 1, 10);
    expect(hasStatus(world, player, 'barrier')).toBe(true);
    expect(hasStatus(world, player, 'chilled')).toBe(false);
    const barrier = world.req(player, StatusEffects).list.find((s) => s.id === 'barrier')!;
    expect(barrier.amount).toBeCloseTo(77);
  });

  it('cannot be used while stunned', () => {
    const { world, ctx, player } = setup();
    applyStatus(world, ctx, player, { status: 'stunned', duration: 2 }, { team: 'enemy', level: 1 });
    run(world, ctx, SYSTEMS, 1);
    cast(world, ctx, player, 3, 0, 1, 10);
    expect(hasStatus(world, player, 'barrier')).toBe(false);
  });
});

describe('dodge and potion', () => {
  it('dodge dashes, grants i-frames and has a cooldown', () => {
    const { world, ctx, player } = setup();
    const user = world.req(player, SkillUser);
    user.dodgeRequested = { x: 1, z: 0 };
    run(world, ctx, SYSTEMS, 1);
    expect(world.has(player, Invulnerable)).toBe(true);
    run(world, ctx, SYSTEMS, 20);
    expect(world.req(player, Transform).x).toBeCloseTo(4.5, 1);
    expect(world.has(player, Invulnerable)).toBe(false);
    user.dodgeRequested = { x: 1, z: 0 };
    run(world, ctx, SYSTEMS, 20);
    expect(world.req(player, Transform).x).toBeCloseTo(4.5, 1); // still on cooldown
  });

  it('dodge cancels a wind-up', () => {
    const { world, ctx, player } = setup();
    const user = world.req(player, SkillUser);
    user.request = { slot: 0, aimX: 0, aimZ: 5, ttl: 0.25 };
    run(world, ctx, SYSTEMS, 1);
    expect(user.cast).not.toBeNull();
    user.dodgeRequested = { x: -1, z: 0 };
    run(world, ctx, SYSTEMS, 1);
    expect(user.cast).toBeNull();
  });

  it('potion heals 35% and uses a charge; does nothing at full life', () => {
    const { world, ctx, player } = setup();
    const user = world.req(player, SkillUser);
    const life = world.req(player, Health);
    user.potionRequested = true;
    run(world, ctx, SYSTEMS, 1);
    expect(user.potionCharges).toBe(4);
    life.current = 100;
    user.potionRequested = true;
    run(world, ctx, SYSTEMS, 1);
    expect(life.current).toBeCloseTo(177);
    expect(user.potionCharges).toBe(3);
  });
});

describe('input buffering', () => {
  it('a skill pressed during recovery fires right after', () => {
    const { world, ctx, player } = setup();
    const enemy = spawnEnemy(world, 'spore_carrier', 0, 1.9);
    const user = world.req(player, SkillUser);
    user.request = { slot: 0, aimX: 0, aimZ: 5, ttl: 0.25 };
    run(world, ctx, SYSTEMS, 10); // first swing fired, now recovering
    user.request = { slot: 0, aimX: 0, aimZ: 5, ttl: 0.25 };
    run(world, ctx, SYSTEMS, 30);
    // Exactly two hits landed: 14 × 0.9 × 1.02 × (1 − 30/95 armor) ≈ 8.79 each.
    expect(world.req(enemy, Health).current).toBeCloseTo(70 - 2 * 14 * 0.9 * 1.02 * (65 / 95), 3);
  });
});
