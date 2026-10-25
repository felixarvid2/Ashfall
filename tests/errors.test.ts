import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorTracker, classifyStartupError, installGlobalErrorHandlers, watchContextLoss } from '../src/core/errors';
import { GameLoop } from '../src/core/loop';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('watchContextLoss', () => {
  it('prevents the default, calls onLost once and lets the loop stop', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const canvas = new EventTarget();
    const loop = new GameLoop({ update: () => {}, render: () => {} });
    loop.start();
    expect(loop.isRunning).toBe(true);
    let lost = 0;
    watchContextLoss(canvas, { onLost: () => { lost++; loop.stop(); }, onRestored: () => {} });
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(event.defaultPrevented).toBe(true);
    expect(lost).toBe(1);
    expect(loop.isRunning).toBe(false);
  });

  it('calls onRestored only after a loss, and cancels the give-up timer', () => {
    vi.useFakeTimers();
    const canvas = new EventTarget();
    const calls: string[] = [];
    watchContextLoss(canvas, { onLost: () => calls.push('lost'), onRestored: () => calls.push('restored'), onGiveUp: () => calls.push('giveup') }, 1000);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(calls).toEqual([]);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual(['lost', 'restored']);
  });

  it('gives up when the context is not restored in time', () => {
    vi.useFakeTimers();
    const canvas = new EventTarget();
    const calls: string[] = [];
    watchContextLoss(canvas, { onLost: () => calls.push('lost'), onRestored: () => {}, onGiveUp: () => calls.push('giveup') }, 1000);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    vi.advanceTimersByTime(1001);
    expect(calls).toEqual(['lost', 'giveup']);
  });

  it('removes its listeners', () => {
    const canvas = new EventTarget();
    let lost = 0;
    const stop = watchContextLoss(canvas, { onLost: () => lost++, onRestored: () => {} });
    stop();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(lost).toBe(0);
  });
});

describe('global error handlers', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('saves once on the first error and is fatal only for a storm or out-of-memory', () => {
    const spy = quiet();
    let t = 0;
    const win = new EventTarget();
    const saved: number[] = [];
    const fatal: unknown[] = [];
    installGlobalErrorHandlers(win, { onFirstError: () => saved.push(1), onFatal: (e) => fatal.push(e) }, new ErrorTracker(3, 2000, () => t));
    const fire = (type: string, init: object): void => {
      win.dispatchEvent(Object.assign(new Event(type), init));
    };
    fire('error', { error: new Error('one') });
    t += 100;
    fire('unhandledrejection', { reason: new Error('two') });
    expect(saved).toHaveLength(1);
    expect(fatal).toHaveLength(0);
    t += 100;
    fire('error', { error: new Error('three') });
    expect(fatal).toHaveLength(1);
    // Far later, one error is not fatal again, but out of memory always is.
    t += 60_000;
    fire('error', { error: new Error('lone') });
    expect(fatal).toHaveLength(1);
    fire('error', { error: new RangeError('Array buffer allocation failed') });
    expect(fatal).toHaveLength(2);
    expect(saved).toHaveLength(1);
    spy.mockRestore();
  });

  it('still reports when the last-chance save throws', () => {
    const spy = quiet();
    const win = new EventTarget();
    const fatal: unknown[] = [];
    installGlobalErrorHandlers(win, { onFirstError: () => { throw new Error('save failed'); }, onFatal: (e) => fatal.push(e) });
    win.dispatchEvent(Object.assign(new Event('error'), { error: new Error('out of memory') }));
    expect(fatal).toHaveLength(1);
    spy.mockRestore();
  });
});

describe('classifyStartupError', () => {
  it('recognises a missing WebGL context', () => {
    expect(classifyStartupError(new Error('Error creating WebGL context.'))).toBe('webgl');
    expect(classifyStartupError(new Error('Missing #game canvas'))).toBe('startup');
    expect(classifyStartupError('boom')).toBe('startup');
  });
});
