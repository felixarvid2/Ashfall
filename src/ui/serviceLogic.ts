/**
 * Pure rules for the service, skill and character panels of the desktop UI pass (docs/ui/diablo-audit-panels.md,
 * B021, B026, B030, B034, B036). No DOM here, so tests can import it.
 */
import { ASPECT_DEFS, BASE_ITEMS } from '../data/loot/db';
import type { Item, ItemType } from '../data/loot/schemas';
import { RANK_DAMAGE } from '../systems/skillCompile';
import type { SkillTree } from '../data/skillTree/schema';
import { learnedSkills, type TreeState } from '../systems/skillTree';

// ---- Stash pages (B021) ----------------------------------------------------------------------------------------

/** Cells per stash page: 6 columns x 4 rows of the unchanged cell size fit without scrolling. */
export const STASH_PAGE_SIZE = 24;

export function stashPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / STASH_PAGE_SIZE));
}

export function clampPage(page: number, total: number): number {
  return Math.max(0, Math.min(page, stashPageCount(total) - 1));
}

/** The stash indexes a page shows: `stash.slice(p * 24, p * 24 + 24)`. */
export function pageIndexes(page: number, total: number): number[] {
  const p = clampPage(page, total);
  const start = p * STASH_PAGE_SIZE;
  const end = Math.min(total, start + STASH_PAGE_SIZE);
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
}

// ---- Codex filters (B026) ------------------------------------------------------------------------------------------

export const ASPECT_CATEGORIES = ['weapon', 'armor', 'jewelry'] as const;
export type AspectCategory = (typeof ASPECT_CATEGORIES)[number];

const TYPE_CATEGORY: Partial<Record<ItemType, AspectCategory>> = {
  weapon: 'weapon',
  offHand: 'weapon',
  helm: 'armor',
  chest: 'armor',
  gloves: 'armor',
  pants: 'armor',
  boots: 'armor',
  amulet: 'jewelry',
  ring: 'jewelry',
};

/** The item groups an aspect can go on (by its `types`). Unknown aspects belong to none. */
export function aspectCategories(aspectId: string): ReadonlySet<AspectCategory> {
  const out = new Set<AspectCategory>();
  for (const type of ASPECT_DEFS.get(aspectId)?.types ?? []) {
    const c = TYPE_CATEGORY[type];
    if (c) out.add(c);
  }
  return out;
}

/** Does the aspect's slot list include this item's type? (Rarity is not looked at: "fits" is about the slot.) */
export function aspectFitsItem(aspectId: string, item: Item): boolean {
  const base = BASE_ITEMS.get(item.base);
  const def = ASPECT_DEFS.get(aspectId);
  return !!base && !!def && !item.crystal && def.types.includes(base.type);
}

/** Which aspects stay in the Codex list: the "fits this item" toggle (needs an item) and one category chip. */
export function codexVisible(aspectId: string, item: Item | null, fitsOnly: boolean, category: AspectCategory | null): boolean {
  if (fitsOnly && item && !aspectFitsItem(aspectId, item)) return false;
  if (category && !aspectCategories(aspectId).has(category)) return false;
  return true;
}

// ---- Skills (B030, B036) ----------------------------------------------------------------------------------------------

/**
 * The damage percentage the next rank of a skill shows. `coefficient` is the skill's current (compiled) coefficient at
 * `rank`; each rank above the first multiplies the base by 1 + RANK_DAMAGE. At rank 0 the skill is not learned yet and
 * the number is its base. Null at the maximum rank.
 */
export function nextRankPercent(coefficient: number, rank: number, max: number): number | null {
  if (rank >= max) return null;
  if (rank <= 0) return Math.round(coefficient * 100);
  return Math.round(((coefficient * (1 + RANK_DAMAGE * rank)) / (1 + RANK_DAMAGE * (rank - 1))) * 100);
}

/** The slot index a number key assigns to: the bar reads LMB, RMB, 1, 2, 3, 4, so key "1" is slot 2. */
export function slotForKey(key: string): number | null {
  const n = Number.parseInt(key, 10);
  return n >= 1 && n <= 4 && String(n) === key ? n + 1 : null;
}

/** Learned active skills that no action bar slot holds. */
export function unassignedSkills(t: SkillTree, state: TreeState, slots: readonly (string | null)[]): string[] {
  return [...learnedSkills(t, state).keys()].filter((skillId) => !slots.includes(skillId));
}

// ---- Character (B034) --------------------------------------------------------------------------------------------------

/** Mean item power of the worn items, rounded; 0 with nothing worn. */
export function averageItemPower(items: readonly (Item | null | undefined)[]): number {
  const powers = items.filter((i): i is Item => !!i).map((i) => i.itemPower);
  return powers.length === 0 ? 0 : Math.round(powers.reduce((a, b) => a + b, 0) / powers.length);
}
