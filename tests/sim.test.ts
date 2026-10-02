import { describe, expect, it } from 'vitest';
import { BUILDS } from '../scripts/sim/builds';
import { simulate } from '../scripts/sim/sim';

describe('balance simulator', () => {
  it('runs every sample build and damage grows with level', () => {
    const results = BUILDS.map((b) => simulate(b, 10));
    for (const r of results) expect(r.dps).toBeGreaterThan(0);
    const level1 = results.filter((_, i) => BUILDS[i]!.level === 1);
    const level30 = results.filter((_, i) => BUILDS[i]!.level === 30);
    const maxL1 = Math.max(...level1.map((r) => r.dps));
    expect(Math.min(...level30.map((r) => r.dps))).toBeGreaterThan(maxL1 * 5);
  });

  it('is deterministic for a seed', () => {
    const b = BUILDS[1]!;
    expect(simulate(b, 5, 'x').dps).toBe(simulate(b, 5, 'x').dps);
  });
});
