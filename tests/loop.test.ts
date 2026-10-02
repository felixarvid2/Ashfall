import { describe, expect, it } from 'vitest';
import { GameLoop } from '../src/core/loop';

describe('GameLoop', () => {
  it('runs a fixed number of ticks regardless of frame timing', () => {
    let ticks = 0;
    const loop = new GameLoop({ update: () => ticks++, render: () => {} }, 60);
    // Exactly 1 second delivered as uneven frames.
    const frames = [5, 33, 16, 50, 7, 100, 16, 40, 3, 22];
    let total = frames.reduce((a, b) => a + b, 0);
    while (total + 16 <= 1000) {
      frames.push(16);
      total += 16;
    }
    frames.push(1000 - total);
    for (const ms of frames) loop.step(ms / 1000);
    expect(ticks).toBeGreaterThanOrEqual(59);
    expect(ticks).toBeLessThanOrEqual(61);
  });

  it('clamps huge frames to avoid a spiral of death', () => {
    let ticks = 0;
    const loop = new GameLoop({ update: () => ticks++, render: () => {} }, 60);
    loop.step(10);
    expect(ticks).toBe(15); // 0.25 s cap
  });

  it('passes interpolation alpha in [0, 1) and pauses with timeScale 0', () => {
    const alphas: number[] = [];
    let ticks = 0;
    const loop = new GameLoop({ update: () => ticks++, render: (a) => alphas.push(a) }, 60);
    loop.step(0.025);
    expect(alphas[0]).toBeGreaterThanOrEqual(0);
    expect(alphas[0]).toBeLessThan(1);
    loop.timeScale = 0;
    const before = ticks;
    loop.step(0.5);
    expect(ticks).toBe(before);
  });
});
