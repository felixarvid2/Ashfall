/** Hub service tuning (Outpost Ember): the trader's stock, blacksmith rerolls, aspects, stash. */
import type { Rarity } from './loot/schemas';

export const VENDOR = {
  stockSize: 8,
  /** The trader restocks after this many seconds (and on level up). */
  refreshSeconds: 600,
  rarity: [
    { item: 'magic' as Rarity, weight: 62 },
    { item: 'rare' as Rarity, weight: 33 },
    { item: 'legendary' as Rarity, weight: 5 },
  ],
  /** Buy price = max(minPrice, salvage value × priceMultiplier) × the rarity's multiplier. */
  priceMultiplier: 6,
  minPrice: 25,
  rarityPrice: { common: 1, magic: 1, rare: 2, legendary: 5, unique: 8, mythic: 12 } as Record<Rarity, number>,
};

export const BLACKSMITH = {
  /** Reroll cost = base × item power / 100 × growth ^ previous rerolls. */
  rerollBase: 40,
  rerollGrowth: 1.6,
};

export const TECHNICIAN = {
  /** Gold × item power / 100. */
  extractCost: 60,
  imprintCost: 90,
  /** Aspects the cache can hold. */
  cacheSize: 12,
};

export const STASH = {
  baseSlots: 50,
};
