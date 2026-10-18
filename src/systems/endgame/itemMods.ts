/**
 * What tempering and masterworking do to an item's numbers (docs/endgame.md). Pure, and kept apart from
 * crafting.ts so item stat output (loot/generate.ts) and the tooltip can use it without an import cycle.
 */
import { MASTERWORK } from '../../data/endgame/crafting';
import type { Item, RolledStat } from '../../data/loot/schemas';

/** Same rounding as loot/generate.ts roundStat (not imported: generate.ts imports this file). */
function round(value: number): number {
  return Math.abs(value) >= 2 ? Math.round(value) : Math.round(value * 1000) / 1000;
}

/** The rolled affixes followed by the tempered ones: the list masterwork upgrade indices refer to. */
export function allAffixes(item: Item): RolledStat[] {
  return [...item.affixes, ...(item.tempered ?? [])];
}

/** Value multiplier of the affix at `index` in allAffixes(): +5 % per rank, +25 % per upgrade on it. */
export function masterworkMultiplier(item: Item, index: number): number {
  const rank = item.masterwork ?? 0;
  if (rank <= 0) return 1;
  const ups = (item.masterworkUp ?? []).filter((i) => i === index).length;
  return 1 + MASTERWORK.perRank * rank + MASTERWORK.upgrade * ups;
}

/** Affixes and tempered affixes with masterworking applied; `tempered` marks the latter. */
export function effectiveAffixes(item: Item): (RolledStat & { tempered: boolean; boosted: boolean })[] {
  const rolled = item.affixes.length;
  return allAffixes(item).map((a, i) => ({
    ...a,
    value: round(a.value * masterworkMultiplier(item, i)),
    tempered: i >= rolled,
    boosted: (item.masterworkUp ?? []).includes(i),
  }));
}
