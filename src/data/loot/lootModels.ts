/**
 * The three models ground loot is drawn with (Blender, scripts/blender/spec/npcs_loot.json; src/render/lootVisuals.ts):
 * an item cache, a Lumen crystal and a pile of scrap credits. Loot is not an entity with a Renderable, so the asset sets
 * list these by hand (every zone and dungeon can drop any of them).
 */
export const LOOT_MODELS = {
  item: 'prop.loot_cache',
  crystal: 'prop.loot_crystal',
  gold: 'prop.loot_gold',
} as const;

export const LOOT_ASSET_IDS: readonly string[] = Object.values(LOOT_MODELS);
