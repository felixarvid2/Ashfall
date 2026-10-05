import { describe, expect, it } from 'vitest';
import { StatusEffects } from '../src/core/components';
import { World } from '../src/core/ecs';
import { PLAYER_DOT, applyStatus } from '../src/systems/combat';
import { statusSystem } from '../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx } from './helpers';

const has = (world: World, e: number, id: string) => world.req(e, StatusEffects).list.some((s) => s.id === id);

describe('damage over time on the player', () => {
  for (const status of ['burning', 'poisoned'] as const) {
    it(`${status} wears off after at most ${PLAYER_DOT.max} s however often it is reapplied, then can take hold again`, () => {
      const world = new World();
      const ctx = makeCtx();
      const player = spawnPlayer(world, 'bastion', 0, 0);
      const dt = 1 / 60;
      let clearAt = -1;
      let lastOn = 0;
      // A fire field or a biting swarm reapplying every half second for 12 s, 3 s each time.
      for (let i = 0; i < 12 / dt; i++) {
        if (i % 30 === 0) applyStatus(world, ctx, player, { status, duration: 3, dps: 1 }, { team: 'enemy', level: 1 });
        statusSystem(world, dt, ctx);
        ctx.time += dt;
        if (has(world, player, status)) lastOn = ctx.time;
        else if (clearAt < 0 && ctx.time > 1) clearAt = ctx.time;
      }
      expect(clearAt).toBeGreaterThan(PLAYER_DOT.max - 0.1);
      expect(clearAt).toBeLessThan(PLAYER_DOT.max + 0.1);
      expect(lastOn).toBeGreaterThan(PLAYER_DOT.max + PLAYER_DOT.rest);
    });
  }

  it(`poison stacks at most ${PLAYER_DOT.poisonStacks} deep on a player`, () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    for (let i = 0; i < 10; i++) applyStatus(world, ctx, player, { status: 'poisoned', duration: 3, dps: 1 + i }, { team: 'enemy', level: 1 });
    expect(world.req(player, StatusEffects).list.filter((s) => s.id === 'poisoned').length).toBe(PLAYER_DOT.poisonStacks);
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
    expect(has(world, enemy, 'poisoned')).toBe(true);
    expect(world.req(enemy, StatusEffects).list.filter((s) => s.id === 'poisoned').length).toBeGreaterThan(PLAYER_DOT.poisonStacks);
  });
});
