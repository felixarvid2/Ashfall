import { describe, expect, it } from 'vitest';
import { Dead, EnemyAI, Health, Targetable, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { spatialSystem } from '../src/systems/collision';
import { enemyNear, livingInCircle, nearestOpposing, opposingTeam } from '../src/systems/targeting';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

function setup() {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, ctx, player };
}
const DEAD = { elapsed: 0, removeAfter: 5, fallDir: 0, corpse: true };
const index = (world: World, ctx: ReturnType<typeof makeCtx>): void => run(world, ctx, [spatialSystem]);

describe('livingInCircle', () => {
  it('finds living members of the team inside the circle only', () => {
    const { world, ctx, player } = setup();
    const near = spawnEnemy(world, 'infected_colonist', 3, 0);
    const far = spawnEnemy(world, 'infected_colonist', 20, 0);
    index(world, ctx);
    expect(livingInCircle(world, ctx, 0, 0, 5, 'enemy')).toEqual([near]);
    expect(livingInCircle(world, ctx, 0, 0, 5, 'player')).toEqual([player]);
    expect(livingInCircle(world, ctx, 0, 0, 30, 'enemy').sort()).toEqual([near, far].sort());
  });

  it('skips dead and burrowed entities', () => {
    const { world, ctx } = setup();
    const dead = spawnEnemy(world, 'infected_colonist', 2, 0);
    const burrowed = spawnEnemy(world, 'burrower', 0, 2);
    const alive = spawnEnemy(world, 'infected_colonist', -2, 0);
    world.add(dead, Dead, DEAD);
    world.req(burrowed, EnemyAI).burrowed = true;
    index(world, ctx);
    expect(livingInCircle(world, ctx, 0, 0, 6, 'enemy')).toEqual([alive]);
    // Back above ground it can be hit again.
    world.req(burrowed, EnemyAI).burrowed = false;
    expect(livingInCircle(world, ctx, 0, 0, 6, 'enemy')).toHaveLength(2);
  });

  it('skips entities without life', () => {
    const { world, ctx } = setup();
    const e = spawnEnemy(world, 'infected_colonist', 2, 0);
    world.remove(e, Health);
    index(world, ctx);
    expect(livingInCircle(world, ctx, 0, 0, 6, 'enemy')).toEqual([]);
  });
});

describe('nearestOpposing', () => {
  it('returns the nearest, honours accept, and null when nothing is in range', () => {
    const { world, ctx } = setup();
    const a = spawnEnemy(world, 'infected_colonist', 4, 0);
    const b = spawnEnemy(world, 'infected_colonist', 2, 0);
    index(world, ctx);
    expect(nearestOpposing(world, ctx, 0, 0, 10, 'enemy')).toBe(b);
    expect(nearestOpposing(world, ctx, 0, 0, 10, 'enemy', (e) => e !== b)).toBe(a);
    expect(nearestOpposing(world, ctx, 0, 0, 1, 'enemy')).toBeNull();
  });

  it('ignores a dead nearest enemy', () => {
    const { world, ctx } = setup();
    const near = spawnEnemy(world, 'infected_colonist', 1, 0);
    const next = spawnEnemy(world, 'infected_colonist', 5, 0);
    world.add(near, Dead, DEAD);
    index(world, ctx);
    expect(nearestOpposing(world, ctx, 0, 0, 10, 'enemy')).toBe(next);
  });
});

describe('opposingTeam and enemyNear', () => {
  it('swaps teams', () => {
    expect(opposingTeam('player')).toBe('enemy');
    expect(opposingTeam('enemy')).toBe('player');
  });

  it('picks the enemy closest to a ground point, counting its collider edge', () => {
    const { world, ctx } = setup();
    const e = spawnEnemy(world, 'infected_colonist', 10, 0);
    index(world, ctx);
    expect(enemyNear(world, ctx, 10.5, 0.2)).toBe(e);
    expect(enemyNear(world, ctx, 14, 0)).toBeNull();
  });

  it('ignores a living thing that is neither an enemy AI nor targetable', () => {
    const { world, ctx } = setup();
    const e = spawnEnemy(world, 'infected_colonist', 10, 0);
    world.remove(e, EnemyAI);
    index(world, ctx);
    expect(enemyNear(world, ctx, 10, 0)).toBeNull();
    world.add(e, Targetable, {});
    expect(enemyNear(world, ctx, 10, 0)).toBe(e);
    expect(world.req(e, Transform).x).toBe(10);
  });
});
