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
  /**
   * Regional stock (C010): legendary and unique weights next to the magic and rare weights above, by zone key.
   * Regions that are not listed (and a caller without a region) use `rarity` and sell no uniques.
   */
  regionStock: {
    cinderFlats: { legendary: 3, unique: 0 },
    refineryDistrict: { legendary: 5, unique: 0.2 },
    hydroponicVaults: { legendary: 8, unique: 0.4 },
    deepMines: { legendary: 10, unique: 0.6 },
    theCore: { legendary: 12, unique: 0.8 },
  } as Record<string, { legendary: number; unique: number }>,
  /** D05: paying to roll the stock again. Cost = base × (1 + perLevel × player level) × growth ^ rerolls already paid today (the count resets on a new date). */
  reroll: { base: 60, perLevel: 0.12, growth: 1.6 },
  /** Stock slots reserved for a legendary the player's class can use (its base, and its aspect when the aspect is class-bound). */
  ownClassLegendarySlots: 1,
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
