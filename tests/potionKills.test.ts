import { describe, expect, it } from 'vitest';
import { Boss, Elite, SkillUser } from '../src/core/components';
import { World } from '../src/core/ecs';
import { POTION_KILL_CREDIT, kill } from '../src/systems/combat';
import { skillSystem } from '../src/systems/skills';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

/** G017: potions are on a flat 18 s timer; every kill takes time off it. */
function setup() {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const user = world.req(player, SkillUser);
  user.potionCharges = 2;
  user.potionRecharge = 18;
  return { world, ctx, user };
}

describe('potion recharge from kills', () => {
  it('a kill, an elite and a boss advance the recharge by 0.75, 3 and 8 s', () => {
    const { world, ctx, user } = setup();
    kill(world, ctx, spawnEnemy(world, 'infected_colonist', 5, 0), 0);
    expect(user.potionRecharge).toBeCloseTo(18 - 0.75);
    const elite = spawnEnemy(world, 'infected_colonist', 6, 0);
    world.add(elite, Elite, { kind: 'rare', affixes: [], timers: {}, shieldUsed: false, mirrored: false, copy: false });
    kill(world, ctx, elite, 0);
    expect(user.potionRecharge).toBeCloseTo(18 - 0.75 - 3);
    const boss = spawnEnemy(world, 'infected_colonist', 7, 0);
    world.add(boss, Boss, { arena: { x: 0, z: 0, radius: 10 } } as never);
    kill(world, ctx, boss, 0);
    expect(user.potionRecharge).toBeCloseTo(18 - 0.75 - 3 - 8);
    expect(POTION_KILL_CREDIT).toEqual({ kill: 0.75, elite: 3, boss: 8 });
  });

  it('a full belt gains nothing, and a surplus carries to the next charge', () => {
    const { world, ctx, user } = setup();
    user.potionCharges = 4;
    kill(world, ctx, spawnEnemy(world, 'infected_colonist', 5, 0), 0);
    expect(user.potionRecharge).toBe(18);
    user.potionCharges = 3;
    user.potionRecharge = 2;
    kill(world, ctx, spawnEnemy(world, 'infected_colonist', 5, 0), 0);
    kill(world, ctx, spawnEnemy(world, 'infected_colonist', 6, 0), 0);
    kill(world, ctx, spawnEnemy(world, 'infected_colonist', 7, 0), 0); // 2 - 2.25 s: one charge, 0.25 s ahead
    run(world, ctx, [skillSystem], 1);
    expect(user.potionCharges).toBe(4);
    expect(user.potionRecharge).toBeGreaterThan(17.5);
  });

  it('at 0.5 kills per second the supply is at least 4.5 potions per minute', () => {
    const { world, ctx, user } = setup();
    user.potionCharges = 0;
    user.potionRecharge = 18;
    let gained = 0;
    // 120 s of play: a kill every 2 s, and a drink as soon as there is a charge.
    for (let tick = 0; tick < 7200; tick++) {
      if (tick % 120 === 0) kill(world, ctx, spawnEnemy(world, 'infected_colonist', 5, 0), 0);
      const before = user.potionCharges;
      run(world, ctx, [skillSystem], 1);
      if (user.potionCharges > before) {
        gained++;
        user.potionCharges = 0;
      }
    }
    expect(gained / 2).toBeGreaterThanOrEqual(4.5);
  });
});
