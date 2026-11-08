/**
 * Item sets (C16): a set is a group of unique items; wearing several of them unlocks bonuses at piece thresholds.
 * Item tooltips list the pieces the hero wears and the thresholds (src/ui/itemTooltip.ts). The table is data: a
 * set names its pieces by unique id and its bonuses by a language key (`sets.<id>.bonus<N>`), and the pieces and
 * bonuses of a set are applied by the effect systems, not here.
 */
import type { Item } from './schemas';

export interface ItemSetBonus {
  /** Pieces that must be worn. */
  pieces: number;
  /** Language key of the bonus text. */
  text: string;
}

export interface ItemSetDef {
  id: string;
  /** Unique item ids that belong to the set. */
  pieces: readonly string[];
  bonuses: readonly ItemSetBonus[];
}

/** Every set of the game. */
export const ITEM_SETS: ItemSetDef[] = [];

/** The set an item belongs to (through its unique id), if any. */
export function setOfItem(item: Pick<Item, 'unique'>, sets: readonly ItemSetDef[] = ITEM_SETS): ItemSetDef | undefined {
  const id = item.unique;
  return id ? sets.find((s) => s.pieces.includes(id)) : undefined;
}

export interface SetProgress {
  set: ItemSetDef;
  /** Each piece with whether the hero wears it. */
  pieces: { id: string; worn: boolean }[];
  wornCount: number;
  bonuses: (ItemSetBonus & { active: boolean })[];
}

/** How far the worn items complete `set`: each piece counts once, however many copies are worn. */
export function setProgress(set: ItemSetDef, worn: readonly Pick<Item, 'unique'>[]): SetProgress {
  const wornIds = new Set(worn.map((i) => i.unique).filter((u): u is string => !!u));
  const pieces = set.pieces.map((id) => ({ id, worn: wornIds.has(id) }));
  const wornCount = pieces.filter((p) => p.worn).length;
  return { set, pieces, wornCount, bonuses: set.bonuses.map((b) => ({ ...b, active: wornCount >= b.pieces })) };
}
