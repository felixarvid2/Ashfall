/**
 * Procedural hit recoil (F008): a quick squash and a push away from the attacker on every non-DoT hit, in addition to
 * the throttled hit animation. Pure curves; the renderer applies them.
 */

/** Seconds a normal hit's recoil lasts; a crit's lasts a little longer and is bigger. */
export const RECOIL_SECONDS = 0.08;
export const RECOIL_SECONDS_CRIT = 0.11;

export interface Recoil {
  /** Multiplier on the model's height. */
  y: number;
  /** Multiplier on its width and depth (the model gets a little wider as it squashes). */
  xz: number;
  /** Metres to push the model away from the attacker. */
  push: number;
}

/** The recoil `age` seconds after a hit, or null once it is over. 1.0 -> 0.94 -> 1.0 in height for a normal hit. */
export function recoilCurve(age: number, crit: boolean): Recoil | null {
  const total = crit ? RECOIL_SECONDS_CRIT : RECOIL_SECONDS;
  if (age < 0 || age >= total) return null;
  const w = Math.sin((age / total) * Math.PI);
  const squash = crit ? 0.1 : 0.06;
  return { y: 1 - squash * w, xz: 1 + squash * 0.5 * w, push: (crit ? 0.25 : 0.15) * w };
}
