import { describe, expect, it } from 'vitest';
import { StatusEffects } from '../src/core/components';
import { World } from '../src/core/ecs';
import { PLAYER_POISON, applyStatus } from '../src/systems/combat';
import { statusSystem } from '../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx } from './helpers';

const poisoned = (world: World, e: number) => world.req(e, StatusEffects).list.some((s) => s.id === 'poisoned');

describe('poison on the player', () => {
  it(`wears off after at most ${PLAYER_POISON.max} s however often it is reapplied, then can take hold again`, () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const dt = 1 / 60;
    let lastPoisoned = 0;
    let clearAt = -1;
    // A spore swarm biting every half second for 12 s, each bite 3 s of poison.
    for (let i = 0; i < 12 / dt; i++) {
      if (i % 30 === 0) applyStatus(world, ctx, player, { status: 'poisoned', duration: 3, dps: 1 }, { team: 'enemy', level: 1 });
      statusSystem(world, dt, ctx);
      ctx.time += dt;
      if (poisoned(world, player)) lastPoisoned = ctx.time;
      else if (clearAt < 0 && ctx.time > 1) clearAt = ctx.time;
    }
    expect(clearAt).toBeGreaterThan(PLAYER_POISON.max - 0.1);
    expect(clearAt).toBeLessThan(PLAYER_POISON.max + 0.1);
    // After the rest it can poison again.
    expect(lastPoisoned).toBeGreaterThan(PLAYER_POISON.max + PLAYER_POISON.rest);
  });

  it('enemies are not capped', () => {
    const world = new World();
    const ctx = makeCtx();
    const enemy = spawnEnemy(world, 'crystal_walker', 0, 0, { level: 1 });
    for (let t = 0; t < 8; t += 0.5) {
      applyStatus(world, ctx, enemy, { status: 'poisoned', duration: 3, dps: 1 }, { team: 'player', level: 1 });
      statusSystem(world, 0.5, ctx);
      ctx.time += 0.5;
    }
    expect(poisoned(world, enemy)).toBe(true);
  });
});
