/**
 * C14: a quick perf-budget check for CI (`npm run perf:quick`). One zone, 300 ticks, 120 enemies; the best of
 * three runs so one noisy slice on a shared runner does not fail it. The numbers are about 6x what a laptop
 * measures (0.5 ms per tick), so only a real regression (an O(n^2) in a system, the static grid rebuilt per
 * tick) trips it. The full per-zone budgets stay in tests/perf.test.ts behind PERF=1. Skipped in a plain
 * `vitest run`, where tests share the CPU; CI runs it on its own.
 */
import { describe, expect, it } from 'vitest';
import { runTickBench } from '../scripts/perf/tick';

describe.skipIf(!process.env.PERF_QUICK)('quick perf budget (PERF_QUICK=1)', () => {
  it('Hydroponic Vaults, 120 enemies: whole tick under 3 ms, static colliders under 1 ms', () => {
    const runs = [0, 1, 2].map(() => runTickBench('hydroponic_vaults', { ticks: 300, warmup: 60 }));
    const best = runs.reduce((a, b) => (b.totalMs < a.totalMs ? b : a));
    console.log(`perf: best total ${best.totalMs.toFixed(3)} ms/tick over ${best.entities} entities`);
    expect(best.totalMs).toBeLessThan(3);
    expect(best.perSystem.spatial! + best.perSystem.collision!).toBeLessThan(1);
  }, 60000);
});
