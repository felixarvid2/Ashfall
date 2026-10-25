import { describe, expect, it } from 'vitest';
import { holdThenRelease, type HoldEnv } from '../src/ui/feelUi';

/** A fake clock: timers fire in time order as `advance` moves it; frames arrive only when the test says (a slow renderer). */
function fakeEnv(msPerFrame: number) {
  let t = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const env: HoldEnv = {
    now: () => t,
    after: (ms, fn) => void timers.push({ at: t + ms, fn }),
    frames: (n, fn) => void timers.push({ at: t + n * msPerFrame, fn }),
  };
  const advance = async (to: number): Promise<void> => {
    for (;;) {
      await Promise.resolve();
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > to) break;
      timers.shift();
      t = Math.max(t, next.at);
      next.fn();
    }
    t = to;
  };
  return { env, advance, now: () => t };
}

/** Time at which the screen was released. */
async function releaseTime(msPerFrame: number, plan: { minBlackMs: number; frameCapMs: number; hardCapMs: number }, settledAt = 0, startedAt = 0): Promise<number> {
  const f = fakeEnv(msPerFrame);
  let released = -1;
  const settled = new Promise<void>((resolve) => f.env.after(settledAt, resolve));
  holdThenRelease(f.env, startedAt, { ...plan, settled }, () => (released = f.now()));
  await f.advance(20000);
  return released;
}

describe('black hold runs on real elapsed time (respawn and zone card)', () => {
  const respawn = { minBlackMs: 600, frameCapMs: 600, hardCapMs: 1000 };

  it('at 60 fps the screen lifts at the minimum hold', async () => {
    expect(await releaseTime(16, respawn)).toBe(600);
  });

  it('at 1 fps it no longer waits for two frames: the frame cap and the hard cap bound it', async () => {
    const at = await releaseTime(1000, respawn);
    expect(at).toBe(600);
    expect(at).toBeLessThanOrEqual(respawn.hardCapMs);
  });

  it('a respawn stays within 2.5 s in total (0.35 s fade out + hold + 0.3 s fade in) even if models never settle', async () => {
    const f = fakeEnv(1000);
    let released = -1;
    holdThenRelease(f.env, 0, { ...respawn, settled: new Promise(() => undefined) }, () => (released = f.now()));
    await f.advance(20000);
    expect(released).toBe(1000);
    expect(0.35 + released / 1000 + 0.3).toBeLessThanOrEqual(2.5);
  });

  it('the zone card holds at least 0.9 s from the start of the fade even when everything is instant', async () => {
    expect(await releaseTime(0, { minBlackMs: 900, frameCapMs: 600, hardCapMs: 9500 }, 0, 0)).toBe(900);
  });

  it('after a slow load the frame wait is capped at frameCapMs, not frames', async () => {
    // Settled 3 s in; frames would take 2 s at 1 fps, the cap says 600 ms.
    const at = await releaseTime(1000, { minBlackMs: 900, frameCapMs: 600, hardCapMs: 9500 }, 3000, 0);
    expect(at).toBe(3600);
  });

  it('releases once', async () => {
    const f = fakeEnv(10);
    let calls = 0;
    holdThenRelease(f.env, 0, { ...respawn, settled: Promise.resolve() }, () => calls++);
    await f.advance(5000);
    expect(calls).toBe(1);
  });
});
