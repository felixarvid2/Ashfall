// @vitest-environment happy-dom
/**
 * B03: crowd perf budget. One zone, 100 enemies around the first hub: the simulation tick plus the renderer's per-frame
 * prep (`GameRenderer.sync` and `render` against a GL-less renderer, tests/fakeGl.ts) must stay inside a CPU budget.
 * The timing checks run with PERF_QUICK=1 (`npm run perf:quick`): wall-clock budgets are too noisy for a busy
 * `vitest run`. The budgets are about 5x a laptop's numbers, so only a real regression trips them.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PlayerControlled, Transform } from '../src/core/components';
import { ZONES } from '../src/data/zones';
import { runTickBench } from '../scripts/perf/tick';
import { gpu, installFakeCanvas } from './fakeGl';

// The factories import the stand-ins themselves: a top-level binding is not ready yet when `three` is first imported.
vi.mock('../src/render/postfx', async () => ({ PostFx: (await import('./fakeGl')).FakePostFx }));
vi.mock('three', async (orig) => ({ ...(await orig<typeof import('three')>()), WebGLRenderer: (await import('./fakeGl')).FakeWebGLRenderer }));

async function crowdRun(zoneName: string, enemies: number, ticks: number) {
  gpu.enabled = false;
  const { GameRenderer } = await import('../src/render/gameRenderer');
  const renderer = new GameRenderer(document.createElement('canvas'));
  renderer.buildArena(ZONES.find((z) => z.id === `zone.${zoneName}`)!);
  const result = runTickBench(zoneName, {
    enemies,
    ticks,
    warmup: 60,
    frame: (world) => {
      const [p] = world.query(PlayerControlled, Transform);
      const tr = world.req(p!, Transform);
      renderer.sync(world, 0.5, 1 / 60);
      renderer.render(1 / 60, tr.x, 0, tr.z);
    },
  });
  return { result, renderer };
}

describe('crowd render prep', () => {
  beforeAll(() => installFakeCanvas());

  it('draws 100 enemies and caps the real shadows at the nearest few (B02)', async () => {
    const { result, renderer } = await crowdRun('hydroponic_vaults', 100, 20);
    expect(result.frameMs).toBeGreaterThan(0);
    expect(renderer.lodStats.shadowCasters).toBeGreaterThan(0);
    expect(renderer.lodStats.shadowCasters).toBeLessThanOrEqual(10);
  }, 60000);
});

describe.skipIf(!process.env.PERF_QUICK)('crowd budget (PERF_QUICK=1)', () => {
  beforeAll(() => installFakeCanvas());

  it('Hydroponic Vaults, 100 enemies: sim tick under 3 ms and render prep under 4 ms per frame', async () => {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push((await crowdRun('hydroponic_vaults', 100, 240)).result);
    const best = runs.reduce((a, b) => (b.totalMs + b.frameMs < a.totalMs + a.frameMs ? b : a));
    console.log(`crowd: sim ${best.totalMs.toFixed(3)} ms/tick, render prep ${best.frameMs.toFixed(3)} ms/frame (${best.entities} entities)`);
    expect(best.totalMs).toBeLessThan(3);
    expect(best.frameMs).toBeLessThan(4);
  }, 120000);
});
