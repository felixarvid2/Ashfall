// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakePostFx, FakeWebGLRenderer, gpu, installFakeCanvas } from './fakeGl';

vi.mock('../src/render/postfx', () => ({ PostFx: FakePostFx }));
vi.mock('three', async (orig) => ({ ...(await orig<typeof import('three')>()), WebGLRenderer: FakeWebGLRenderer }));

describe('harness', () => {
  beforeAll(() => installFakeCanvas());
  it('builds a zone', async () => {
    const { GameRenderer } = await import('../src/render/gameRenderer');
    const { ZONES } = await import('../src/data/zones');
    const r = new GameRenderer(document.createElement('canvas'));
    r.buildArena(ZONES[0]!);
    r.render(0.016, 0, 0, 0);
    console.log(gpu.counts);
    expect(gpu.counts.geometries).toBeGreaterThan(0);
  });
});
