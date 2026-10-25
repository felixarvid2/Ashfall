/** Player footsteps: one step every STEP_INTERVAL seconds while moving, a little faster when running quicker. */
import type { Surface } from '../data/audio';
import type { PlayOptions } from './engine';

/** Seconds between steps at WALK_SPEED. */
export const STEP_INTERVAL = 0.33;
/** Speed (m/s) the cadence is tuned for; faster movement steps more often, down to half the interval. */
const WALK_SPEED = 6;
/** Below this speed the player is standing (m/s). */
const MOVING = 0.6;
/** Footsteps sit well under combat sounds. */
export const FOOTSTEP_VOLUME = 0.35;

/**
 * How each ground changes the one footstep sound (F015): playback rate (pitch), a low-pass that dulls it
 * (`lowpass`, Hz) and a level. Ash is soft and low, metal ringing and bright, mud heavy and muffled, crystal thin and high.
 */
export const SURFACE_STEP: Record<Surface, { rate: number; lowpass?: number; volume: number }> = {
  stone: { rate: 1, volume: 1 },
  ash: { rate: 0.86, lowpass: 3200, volume: 0.85 },
  metal: { rate: 1.14, volume: 1.15 },
  wet: { rate: 0.76, lowpass: 1900, volume: 1.05 },
  crystal: { rate: 1.32, volume: 0.9 },
};

/** The play options for a footstep on `surface`. */
export function footstepPlay(surface: Surface): PlayOptions {
  const s = SURFACE_STEP[surface];
  return { volume: FOOTSTEP_VOLUME * s.volume, rate: s.rate, ...(s.lowpass !== undefined ? { lowpass: s.lowpass } : {}) };
}

export class FootstepClock {
  private timer = STEP_INTERVAL * 0.5;

  /** Advance by `dt` at `speed` m/s; returns true when a step should sound. */
  update(dt: number, speed: number, grounded = true): boolean {
    if (!grounded || speed < MOVING) {
      // Standing: the next step lands half a beat after setting off.
      this.timer = STEP_INTERVAL * 0.5;
      return false;
    }
    this.timer -= dt;
    if (this.timer > 0) return false;
    this.timer += Math.max(STEP_INTERVAL * 0.5, STEP_INTERVAL * Math.min(1.4, WALK_SPEED / speed));
    return true;
  }
}
