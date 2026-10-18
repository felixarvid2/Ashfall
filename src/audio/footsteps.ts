/** Player footsteps: one step every STEP_INTERVAL seconds while moving, a little faster when running quicker. */

/** Seconds between steps at WALK_SPEED. */
export const STEP_INTERVAL = 0.33;
/** Speed (m/s) the cadence is tuned for; faster movement steps more often, down to half the interval. */
const WALK_SPEED = 6;
/** Below this speed the player is standing (m/s). */
const MOVING = 0.6;
/** Footsteps sit well under combat sounds. */
export const FOOTSTEP_VOLUME = 0.35;

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
