import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng('ashfall');
    const b = new Rng('ashfall');
    for (let i = 0; i < 1000; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng('seed-a');
    const b = new Rng('seed-b');
    const same = Array.from({ length: 50 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBeLessThan(2);
  });

  it('keeps int() within inclusive bounds and hits both ends', () => {
    const rng = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('keeps next() in [0, 1)', () => {
    const rng = new Rng('range');
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('resumes exactly from a saved state', () => {
    const rng = new Rng('resume');
    for (let i = 0; i < 37; i++) rng.next();
    const state = rng.getState();
    const expected = Array.from({ length: 20 }, () => rng.next());
    const restored = new Rng('anything');
    restored.setState(state);
    expect(Array.from({ length: 20 }, () => restored.next())).toEqual(expected);
  });

  it('fork() gives stable, independent streams', () => {
    const root = new Rng('world');
    const loot1 = root.fork('loot');
    root.next(); // consuming the parent must not affect a fork
    const loot2 = new Rng('world').fork('loot');
    expect(loot1.next()).toBe(loot2.next());
    expect(new Rng('world').fork('loot').next()).not.toBe(new Rng('world').fork('dungeon').next());
  });

  it('weighted() respects weights and never picks zero-weight items', () => {
    const rng = new Rng('weights');
    const counts = { common: 0, rare: 0, never: 0 };
    for (let i = 0; i < 20000; i++) {
      const pick = rng.weighted([
        { item: 'common' as const, weight: 9 },
        { item: 'rare' as const, weight: 1 },
        { item: 'never' as const, weight: 0 },
      ]);
      counts[pick]++;
    }
    expect(counts.never).toBe(0);
    expect(counts.common / 20000).toBeCloseTo(0.9, 1);
  });

  it('weighted() throws when no weight is positive', () => {
    expect(() => new Rng(1).weighted([{ item: 'x', weight: 0 }])).toThrow();
  });
});
