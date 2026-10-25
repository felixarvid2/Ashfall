/** Loudness helpers of the audio build, kept apart from build.ts (which runs when imported) so tests can use them. */

const db = (x: number) => 10 ** (x / 20);

/**
 * Short-term loudness of a clip in dBFS: its loudest 100 ms RMS window. The ear follows that for sounds this
 * short, whereas the RMS over a whole clip would read a decaying tail (the toxic splash) as quiet.
 */
export function shortTermDb(x: Float32Array, sampleRate: number): number {
  const w = Math.max(1, Math.min(Math.round(0.1 * sampleRate), x.length));
  const hop = Math.max(1, Math.round(w / 4));
  let best = 0;
  for (let a = 0; a + w <= x.length; a += hop) {
    let sum = 0;
    for (let i = a; i < a + w; i++) sum += x[i]! * x[i]!;
    best = Math.max(best, sum / w);
  }
  return 10 * Math.log10(Math.max(best, 1e-12));
}

/** The loudest a quiet sound may be turned down by when matching (dB), so the quiet end does not drag the rest. */
export const MATCH_FLOOR_DB = -8;

/**
 * Catalog gains that bring sounds of different loudness (`levels`, dBFS) to the median one: louder sounds are
 * turned down to it, quieter ones stay at 1 (a gain above 1 is not allowed) and no sound drops below
 * MATCH_FLOOR_DB. `trims` multiplies on top (default 1). Rounded to 3 decimals.
 */
export function matchGains(levels: ReadonlyMap<string, number>, trims: ReadonlyMap<string, number> = new Map()): Map<string, number> {
  const sorted = [...levels.values()].sort((a, b) => a - b);
  const target = sorted[Math.floor((sorted.length - 1) / 2)]!;
  const gains = new Map<string, number>();
  for (const [id, level] of levels) {
    const g = Math.min(1, Math.max(db(MATCH_FLOOR_DB), db(target - level)) * (trims.get(id) ?? 1));
    gains.set(id, Math.round(g * 1000) / 1000);
  }
  return gains;
}
