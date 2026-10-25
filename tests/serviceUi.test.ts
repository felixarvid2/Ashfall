/**
 * Desktop UI pass for the service, skill and character panels (docs/ui/diablo-audit-panels.md B020-B036):
 * the pure rules behind stash pages and sort, buyback, Codex filters, next rank, refund and gear power.
 */
import { describe, expect, it } from 'vitest';
import type { Inventory } from '../src/core/components';
import { Rng } from '../src/core/rng';
import { ASPECT_DEFS, BASE_ITEMS } from '../src/data/loot/db';
import { generateItem } from '../src/systems/loot/generate';
import { emptyInventory } from '../src/systems/loot/inventory';
import { BUYBACK_MAX, buyBack, sell, sellPrice, type BuybackEntry } from '../src/systems/hub/services';
import { RANK_DAMAGE } from '../src/systems/skillCompile';
import { canRefund, learn, newTreeState, pointsInTree, refundCost, refundRank, respecCost, tree } from '../src/systems/skillTree';
import { sortGrid } from '../src/ui/inventoryLogic';
import {
  STASH_PAGE_SIZE,
  aspectFitsItem,
  averageItemPower,
  clampPage,
  codexVisible,
  nextRankPercent,
  pageIndexes,
  slotForKey,
  stashPageCount,
  unassignedSkills,
} from '../src/ui/serviceLogic';

const rng = new Rng('service-ui');
let n = 0;
function item(power = 120, rarity: 'common' | 'magic' | 'rare' | 'legendary' = 'rare', baseId?: string) {
  return generateItem(rng, { itemPower: power, classId: 'bastion', uid: `u-${n++}`, rarity, ...(baseId ? { baseId } : {}) });
}
function inv(gold: number, size = 10): Inventory {
  return { ...emptyInventory(size), gold };
}

describe('stash pages (B021)', () => {
  it('shows 24 cells per page and clamps the page', () => {
    expect(STASH_PAGE_SIZE).toBe(24);
    expect(stashPageCount(50)).toBe(3);
    expect(stashPageCount(24)).toBe(1);
    expect(stashPageCount(25)).toBe(2);
    expect(pageIndexes(0, 50)).toHaveLength(24);
    expect(pageIndexes(2, 50)).toEqual([48, 49]);
    expect(pageIndexes(1, 50)[0]).toBe(24);
    expect(clampPage(9, 50)).toBe(2);
    expect(clampPage(-1, 50)).toBe(0);
  });
});

describe('stash sort (B020)', () => {
  it('puts the item with the highest power first and keeps the length', () => {
    const stash = [null, item(80), item(130), null, item(100)];
    const sorted = sortGrid(stash, 'power');
    expect(sorted).toHaveLength(stash.length);
    expect(sorted.map((i) => i?.itemPower ?? null)).toEqual([130, 100, 80, null, null]);
  });
});

describe('vendor buyback (B023)', () => {
  it('buys a sold item back at the sale price, gold returns to the start', () => {
    const bag = inv(500);
    const it = item(120);
    bag.grid[0] = it;
    const sold: BuybackEntry[] = [];
    const paid = sell(bag, 0, sold);
    expect(paid).toBe(sellPrice(it));
    expect(bag.grid[0]).toBeNull();
    expect(sold).toEqual([{ item: it, price: paid }]);
    expect(buyBack(bag, sold, 0)).toEqual({ ok: true });
    expect(bag.grid.includes(it)).toBe(true);
    expect(bag.gold).toBe(500);
    expect(sold).toHaveLength(0);
  });

  it('keeps the newest 8, and fails without gold or room', () => {
    const bag = inv(0, 12);
    const sold: BuybackEntry[] = [];
    for (let i = 0; i < 10; i++) {
      bag.grid[i] = item(100 + i);
      sell(bag, i, sold);
    }
    expect(sold).toHaveLength(BUYBACK_MAX);
    expect(sold[0]!.item.itemPower).toBe(109);
    bag.gold = 0;
    expect(buyBack(bag, sold, 0)).toEqual({ ok: false, reason: 'gold' });
    bag.gold = 1_000_000;
    bag.grid.fill(item());
    expect(buyBack(bag, sold, 0)).toEqual({ ok: false, reason: 'full' });
    expect(buyBack(bag, sold, 99)).toEqual({ ok: false, reason: 'empty' });
  });

  it('selling without a buyback list works as before', () => {
    const bag = inv(0);
    bag.grid[3] = item();
    expect(sell(bag, 3)).toBeGreaterThan(0);
  });
});

describe('Codex filters (B026)', () => {
  const ring = item(150, 'rare', [...BASE_ITEMS.values()].find((b) => b.type === 'ring')!.id);
  const fits = [...ASPECT_DEFS.values()].find((d) => d.types.includes('ring'))!;
  const misses = [...ASPECT_DEFS.values()].find((d) => !d.types.includes('ring'))!;

  it('"fits this item" hides aspects whose slots do not include the item', () => {
    expect(aspectFitsItem(fits.id, ring)).toBe(true);
    expect(aspectFitsItem(misses.id, ring)).toBe(false);
    expect(codexVisible(fits.id, ring, true, null)).toBe(true);
    expect(codexVisible(misses.id, ring, true, null)).toBe(false);
    expect(codexVisible(misses.id, ring, false, null)).toBe(true);
    // Without an item nothing is hidden by the toggle.
    expect(codexVisible(misses.id, null, true, null)).toBe(true);
  });

  it('a slot group chip keeps only aspects that go on that group', () => {
    expect(codexVisible(fits.id, null, false, 'jewelry')).toBe(true);
    const weaponOnly = [...ASPECT_DEFS.values()].find((d) => d.types.every((t) => t === 'weapon' || t === 'offHand'));
    if (weaponOnly) expect(codexVisible(weaponOnly.id, null, false, 'jewelry')).toBe(false);
  });
});

describe('next rank line (B030)', () => {
  it('shows the next rank damage, and nothing at the maximum', () => {
    // A skill whose rank 1 is 100 %: rank 2 is 110 %, rank 3 is 120 %.
    expect(nextRankPercent(1, 1, 5)).toBe(Math.round((1 + RANK_DAMAGE) * 100));
    const atRank2 = 1 * (1 + RANK_DAMAGE);
    expect(nextRankPercent(atRank2, 2, 5)).toBe(Math.round((1 + 2 * RANK_DAMAGE) * 100));
    expect(nextRankPercent(1.5, 0, 5)).toBe(150);
    expect(nextRankPercent(1.5, 5, 5)).toBeNull();
  });
});

describe('assign by key (B029) and the off-bar dot (B036)', () => {
  it('keys 1-4 are the four numbered slots after LMB and RMB', () => {
    expect(slotForKey('1')).toBe(2);
    expect(slotForKey('4')).toBe(5);
    expect(slotForKey('5')).toBeNull();
    expect(slotForKey('0')).toBeNull();
    expect(slotForKey('q')).toBeNull();
    expect(slotForKey('12')).toBeNull();
  });

  it('lists learned skills that are not on the bar, and drops them once assigned', () => {
    const T = tree('bastion');
    const s = newTreeState(T);
    learn(T, s, 'n.piston_jab', 5);
    const bar = ['bastion.hydraulic_strike', null, null, null, null, null];
    expect(unassignedSkills(T, s, bar)).toEqual(['bastion.piston_jab']);
    bar[2] = 'bastion.piston_jab';
    expect(unassignedSkills(T, s, bar)).toEqual([]);
  });
});

describe('refund one rank (B032)', () => {
  const T = tree('bastion');

  it('returns one rank of a ranked skill and costs a share of the respec price', () => {
    const s = newTreeState(T);
    learn(T, s, 'n.hydraulic_strike', 9);
    learn(T, s, 'n.hydraulic_strike', 9);
    expect(s.ranks['n.hydraulic_strike']).toBe(3);
    expect(refundRank(T, s, 'n.hydraulic_strike')).toEqual({ ok: true });
    expect(s.ranks['n.hydraulic_strike']).toBe(2);
    expect(refundCost(T, 50)).toBeGreaterThan(0);
    expect(refundCost(T, 50)).toBeLessThan(respecCost(T, 50));
  });

  it('keeps the free first rank of the starting skill', () => {
    const s = newTreeState(T);
    expect(canRefund(T, s, T.startingNode)).toEqual({ ok: false, reason: 'start' });
    expect(canRefund(T, s, 'n.piston_jab')).toEqual({ ok: false, reason: 'none' });
  });

  it('refuses the last rank of a node an enhancement hangs on', () => {
    const s = newTreeState(T);
    learn(T, s, 'n.piston_jab', 9);
    learn(T, s, 'e.piston_jab', 9);
    expect(canRefund(T, s, 'n.piston_jab')).toEqual({ ok: false, reason: 'dependent' });
    // The enhancement itself can go, and then the skill can.
    expect(refundRank(T, s, 'e.piston_jab').ok).toBe(true);
    expect(refundRank(T, s, 'n.piston_jab').ok).toBe(true);
    expect(s.ranks['n.piston_jab']).toBeUndefined();
  });

  it('refuses when a learned node would fall below its branch unlock total', () => {
    const s = newTreeState(T);
    // start 1 + piston 4 = 5 points open the defensive branch (unlocks at 5), then one defensive node.
    s.ranks['n.piston_jab'] = 4;
    s.ranks['n.energy_shield'] = 1;
    expect(pointsInTree(s)).toBe(6);
    expect(refundRank(T, s, 'n.piston_jab').ok).toBe(true);
    expect(canRefund(T, s, 'n.piston_jab')).toEqual({ ok: false, reason: 'branch' });
    expect(s.ranks['n.piston_jab']).toBe(3);
  });
});

describe('gear power line (B034)', () => {
  it('is the mean worn item power, rounded', () => {
    const gear = [item(50), item(55), item(55), null, undefined, item(58)];
    expect(averageItemPower(gear)).toBe(55);
    expect(averageItemPower([item(54), item(55), item(55)])).toBe(55); // 54.67
    expect(averageItemPower([])).toBe(0);
    expect(averageItemPower([null, undefined])).toBe(0);
  });
});
