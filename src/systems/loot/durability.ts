/**
 * A12: durability. Death wears the equipped gear (10 % of full each time); at 0 an item is broken and gives only its base
 * (implicit) stats, with no affixes, crystals or powers, until the blacksmith repairs it for gold.
 * An item without a `durability` field is at 100 %.
 */
import type { Inventory } from '../../core/components';
import type { Item } from '../../data/loot/schemas';

export const DURABILITY = {
  max: 100,
  /** Points lost by every equipped item when the player dies. */
  deathLoss: 10,
  /** Repair price: gold per item power per 1 % missing (rounded up, at least 1 gold for a worn item). */
  goldPerPowerPoint: 0.06,
};

export const durabilityOf = (item: Item): number => item.durability ?? DURABILITY.max;
export const isBroken = (item: Item): boolean => durabilityOf(item) <= 0;
export const isWorn = (item: Item): boolean => durabilityOf(item) < DURABILITY.max;

/** Wear every equipped item by the death toll. Returns how many items wore and how many broke just now. */
export function wearEquipment(inv: Inventory, loss = DURABILITY.deathLoss): { worn: number; broken: number } {
  let worn = 0;
  let broken = 0;
  for (const item of Object.values(inv.equipped)) {
    if (!item || item.crystal) continue;
    const before = durabilityOf(item);
    if (before <= 0) continue;
    const after = Math.max(0, before - loss);
    item.durability = after;
    worn++;
    if (after <= 0) broken++;
  }
  return { worn, broken };
}

/** Gold to bring one item back to 100 %. */
export function repairCost(item: Item): number {
  const missing = DURABILITY.max - durabilityOf(item);
  return missing <= 0 ? 0 : Math.max(1, Math.ceil(item.itemPower * missing * DURABILITY.goldPerPowerPoint));
}

/** Everything equipped or carried that needs repair, and what it costs together. */
export function repairable(inv: Inventory): Item[] {
  return [...Object.values(inv.equipped), ...inv.grid].filter((i): i is Item => !!i && !i.crystal && isWorn(i));
}
export const repairAllCost = (inv: Inventory): number => repairable(inv).reduce((n, i) => n + repairCost(i), 0);

/** Pay and repair all. Items are repaired in order until the gold runs out, so a short purse still helps the broken ones first. */
export function repairAll(inv: Inventory): { ok: boolean; paid: number; repaired: number } {
  const todo = repairable(inv).sort((a, b) => durabilityOf(a) - durabilityOf(b));
  let paid = 0;
  let repaired = 0;
  for (const item of todo) {
    const cost = repairCost(item);
    if (inv.gold < cost) continue;
    inv.gold -= cost;
    paid += cost;
    delete item.durability;
    repaired++;
  }
  return { ok: repaired === todo.length, paid, repaired };
}
