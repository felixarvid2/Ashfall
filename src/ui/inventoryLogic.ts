/**
 * Pure rules for the backpack on touch screens: sorting (P048), filter chips (P049) and which item to compare
 * against in a dual slot (P053). No DOM here, so tests can import it.
 */
import { AFFIX_DEFS, BASE_ITEMS, UNIQUE_DEFS } from '../data/loot/db';
import { RARITIES, slotsFor, type Item, type Slot } from '../data/loot/schemas';
import { masterworkMultiplier } from '../systems/endgame/itemMods';
import { GREATER_MULTIPLIER, powerScale, roundStat } from '../systems/loot/generate';
import { isJunk } from '../systems/loot/inventory';

export { isJunk };

export const SORT_MODES = ['rarity', 'slot', 'power', 'newest'] as const;
export type SortMode = (typeof SORT_MODES)[number];

export const FILTER_CHIPS = ['all', 'weapons', 'armor', 'jewelry', 'crystals', 'better'] as const;
export type FilterChip = (typeof FILTER_CHIPS)[number];

export type ItemCategory = 'weapon' | 'armor' | 'jewelry' | 'crystal' | 'other';

export function itemCategory(item: Item): ItemCategory {
  if (item.crystal) return 'crystal';
  const type = BASE_ITEMS.get(item.base)?.type;
  switch (type) {
    case 'weapon':
    case 'offHand':
      return 'weapon';
    case 'helm':
    case 'chest':
    case 'gloves':
    case 'pants':
    case 'boots':
      return 'armor';
    case 'amulet':
    case 'ring':
      return 'jewelry';
    default:
      return 'other';
  }
}

/**
 * Does a cell stay at full strength under a filter chip? `better` says it beats what is worn (compare > 0).
 * `search` is the optional text predicate of the `/` search (B015): an item must pass it as well as the chip.
 */
export function filterMatches(item: Item | null, chip: FilterChip, better: boolean, search?: (item: Item) => boolean): boolean {
  if (search) {
    if (!item || !search(item)) return false;
  }
  if (chip === 'all') return true;
  if (!item) return false;
  switch (chip) {
    case 'weapons':
      return itemCategory(item) === 'weapon';
    case 'armor':
      return itemCategory(item) === 'armor';
    case 'jewelry':
      return itemCategory(item) === 'jewelry';
    case 'crystals':
      return itemCategory(item) === 'crystal';
    case 'better':
      return better;
  }
}

/** Order in which the equipment slots are listed when sorting by slot. */
const SLOT_ORDER = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring1', 'ring2'] as const;

function slotRank(item: Item): number {
  const base = BASE_ITEMS.get(item.base);
  const slot = base ? slotsFor(base.type)[0] : undefined;
  const i = slot ? SLOT_ORDER.indexOf(slot) : -1;
  return i < 0 ? SLOT_ORDER.length : i;
}

/** The running number at the end of an item uid ("seed-17" -> 17); higher is newer. */
export function uidSequence(uid: string): number {
  const n = Number.parseInt(uid.slice(uid.lastIndexOf('-') + 1), 10);
  return Number.isFinite(n) ? n : 0;
}

/** A new order for the backpack cells: best first, crystals after the gear, empty cells last. Pure. */
export function sortGrid(grid: readonly (Item | null)[], mode: SortMode): (Item | null)[] {
  const rarity = (item: Item) => RARITIES.indexOf(item.rarity);
  const byMode: Record<SortMode, (a: Item, b: Item) => number> = {
    rarity: (a, b) => rarity(b) - rarity(a) || b.itemPower - a.itemPower,
    slot: (a, b) => slotRank(a) - slotRank(b) || b.itemPower - a.itemPower,
    power: (a, b) => b.itemPower - a.itemPower || rarity(b) - rarity(a),
    newest: (a, b) => uidSequence(b.uid) - uidSequence(a.uid),
  };
  const items = grid.filter((i): i is Item => i !== null);
  const gear = items.filter((i) => !i.crystal).sort(byMode[mode]);
  const crystals = items.filter((i) => i.crystal).sort(byMode[mode]);
  const sorted: (Item | null)[] = [...gear, ...crystals];
  while (sorted.length < grid.length) sorted.push(null);
  return sorted;
}

/** Which of an item's slots a swap should default to: an empty one, else the one wearing the weaker item. */
export function defaultTargetSlot(slots: readonly Slot[], equipped: Partial<Record<Slot, Item>>): Slot | undefined {
  const empty = slots.find((s) => !equipped[s]);
  if (empty) return empty;
  return [...slots].sort((a, b) => (equipped[a]?.itemPower ?? 0) - (equipped[b]?.itemPower ?? 0))[0];
}

/** Rarities that ask for a confirmation before they are salvaged. */
export function needsSalvageConfirm(item: Item): boolean {
  return item.rarity !== 'common' && item.rarity !== 'magic';
}

/**
 * Is an item better (1), worse (-1) or the same (0) than what it would replace? Judged by the damage estimate;
 * when that does not move, by life and then by the stat differences (all up = better, all down = worse).
 */
export function upgradeSign(c: { damagePct: number; life: number; stats: { stat: string; delta: number }[] }): -1 | 0 | 1 {
  if (Math.abs(c.damagePct) >= 0.0005) return c.damagePct > 0 ? 1 : -1;
  if (Math.abs(c.life) >= 0.5) return c.life > 0 ? 1 : -1;
  const deltas = c.stats.filter((s) => s.stat !== 'weaponDamage' && Math.abs(s.delta) > 0.0005).map((s) => s.delta);
  if (deltas.length === 0) return 0;
  if (deltas.every((d) => d > 0)) return 1;
  if (deltas.every((d) => d < 0)) return -1;
  return 0;
}


// ---- UI audit B001-B019 helpers (pure) -------------------------------------------------------------------

/** Protect an item (B002): a locked item is skipped by salvage, sell and junk actions. Locking clears a junk mark. */
export function setLocked(item: Item, locked: boolean): void {
  if (locked) {
    item.locked = true;
    item.junk = false;
  } else item.locked = false;
}

/** Mark an item as junk (B003): it joins common and magic gear in "salvage / store / sell junk". Marking clears a lock. */
export function setJunk(item: Item, junk: boolean): void {
  if (junk) {
    item.junk = true;
    item.locked = false;
  } else item.junk = false;
}

/** The backpack items that can be salvaged or sold in bulk: everything not locked. */
export function unlockedIndices(grid: readonly (Item | null)[], indices: Iterable<number>): number[] {
  return [...indices].filter((i) => !!grid[i] && !grid[i]!.locked);
}

/** Junk in a backpack grid for the bulk buttons: grid index, item. Locked items never appear. */
export function junkItems(grid: readonly (Item | null)[]): { index: number; item: Item }[] {
  const out: { index: number; item: Item }[] = [];
  grid.forEach((item, index) => {
    if (item && isJunk(item)) out.push({ index, item });
  });
  return out;
}

/** The slot a ring-like item goes to with Shift+right-click (B011): the one `defaultTargetSlot` would not pick. */
export function otherSlot(slots: readonly Slot[], equipped: Partial<Record<Slot, Item>>): Slot | undefined {
  if (slots.length < 2) return undefined;
  const first = defaultTargetSlot(slots, equipped);
  return slots.find((s) => s !== first);
}

/** Item power gained (positive) or lost against what is worn in the target slot; an empty slot counts as 0. */
export function powerDelta(item: Item, equipped: Item | null | undefined): number {
  return item.itemPower - (equipped?.itemPower ?? 0);
}

/** "+51" / "-12" / "" (equal). */
export function powerDeltaText(delta: number): string {
  if (delta === 0) return '';
  return delta > 0 ? `+${delta}` : `-${Math.abs(delta)}`;
}

/** Where an aspect stands (B017): already in the account's Codex, in this character's cache, or new. */
export function aspectStatus(id: string, cache: readonly { id: string }[], codex: readonly string[]): 'codex' | 'cache' | 'new' {
  if (codex.includes(id)) return 'codex';
  if (cache.some((a) => a.id === id)) return 'cache';
  return 'new';
}

/** Bag fill (B014): `near` from 90 % full, `full` when no cell is free. */
export function bagFill(used: number, max: number): 'ok' | 'near' | 'full' {
  if (max > 0 && used >= max) return 'full';
  return max > 0 && used >= Math.ceil(max * 0.9) ? 'near' : 'ok';
}

/** Every whitespace-separated word of `query` appears in `haystack` (case-insensitive). Empty query matches all. */
export function textMatches(haystack: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = haystack.toLowerCase();
  return words.every((w) => text.includes(w));
}

/** Inclusive run of backpack indices between two cells (Shift+click range in select mode, B016). */
export function indexRange(a: number, b: number): number[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/**
 * The range an affix could have rolled at this item's power (B009), printed next to the value. It mirrors the
 * roll in loot/generate.ts (scale, round, greater x1.5, round) and the masterwork boost, so the shown value
 * always lies inside it. `index` is the position in `item.affixes`; tempered affixes have no range (null).
 */
export function affixRollRange(item: Item, index: number): { min: number; max: number } | null {
  const rolled = item.affixes[index];
  if (!rolled?.affix) return null;
  const def = rolled.affix.startsWith('unique:')
    ? UNIQUE_DEFS.get(item.unique ?? '')?.affixes.find((a) => a.stat === rolled.stat)
    : AFFIX_DEFS.get(rolled.affix);
  if (!def) return null;
  const scale = powerScale(def.scaling, item.itemPower);
  const greater = rolled.greater ? GREATER_MULTIPLIER : 1;
  const boost = masterworkMultiplier(item, index);
  const edge = (v: number) => roundStat(roundStat(roundStat(v * scale) * greater) * boost);
  return { min: edge(def.min), max: edge(def.max) };
}

/** Is a roll in the top fifth of its range (B009)? */
export function isHighRoll(value: number, range: { min: number; max: number }): boolean {
  return range.max > range.min && (value - range.min) / (range.max - range.min) >= 0.8;
}
