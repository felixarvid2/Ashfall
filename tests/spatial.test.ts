import { describe, expect, it } from 'vitest';
import { Collider, Dead, Transform } from '../src/core/components';
import { SpatialHash } from '../src/core/spatial';
import { World } from '../src/core/ecs';
import { makeTransform } from '../src/core/components';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { makeCtx } from './helpers';

function prop(world: World, x: number, z: number, radius = 1, isStatic = true) {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Collider, { radius, mass: isStatic ? Infinity : 1, layer: 'ground', isStatic });
  return e;
}

describe('SpatialHash layers', () => {
  it('reports a wide entity once however many cells the query and the entity cover', () => {
    const h = new SpatialHash(4);
    h.insertStatic(1, 0, 0, 9);
    h.insert(2, 3, 3, 7);
    const out = h.queryCircle(0, 0, 20);
    expect(out.sort()).toEqual([1, 2]);
    expect(h.queryCircle(30, 0, 10)).toEqual([]);
  });

  it('keeps statics across clearDynamic and drops them on removeStatic', () => {
    const h = new SpatialHash(4);
    h.insertStatic(1, 0, 0, 1);
    h.insert(2, 1, 0, 1);
    h.clearDynamic();
    expect(h.queryCircle(0, 0, 3)).toEqual([1]);
    h.removeStatic(1);
    expect(h.queryCircle(0, 0, 3)).toEqual([]);
    expect(h.staticCount).toBe(0);
  });

  it('hides statics the hide predicate names, without removing them', () => {
    const h = new SpatialHash(4);
    const dead = new Set<number>();
    h.isHidden = (e) => dead.has(e);
    h.insertStatic(1, 0, 0, 1);
    dead.add(1);
    expect(h.queryCircle(0, 0, 3)).toEqual([]);
    dead.delete(1);
    expect(h.queryCircle(0, 0, 3)).toEqual([1]);
  });

  it('re-indexes a static whose Transform moved or Collider radius changed', () => {
    const h = new SpatialHash(4);
    const tr = { x: 0, z: 0 };
    const col = { radius: 1 };
    h.insertStatic(1, tr.x, tr.z, col.radius, tr, col);
    tr.x = 40;
    h.refreshStatics();
    expect(h.queryCircle(0, 0, 3)).toEqual([]);
    expect(h.queryCircle(40, 0, 3)).toEqual([1]);
    col.radius = 6;
    h.refreshStatics();
    expect(h.queryCircle(34, 0, 1)).toEqual([1]);
  });
});

describe('static colliders in the spatial system', () => {
  it('picks up statics added later, hides them while Dead and drops them when destroyed', () => {
    const world = new World();
    const ctx = makeCtx();
    const first = prop(world, 5, 5);
    spatialSystem(world, 0, ctx);
    expect(ctx.spatial.queryCircle(5, 5, 2)).toEqual([first]);

    const crate = prop(world, 6, 5);
    spatialSystem(world, 0, ctx);
    expect(ctx.spatial.queryCircle(5, 5, 2).sort()).toEqual([first, crate]);

    world.add(crate, Dead, { at: 0 } as never);
    spatialSystem(world, 0, ctx);
    expect(ctx.spatial.queryCircle(5, 5, 2)).toEqual([first]);

    world.remove(crate, Dead); // a crystal regrowing
    spatialSystem(world, 0, ctx);
    expect(ctx.spatial.queryCircle(5, 5, 2).sort()).toEqual([first, crate]);

    world.destroy(crate);
    spatialSystem(world, 0, ctx);
    expect(ctx.spatial.queryCircle(5, 5, 2)).toEqual([first]);
  });

  it('waits for a static that gets its Transform after its Collider', () => {
    const world = new World();
    const ctx = makeCtx();
    const e = world.create();
    world.add(e, Collider, { radius: 1, mass: Infinity, layer: 'ground', isStatic: true });
    spatialSystem(world, 0, ctx);
    expect(ctx.spatial.queryCircle(0, 0, 5)).toEqual([]);
    world.add(e, Transform, makeTransform(1, 0, 1, 0));
    spatialSystem(world, 0, ctx);
    expect(ctx.spatial.queryCircle(0, 0, 5)).toEqual([e]);
  });

  it('moves a mover each tick, pushes it out of a static, and rebinds when the world changes', () => {
    const ctx = makeCtx();
    const world = new World();
    const wall = prop(world, 0, 0, 1);
    const mover = prop(world, 1, 0, 0.5, false);
    collisionSystem(world, 1 / 60, ctx);
    expect(world.req(mover, Transform).x).toBeCloseTo(1.5, 5);
    expect(world.req(wall, Transform).x).toBe(0);

    world.req(mover, Transform).x = 10;
    spatialSystem(world, 0, ctx);
    expect(ctx.spatial.queryCircle(10, 0, 0.1)).toEqual([mover]);

    const other = new World();
    const lone = prop(other, 3, 3);
    spatialSystem(other, 0, ctx);
    expect(ctx.spatial.queryCircle(0, 0, 50)).toEqual([lone]);
  });
});
