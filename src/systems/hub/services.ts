/**
 * Hub services (docs/world-and-gameplay.md §3, brief §5.4–5.6): the trader buys and sells, the
 * blacksmith rerolls one affix at a rising price, the Technician extracts aspects from legendaries
 * and imprints them onto other gear, and the shared stash holds items for every character.
 * Pure functions on Inventory / item lists.
 */
import type { Inventory } from '../../core/components';
import type { Rng } from '../../core/rng';
import { BLACKSMITH, STASH, TECHNICIAN, VENDOR } from '../../data/services';
import { ASPECT_DEFS, BASE_ITEMS, rarityDef } from '../../data/loot/db';
import type { Item } from '../../data/loot/schemas';
import { addToGrid, isJunk } from '../loot/inventory';
import { generateItem, itemPowerFor, rollAffixes, salvageValue } from '../loot/generate';
import type { TierMods } from '../endgame/tiers';

/** The part of the World Tier the shops use: bonus item power and greater-affix chance (neutral in the campaign). */
export type ShopTier = Pick<TierMods, 'itemPower' | 'greaterChance'>;

export type ServiceResult = { ok: true } | { ok: false; reason: 'gold' | 'full' | 'empty' | 'invalid' | 'noAspect' | 'cacheFull' | 'type' | 'itemLocked' };

const fail = (reason: Exclude<ServiceResult, { ok: true }>['reason']): ServiceResult => ({ ok: false, reason });

// ---- Trader --------------------------------------------------------------------------

/** The trader's stock; at a higher World Tier it rolls with the tier's item power and greater-affix chance like drops do. */
export function rollVendorStock(rng: Rng, level: number, classId: string, uid: () => string, nameOf?: (baseId: string) => string, tier?: ShopTier): Item[] {
  return Array.from({ length: VENDOR.stockSize }, () =>
    generateItem(rng, {
      itemPower: itemPowerFor(level, rng) + (tier?.itemPower ?? 0),
      ...(tier ? { greaterBonus: tier.greaterChance } : {}),
      classId,
      uid: uid(),
      rarity: rng.weighted(VENDOR.rarity),
      ...(nameOf ? { nameOf } : {}),
    }),
  );
}

export function buyPrice(item: Item): number {
  return Math.max(VENDOR.minPrice, Math.round(salvageValue(item) * VENDOR.priceMultiplier)) * VENDOR.rarityPrice[item.rarity];
}

export function sellPrice(item: Item): number {
  return salvageValue(item);
}

export function buy(inv: Inventory, stock: (Item | null)[], index: number): ServiceResult {
  const item = stock[index];
  if (!item) return fail('empty');
  const price = buyPrice(item);
  if (inv.gold < price) return fail('gold');
  if (!addToGrid(inv, item).ok) return fail('full');
  inv.gold -= price;
  stock[index] = null;
  return { ok: true };
}

/** Sold items the trader still holds (B023): newest first, kept in memory only, cleared when the stock refreshes. */
export const BUYBACK_MAX = 8;
export interface BuybackEntry {
  item: Item;
  /** What the player was paid; buying back costs the same. */
  price: number;
}

export function sell(inv: Inventory, gridIndex: number, buyback?: BuybackEntry[]): number {
  const item = inv.grid[gridIndex];
  if (!item || item.locked) return 0;
  const gold = sellPrice(item);
  inv.grid[gridIndex] = null;
  inv.gold += gold;
  if (buyback) {
    buyback.unshift({ item, price: gold });
    buyback.length = Math.min(buyback.length, BUYBACK_MAX);
  }
  return gold;
}

/** Take a sold item back at the sale price. Needs the gold and a free backpack cell. */
export function buyBack(inv: Inventory, buyback: BuybackEntry[], index: number): ServiceResult {
  const entry = buyback[index];
  if (!entry) return fail('empty');
  if (inv.gold < entry.price) return fail('gold');
  if (!addToGrid(inv, entry.item).ok) return fail('full');
  inv.gold -= entry.price;
  buyback.splice(index, 1);
  return { ok: true };
}

// ---- Blacksmith -------------------------------------------------------------------------

export function rerollCost(item: Item): number {
  return Math.round(BLACKSMITH.rerollBase * (item.itemPower / 100) * BLACKSMITH.rerollGrowth ** (item.rerolls ?? 0));
}

/**
 * Replace one affix with a new random one the item doesn't already have. The new affix is rolled at the item's own
 * power (it already carries the tier it dropped at), with the World Tier's greater-affix chance on top.
 */
export function rerollAffix(rng: Rng, inv: Inventory, item: Item, affixIndex: number, tier?: ShopTier): ServiceResult {
  const old = item.affixes[affixIndex];
  const base = BASE_ITEMS.get(item.base);
  if (!old || !base || item.unique || item.crystal) return fail('invalid');
  const cost = rerollCost(item);
  if (inv.gold < cost) return fail('gold');
  const taken = new Set(item.affixes.map((a) => a.affix));
  // Roll a few candidates and keep the first that is new to the item.
  const candidates = rollAffixes(rng, base.type, 8, item.itemPower, Math.min(1, rarityDef(item.rarity).greaterChance + (tier?.greaterChance ?? 0)));
  const next = candidates.find((c) => !taken.has(c.affix));
  if (!next) return fail('invalid');
  inv.gold -= cost;
  item.affixes[affixIndex] = next;
  item.rerolls = (item.rerolls ?? 0) + 1;
  return { ok: true };
}

/** Salvage every junk item (common, magic, marked; never locked) in the backpack, except the grid indexes in `keep`. Returns gold gained. */
export function salvageJunk(inv: Inventory, keep?: ReadonlySet<number>): number {
  let gold = 0;
  inv.grid.forEach((item, i) => {
    if (!item || !isJunk(item) || keep?.has(i)) return;
    gold += salvageValue(item);
    inv.grid[i] = null;
  });
  inv.gold += gold;
  return gold;
}

// ---- Technician -------------------------------------------------------------------------

export function extractCost(item: Item): number {
  return Math.round(TECHNICIAN.extractCost * (item.itemPower / 100));
}

export function imprintCost(item: Item): number {
  return Math.round(TECHNICIAN.imprintCost * (item.itemPower / 100));
}

/** Destroy a legendary and keep its aspect in the cache. */
export function extractAspect(inv: Inventory, gridIndex: number): ServiceResult {
  const item = inv.grid[gridIndex];
  if (!item) return fail('empty');
  if (!item.aspect || item.unique) return fail('noAspect');
  // Extracting destroys the item, so a locked one is refused like salvage and sell.
  if (item.locked) return fail('itemLocked');
  const cache = (inv.aspects ??= []);
  if (cache.length >= TECHNICIAN.cacheSize) return fail('cacheFull');
  const cost = extractCost(item);
  if (inv.gold < cost) return fail('gold');
  inv.gold -= cost;
  cache.push({ ...item.aspect });
  inv.grid[gridIndex] = null;
  return { ok: true };
}

/** Can this cached aspect go onto that item? Rares become legendary. */
export function canImprint(item: Item, aspectId: string): boolean {
  const def = ASPECT_DEFS.get(aspectId);
  const base = BASE_ITEMS.get(item.base);
  if (!def || !base || item.unique || item.crystal) return false;
  if (item.rarity !== 'rare' && item.rarity !== 'legendary') return false;
  return def.types.includes(base.type);
}

export function imprintAspect(inv: Inventory, cacheIndex: number, item: Item): ServiceResult {
  const cache = inv.aspects ?? [];
  const aspect = cache[cacheIndex];
  if (!aspect) return fail('empty');
  if (!canImprint(item, aspect.id)) return fail('type');
  const cost = imprintCost(item);
  if (inv.gold < cost) return fail('gold');
  inv.gold -= cost;
  item.aspect = { ...aspect };
  item.rarity = 'legendary';
  cache.splice(cacheIndex, 1);
  return { ok: true };
}

// ---- Stash ------------------------------------------------------------------------------

/** The shared stash, padded to its size (base + Restoration bonus). */
export function stashSlots(stash: (Item | null)[], bonusSlots: number): (Item | null)[] {
  const size = STASH.baseSlots + bonusSlots;
  while (stash.length < size) stash.push(null);
  return stash;
}

export function toStash(inv: Inventory, gridIndex: number, stash: (Item | null)[]): ServiceResult {
  const item = inv.grid[gridIndex];
  if (!item) return fail('empty');
  const free = stash.indexOf(null);
  if (free < 0) return fail('full');
  stash[free] = item;
  inv.grid[gridIndex] = null;
  return { ok: true };
}

export function fromStash(inv: Inventory, stash: (Item | null)[], index: number): ServiceResult {
  const item = stash[index];
  if (!item) return fail('empty');
  if (!addToGrid(inv, item).ok) return fail('full');
  stash[index] = null;
  return { ok: true };
}
