import { describe, expect, it } from 'vitest';
import { GroundGold, GroundItem, Inventory, Transform, makeTransform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { generateCrystal, generateItem } from '../src/systems/loot/generate';
import { MAGNET_RADIUS, magnetStep } from '../src/systems/loot/magnet';
import { pickupSystem } from '../src/systems/loot/rewards';
import { spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

const setup = () => {
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, ctx, player };
};
const dropGold = (world: World, x: number, amount = 25, age = 1) => {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, 0));
  world.add(e, GroundGold, { amount, age });
  return e;
};
const dropItem = (world: World, x: number, crystal: boolean) => {
  const rng = new Rng('magnet');
  const item = crystal ? generateCrystal(rng, 100, 'u-c') : generateItem(rng, { itemPower: 100, classId: 'bastion', uid: 'u-g', rarity: 'rare' });
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, 0));
  world.add(e, GroundItem, { item, age: 1 });
  return e;
};

describe('loot magnet (F020)', () => {
  it('gold inside 2.5 m flies to the hero and is picked up; gold outside stays put', () => {
    const { world, ctx, player } = setup();
    const near = dropGold(world, MAGNET_RADIUS - 0.1);
    const far = dropGold(world, MAGNET_RADIUS + 1);
    run(world, ctx, [pickupSystem], 1);
    // One tick: it moved toward the hero but is not there yet.
    expect(world.get(near, GroundGold)).toBeDefined();
    expect(world.req(near, Transform).x).toBeLessThan(MAGNET_RADIUS - 0.1);
    run(world, ctx, [pickupSystem], 60);
    expect(world.query(GroundGold)).toEqual([far]);
    expect(world.req(player, Inventory).gold).toBe(25);
    expect(world.req(far, Transform).x).toBe(MAGNET_RADIUS + 1);
  });

  it('crystals fly in and enter the backpack; gear on the ground is left alone', () => {
    const { world, ctx, player } = setup();
    const crystal = dropItem(world, 2, true);
    const gear = dropItem(world, 2, false);
    run(world, ctx, [pickupSystem], 60);
    expect(world.query(GroundItem)).toEqual([gear]);
    expect(world.req(gear, Transform).x).toBe(2);
    expect(world.req(player, Inventory).grid.filter((c) => c?.crystal)).toHaveLength(1);
    expect(world.get(crystal, GroundItem)).toBeUndefined();
  });

  it('crystals stay on the ground when the backpack is full, without a notice every tick', () => {
    const { world, ctx, player } = setup();
    const inv = world.req(player, Inventory);
    inv.grid.fill(generateItem(new Rng('f'), { itemPower: 50, classId: 'bastion', uid: 'f' }));
    const crystal = dropItem(world, 2, true);
    run(world, ctx, [pickupSystem], 30);
    expect(world.get(crystal, GroundItem)).toBeDefined();
    expect(world.req(crystal, Transform).x).toBe(2);
    expect(ctx.events.peek().filter((e) => e.type === 'notice')).toHaveLength(0);
  });

  it('does not grab drops that are still popping out (age under 0.4 s)', () => {
    const { world, ctx } = setup();
    const e = dropGold(world, 2, 10, 0);
    run(world, ctx, [pickupSystem], 3);
    expect(world.req(e, Transform).x).toBe(2);
  });

  it('flies faster the longer it goes and never overshoots', () => {
    expect(magnetStep(2, 0, 0.1)).toBeCloseTo(2 - 0.8, 6);
    expect(2 - magnetStep(2, 0.5, 0.1)).toBeGreaterThan(2 - magnetStep(2, 0, 0.1));
    expect(magnetStep(0.1, 1, 1)).toBe(0);
  });
});
