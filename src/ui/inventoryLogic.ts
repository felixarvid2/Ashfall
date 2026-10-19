/**
 * Pure rules for the backpack on touch screens: sorting (P048), filter chips (P049) and which item to compare
 * against in a dual slot (P053). No DOM here, so tests can import it.
 */
import { BASE_ITEMS } from '../data/loot/db';
import { RARITIES, slotsFor, type Item, type Slot } from '../data/loot/schemas';

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

/** Does a cell stay at full strength under a filter chip? `better` says it beats what is worn (compare > 0). */
export function filterMatches(item: Item | null, chip: FilterChip, better: boolean): boolean {
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
