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
  { id: 'dt.bloater', itemChance: 0.14, goldChance: 0.4, gold: [1, 3], crystalChance: 0.02, xp: 14 },
  { id: 'dt.spore_hound', itemChance: 0.1, goldChance: 0.3, gold: [1, 2], crystalChance: 0.01, xp: 9 },
  { id: 'dt.sergeant', itemChance: 0.9, extraItems: 1, goldChance: 1, gold: [6, 12], crystalChance: 0.15, rarityBias: { rare: 2.5, legendary: 2 }, minRarity: 'magic', xp: 70 },
  // Region 2 (values are per level-1 kill; XP and gold scale with level like everything else).
  { id: 'dt.scorched_walker', itemChance: 0.12, goldChance: 0.32, gold: [1, 3], crystalChance: 0.01, xp: 11 },
  { id: 'dt.slag_hound', itemChance: 0.1, goldChance: 0.3, gold: [1, 2], crystalChance: 0.01, xp: 10 },
  { id: 'dt.flame_drone', itemChance: 0.12, goldChance: 0.35, gold: [1, 3], crystalChance: 0.02, xp: 11 },
  { id: 'dt.fire_bloater', itemChance: 0.14, goldChance: 0.4, gold: [1, 3], crystalChance: 0.02, xp: 15 },
  { id: 'dt.smelter', itemChance: 0.3, goldChance: 0.7, gold: [2, 5], crystalChance: 0.05, xp: 28 },
  { id: 'dt.welder', itemChance: 0.22, goldChance: 0.6, gold: [2, 4], crystalChance: 0.04, xp: 20 },
  { id: 'dt.slagborn', itemChance: 0.9, goldChance: 1, gold: [5, 10], crystalChance: 0.15, rarityBias: { rare: 2 }, minRarity: 'magic', xp: 80 },
  { id: 'dt.cargo_loader', itemChance: 0.95, extraItems: 1, goldChance: 1, gold: [6, 12], crystalChance: 0.18, rarityBias: { rare: 2.5, legendary: 2 }, minRarity: 'magic', xp: 95 },
  { id: 'dt.smelter_priest', itemChance: 0.6, goldChance: 1, gold: [4, 8], crystalChance: 0.1, rarityBias: { rare: 1.5 }, minRarity: 'magic', xp: 45 },
  { id: 'dt.tentacle', itemChance: 0.05, goldChance: 0.2, gold: [1, 2], crystalChance: 0, xp: 4 },
  // Elites: champions (blue) and rare elites (yellow) roll extra, better loot.
  { id: 'dt.champion', itemChance: 0.6, goldChance: 1, gold: [3, 6], crystalChance: 0.08, rarityBias: { rare: 2, legendary: 1.5 }, minRarity: 'magic', xp: 40 },
  { id: 'dt.rare_elite', itemChance: 1, extraItems: 2, goldChance: 1, gold: [8, 14], crystalChance: 0.2, rarityBias: { rare: 3, legendary: 3, unique: 2 }, minRarity: 'magic', xp: 120 },
  // Open-world containers: supply crates along the roads, locked chests (keycard) and bunker caches.
  { id: 'dt.supply_crate', itemChance: 0.7, goldChance: 1, gold: [3, 8], crystalChance: 0.06, rarityBias: { magic: 1.5 }, xp: 0 },
  { id: 'dt.locked_chest', itemChance: 1, extraItems: 2, goldChance: 1, gold: [12, 24], crystalChance: 0.35, rarityBias: { rare: 3, legendary: 2.5 }, minRarity: 'magic', xp: 0 },
  // Bosses and their caches: lots of loot, a guaranteed legendary comes on top (first kill).
  { id: 'dt.boss', itemChance: 1, extraItems: 3, goldChance: 1, gold: [30, 60], crystalChance: 0.6, rarityBias: { rare: 3, legendary: 4, unique: 3 }, minRarity: 'magic', xp: 400 },
  { id: 'dt.dungeon_cache', itemChance: 1, extraItems: 2, goldChance: 1, gold: [20, 40], crystalChance: 0.4, rarityBias: { rare: 3, legendary: 3 }, minRarity: 'magic', xp: 0 },
  { id: 'dt.event_bronze', itemChance: 0.8, goldChance: 1, gold: [8, 14], crystalChance: 0.1, rarityBias: { magic: 2 }, xp: 0 },
  { id: 'dt.event_silver', itemChance: 1, extraItems: 1, goldChance: 1, gold: [14, 24], crystalChance: 0.2, rarityBias: { rare: 2 }, minRarity: 'magic', xp: 0 },
  { id: 'dt.event_gold', itemChance: 1, extraItems: 2, goldChance: 1, gold: [24, 40], crystalChance: 0.35, rarityBias: { rare: 3, legendary: 3 }, minRarity: 'magic', xp: 0 },
  // Quest rewards: only the guaranteed item of the quest's rarity (gold and XP are paid directly).
  { id: 'dt.quest_reward', itemChance: 0, goldChance: 0, gold: [0, 0], crystalChance: 0, xp: 0 },
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
