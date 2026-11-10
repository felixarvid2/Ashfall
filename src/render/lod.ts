/**
 * Render level of detail (round 4 B01, B02): which skinned enemies tick their animation mixer how often, and which
 * enemies cast a real shadow. Pure helpers so they can be tested without a renderer.
 */

/** Closer than this (metres from the camera focus) a mixer runs every frame. */
export const ANIM_NEAR = 22;
/** Up to this far a mixer runs at 30 Hz; beyond it at 15 Hz. Off-screen mixers do not run. */
export const ANIM_MID = 40;
/** Enemies that cast a real shadow (the nearest ones); the rest get a blob under them. */
export const SHADOW_CASTERS = 10;

/** Seconds between mixer updates for an entity at squared distance `distSq`; -1 = not at all (off-screen). */
export function animInterval(distSq: number, onScreen: boolean): number {
  if (!onScreen) return -1;
  if (distSq < ANIM_NEAR * ANIM_NEAR) return 0;
  return distSq < ANIM_MID * ANIM_MID ? 1 / 30 : 1 / 15;
}

/** Accumulated, not yet applied animation time per object. */
export interface AnimClock {
  acc: number;
}

/**
 * Feed one frame; returns the time to give the mixer now (0 = skip this frame). Skipped time is kept (up to 1 s), so a
 * clip that was throttled or off-screen catches up in one step instead of falling behind.
 */
export function stepAnimClock(clock: AnimClock, dt: number, interval: number): number {
  clock.acc = Math.min(1, clock.acc + dt);
  if (interval < 0) return 0;
  if (clock.acc < interval) return 0;
  const out = clock.acc;
  clock.acc = 0;
  return out;
}

/**
 * The ids of the `n` smallest distances. `dist` is filled by the caller (parallel to `ids`); no allocation beyond the
 * result and it is O(n * count), fine for n around 10.
 */
export function nearestN<T>(ids: readonly T[], dist: readonly number[], n: number, out: Set<T>): Set<T> {
  out.clear();
  if (ids.length <= n) {
    for (const id of ids) out.add(id);
    return out;
  }
  // Threshold = n-th smallest distance, found by a small insertion buffer.
  const best: number[] = [];
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i]!;
    if (best.length < n) {
      best.push(d);
      for (let j = best.length - 1; j > 0 && best[j]! < best[j - 1]!; j--) [best[j], best[j - 1]] = [best[j - 1]!, best[j]!];
    } else if (d < best[n - 1]!) {
      best[n - 1] = d;
      for (let j = n - 1; j > 0 && best[j]! < best[j - 1]!; j--) [best[j], best[j - 1]] = [best[j - 1]!, best[j]!];
    }
  }
  const limit = best[n - 1]!;
  for (let i = 0; i < ids.length && out.size < n; i++) if (dist[i]! <= limit) out.add(ids[i]!);
  return out;
}
