/**
 * The painted art generated with FLUX.2 Turbo (public/assets/art/, listed in src/data/artFiles.ts):
 * item icons per rarity look, unique icons, rarity frames, aspect and passive icons, boss portraits,
 * region cards, menu art and region maps. Everything falls back to what was there before when a file
 * is missing.
 */
import { ART_FILES } from '../data/artFiles';
import type { Item } from '../data/loot/schemas';

export function artUrl(key: string): string | null {
  return ART_FILES.has(key) ? `${import.meta.env.BASE_URL}assets/art/${key}.webp` : null;
}

/** Common and magic items look worn, rare and legendary military, mythic masterwork. */
const TIER: Record<Item['rarity'], number> = { common: 1, magic: 1, rare: 2, legendary: 2, unique: 3, mythic: 3 };

/** The painted icon for an item: its unique's own, else its base in the look of its rarity. */
export function itemArtUrl(item: Item): string | null {
  if (item.crystal) return null;
  if (item.unique) {
    const own = artUrl(`items/unique_${item.unique}`);
    if (own) return own;
  }
  return artUrl(`items/${item.base}_${TIER[item.rarity]}`);
}

/** The ornamental frame for an item's rarity. */
export function rarityFrameUrl(item: Item): string | null {
  return item.crystal ? null : artUrl(`frames/${item.rarity}`);
}
