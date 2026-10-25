import { describe, expect, it } from 'vitest';
import {
  Dead,
  EncounterState,
  EnemyAI,
  Health,
  Invulnerable,
  Projectile,
  StatusEffects,
  Transform,
  WaveMember,
} from '../src/core/components';
import { World } from '../src/core/ecs';
import { SpatialHash } from '../src/core/spatial';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { deathSystem } from '../src/systems/death';
import { encounterSystem } from '../src/systems/encounter';
import { enemyAISystem } from '../src/systems/enemyAI';
import { ENEMY_DEFS, enemyDef } from '../src/data/db';
import { MIN_WINDUP } from '../src/data/schemas';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem, projectileSystem } from '../src/systems/projectiles';
import { statusSystem } from '../src/systems/status';
import { forcedMoveSystem, skillSystem } from '../src/systems/skills';
import { kill, hasStatus } from '../src/systems/combat';
import { spawnArenaProps } from '../src/world/arena';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { TEST_ARENA } from '../src/data/zones/testArena';
import { makeCtx, run, type SystemFn } from './helpers';

const SYSTEMS: SystemFn[] = [
  spatialSystem,
  skillSystem,
  enemyAISystem,
  statusSystem,
  movementSystem,
  forcedMoveSystem,
  collisionSystem,
  projectileSystem,
  hazardSystem,
  deathSystem,
];

function setup() {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, ctx, player };
}

describe('rusher (Infected Colonist)', () => {
  it('ignores the player outside aggro range and wanders slowly', () => {
    const { world, ctx } = setup();
    const e = spawnEnemy(world, 'infected_colonist', 30, 0);
    run(world, ctx, SYSTEMS, 60);
    expect(world.req(e, EnemyAI).aggro).toBe(false);
    expect(Math.abs(world.req(e, Transform).x - 30)).toBeLessThan(3);
  });

  it('aggroes nearby allies too', () => {
    const { world, ctx } = setup();
    const a = spawnEnemy(world, 'infected_colonist', 10, 0);
    const b = spawnEnemy(world, 'infected_colonist', 17, 0); // outside its own 16 m aggro range
    run(world, ctx, SYSTEMS, 1);
    expect(world.req(a, EnemyAI).aggro).toBe(true);
    expect(world.req(b, EnemyAI).aggro).toBe(true);
  });

  it('chases, telegraphs, and hits a player who stays put', () => {
    const { world, ctx, player } = setup();
    spawnEnemy(world, 'infected_colonist', 6, 0, { aggro: true });
    run(world, ctx, SYSTEMS, 60 * 3);
    const kinds = ctx.events.peek().map((e) => e.type);
    expect(kinds).toContain('telegraph');
    expect(world.req(player, Health).current).toBeLessThan(220);
  });

  it('misses a player who leaves the telegraphed arc in time', () => {
    const { world, ctx, player } = setup();
    const e = spawnEnemy(world, 'infected_colonist', 1.5, 0, { aggro: true });
    world.req(e, EnemyAI).cooldown = 0;
    run(world, ctx, SYSTEMS, 2); // wind-up starts
    expect(world.req(e, EnemyAI).state).toBe('windup');
    // Teleport out of reach before the swing lands.
    const tr = world.req(player, Transform);
    tr.x = -5;
    run(world, ctx, SYSTEMS, 40);
    expect(world.req(player, Health).current).toBe(220);
  });

  it('dodge i-frames avoid a hit that would otherwise land', () => {
    const { world, ctx, player } = setup();
    const e = spawnEnemy(world, 'infected_colonist', 1.5, 0, { aggro: true });
    world.req(e, EnemyAI).cooldown = 0;
    world.add(player, Invulnerable, { remaining: 2 });
    run(world, ctx, SYSTEMS, 60);
    expect(world.req(player, Health).current).toBe(220);
  });
});

describe('ranged (Security Drone)', () => {
  it('keeps its distance and fires projectiles that hit a stationary player', () => {
    const { world, ctx, player } = setup();
    const drone = spawnEnemy(world, 'security_drone', 4, 0, { aggro: true });
    let sawProjectile = false;
    for (let i = 0; i < 60 * 4; i++) {
      run(world, ctx, SYSTEMS, 1);
      if (world.query(Projectile).length > 0) sawProjectile = true;
    }
    const d = Math.hypot(world.req(drone, Transform).x, world.req(drone, Transform).z);
    expect(d).toBeGreaterThan(6);
    expect(sawProjectile).toBe(true);
    expect(world.req(player, Health).current).toBeLessThan(220);
  });

  it('hovers above the ground', () => {
    const { world } = setup();
    const drone = spawnEnemy(world, 'security_drone', 4, 0);
    expect(world.req(drone, Transform).y).toBeCloseTo(1.3);
  });
});

describe('support (Spore Carrier)', () => {
  it('shields nearby allies with a barrier', () => {
    const { world, ctx } = setup();
    const carrier = spawnEnemy(world, 'spore_carrier', 12, 0, { aggro: true });
    const ally = spawnEnemy(world, 'infected_colonist', 10, 0, { aggro: true });
    world.req(carrier, EnemyAI).cooldown = 0;
    let shielded = false;
    for (let i = 0; i < 90; i++) {
      run(world, ctx, SYSTEMS, 1);
      if (hasStatus(world, ally, 'barrier')) shielded = true;
    }
    expect(shielded).toBe(true);
  });

  it('stays away from the player', () => {
    const { world, ctx } = setup();
    const carrier = spawnEnemy(world, 'spore_carrier', 3, 0, { aggro: true });
    run(world, ctx, SYSTEMS, 120);
    expect(Math.hypot(world.req(carrier, Transform).x, world.req(carrier, Transform).z)).toBeGreaterThan(5);
  });
});

describe('stunned enemies', () => {
  it('do not move or attack', () => {
    const { world, ctx, player } = setup();
    const e = spawnEnemy(world, 'infected_colonist', 1.5, 0, { aggro: true });
    world.req(e, StatusEffects).list.push({
      id: 'stunned',
      remaining: 5,
      duration: 5,
      dps: 0,
      amount: 0,
      pending: 0,
      sourceTeam: 'player',
      attackerLevel: 1,
    });
    run(world, ctx, SYSTEMS, 120);
    expect(world.req(player, Health).current).toBe(220);
  });
});

describe('collision', () => {
  it('keeps the crowd from overlapping and blocks walking through crates', () => {
    const world = new World();
    const ctx = makeCtx();
    spawnArenaProps(world, TEST_ARENA);
    const player = spawnPlayer(world, 'bastion', -5, -3);
    const enemies = [0, 1, 2, 3, 4].map(() => spawnEnemy(world, 'infected_colonist', 3, 3));
    run(world, ctx, [spatialSystem, movementSystem, collisionSystem], 60);
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = world.req(enemies[i]!, Transform);
        const b = world.req(enemies[j]!, Transform);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.7);
      }
    }
    // Crate at (-5, -6) with radius 0.95: push the player into it.
    const tr = world.req(player, Transform);
    tr.z = -5.4;
    run(world, ctx, [spatialSystem, collisionSystem], 5);
    expect(Math.hypot(tr.x + 5, tr.z + 6)).toBeGreaterThanOrEqual(0.95 + 0.45 - 0.01);
  });
});

describe('SpatialHash', () => {
  it('finds overlapping circles once, across cell borders', () => {
    const hash = new SpatialHash(4);
    hash.insert(1, 3.9, 0, 0.5);
    hash.insert(2, 10, 10, 0.5);
    hash.insert(3, -0.2, -0.2, 0.5);
    expect(hash.queryCircle(4.1, 0, 0.3).sort()).toEqual([1]);
    expect(hash.queryCircle(2, 0, 3).sort()).toEqual([1, 3]);
    expect(hash.queryCircle(50, 50, 1)).toEqual([]);
  });
});

describe('wave encounter', () => {
  it('spawns waves after the intermission and advances when cleared', () => {
    const world = new World();
    const ctx = makeCtx();
    spawnPlayer(world, 'bastion', 0, 0);
    const enc = world.create();
    world.add(enc, EncounterState, { encounterId: 'encounter.test_arena', wave: 0, phase: 'intermission', timer: 1, alive: 0 });
    run(world, ctx, [encounterSystem], 70);
    const state = world.req(enc, EncounterState);
    expect(state.wave).toBe(1);
    expect(state.phase).toBe('active');
    expect(world.query(WaveMember)).toHaveLength(6);

    for (const e of world.query(WaveMember)) kill(world, ctx, e, 0);
    run(world, ctx, [encounterSystem], 1);
    expect(state.phase).toBe('intermission');
    expect(ctx.events.peek().some((e) => e.type === 'waveCleared')).toBe(true);
    run(world, ctx, [encounterSystem, deathSystem], 60 * 4);
    expect(state.wave).toBe(2);
    expect(world.query(WaveMember).filter((e) => !world.has(e, Dead))).toHaveLength(9);
  });

  it('spawns inside the arena', () => {
    const world = new World();
    const ctx = makeCtx();
    spawnPlayer(world, 'bastion', 38, 38);
    const enc = world.create();
    world.add(enc, EncounterState, { encounterId: 'encounter.test_arena', wave: 4, phase: 'intermission', timer: 0, alive: 0 });
    run(world, ctx, [encounterSystem], 1);
    for (const e of world.query(WaveMember)) {
      const tr = world.req(e, Transform);
      expect(Math.abs(tr.x)).toBeLessThanOrEqual(40);
      expect(Math.abs(tr.z)).toBeLessThanOrEqual(40);
    }
  });
});

describe('fast wind-ups (G025)', () => {
  it('every melee, cone and lunge wind-up leaves a dodge time to answer, unless the enemy is marked quick', () => {
    for (const def of ENEMY_DEFS.values()) {
      const a = def.attack;
      if (a.kind !== 'melee' && a.kind !== 'cone' && a.kind !== 'lunge') continue;
      if (def.quick) continue;
      expect(a.windup, def.id).toBeGreaterThanOrEqual(MIN_WINDUP);
    }
  });

  it('a hound telegraphs 0.15 s before its 0.45 s wind-up; its cooldown pays the lead back, so it still swings every 1.55 s', () => {
    const { world, ctx } = setup();
    const hound = spawnEnemy(world, 'spore_hound', 1.6, 0, { aggro: true });
    const ai = world.req(hound, EnemyAI);
    for (let i = 0; i < 120 && ai.state !== 'windup'; i++) run(world, ctx, SYSTEMS, 1);
    expect(ai.state).toBe('windup');
    const warning = ctx.events.drain().find((ev) => ev.type === 'telegraph');
    expect(warning && 'duration' in warning ? warning.duration : 0).toBeCloseTo(0.6, 5);
    const atk = enemyDef('spore_hound').attack;
    expect(atk.kind === 'melee' ? atk.windup + atk.cooldown : 0).toBeCloseTo(0.35 + 1.2, 5); // swing every 1.55 s, as before;
  });
});
