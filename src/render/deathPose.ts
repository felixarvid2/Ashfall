/**
 * Code-driven death for machines without a death clip (round 4, D18): a sputtering twitch, a topple with one small
 * bounce, then the sink the other bodies get. Pure, so tests can check the curve.
 */
export interface DeathPose {
  /** Pitch toward the fall direction (radians). */
  pitch: number;
  /** Sideways wobble (radians). */
  roll: number;
  /** Height added to the body (metres, never below 0). */
  lift: number;
}

export const MACHINE_TWITCH = 0.35;
export const MACHINE_TOPPLE = 0.45;

export function machineDeathPose(elapsed: number): DeathPose {
  if (elapsed < MACHINE_TWITCH) {
    // Sparking: a fast shudder that grows, a little hop at the end.
    const k = elapsed / MACHINE_TWITCH;
    return { pitch: 0.05 * Math.sin(elapsed * 60) * k, roll: 0.12 * Math.sin(elapsed * 45) * k, lift: 0.06 * k };
  }
  const t = Math.min(1, (elapsed - MACHINE_TWITCH) / MACHINE_TOPPLE);
  // Ease-in topple (gravity), then a bounce of about 0.1 m as it lands.
  const fall = t * t;
  const bounce = t < 0.8 ? 0 : Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.1;
  return { pitch: (Math.PI / 2) * 0.95 * fall, roll: 0.12 * (1 - t), lift: bounce };
}
