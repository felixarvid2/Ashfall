import { beforeEach, describe, expect, it } from 'vitest';
import { LOG_KEEP, formatLog, installErrorLog, logEntries, logEntry, resetErrorLogForTests } from '../src/core/errorLog';

describe('error log (round 4 B18)', () => {
  beforeEach(() => resetErrorLogForTests());

  it('keeps the last 200 entries', () => {
    for (let i = 0; i < 250; i++) logEntry('warn', [`w${i}`], i);
    expect(logEntries()).toHaveLength(LOG_KEEP);
    expect(logEntries()[0]!.text).toBe('w50');
    expect(logEntries().at(-1)!.text).toBe('w249');
  });

  it('hooks console.warn and console.error and still calls the original', () => {
    const calls: unknown[][] = [];
    const fake = { warn: (...a: unknown[]) => calls.push(['warn', ...a]), error: (...a: unknown[]) => calls.push(['error', ...a]) };
    installErrorLog(fake);
    fake.warn('careful', { id: 3 });
    fake.error(new Error('boom'));
    expect(calls).toHaveLength(2);
    expect(logEntries().map((e) => e.level)).toEqual(['warn', 'error']);
    expect(logEntries()[0]!.text).toBe('careful {"id":3}');
    expect(logEntries()[1]!.text).toContain('boom');
    installErrorLog(fake); // twice is a no-op
    fake.warn('x');
    expect(logEntries()).toHaveLength(3);
  });

  it('records uncaught errors and rejections from a window', () => {
    const win = new EventTarget();
    installErrorLog({ warn() {}, error() {} }, win);
    win.dispatchEvent(Object.assign(new Event('error'), { message: 'bad', error: new Error('bad') }));
    win.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'nope' }));
    expect(logEntries().map((e) => e.text.split(' ')[0])).toEqual(['Uncaught:', 'Unhandled']);
  });

  it('formats a header and one line per entry, and cuts huge entries', () => {
    logEntry('error', ['x'.repeat(5000)], Date.UTC(2026, 0, 1, 12, 0, 0));
    const text = formatLog(logEntries(), { version: '1.2.3', userAgent: 'UA', now: Date.UTC(2026, 0, 2) });
    const lines = text.split('\n');
    expect(lines[0]).toBe('Ashfall 1.2.3 log, 2026-01-02T00:00:00.000Z');
    expect(lines[1]).toBe('Browser: UA');
    expect(lines.at(-1)).toMatch(/^12:00:00.000 ERROR x+\.\.\. \(cut\)$/);
    expect(lines.at(-1)!.length).toBeLessThan(2100);
  });
});
