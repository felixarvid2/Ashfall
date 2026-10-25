/**
 * Small per-browser UI preferences (open panel sections, seen hints, sort mode, last slot).
 * localStorage throws in private mode or with blocked site data, so every access goes through here
 * instead of a try/catch at each call site. Game progress does not belong here: saves and the account
 * report their own write failures (src/core/save.ts, account.ts).
 */

/** The stored string, or null when it is missing or storage is blocked. */
export function getPref(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    // Storage blocked: a preference reads as unset.
    return null;
  }
}

/** Stores a string. Returns false when storage is blocked or full (the preference is then not remembered). */
export function setPref(key: string, value: string): boolean {
  try {
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    // Storage blocked or full: the preference is not kept.
    return false;
  }
}

/** True when localStorage cannot be read at all. */
export function prefsBlocked(): boolean {
  try {
    void globalThis.localStorage.length;
    return false;
  } catch {
    // Reading storage throws when it is blocked.
    return true;
  }
}

/** A JSON value, or `fallback` when it is missing, blocked or does not parse. */
export function getJsonPref<T>(key: string, fallback: T): T {
  const raw = getPref(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Not JSON (an old or hand-edited value): use the fallback.
    return fallback;
  }
}

export function setJsonPref(key: string, value: unknown): boolean {
  return setPref(key, JSON.stringify(value));
}
