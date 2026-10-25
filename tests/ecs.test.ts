import { describe, expect, it } from 'vitest';
import { Scheduler, World, defineComponent, type Entity } from '../src/core/ecs';

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

describe('World queryInto / forEach / first / watch', () => {
  function populated(n = 40) {
    const w = new World();
    const ids: Entity[] = [];
    for (let i = 0; i < n; i++) {
      const e = w.create();
      ids.push(e);
      w.add(e, Pos, { x: i });
      if (i % 2 === 0) w.add(e, Vel, { v: i });
      if (i % 5 === 0) w.add(e, Tag, {});
    }
    return { w, ids };
  }

  it('queryInto matches query for 0 to 4 types, clears and reuses the array', () => {
    const { w } = populated();
    const out: Entity[] = [999];
    for (const types of [[], [Pos], [Pos, Vel], [Vel, Tag, Pos], [Pos, Vel, Tag, Vel]]) {
      expect(w.queryInto(out, ...types)).toBe(out);
      expect(out).toEqual(w.query(...types));
    }
    expect(w.queryInto(out, Pos, defineComponent('Never'))).toEqual([]);
    expect(out).toEqual([]);
  });

  it('forEach visits the same entities as query, in the same order', () => {
    const { w } = populated();
    for (const types of [[], [Pos], [Pos, Vel], [Vel, Tag, Pos]]) {
      const seen: Entity[] = [];
      w.forEach(types, (e) => seen.push(e));
      expect(seen).toEqual(w.query(...types));
    }
  });

  it('a query snapshot survives destroying and adding entities mid-loop; forEach skips destroyed ones', () => {
    const { w, ids } = populated(10);
    const snap = w.query(Pos);
    const visited: Entity[] = [];
    for (const e of snap) {
      visited.push(e);
      w.destroy(e + 1 <= ids[ids.length - 1]! ? e + 1 : e);
      const n = w.create();
      w.add(n, Pos, { x: -1 });
    }
    expect(visited).toEqual(snap);

    const { w: w2 } = populated(10);
    const seen: Entity[] = [];
    w2.forEach([Pos], (e) => {
      seen.push(e);
      w2.destroy(e + 1);
    });
    expect(seen).toEqual([1, 3, 5, 7, 9]);
    const out: Entity[] = [];
    w2.queryInto(out, Pos);
    for (const _e of out) w2.add(w2.create(), Pos, { x: 0 });
    expect(out.length).toBe(5);
  });

  it('first returns the first match without a full scan, or undefined', () => {
    const { w, ids } = populated();
    expect(w.first(Tag)).toBe(ids[0]);
    expect(w.first(Vel, Tag, Pos)).toBe(ids[0]);
    w.destroy(ids[0]!);
    expect(w.first(Tag)).toBe(ids[5]);
    expect(w.first(defineComponent('Never'))).toBeUndefined();
    expect(w.first()).toBe(ids[1]);
  });

  it('watchers hear adds (including replacements), remove() and destroy(), until unwatched', () => {
    const w = new World();
    const log: string[] = [];
    const off = w.watch(Vel, { added: (e, d) => log.push(`+${e}:${d.v}`), removed: (e) => log.push(`-${e}`) });
    const a = w.create();
    w.add(a, Pos, { x: 0 });
    w.add(a, Vel, { v: 1 });
    w.add(a, Vel, { v: 2 });
    w.remove(a, Vel);
    w.remove(a, Vel); // already gone: silent
    w.add(a, Vel, { v: 3 });
    w.destroy(a);
    off();
    const b = w.create();
    w.add(b, Vel, { v: 4 });
    expect(log).toEqual([`+${a}:1`, `+${a}:2`, `-${a}`, `+${a}:3`, `-${a}`]);
  });

  it('profiles systems only when asked', () => {
    const w = new World();
    const s = new Scheduler<null>().add('a', () => {}).add('b', () => {});
    s.tick(w, 1 / 60, null);
    expect(s.times.get('a')).toBe(0);
    s.profile = true;
    s.tick(w, 1 / 60, null);
    expect(s.times.get('a')!).toBeGreaterThanOrEqual(0);
    expect([...s.times.keys()]).toEqual(['a', 'b']);
    s.resetTimes();
    expect(s.times.get('b')).toBe(0);
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
