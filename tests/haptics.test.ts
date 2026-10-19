import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buzz, haptic, hapticsSupported, setHaptics, setLowLife } from '../src/ui/haptics';

describe('haptics', () => {
  let epoch = 0;
  let vibrate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    setHaptics(true);
    // Move the clock past the previous test's throttle window (the fake clock restarts at zero each time).
    vi.advanceTimersByTime(10_000_000 * ++epoch);
  });
  afterEach(() => {
    setLowLife(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('plays the pattern of the moment', () => {
    haptic('potion');
    expect(vibrate).toHaveBeenCalledWith([10, 30, 10]);
    expect(hapticsSupported()).toBe(true);
  });

  it('does nothing when the setting is off or the browser cannot vibrate', () => {
    setHaptics(false);
    haptic('hit');
    expect(vibrate).not.toHaveBeenCalledWith(12);
    setHaptics(true);
    vi.stubGlobal('navigator', {});
    haptic('hit');
    expect(hapticsSupported()).toBe(false);
  });

  it('throttles bursts but always lets death and level up through', () => {
    haptic('hit');
    haptic('hit');
    haptic('tap');
    expect(vibrate).toHaveBeenCalledTimes(1);
    haptic('death');
    expect(vibrate).toHaveBeenLastCalledWith([60, 40, 120]);
    expect(vibrate).toHaveBeenCalledTimes(2);
    buzz(5);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('beats like a heart every 1.6 s while life is low, and stops', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    setLowLife(true);
    vi.advanceTimersByTime(1600);
    expect(vibrate).toHaveBeenCalledWith([30, 70, 30]);
    vibrate.mockClear();
    setLowLife(false);
    vi.advanceTimersByTime(5000);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('stays quiet for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    setLowLife(true);
    vi.advanceTimersByTime(5000);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
