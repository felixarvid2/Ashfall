import { describe, expect, it } from 'vitest';
import { ANIM_MID, ANIM_NEAR, animInterval, nearestN, stepAnimClock } from '../src/render/lod';

describe('animation LOD (round 4 B01)', () => {
  it('near mixers run every frame, mid at 30 Hz, far at 15 Hz, off-screen never', () => {
    expect(animInterval(5 * 5, true)).toBe(0);
    expect(animInterval((ANIM_NEAR + 1) ** 2, true)).toBeCloseTo(1 / 30);
    expect(animInterval((ANIM_MID + 1) ** 2, true)).toBeCloseTo(1 / 15);
    expect(animInterval(1, false)).toBe(-1);
  });

  it('a throttled clock hands over the accumulated time, so total animation time is kept', () => {
    const clock = { acc: 0 };
    let applied = 0;
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      const d = stepAnimClock(clock, 1 / 60, 1 / 15);
      if (d > 0) steps++;
      applied += d;
    }
    expect(steps).toBeGreaterThanOrEqual(14);
    expect(steps).toBeLessThanOrEqual(16);
    expect(applied + clock.acc).toBeCloseTo(1, 5);
  });

  it('an off-screen clock holds its time (capped) and catches up when it returns', () => {
    const clock = { acc: 0 };
    for (let i = 0; i < 300; i++) expect(stepAnimClock(clock, 1 / 60, -1)).toBe(0);
    expect(clock.acc).toBe(1);
    expect(stepAnimClock(clock, 1 / 60, 0)).toBeCloseTo(1);
  });
});

describe('shadow LOD (round 4 B02)', () => {
  it('picks exactly the N nearest', () => {
    const ids = Array.from({ length: 100 }, (_, i) => i);
    const dist = ids.map((i) => ((i * 37) % 100) + 0.1 * i);
    const set = nearestN(ids, dist, 8, new Set<number>());
    expect(set.size).toBe(8);
    const sorted = [...ids].sort((a, b) => dist[a]! - dist[b]!).slice(0, 8);
    expect([...set].sort()).toEqual(sorted.sort());
  });
  it('takes everything when there are few', () => {
    expect(nearestN([1, 2], [5, 6], 8, new Set()).size).toBe(2);
  });
});
