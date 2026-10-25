/**
 * Endgame crafting (docs/endgame.md): tempering recipes, masterworking and the Codex of Power. The grant
 * functions are the shared entry point drop sources call (world bosses, Ash Harvest caches, Deep Rift
 * guardians); the rest are the blacksmith's and the technician's services. Pure functions on the context,
 * an Inventory and items, like systems/hub/services.ts.
 */
import type { Inventory } from '../../core/components';
import type { GameContext } from '../../core/context';
import type { Rng } from '../../core/rng';
import {
  CODEX_ASPECTS,
  codexEntries,
  CODEX_IMPRINT_COST,
  MASTERWORK,
  RECIPE_DEFS,
  SALVAGE_DUST,
  TEMPERING,
  type Recipe,
} from '../../data/endgame/crafting';
import { ASPECT_DEFS, BASE_ITEMS } from '../../data/loot/db';
import type { Item, RolledStat } from '../../data/loot/schemas';
import { powerScale, roundStat } from '../loot/generate';
import { canImprint } from '../hub/services';
import { allAffixes } from './itemMods';
import { tierMods } from './tiers';

export type CraftFailure = 'gold' | 'invalid' | 'locked' | 'charges' | 'recipe' | 'materials' | 'maxRank' | 'slots' | 'type';
export type CraftResult = { ok: true } | { ok: false; reason: CraftFailure };
const fail = (reason: CraftFailure): CraftResult => ({ ok: false, reason });

/** Teaches the character a tempering recipe. Returns true if it was new. */
export function grantRecipe(ctx: GameContext, id: string): boolean {
  const e = ctx.endgame;
  if (!e || e.recipes.includes(id)) return false;
  e.recipes.push(id);
  return true;
}

/** Adds masterworking materials of one kind. */
export function grantMaterial(ctx: GameContext, id: string, amount: number): void {
  const e = ctx.endgame;
  if (!e || amount <= 0) return;
  e.materials[id] = (e.materials[id] ?? 0) + Math.floor(amount);
}

export function materialCount(ctx: GameContext, id: string): number {
  return ctx.endgame?.materials[id] ?? 0;
}

// ---- Salvage -------------------------------------------------------------------------------------

/** Lumen Dust a salvaged item yields (legendaries, uniques and mythics only). */
export function salvageDust(item: Item): number {
  if (item.crystal) return 0;
  return SALVAGE_DUST[item.rarity] ?? 0;
}

/** Call when an item is salvaged; returns the dust granted. */
export function grantSalvageDust(ctx: GameContext, item: Item): number {
  const n = ctx.endgame ? salvageDust(item) : 0;
  if (n > 0) grantMaterial(ctx, 'lumen_dust', n);
  return n;
}

// ---- Tempering -----------------------------------------------------------------------------------

/** Has the account reached the World Tier that opens tempering? */
export function temperingUnlocked(ctx: GameContext): boolean {
  return (ctx.account?.endgame.tierUnlocked ?? 1) >= TEMPERING.tierRequired;
}

export function canTemper(item: Item): boolean {
  return !item.crystal && (TEMPERING.rarities as readonly string[]).includes(item.rarity) && BASE_ITEMS.has(item.base);
}

/** Tempering charges the item has left. */
export function temperChargesLeft(item: Item): number {
  return item.temperCharges ?? TEMPERING.charges;
}

/** Gold for the next tempering; rises with every charge already spent. */
export function temperCost(item: Item): number {
  const spent = TEMPERING.charges - temperChargesLeft(item);
  return Math.round(TEMPERING.goldBase * (item.itemPower / 100) * TEMPERING.goldGrowth ** spent);
}

/** The recipes of this character that are learned, in data order. */
export function learnedRecipes(ctx: GameContext): Recipe[] {
  const known = new Set(ctx.endgame?.recipes ?? []);
  return [...RECIPE_DEFS.values()].filter((r) => known.has(r.id));
}

/**
 * Adds one random affix from the recipe to the item, or with `slot` (0 or 1) replaces that tempered affix.
 * With two tempered affixes already, a slot is required. Costs gold and one charge either way.
 */
export function temperItem(rng: Rng, ctx: GameContext, inv: Inventory, item: Item, recipeId: string, slot?: number): CraftResult {
  if (!temperingUnlocked(ctx)) return fail('locked');
  if (!canTemper(item)) return fail('invalid');
  const recipe = RECIPE_DEFS.get(recipeId);
  if (!recipe || !ctx.endgame?.recipes.includes(recipeId)) return fail('recipe');
  if (temperChargesLeft(item) <= 0) return fail('charges');
  const tempered = item.tempered ?? [];
  const replacing = slot !== undefined && slot < tempered.length;
  if (!replacing && tempered.length >= TEMPERING.maxAffixes) return fail('slots');
  const cost = temperCost(item);
  if (inv.gold < cost) return fail('gold');
  // Never roll the stat the item's other tempered affix already has.
  const keep = replacing ? tempered.filter((_, i) => i !== slot) : tempered;
  const options = recipe.options.filter((o) => !keep.some((k) => k.stat === o.stat));
  if (options.length === 0) return fail('invalid');
  const option = rng.pick(options);
  const rolled: RolledStat = {
    stat: option.stat,
    value: roundStat(rng.range(option.min, option.max) * powerScale(option.scaling, item.itemPower)),
    affix: recipe.id,
  };
  inv.gold -= cost;
  item.tempered = [...tempered];
  if (replacing) item.tempered[slot] = rolled;
  else item.tempered.push(rolled);
  item.temperCharges = temperChargesLeft(item) - 1;
  return { ok: true };
}

// ---- Masterworking -------------------------------------------------------------------------------

export function canMasterwork(item: Item): boolean {
  return !item.crystal && (MASTERWORK.rarities as readonly string[]).includes(item.rarity) && BASE_ITEMS.has(item.base);
}

export interface MasterworkCost {
  gold: number;
  lumen_dust: number;
  rift_shard: number;
}

/** What the next rank costs, or null at the maximum rank. */
export function masterworkCost(item: Item): MasterworkCost | null {
  const rank = (item.masterwork ?? 0) + 1;
  if (rank > MASTERWORK.maxRank) return null;
  return {
    gold: Math.round(MASTERWORK.goldBase * (item.itemPower / 100) * MASTERWORK.goldGrowth ** (rank - 1)),
    lumen_dust: Math.ceil(MASTERWORK.dustBase + MASTERWORK.dustPerRank * rank),
    rift_shard: rank >= MASTERWORK.shardsFrom ? rank - MASTERWORK.shardsFrom + 2 : 0,
  };
}

/** Raises the masterwork rank by one; ranks 4, 8 and 12 also upgrade one random affix by a further 25 %. */
export function masterworkRankUp(rng: Rng, ctx: GameContext, inv: Inventory, item: Item): CraftResult {
  if (!canMasterwork(item)) return fail('invalid');
  const cost = masterworkCost(item);
  if (!cost) return fail('maxRank');
  if (inv.gold < cost.gold) return fail('gold');
  if (materialCount(ctx, 'lumen_dust') < cost.lumen_dust || materialCount(ctx, 'rift_shard') < cost.rift_shard) return fail('materials');
  const affixes = allAffixes(item);
  const rank = (item.masterwork ?? 0) + 1;
  const upgrades = (MASTERWORK.upgradeRanks as readonly number[]).includes(rank);
  if (upgrades && affixes.length === 0) return fail('invalid');
  inv.gold -= cost.gold;
  const mats = ctx.endgame!.materials;
  mats['lumen_dust'] = (mats['lumen_dust'] ?? 0) - cost.lumen_dust;
  if (cost.rift_shard > 0) mats['rift_shard'] = (mats['rift_shard'] ?? 0) - cost.rift_shard;
  item.masterwork = rank;
  if (upgrades) item.masterworkUp = [...(item.masterworkUp ?? []), rng.int(0, affixes.length - 1)];
  return { ok: true };
}

export function masterworkResetCost(item: Item): number {
  return Math.round(MASTERWORK.resetBase * (item.itemPower / 100) * (1 + (item.masterwork ?? 0) / 4));
}

/** Back to rank 0 for gold; the materials are not returned. */
export function masterworkReset(inv: Inventory, item: Item): CraftResult {
  if (!item.masterwork) return fail('invalid');
  const cost = masterworkResetCost(item);
  if (inv.gold < cost) return fail('gold');
  inv.gold -= cost;
  delete item.masterwork;
  delete item.masterworkUp;
  return { ok: true };
}

// ---- Codex of Power ------------------------------------------------------------------------------

/** The dungeon that unlocks an aspect, or null (aspects without a dungeon are never in the Codex). */
export function codexDungeon(aspectId: string): string | null {
  return codexEntries().find(([, a]) => a === aspectId)?.[0] ?? null;
}

export function codexUnlocked(ctx: GameContext, aspectId: string): boolean {
  return ctx.account?.endgame.codex.includes(aspectId) ?? false;
}

/** The first clear of a dungeon unlocks its aspects for the account. Returns the ones that were new, in table order. */
export function unlockCodexForDungeon(ctx: GameContext, dungeonId: string): string[] {
  const codex = ctx.account?.endgame.codex;
  if (!codex) return [];
  const fresh = (CODEX_ASPECTS[dungeonId] ?? []).filter((a) => !codex.includes(a));
  codex.push(...fresh);
  return fresh;
}

/** Aspect strength for a Codex imprint: the middle of its range, pushed up by the World Tier's item power and greater chance. */
export function codexValue(ctx: GameContext, aspectId: string, itemPower: number): number {
  const def = ASPECT_DEFS.get(aspectId);
  if (!def) return 0;
  const mods = tierMods(ctx);
  const t = Math.min(1, 0.5 + mods.greaterChance);
  return roundStat((def.min + (def.max - def.min) * t) * powerScale(def.scaling, itemPower + mods.itemPower));
}

export function codexImprintCost(item: Item): number {
  return Math.round(CODEX_IMPRINT_COST * (item.itemPower / 100));
}

/** Imprints an unlocked Codex aspect without using up anything but gold. Same item rules as the cache imprint. */
export function codexImprint(ctx: GameContext, inv: Inventory, item: Item, aspectId: string): CraftResult {
  if (!codexUnlocked(ctx, aspectId)) return fail('locked');
  if (!canImprint(item, aspectId)) return fail('type');
  const cost = codexImprintCost(item);
  if (inv.gold < cost) return fail('gold');
  inv.gold -= cost;
  item.aspect = { id: aspectId, value: codexValue(ctx, aspectId, item.itemPower) };
  item.rarity = 'legendary';
  return { ok: true };
}
