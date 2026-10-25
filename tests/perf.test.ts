/**
 * Simulation tick cost guard (docs/improvements/tech.md T001/T019). The timing checks only run with
 * `PERF=1 npx vitest run tests/perf.test.ts`: wall-clock budgets are too noisy for the default run.
 */
import { describe, expect, it } from 'vitest';
import { openZoneIds, runTickBench } from '../scripts/perf/tick';

describe('tick harness', () => {
  it('runs a short bench and reports every system', () => {
    const r = runTickBench('deep_mines', { enemies: 6, ticks: 5, warmup: 2 });
    expect(Object.keys(r.perSystem)).toEqual(['spatial', 'skills', 'navigation', 'enemyAI', 'status', 'movement', 'collision', 'projectiles', 'death']);
    expect(r.entities).toBeGreaterThan(6);
    expect(r.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('names the valid zones when given a bad one', () => {
    expect(() => runTickBench('nowhere')).toThrow(/hydroponic_vaults/);
    expect(openZoneIds()).toContain('hydroponic_vaults');
  });
});

describe.skipIf(!process.env.PERF)('tick budget (PERF=1)', () => {
  it('Hydroponic Vaults with 120 enemies: whole tick under 6 ms, static colliders nearly free', () => {
    const r = runTickBench('hydroponic_vaults');
    console.log(JSON.stringify(r));
    expect(r.totalMs).toBeLessThan(6);
    // Before the persistent static grid these two cost 7.3 ms together (T001).
    expect(r.perSystem.spatial! + r.perSystem.collision!).toBeLessThan(1.5);
  });

  for (const zone of openZoneIds()) {
    it(`${zone}: whole tick under 6 ms`, () => {
      expect(runTickBench(zone, { ticks: 300 }).totalMs).toBeLessThan(6);
    });
  }
});
