import { describe, expect, it } from 'vitest';
import { GraphicsProbe, MIN_FRAMES, PROBE_SECONDS, PROBE_WARMUP, chooseGraphics, frameStats } from '../src/render/autoGraphics';

const steady = (ms: number, n = 120) => frameStats(Array.from({ length: n }, () => ms));

describe('graphics auto-detect (round 4 B16)', () => {
  it('computes median and p90', () => {
    const s = frameStats([10, 10, 10, 10, 10, 10, 10, 10, 10, 100]);
    expect(s.frames).toBe(10);
    expect(s.median).toBe(10);
    expect(s.p90).toBe(100);
    expect(frameStats([])).toEqual({ frames: 0, median: 0, p90: 0 });
  });

  it('keeps a device that holds 60 or 120 fps where it started', () => {
    expect(chooseGraphics('high', steady(16.7))).toBe('high');
    expect(chooseGraphics('high', steady(8.3))).toBe('high');
    expect(chooseGraphics('medium', steady(16.7))).toBe('medium');
  });

  it('steps down one preset for a device around 45 fps, to low for one under 36', () => {
    expect(chooseGraphics('high', steady(22))).toBe('medium');
    expect(chooseGraphics('medium', steady(22))).toBe('low');
    expect(chooseGraphics('high', steady(33))).toBe('low');
    expect(chooseGraphics('medium', steady(40))).toBe('low');
  });

  it('a bad 90th percentile alone steps down, a single hitch does not', () => {
    expect(chooseGraphics('high', { frames: 100, median: 16.7, p90: 70 })).toBe('medium');
    const oneHitch = frameStats([...Array.from({ length: 99 }, () => 16.7), 300]);
    expect(chooseGraphics('high', oneHitch)).toBe('high');
  });

  it('never steps up and never goes below low', () => {
    expect(chooseGraphics('low', steady(8))).toBe('low');
    expect(chooseGraphics('low', steady(50))).toBe('low');
    expect(chooseGraphics('medium', steady(5))).toBe('medium');
  });

  it('gives no verdict on too few frames', () => {
    expect(chooseGraphics('high', steady(60, MIN_FRAMES - 1))).toBe('high');
  });

  it('the probe skips the warm-up, ignores stalls and reports once after two seconds', () => {
    const results: string[] = [];
    const probe = new GraphicsProbe('high', (choice) => results.push(choice));
    // A slow warm-up (shader compiles) must not count.
    for (let t = 0; t < PROBE_WARMUP; t += 0.1) probe.frame(0.1);
    expect(probe.active).toBe(true);
    probe.frame(5); // a tab switch
    for (let t = 0; t < PROBE_SECONDS; t += 0.016) probe.frame(0.016);
    expect(results).toEqual(['high']);
    expect(probe.active).toBe(false);
    probe.frame(0.2);
    expect(results).toHaveLength(1);
  });

  it('a slow device steps down through the probe; cancel gives no answer', () => {
    const slow: string[] = [];
    const p = new GraphicsProbe('high', (c) => slow.push(c));
    for (let i = 0; i < 400; i++) p.frame(0.035);
    expect(slow).toEqual(['low']);
    const none: string[] = [];
    const c = new GraphicsProbe('high', (x) => none.push(x));
    c.cancel();
    for (let i = 0; i < 400; i++) c.frame(0.035);
    expect(none).toEqual([]);
  });
});
