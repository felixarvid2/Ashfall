/**
 * Elite affixes (docs/world-and-gameplay.md §8.3). Champions share 1–2 affixes across their pack;
 * rare elites get 2–4 (more at higher levels), a generated name and minions. Force Wall and Laser
 * Grid arrive with later regions.
 */
export const ELITE_AFFIXES = [
  'shielded',
  'burning',
  'teleporting',
  'snaring',
  'sporeSpreader',
  'explodesOnDeath',
  'vampiric',
  'fast',
  'freezing',
  'mirroring',
] as const;
export type EliteAffix = (typeof ELITE_AFFIXES)[number];

/** Pairs that never roll together (too oppressive or visually unreadable). */
export const EXCLUSIVE_AFFIXES: [EliteAffix, EliteAffix][] = [
  ['teleporting', 'snaring'],
  ['mirroring', 'explodesOnDeath'],
  ['freezing', 'snaring'],
];

export const AFFIX_TUNING = {
  /** Shielded: barrier (fraction of max life) the first time it is hurt. */
  shieldFraction: 0.35,
  shieldDuration: 6,
  /** Burning: a fire patch dropped every `interval` seconds while moving. */
  burning: { interval: 1.2, radius: 1.3, duration: 3.5, dpsOfDamage: 0.35 },
  /** Teleporting: blinks next to a player farther than `minDistance`. */
  teleporting: { cooldown: [6, 9] as [number, number], minDistance: 9 },
  /** Snaring: a rooting field under the player after a warning. */
  snaring: { cooldown: [7, 10] as [number, number], warning: 1.2, radius: 2.2, root: 1.2 },
  /** Spore Spreader: toxic clouds at its feet. */
  sporeSpreader: { cooldown: [5, 7] as [number, number], radius: 3, duration: 5, dpsOfDamage: 0.3 },
  /** Explodes on Death: warning, then a blast. */
  explodesOnDeath: { warning: 1.1, radius: 3.6, damageOfWeapon: 2.2 },
  /** Vampiric: heals for this fraction of damage it deals. */
  vampiric: 0.6,
  /** Fast: movement speed multiplier. */
  fast: 1.4,
  /** Freezing: chill on every hit, sometimes a short freeze. */
  freezing: { chill: 2, freezeChance: 0.18, freeze: 0.8 },
  /** Mirroring: at half life, splits off copies with a share of its life. */
  mirroring: { copies: 2, lifeFraction: 0.25 },
};

/** How many affixes a rare elite gets by monster level. */
export function rareAffixCount(level: number): number {
  return level >= 9 ? 4 : level >= 5 ? 3 : 2;
}

export const ELITE_COLORS = { champion: '#6aa8ff', rare: '#ffd23a', named: '#ff9a3a' } as const;
