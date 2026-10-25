import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJsonPref, getPref, prefsBlocked, setJsonPref, setPref } from '../src/core/localPrefs';
import { MemoryStorage } from './fixtures/memoryStorage';

afterEach(() => vi.unstubAllGlobals());

describe('localPrefs', () => {
  it('stores and reads strings and JSON', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    expect(getPref('k')).toBeNull();
    expect(setPref('k', 'v')).toBe(true);
    expect(getPref('k')).toBe('v');
    expect(setJsonPref('j', { a: [1, 2] })).toBe(true);
    expect(getJsonPref('j', null)).toEqual({ a: [1, 2] });
    expect(prefsBlocked()).toBe(false);
  });

  it('falls back instead of throwing on bad JSON, a full storage or blocked access', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    storage.setItem('bad', '{nope');
    expect(getJsonPref('bad', 'fallback')).toBe('fallback');
    storage.failWith = 'QuotaExceededError';
    expect(setPref('k', 'v')).toBe(false);

    const blocked = {
      get length(): number {
        throw new DOMException('denied', 'SecurityError');
      },
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    vi.stubGlobal('localStorage', blocked);
    expect(getPref('k')).toBeNull();
    expect(setPref('k', 'v')).toBe(false);
    expect(prefsBlocked()).toBe(true);
  });
});
