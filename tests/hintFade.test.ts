import { describe, expect, it } from 'vitest';
import { HintFade, HINT_FADE_AFTER, MAX_FADE_STEP, TITLE_FADE_AFTER } from '../src/ui/hintFade';

/** Advance `secs` of real time in half-second frames (one step is capped at MAX_FADE_STEP). */
function run(f: HintFade, secs: number, dead = false): void {
  for (let t = 0; t < secs - 1e-9; t += 0.5) f.step(Math.min(0.5, secs - t), dead, false);
}

describe('HUD title and hint fade (A019)', () => {
  it('fades the title after 8 s of play and the hints after 20 s', () => {
    const f = new HintFade();
    run(f, TITLE_FADE_AFTER - 0.5);
    expect(f.titleFaded).toBe(false);
    run(f, 1);
    expect(f.titleFaded).toBe(true);
    expect(f.hintFaded).toBe(false);
    run(f, HINT_FADE_AFTER - TITLE_FADE_AFTER - 1.4);
    expect(f.hintFaded).toBe(false);
    run(f, 1);
    expect(f.hintFaded).toBe(true);
  });

  it('fades the hints at the first skill use and reports it once', () => {
    const f = new HintFade();
    expect(f.step(0.1, false, true)).toBe(true);
    expect(f.hintFaded).toBe(true);
    expect(f.step(0.1, false, true)).toBe(false);
  });

  it('does not count time spent dead', () => {
    const f = new HintFade();
    run(f, 8, true);
    expect(f.playTime).toBe(0);
    expect(f.titleFaded).toBe(false);
  });

  it('starts faded when the hints were seen before, and F1 / ? bring them back for 12 s', () => {
    const f = new HintFade(true);
    expect(f.hintFaded).toBe(true);
    f.recall();
    expect(f.hintFaded).toBe(false);
    run(f, 11);
    expect(f.hintFaded).toBe(false);
    run(f, 1.5);
    expect(f.hintFaded).toBe(true);
  });

  it('runs on real time: slow frames still fade within 20 s of wall clock', () => {
    // 2 fps for 25 s of wall time, each step the real 0.5 s.
    const f = new HintFade();
    for (let i = 0; i < 50; i++) f.step(0.5, false, false);
    expect(f.hintFaded).toBe(true);
  });

  it('caps a single huge step (hidden tab)', () => {
    const f = new HintFade();
    f.step(600, false, false);
    expect(f.playTime).toBe(MAX_FADE_STEP);
  });
});
