/** Rarities, crystals, drop tables and progression curves. */
import type { z } from 'zod';
import type { CrystalDefSchema, DropTableSchema, ProgressionSchema, RarityDefSchema } from './schemas';

export const RARITY_DEFS: z.input<typeof RarityDefSchema>[] = [
  { id: 'common', color: '#a8a8a8', affixes: [0, 0], greaterChance: 0, socketChance: 0.12, salvageGold: 0.5, beam: 0 },
  { id: 'magic', color: '#4a8cff', affixes: [1, 2], greaterChance: 0.01, socketChance: 0.22, salvageGold: 1, beam: 1.2 },
  { id: 'rare', color: '#ffd84a', affixes: [3, 4], greaterChance: 0.03, socketChance: 0.32, salvageGold: 2.5, beam: 2.4 },
  { id: 'legendary', color: '#ff8a2a', affixes: [3, 4], greaterChance: 0.05, socketChance: 0.4, salvageGold: 5, beam: 5 },
  { id: 'unique', color: '#c9a45c', affixes: [4, 4], greaterChance: 0.1, socketChance: 0.4, salvageGold: 8, beam: 6 },
  { id: 'mythic', color: '#ff2a3a', affixes: [4, 4], greaterChance: 1, socketChance: 0.5, salvageGold: 20, beam: 9 },
];

/** Crystal tiers: chipped (< 150 item power), regular (< 300), flawless. */
export const CRYSTALS: z.input<typeof CrystalDefSchema>[] = [
  {
    id: 'ember',
    icon: 'icon.crystal_ember',
    color: '#ff7a1a',
    weapon: { stat: 'damageVsBurning', values: [0.08, 0.12, 0.16] },
    armor: { stat: 'maxLife', values: [10, 20, 32] },
    jewelry: { stat: 'resistHeat', values: [0.08, 0.12, 0.16] },
  },
  {
    id: 'lumen',
    icon: 'icon.crystal_lumen',
    color: '#5dff6a',
    weapon: { stat: 'damageVsVulnerable', values: [0.08, 0.12, 0.16] },
    armor: { stat: 'resourceGen', values: [0.03, 0.05, 0.07] },
    jewelry: { stat: 'resistToxic', values: [0.08, 0.12, 0.16] },
  },
  {
    id: 'void',
    icon: 'icon.crystal_void',
    color: '#a26bff',
    weapon: { stat: 'critDamage', values: [0.06, 0.09, 0.12] },
    armor: { stat: 'damageReduction', values: [0.01, 0.015, 0.02] },
    jewelry: { stat: 'resistVoid', values: [0.08, 0.12, 0.16] },
  },
];

export const DROP_TABLES: z.input<typeof DropTableSchema>[] = [
  { id: 'dt.infected_colonist', itemChance: 0.12, goldChance: 0.35, gold: [1, 3], crystalChance: 0.015, xp: 12 },
  { id: 'dt.security_drone', itemChance: 0.16, goldChance: 0.4, gold: [1, 4], crystalChance: 0.02, xp: 14 },
  { id: 'dt.spore_carrier', itemChance: 0.4, goldChance: 0.6, gold: [3, 6], crystalChance: 0.05, rarityBias: { rare: 2 }, xp: 26 },
  // Reward cache that drops when a wave is cleared.
  {
    id: 'dt.wave_reward',
    itemChance: 1,
    extraItems: 1,
    goldChance: 1,
    gold: [6, 10],
    crystalChance: 0.3,
    minRarity: 'magic',
    rarityBias: { rare: 1.5 },
    xp: 0,
  },
];

export const PROGRESSION: z.input<typeof ProgressionSchema> = {
  maxLevel: 50,
  xpBase: 60,
  xpExponent: 1.45,
  itemPower: { base: 10, perLevel: 8, spread: 4 },
  enemyLifePerLevel: 0.18,
  enemyDamagePerLevel: 0.12,
  xpPerEnemyLevel: 0.1,
  rarityWeights: { common: 55, magic: 32, rare: 11, legendary: 1.6, unique: 0.3, mythic: 0.01 },
  ownClassShare: 0.85,
  inventorySize: 40,
};
