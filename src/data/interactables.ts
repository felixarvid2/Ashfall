/**
 * Tuning for open-world interactables (docs/world-and-gameplay.md §3, §10): Stim Pylons, Echo Relic
 * bonuses, supply crates and explosive barrels.
 */
import type { StatKey } from './loot/schemas';
import type { StatusId } from './schemas';

export type PylonType = 'overcharge' | 'kinetic' | 'barrier' | 'chainReaction' | 'magnet' | 'overclock';

/** Each pylon grants a status for a while, then recharges. */
export const PYLONS: Record<PylonType, { status: StatusId; duration: number; color: string }> = {
  overcharge: { status: 'overcharge', duration: 60, color: '#ff6a3a' },
  kinetic: { status: 'kinetic', duration: 60, color: '#ffd23a' },
  barrier: { status: 'aegis', duration: 10, color: '#9fd8ff' },
  chainReaction: { status: 'chainReaction', duration: 60, color: '#ff9a3a' },
  magnet: { status: 'magnet', duration: 60, color: '#c77dff' },
  overclock: { status: 'overclock', duration: 8, color: '#5ad2ff' },
};
export const PYLON_RECHARGE = 300;

/** Pylon effect sizes, read by combat, movement, skills and rewards. */
export const PYLON_EFFECTS = {
  overchargeDamage: 0.5,
  kineticSpeed: 0.4,
  /** Chain Reaction: dying enemies explode for this × the player's weapon damage. */
  chainCoefficient: 1.4,
  chainRadius: 4,
  magnetXp: 2,
};

/** Echo Relics: one small permanent bonus each, for every character on the account. */
export const RELIC_BONUS: Partial<Record<StatKey, number>> = {
  maxLife: 8,
  damage: 0.02,
  armor: 12,
  moveSpeed: 0.02,
  resourceGen: 0.03,
};

/** Supply crates refill after this long (locked chests, relics, logs are one-time). */
export const CRATE_REFILL = 600;

export const BARREL = {
  /** Blast radius (m). */
  radius: 4.5,
  /** Damage to enemies: base + perLevel × monster level. */
  base: 30,
  perLevel: 14,
  /** Damage to the player as a fraction of max life. */
  playerFraction: 0.18,
  /** Delay before a barrel caught in another blast goes off. */
  chainDelay: 0.18,
};

/** Signal towers reveal the map within this radius. */
export const SIGNAL_TOWER_RADIUS = 220;

/** XP for reading a log the first time, per character level. */
export const LORE_XP_PER_LEVEL = 6;

/** Interaction radius per kind (m). */
export const INTERACT_RADIUS = 2.8;
