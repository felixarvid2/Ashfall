import { describe, expect, it } from 'vitest';
import { Blast, EnemyAI, Mover, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { enemyDef } from '../src/data/db';
import { HEARING, heardNoise, isBurrowed, minesBehaviours } from '../src/systems/minesAI';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx } from './helpers';

function setup(enemyId: string, ex: number, ez: number, aggro = true) {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const enemy = spawnEnemy(world, enemyId, ex, ez, { aggro });
  const def = enemyDef(enemyId);
  const tick = (dt = 1 / 60): boolean =>
    minesBehaviours(world, ctx, enemy, world.req(enemy, EnemyAI), def, world.req(enemy, Transform), world.req(enemy, Mover), dt);
  return { world, ctx, player, enemy, def, tick };
}

describe('burrowers', () => {
  it('stay surfaced until their timer runs out, then dive and cannot be hit', () => {
    const { world, enemy, def, tick } = setup('burrower', 8, 0);
    const b = def.burrow!;
    expect(tick(1 / 60)).toBe(false);
    expect(isBurrowed(world, enemy)).toBe(false);
    expect(tick(b.surfaced)).toBe(true);
    expect(isBurrowed(world, enemy)).toBe(true);
    expect(world.req(enemy, Transform).y).toBeLessThan(0);
  });

  it('travel under the player, warn, then burst up at the warned spot and surface for a while', () => {
    const { world, ctx, enemy, def, tick } = setup('burrower', 8, 0);
    const b = def.burrow!;
    tick(b.surfaced);
    const ai = world.req(enemy, EnemyAI);
    // Underground: moves toward the player at the burrow speed.
    expect(tick(1 / 60)).toBe(true);
    const mover = world.req(enemy, Mover);
    expect(mover.vx).toBeLessThan(0);
    expect(Math.hypot(mover.vx, mover.vz)).toBeCloseTo(b.speed);
    // Close enough: the warning starts and a telegraph is sent.
    const tr = world.req(enemy, Transform);
    tr.x = 2;
    tick(1 / 60);
    expect(ai.surfaceAt).not.toBeNull();
    expect(ctx.events.peek().some((e) => e.type === 'telegraph')).toBe(true);
    // Still warning.
    expect(tick(b.warning / 2)).toBe(true);
    expect(ai.burrowed).toBe(true);
    // Emerge: a blast at the player's spot, no longer burrowed, timer set for the next dive.
    tick(b.warning);
    expect(ai.burrowed).toBe(false);
    expect(tr.y).toBe(0);
    expect(world.query(Blast, Transform)).toHaveLength(1);
    expect(ai.burrowTimer).toBe(b.every);
    // While surfaced it fights normally (the behaviour hands control back).
    expect(tick(1 / 60)).toBe(false);
  });

  it('do not dive without aggro', () => {
    const { world, enemy, def, tick } = setup('burrower', 8, 0, false);
    expect(tick(def.burrow!.surfaced * 2)).toBe(false);
    expect(isBurrowed(world, enemy)).toBe(false);
  });
});

describe('dynamite throwers', () => {
  it('lob a bomb at the player in range and it explodes after the fuse', () => {
    const { world, ctx, enemy, def, tick } = setup('infected_miner', 6, 0);
    const d = def.dynamite!;
    tick(d.every); // first throw is due after half a period
    const ai = world.req(enemy, EnemyAI);
    expect(ai.bombs).toHaveLength(1);
    expect(ctx.events.peek().some((e) => e.type === 'telegraph')).toBe(true);
    tick(d.fuse + 0.1);
    expect(world.query(Blast, Transform).length).toBeGreaterThanOrEqual(1);
  });

  it('hold their dynamite when the player is out of range', () => {
    const { world, enemy, def, tick } = setup('infected_miner', 40, 0);
    tick(def.dynamite!.every);
    expect(world.req(enemy, EnemyAI).bombs).toHaveLength(0);
  });
});

describe('echoes', () => {
  it('blink next to a player who is in range and not too close', () => {
    const { world, enemy, def, tick } = setup('echo', 10, 0);
    const tr = world.req(enemy, Transform);
    expect(tick(def.teleport!.every * 2)).toBe(true);
    // About 2.4 m from the player (the origin), no longer at the start spot.
    expect(Math.hypot(tr.x, tr.z)).toBeCloseTo(2.4, 5);
  });

  it('do not blink when the player is already close', () => {
    const { world, enemy, def, tick } = setup('echo', 2, 0);
    expect(tick(def.teleport!.every * 2)).toBe(false);
    expect(world.req(enemy, Transform).x).toBe(2);
  });
});

describe('heardNoise', () => {
  const withNoises = (noises: { x: number; z: number; until: number }[]) => {
    const ctx = makeCtx();
    ctx.zone = { underground: { noises } } as never;
    ctx.time = 10;
    return ctx;
  };

  it('returns the nearest live noise within range, ignoring expired ones', () => {
    const ctx = withNoises([
      { x: 20, z: 0, until: 20 },
      { x: 5, z: 0, until: 20 },
      { x: 1, z: 0, until: 5 },
    ]);
    expect(heardNoise(ctx, 0, 0, HEARING.noiseRange)).toEqual({ x: 5, z: 0, until: 20 });
    expect(heardNoise(ctx, 0, 0, 3)).toBeNull();
  });

  it('is null without a zone or noises', () => {
    expect(heardNoise(makeCtx(), 0, 0, 30)).toBeNull();
  });
});
