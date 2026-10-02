/** Inventory rules: backpack grid, equipping, salvaging and socketing. Pure functions on Inventory. */
import type { Inventory } from '../../core/components';
import { BASE_ITEMS } from '../../data/loot/db';
import { slotsFor, type Item, type Slot } from '../../data/loot/schemas';
import { canEquip, salvageValue } from './generate';

export type Result = { ok: true } | { ok: false; reason: 'full' | 'class' | 'notEquippable' | 'noSocket' | 'notCrystal' | 'empty' };

export function emptyInventory(size: number): Inventory {
  return { grid: Array.from({ length: size }, () => null), equipped: {}, gold: 0 };
}

export function freeCells(inv: Inventory): number {
  return inv.grid.filter((c) => c === null).length;
}

export function addToGrid(inv: Inventory, item: Item): Result {
  const i = inv.grid.indexOf(null);
  if (i < 0) return { ok: false, reason: 'full' };
  inv.grid[i] = item;
  return { ok: true };
}

/** Slot an item would go into: the first empty valid slot, else the first valid slot. */
export function targetSlot(inv: Inventory, item: Item): Slot | null {
  const base = BASE_ITEMS.get(item.base);
  if (!base) return null;
  const slots = slotsFor(base.type);
  return slots.find((s) => !inv.equipped[s]) ?? slots[0] ?? null;
}

/** Equip the grid item at `index`; whatever was in the slot goes back to that grid cell. */
export function equipFromGrid(inv: Inventory, index: number, classId: string, slot?: Slot): Result {
  const item = inv.grid[index];
  if (!item) return { ok: false, reason: 'empty' };
  const base = BASE_ITEMS.get(item.base);
  if (!base || slotsFor(base.type).length === 0) return { ok: false, reason: 'notEquippable' };
  if (!canEquip(base, classId)) return { ok: false, reason: 'class' };
  const target = slot && slotsFor(base.type).includes(slot) ? slot : targetSlot(inv, item);
  if (!target) return { ok: false, reason: 'notEquippable' };
  const previous = inv.equipped[target] ?? null;
  inv.equipped[target] = item;
  inv.grid[index] = previous;
  return { ok: true };
}

export function unequip(inv: Inventory, slot: Slot): Result {
  const item = inv.equipped[slot];
  if (!item) return { ok: false, reason: 'empty' };
  const r = addToGrid(inv, item);
  if (r.ok) delete inv.equipped[slot];
  return r;
}

/** Destroy a grid item for gold. Returns gold gained (0 if the cell was empty). */
export function salvage(inv: Inventory, index: number): number {
  const item = inv.grid[index];
  if (!item) return 0;
  const gold = salvageValue(item);
  inv.grid[index] = null;
  inv.gold += gold;
  return gold;
}

/** Put the crystal at grid `crystalIndex` into the first free socket of `target`. */
export function socketCrystal(inv: Inventory, crystalIndex: number, target: { grid: number } | { slot: Slot }): Result {
  const crystal = inv.grid[crystalIndex];
  if (!crystal) return { ok: false, reason: 'empty' };
  if (!crystal.crystal) return { ok: false, reason: 'notCrystal' };
  const item = 'grid' in target ? inv.grid[target.grid] : inv.equipped[target.slot];
  if (!item || item.crystal) return { ok: false, reason: 'noSocket' };
  const free = item.sockets.indexOf(null);
  if (free < 0) return { ok: false, reason: 'noSocket' };
  item.sockets[free] = { crystal: crystal.crystal.id, tier: crystal.crystal.tier };
  inv.grid[crystalIndex] = null;
  return { ok: true };
}
