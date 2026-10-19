/**
 * Haptic feedback for touch play (navigator.vibrate where the browser supports it). Callers name the
 * moment; the patterns and the on/off setting live here.
 */
export type HapticKind = 'tap' | 'hit' | 'hurt' | 'levelUp' | 'loot' | 'death' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  hit: 12,
  hurt: [20, 30, 20],
  levelUp: [30, 40, 60],
  loot: 15,
  death: [80, 60, 120],
  error: [10, 40, 10],
};

let enabled = true;

/** Turns haptics on or off (the settings panel calls this). */
export function setHaptics(on: boolean): void {
  enabled = on;
}

/** Plays a short vibration for the moment, if supported and enabled. */
export function haptic(kind: HapticKind): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Some browsers throw when vibration isn't allowed yet (no user gesture); ignore.
  }
}
