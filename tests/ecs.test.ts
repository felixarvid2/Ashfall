import { describe, expect, it } from 'vitest';
import { Scheduler, World, defineComponent } from '../src/core/ecs';

const Pos = defineComponent<{ x: number }>('Pos');
const Vel = defineComponent<{ v: number }>('Vel');
const Tag = defineComponent<Record<string, never>>('Tag');

describe('World', () => {
  it('creates entities with unique ids and tracks components', () => {
    const w = new World();
    const a = w.create();
    const b = w.create();
    expect(a).not.toBe(b);
    w.add(a, Pos, { x: 1 });
    expect(w.get(a, Pos)).toEqual({ x: 1 });
    expect(w.has(b, Pos)).toBe(false);
    expect(() => w.req(b, Pos)).toThrow(/Pos/);
  });

  it('queries entities that have all listed components', () => {
    const w = new World();
    const a = w.create();
    const b = w.create();
    const c = w.create();
    w.add(a, Pos, { x: 0 });
    w.add(a, Vel, { v: 1 });
    w.add(b, Pos, { x: 0 });
    w.add(c, Vel, { v: 1 });
    expect(w.query(Pos, Vel)).toEqual([a]);
    expect(w.query(Pos).sort()).toEqual([a, b]);
    expect(w.query(Tag)).toEqual([]);
  });

  it('destroy removes all components; deferred destroy waits for flush', () => {
    const w = new World();
    const a = w.create();
    w.add(a, Pos, { x: 0 });
    w.destroyDeferred(a);
    expect(w.isAlive(a)).toBe(true);
    w.flushDestroyed();
    expect(w.isAlive(a)).toBe(false);
    expect(w.query(Pos)).toEqual([]);
    expect(() => w.add(a, Pos, { x: 1 })).toThrow();
  });
});

describe('Scheduler', () => {
  it('runs systems in registration order and flushes deferred destroys', () => {
    const w = new World();
    const e = w.create();
    w.add(e, Pos, { x: 0 });
    const order: string[] = [];
    const s = new Scheduler<null>()
      .add('a', () => order.push('a'))
      .add('b', (world) => {
        order.push('b');
        world.destroyDeferred(e);
      });
    s.tick(w, 1 / 60, null);
    expect(order).toEqual(['a', 'b']);
    expect(w.isAlive(e)).toBe(false);
  });
});
