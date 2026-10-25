/**
 * Elite affixes (docs/world-and-gameplay.md §8.3). Champions share 1–2 affixes across their pack;
 * rare elites get 2–4 (more at higher levels), a generated name and minions. Force Wall and Laser
 * Grid (C019) only roll on monsters of level LATE_AFFIX_MIN_LEVEL and up (Hydroponic Vaults and later),
 * so earlier regions are unchanged.
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
  'forceWall',
  'laserGrid',
] as const;
export type EliteAffix = (typeof ELITE_AFFIXES)[number];

/** The affixes of the later regions, and the monster level they start to roll at. */
export const LATE_AFFIXES: readonly EliteAffix[] = ['forceWall', 'laserGrid'];
export const LATE_AFFIX_MIN_LEVEL = 20;

/** The affixes a monster of this level can roll (the original ten below LATE_AFFIX_MIN_LEVEL, in their old order). */
export function affixPool(level: number): readonly EliteAffix[] {
  return level >= LATE_AFFIX_MIN_LEVEL ? ELITE_AFFIXES : ELITE_AFFIXES.filter((a) => !LATE_AFFIXES.includes(a));
}

/** Pairs that never roll together (too oppressive or visually unreadable). */
export const EXCLUSIVE_AFFIXES: [EliteAffix, EliteAffix][] = [
  ['teleporting', 'snaring'],
  ['mirroring', 'explodesOnDeath'],
  ['freezing', 'snaring'],
  ['forceWall', 'laserGrid'],
  ['laserGrid', 'snaring'],
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
  /** Force Wall: a warned line of energy across the player's path that burns and slows. */
  forceWall: { cooldown: [10, 13] as [number, number], range: 22, warning: 1, length: 10, width: 2, radius: 1.2, duration: 4.5, dpsOfDamage: 0.4, slow: 1.5 },
  /** Laser Grid: two warned beams crossing under the player, a short hard burn. */
  laserGrid: { cooldown: [9, 12] as [number, number], range: 24, warning: 1.5, length: 16, width: 1.6, radius: 0.9, duration: 0.8, dpsOfDamage: 1 },
};

/** How many affixes a rare elite gets by monster level. */
export function rareAffixCount(level: number): number {
  return level >= 30 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
}

/** Elite life multiplier by kind and monster level (G023): champions 2 + 0.02 x level, rares 4 + 0.05 x level. */
export function eliteLifeMul(kind: 'champion' | 'rare', level: number): number {
  return kind === 'rare' ? 4 + 0.05 * level : 2 + 0.02 * level;
}

/** Elite weapon damage multiplier: champions a flat 1.25, rares 1.5 + 0.01 x level. */
export function eliteDamageMul(kind: 'champion' | 'rare', level: number): number {
  return kind === 'rare' ? 1.5 + 0.01 * level : 1.25;
}

export const ELITE_COLORS = { champion: '#6aa8ff', rare: '#ffd23a', named: '#ff9a3a' } as const;
