/** Per-frame scratch objects for the enemy bars and minimap blips are reused (T017). */
import { describe, expect, it } from 'vitest';
import { FramePool, newBarInfo, setInfoAffixes } from '../src/ui/enemyBars';

describe('FramePool', () => {
  it('hands out the same objects every frame and builds more only when a frame needs more', () => {
    let built = 0;
    const pool = new FramePool(() => ({ n: ++built }));
    const first = [pool.next(), pool.next(), pool.next()];
    pool.reset();
    const second = [pool.next(), pool.next(), pool.next()];
    expect(second).toEqual(first);
    second.forEach((o, i) => expect(o).toBe(first[i]));
    expect(built).toBe(3);
    pool.reset();
    for (let i = 0; i < 4; i++) pool.next();
    expect(built).toBe(4);
    expect(pool.capacity).toBe(4);
  });

  it('a long run of frames allocates nothing after the first', () => {
    const pool = new FramePool(newBarInfo);
    for (let frame = 0; frame < 1000; frame++) {
      pool.reset();
      for (let i = 0; i < 40; i++) pool.next().id = i;
    }
    expect(pool.capacity).toBe(40);
  });
});

describe('setInfoAffixes', () => {
  const name = (id: string) => `Name ${id}`;

  it('keeps the list while the affixes stay the same and rebuilds it when they change', () => {
    const info = newBarInfo();
    setInfoAffixes(info, ['fast', 'burning'], name);
    const list = info.affixes;
    expect(list).toEqual([{ id: 'fast', name: 'Name fast' }, { id: 'burning', name: 'Name burning' }]);
    setInfoAffixes(info, ['fast', 'burning'], name);
    expect(info.affixes).toBe(list);
    setInfoAffixes(info, ['fast'], name);
    expect(info.affixes).not.toBe(list);
    expect(info.affixes).toEqual([{ id: 'fast', name: 'Name fast' }]);
  });
});
