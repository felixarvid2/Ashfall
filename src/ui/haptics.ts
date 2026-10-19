/**
 * Haptic feedback for touch play (navigator.vibrate where the browser supports it; iOS Safari does not).
 *
 * Usage: `haptic('hit')` at the moment something happens. Patterns, throttling and the on/off setting
 * (`Settings.haptics`, wired by the settings panel through `setHaptics`) live here, so callers only name the
 * moment. `setLowLife(true/false)` runs the low-life heartbeat by itself.
 */
export type HapticKind =
  | 'tap'
  | 'tick'
  | 'select'
  | 'hit'
  | 'bigHit'
  | 'hurt'
  | 'dodge'
  | 'potion'
  | 'overheat'
  | 'levelUp'
  | 'quest'
  | 'boss'
  | 'legendary'
  | 'loot'
  | 'success'
  | 'death'
  | 'error'
  | 'longPress'
  | 'heartbeat';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  tick: 10,
  select: 12,
  hit: 12,
  bigHit: 14,
  hurt: [20, 30, 20],
  dodge: 10,
  potion: [10, 30, 10],
  overheat: 20,
  levelUp: [20, 40, 20, 40, 60],
  quest: 18,
  boss: [40, 60, 40],
  legendary: 25,
  loot: 15,
  success: 25,
  death: [60, 40, 120],
  error: [40, 30, 40],
  longPress: 20,
  heartbeat: [30, 70, 30],
};

/** Minimum gap (ms) before the same kind plays again; bursts of hits would otherwise buzz continuously. */
const KIND_GAP: Partial<Record<HapticKind, number>> = { hit: 150, bigHit: 150, hurt: 150, tap: 60, tick: 60 };
/** Gap between any two vibrations, except the moments that must always be felt. */
const GLOBAL_GAP = 80;
const ALWAYS: ReadonlySet<HapticKind> = new Set(['death', 'levelUp', 'boss', 'error']);
const HEARTBEAT_MS = 1600;

let enabled = true;
let last = 0;
const lastByKind = new Map<HapticKind, number>();
let heartbeat: ReturnType<typeof setInterval> | undefined;

/** True when this browser can vibrate at all (the settings switch is hidden otherwise). */
export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Turns haptics on or off (the settings panel calls this). */
export function setHaptics(on: boolean): void {
  enabled = on;
  if (!on) {
    stopHeartbeat();
    try {
      navigator.vibrate?.(0);
    } catch {
      // ignore
    }
  }
}

export function hapticsEnabled(): boolean {
  return enabled;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Plays a short vibration for the moment, if supported, enabled and not throttled. */
export function haptic(kind: HapticKind): void {
  if (!enabled || !hapticsSupported()) return;
  const t = now();
  if (!ALWAYS.has(kind) && t - last < GLOBAL_GAP) return;
  const gap = KIND_GAP[kind];
  if (gap !== undefined && t - (lastByKind.get(kind) ?? -Infinity) < gap) return;
  last = t;
  lastByKind.set(kind, t);
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Some browsers throw when vibration isn't allowed yet (no user gesture); ignore.
  }
}

/** Raw pattern (ms on/off/on...), for one-off effects; same setting and throttle as `haptic`. */
export function buzz(pattern: number | number[]): void {
  if (!enabled || !hapticsSupported()) return;
  const t = now();
  if (t - last < GLOBAL_GAP) return;
  last = t;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function stopHeartbeat(): void {
  if (heartbeat !== undefined) clearInterval(heartbeat);
  heartbeat = undefined;
}

/**
 * While life is low (under 25 %) a heartbeat plays every 1.6 s; call with false at a potion, a heal, death or
 * a respawn. Safe to call every frame with the same value. Silent when haptics or motion are turned off.
 */
export function setLowLife(low: boolean): void {
  if (!low || !enabled || reducedMotion() || !hapticsSupported()) return stopHeartbeat();
  if (heartbeat !== undefined) return;
  heartbeat = setInterval(() => haptic('heartbeat'), HEARTBEAT_MS);
}
