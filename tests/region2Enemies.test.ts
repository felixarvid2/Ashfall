import { describe, expect, it } from 'vitest';
import { Dead, EnemyAI, ForcedMove, Hazard, Health, StatusEffects, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { ENEMY_DEFS } from '../src/data/db';
import { PACK_TEMPLATES } from '../src/data/packs';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { dealHit, hasStatus, kill } from '../src/systems/combat';
import { deathSystem } from '../src/systems/death';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem, projectileSystem } from '../src/systems/projectiles';
import { forcedMoveSystem } from '../src/systems/skills';
import { statusSystem } from '../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx, run, type SystemFn } from './helpers';

const SYSTEMS: SystemFn[] = [spatialSystem, enemyAISystem, statusSystem, movementSystem, forcedMoveSystem, collisionSystem, projectileSystem, hazardSystem, deathSystem];

function setup(enemy: string, x = 0, z = 4, level = 12) {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 200 });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  // A sturdy target so the fights last.
  const h = world.req(player, Health);
  h.max = h.current = 1e6;
  const e = spawnEnemy(world, enemy, x, z, { level, aggro: true });
  return { world, ctx, player, e };
}

const life = (world: World, e: Entity) => world.req(e, Health).current;

describe('Region 2 roster', () => {
  it('has the returning variants and the new enemies, each in some pack', () => {
    const ids = ['scorched_walker', 'slag_hound', 'flame_drone', 'fire_bloater', 'smelter', 'welder', 'slagborn', 'cargo_loader', 'smelter_priest'];
    for (const id of ids) expect(ENEMY_DEFS.has(id), id).toBe(true);
    const packed = new Set(PACK_TEMPLATES.filter((p) => p.id.startsWith('rd_')).flatMap((p) => p.members.map((m) => m.enemy)));
    for (const id of ids) expect(packed.has(id), id).toBe(true);
    // Variants reuse region 1 models (no new credits).
    for (const id of ['scorched_walker', 'slag_hound', 'flame_drone', 'fire_bloater']) expect(ENEMY_DEFS.get(id)!.assetId.startsWith('enemy.')).toBe(true);
  });
});

describe('flamethrower (Flame Drone, Smelter)', () => {
  it('telegraphs a cone, then hits several times and sets the target burning', () => {
    const { world, ctx, player } = setup('flame_drone', 0, 4);
    let telegraphs = 0;
    const start = life(world, player);
    for (let i = 0; i < 60 * 3; i++) {
      run(world, ctx, SYSTEMS, 1);
      for (const ev of ctx.events.drain()) if (ev.type === 'telegraph') telegraphs++;
    }
    expect(telegraphs).toBeGreaterThan(0);
    expect(life(world, player)).toBeLessThan(start);
    expect(hasStatus(world, player, 'burning')).toBe(true);
  });

  it('cannot hit what is behind it', () => {
    const { world, ctx, player, e } = setup('flame_drone', 0, 4);
    // Let the wind-up start facing the player, then step behind the drone.
    for (let i = 0; i < 180 && world.req(e, EnemyAI).state !== 'windup'; i++) run(world, ctx, SYSTEMS, 1);
    expect(world.req(e, EnemyAI).state).toBe('windup');
    const tr = world.req(player, Transform);
    tr.x = tr.prevX = 0;
    tr.z = tr.prevZ = 9;
    const before = life(world, player);
    run(world, ctx, SYSTEMS, 40);
    expect(life(world, player)).toBe(before);
  });
});

describe('fire shield (Smelter)', () => {
  it('rises as the target closes in and blocks most of a frontal hit', () => {
    const { world, ctx, player, e } = setup('smelter', 0, 5);
    run(world, ctx, SYSTEMS, 3);
    expect(world.req(e, EnemyAI).shieldUp ?? 0).toBeGreaterThan(0);
    const hit = (fromZ: number) => {
      const h = world.req(e, Health);
      h.current = h.max;
      dealHit(world, ctx, player, e, { coefficient: 1, damageType: 'physical', knockback: 0, fromX: 0, fromZ, applies: [], range: 'melee' });
      return h.max - h.current;
    };
    world.req(e, Transform).facing = Math.PI; // facing −z, toward the player
    ctx.rng = makeCtx().rng;
    const front = hit(0);
    ctx.rng = makeCtx().rng;
    const back = hit(10);
    expect(front).toBeLessThan(back * 0.3);
  });
});

describe('lunge (Welder)', () => {
  it('telegraphs a line, dashes along it and burns what it passes through', () => {
    const { world, ctx, player, e } = setup('welder', 0, 7);
    const from = { ...world.req(e, Transform) };
    let line = false;
    let dashed = false;
    for (let i = 0; i < 60 * 2; i++) {
      run(world, ctx, SYSTEMS, 1);
      for (const ev of ctx.events.drain()) if (ev.type === 'telegraph' && ev.shape.kind === 'line') line = true;
      if (world.has(e, ForcedMove)) dashed = true;
    }
    expect(line).toBe(true);
    expect(dashed).toBe(true);
    expect(life(world, player)).toBeLessThan(1e6);
    expect(hasStatus(world, player, 'burning')).toBe(true);
    const to = world.req(e, Transform);
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeGreaterThan(5);
  });
});

describe('grab and throw (Cargo Loader)', () => {
  it('throws the target on every third swing, leaving it stunned', () => {
    const { world, ctx, player, e } = setup('cargo_loader', 0, 2.5);
    let thrown = false;
    for (let i = 0; i < 60 * 12 && !thrown; i++) {
      run(world, ctx, SYSTEMS, 1);
      if (world.has(player, ForcedMove)) thrown = true;
    }
    expect(thrown).toBe(true);
    expect(world.req(e, EnemyAI).swings! % 3).toBe(0);
    expect(hasStatus(world, player, 'stunned')).toBe(true);
  });
});

describe('burning trail (Slagborn)', () => {
  it('leaves burning ground behind as it walks', () => {
    const { world, ctx, e } = setup('slagborn', 0, 12);
    run(world, ctx, SYSTEMS, 60 * 3);
    const patches = world.query(Hazard, Transform);
    expect(patches.length).toBeGreaterThan(1);
    expect(world.req(patches[0]!, Hazard).applies[0]!.dps).toBeGreaterThan(0);
    expect(world.isAlive(e)).toBe(true);
  });

  it('a fire variant burns where it dies', () => {
    const { world, ctx, e } = setup('scorched_walker', 0, 3);
    kill(world, ctx, e, 0);
    const patch = world.query(Hazard)[0]!;
    expect(world.req(patch, Hazard).applies[0]!.status).toBe('burning');
    expect(world.req(patch, Hazard).applies[0]!.dps).toBeGreaterThan(0);
  });
});

describe('revive (Smelter Priest)', () => {
  it('raises a fallen Smelter once', () => {
    const { world, ctx, e: priest } = setup('smelter_priest', 0, 10);
    const smelter = spawnEnemy(world, 'smelter', 3, 10, { level: 12, aggro: true });
    kill(world, ctx, smelter, 0);
    expect(world.has(smelter, Dead)).toBe(true);
    run(world, ctx, SYSTEMS, 60 * 3);
    expect(world.has(smelter, Dead)).toBe(false);
    expect(life(world, smelter)).toBeGreaterThan(0);
    expect(world.req(priest, EnemyAI).revives).toBe(0);
    // A second death stays a death.
    kill(world, ctx, smelter, 0);
    run(world, ctx, SYSTEMS, 60 * 15);
    expect(world.has(smelter, Dead) || !world.isAlive(smelter)).toBe(true);
  });
});

describe('heavy melee', () => {
  it('tank-type melee enemies (bosses, Slagborn) close in and attack', () => {
    for (const id of ['slagborn', 'the_first', 'brood_mother']) {
      const { world, ctx, player } = setup(id, 0, 6);
      run(world, ctx, SYSTEMS, 60 * 6);
      expect(life(world, player), id).toBeLessThan(1e6);
      expect(world.get(player, StatusEffects)).toBeDefined();
    }
  });
});
