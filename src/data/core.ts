/**
 * The Core's tuning shared between systems that must not import each other (docs/regions/the-core.md).
 */

/** The Choir: while a singer lives, every other enemy within `radius` metres deals +25 % damage and moves +15 % faster. */
export const CHOIR = {
  radius: 14,
  damage: 0.25,
  speed: 0.15,
  /** The aura is re-applied this often (s); the status lasts a little longer so it does not flicker. */
  pulse: 0.25,
  duration: 0.6,
};

/** Death by fade-and-shrink for models without a death clip. */
export const FADE_DEATH = { seconds: 0.9 };
