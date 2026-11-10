import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLoop, capInterval } from '../src/core/loop';
import { SettingsSchema, defaultSettings, tabDefaults } from '../src/data/settings';

/** Drive GameLoop.frame by hand: a fake requestAnimationFrame fires at the display's refresh rate. */
function run(displayHz: number, maxFps: number, seconds: number) {
  let frames = 0;
  let ticks = 0;
  const loop = new GameLoop({ update: () => ticks++, render: () => frames++ }, 60, () => 0);
  loop.maxFps = maxFps;
  let pending: ((t: number) => void) | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => ((pending = cb), 1));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockReturnValue(0);
  loop.start();
  const step = 1000 / displayHz;
  for (let t = step, i = 0; t <= seconds * 1000 + 1e-6; t += step, i++) {
    // A little jitter, like a real compositor.
    const jitter = i % 2 === 0 ? 0.4 : -0.4;
    pending!(t + jitter);
  }
  loop.stop();
  return { frames, ticks };
}

describe('FPS limiter (round 4 B17)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [60, 30, 30],
    [120, 60, 60],
    [120, 30, 30],
    [60, 60, 60],
    [120, 120, 120],
  ])('a %i Hz display capped at %i draws about %i frames a second', (hz, cap, expected) => {
    const { frames } = run(hz, cap, 4);
    expect(frames / 4).toBeGreaterThan(expected * 0.93);
    expect(frames / 4).toBeLessThan(expected * 1.07);
  });

  it('no limit draws every display frame', () => {
    expect(run(120, 0, 2).frames).toBeGreaterThanOrEqual(238);
  });

  it('the simulation keeps its 60 Hz whatever the cap', () => {
    for (const cap of [0, 30, 60]) {
      const { ticks } = run(120, cap, 4);
      expect(ticks / 4).toBeGreaterThan(55);
      expect(ticks / 4).toBeLessThan(62);
    }
  });

  it('the cap interval leaves room for jitter', () => {
    expect(capInterval(60)).toBeLessThan(1000 / 60);
    expect(capInterval(60)).toBeGreaterThan(14);
  });
});

describe('fpsCap setting', () => {
  it('defaults to no limit, accepts the four steps and refuses others, and resets with the display tab', () => {
    expect(defaultSettings().fpsCap).toBe(0);
    for (const n of [0, 30, 60, 120]) expect(SettingsSchema.parse({ fpsCap: n }).fpsCap).toBe(n);
    expect(SettingsSchema.safeParse({ fpsCap: 45 }).success).toBe(false);
    expect(tabDefaults('display').fpsCap).toBe(0);
  });
});
