import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../src/core/loop';

describe('GameLoop', () => {
  it('runs a fixed number of ticks regardless of frame timing', () => {
    let ticks = 0;
    const loop = new GameLoop({ update: () => ticks++, render: () => {} }, 60);
    // Exactly 1 second delivered as uneven frames.
    const frames = [5, 33, 16, 50, 7, 80, 16, 40, 3, 22]; // no frame longer than 5 ticks (a longer one drops time)
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
    expect(ticks).toBe(5); // 0.25 s frame cap, then at most 5 ticks per frame
  });

  it('caps catch-up at 5 ticks per frame and drops the backlog', () => {
    let ticks = 0;
    const alphas: number[] = [];
    const loop = new GameLoop({ update: () => ticks++, render: (a) => alphas.push(a) }, 60);
    loop.step(0.25);
    expect(ticks).toBe(5);
    expect(alphas[0]).toBeGreaterThanOrEqual(0);
    expect(alphas[0]).toBeLessThan(1);
    expect(loop.slowFrames).toBe(1);
    expect(loop.droppedTicks).toBe(10);
    // The next normal frame is a normal frame, not a payback of the dropped time.
    loop.step(1 / 60);
    expect(ticks).toBe(6);
    expect(loop.slowFrames).toBe(1);
  });

  it('stops catching up once the ticks of a frame use their wall-time budget', () => {
    let clock = 0;
    let ticks = 0;
    const loop = new GameLoop(
      {
        update: () => {
          ticks++;
          clock += 20; // a 20 ms tick: a phone in a busy zone
        },
        render: () => {},
      },
      60,
      () => clock,
    );
    loop.step(0.25);
    expect(ticks).toBe(1);
    // Nothing is carried over, so the next frame is not even further behind.
    loop.step(2 / 60);
    expect(ticks).toBe(2);
  });

  it('keeps every tick of a normal frame when updates are cheap', () => {
    let clock = 0;
    let ticks = 0;
    const loop = new GameLoop({ update: () => { ticks++; clock += 0.5; }, render: () => {} }, 60, () => clock);
    loop.step(4 / 60 + 1e-9);
    expect(ticks).toBe(4);
    expect(loop.slowFrames).toBe(0);
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

describe('GameLoop guard', () => {
  afterEach(() => vi.unstubAllGlobals());

  const guarded = (update: () => void, maxErrors = 5) => {
    let t = 0;
    const seen: unknown[] = [];
    const fatal: unknown[] = [];
    const renders: number[] = [];
    const loop = new GameLoop({ update, render: () => renders.push(1) }, 60);
    loop.guard = { onError: (e) => seen.push(e), onFatal: (e) => fatal.push(e), maxErrors, now: () => t };
    return { loop, seen, fatal, renders, advance: (ms: number) => (t += ms) };
  };

  it('lets exceptions propagate when no guard is set', () => {
    const loop = new GameLoop({ update: () => { throw new Error('boom'); }, render: () => {} }, 60);
    expect(() => loop.step(1 / 60)).toThrow('boom');
  });

  it('reports a throwing update, keeps going, and trips after five in a window', () => {
    const { loop, seen, fatal, advance } = guarded(() => { throw new Error('tick'); });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    for (let i = 0; i < 4; i++) {
      loop.step(1 / 60);
      advance(100);
    }
    expect(seen).toHaveLength(4);
    expect(fatal).toHaveLength(0);
    loop.step(1 / 60);
    expect(seen).toHaveLength(5);
    expect(fatal).toHaveLength(1);
  });

  it('does not trip when the errors are spread out', () => {
    const { loop, fatal, advance } = guarded(() => { throw new Error('rare'); });
    for (let i = 0; i < 10; i++) {
      loop.step(1 / 60);
      advance(600);
    }
    expect(fatal).toHaveLength(0);
  });

  it('still renders after a failed tick is skipped only when the update succeeded', () => {
    let fail = true;
    const { loop, renders } = guarded(() => { if (fail) throw new Error('once'); });
    loop.step(1 / 60);
    expect(renders).toHaveLength(0);
    fail = false;
    loop.step(1 / 60);
    expect(renders).toHaveLength(1);
  });
});
