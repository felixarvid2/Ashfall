/**
 * World Tiers (docs/endgame.md): the account's chosen difficulty after the campaign. This file is the
 * shared entry point other endgame systems call; the full tier logic (scaling hooks, the Tier Beacon)
 * builds on it.
 */
import type { GameContext } from '../../core/context';

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

const NEUTRAL: TierMods = { tier: 1, enemyLife: 1, enemyDamage: 1, xp: 1, gold: 1, itemPower: 0, greaterChance: 0, rareDrops: 1 };

/** The current tier's modifiers; neutral without an account (headless sims). */
export function tierMods(ctx: GameContext): TierMods {
  void ctx;
  return NEUTRAL;
}

/** Unlocks a World Tier for the whole account (never lowers it). */
export function unlockTier(ctx: GameContext, tier: WorldTier): void {
  const e = ctx.account?.endgame;
  if (e && tier > e.tierUnlocked) e.tierUnlocked = tier;
}
