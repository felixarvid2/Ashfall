/**
 * World Tier table (docs/endgame.md). Names and unlock texts: lang/en.json → worldTiers.<n>.
 * Tier 1 is the campaign (all neutral). From tier 2, monsters scale to the player's level everywhere.
 */
export type WorldTier = 1 | 2 | 3 | 4;

/** Multipliers and bonuses a World Tier applies (tier 1 = the campaign, all neutral). */
export interface TierMods {
  tier: WorldTier;
  enemyLife: number;
  enemyDamage: number;
  xp: number;
  gold: number;
  /** Added to rolled item power. */
  itemPower: number;
  /** Added to the chance that an affix rolls greater (0–1). */
  greaterChance: number;
  /** Multiplies unique and mythic drop weights. */
  rareDrops: number;
}

export const WORLD_TIERS: readonly WorldTier[] = [1, 2, 3, 4];

export const TIER_TABLE: Readonly<Record<WorldTier, TierMods>> = {
  1: { tier: 1, enemyLife: 1, enemyDamage: 1, xp: 1, gold: 1, itemPower: 0, greaterChance: 0, rareDrops: 1 },
  2: { tier: 2, enemyLife: 1.5, enemyDamage: 1.25, xp: 1.5, gold: 1.5, itemPower: 40, greaterChance: 0.1, rareDrops: 1.5 },
  3: { tier: 3, enemyLife: 3, enemyDamage: 1.75, xp: 2.5, gold: 2, itemPower: 80, greaterChance: 0.25, rareDrops: 2.5 },
  4: { tier: 4, enemyLife: 6, enemyDamage: 2.5, xp: 4, gold: 3, itemPower: 120, greaterChance: 0.45, rareDrops: 4 },
};

/** From this tier on, every zone's monsters match the player's level (never below the zone's own range). */
export const SCALE_TO_PLAYER_FROM_TIER: WorldTier = 2;
