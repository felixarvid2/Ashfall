import { describe, expect, it } from 'vitest';
import { BUILDS } from '../scripts/sim/builds';
import { simulate } from '../scripts/sim/sim';

describe('balance simulator', () => {
  it('runs every sample build and damage grows with level', () => {
    const results = BUILDS.map((b) => simulate(b, 10));
    for (const r of results) expect(r.dps).toBeGreaterThan(0);
    const first = results[0]!;
    const last = results[results.length - 1]!;
    expect(last.dps).toBeGreaterThan(first.dps * 5);
  });

  it('is deterministic for a seed', () => {
    const b = BUILDS[1]!;
    expect(simulate(b, 5, 'x').dps).toBe(simulate(b, 5, 'x').dps);
  });
});
