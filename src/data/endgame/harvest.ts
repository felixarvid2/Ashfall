/**
 * Ash Harvest (docs/endgame.md): from World Tier 2 one region at a time is "under the Harvest" for
 * 20 minutes of play time, rotating through the five regions. Packs there are denser, elite-heavier and
 * mixed with packs from other regions; enemies drop Ash Shards, spent on Harvest Caches.
 * Names and messages: lang/en.json → harvest.*
 */

export const HARVEST = {
  /** Lowest account tier (`tierUnlocked`) that switches the Harvest on. */
  minTier: 2,
  /** Play time (s) each region stays under the Harvest. */
  rotationSeconds: 20 * 60,
  /** Region zones in rotation order (play time 0 starts with the first). */
  rotation: ['zone.cinder_flats', 'zone.refinery_district', 'zone.hydroponic_vaults', 'zone.deep_mines', 'zone.the_core'] as readonly string[],
  /** In the active zone: pack size ×, champion and rare chance ×, share of packs swapped for other regions' packs, world event cooldown ×. */
  packMul: 1.5,
  eliteMul: 3,
  mixShare: [0.1, 0.3] as const,
  eventCooldownMul: 0.5,
  /** Ash Shards per kill in the active zone. */
  shards: { normal: 1, elite: 5, boss: 25 },
  /** Dying drops this share of the carried shards (they are lost). */
  deathLoss: 0.5,
  /** A Harvest Cache: price in shards, the Lumen Dust it holds, and the chance it teaches a tempering recipe. */
  cacheCost: 250,
  cacheDust: [4, 8] as const,
  cacheRecipeChance: 0.35,
  cacheMaterial: 'lumen_dust',
  /** Enemies that never travel into another region's packs (set pieces of their own, or huge). */
  mixExcluded: ['lumen_giant', 'drill_colossus'] as readonly string[],
};

export interface CacheSpot {
  id: string;
  x: number;
  z: number;
}

/**
 * Three Harvest Cache spots per region zone: open ground 100–300 m from a teleporter, well away from the
 * hubs, gates, points of interest and prop colliders (tests/endgameHarvest.test.ts keeps it that way).
 */
export const HARVEST_CACHES: Record<string, readonly CacheSpot[]> = {
  'zone.cinder_flats': [
    { id: 'hc.cf.1', x: -423, z: -217 },
    { id: 'hc.cf.2', x: -286, z: 369 },
    { id: 'hc.cf.3', x: 457, z: 344 },
  ],
  'zone.refinery_district': [
    { id: 'hc.rd.1', x: -402, z: -295 },
    { id: 'hc.rd.2', x: 316, z: 283 },
    { id: 'hc.rd.3', x: -208, z: 447 },
  ],
  'zone.hydroponic_vaults': [
    { id: 'hc.hv.1', x: -60, z: -462 },
    { id: 'hc.hv.2', x: -365, z: 258 },
    { id: 'hc.hv.3', x: -686, z: -299 },
  ],
  'zone.deep_mines': [
    { id: 'hc.dm.1', x: -67, z: 568 },
    { id: 'hc.dm.2', x: -350, z: 35 },
    { id: 'hc.dm.3', x: 561, z: -310 },
  ],
  'zone.the_core': [
    { id: 'hc.core.1', x: 0, z: 341 },
    { id: 'hc.core.2', x: -5, z: -347 },
    { id: 'hc.core.3', x: 362, z: 10 },
  ],
};
