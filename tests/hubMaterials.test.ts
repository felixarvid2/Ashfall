/** D05 (trader reroll), D09 (salvage preview) and D10 (deposit all materials). */
import { describe, expect, it } from 'vitest';
import type { Inventory } from '../src/core/components';
import { Rng } from '../src/core/rng';
import { emptyAccount } from '../src/core/account';
import { generateItem } from '../src/systems/loot/generate';
import { emptyInventory } from '../src/systems/loot/inventory';
import { salvageDust, salvagePreview } from '../src/systems/endgame/crafting';
import { depositMaterials, payVendorReroll, rerollsToday, salvageJunk, vendorRerollCost, withdrawMaterials } from '../src/systems/hub/services';

const rng = new Rng('hub-materials');
let uid = 0;
const item = (rarity: 'common' | 'magic' | 'rare' | 'legendary') => generateItem(rng, { itemPower: 120, classId: 'bastion', uid: `m-${uid++}`, rarity });
const inv = (gold: number): Inventory => ({ ...emptyInventory(10), gold });

describe('D05 trader reroll', () => {
  it('costs more with every reroll today and more at a higher level', () => {
    const costs = [0, 1, 2, 3].map((n) => vendorRerollCost(10, n));
    expect(costs[0]).toBeGreaterThan(0);
    for (let i = 1; i < costs.length; i++) expect(costs[i]!).toBeGreaterThan(costs[i - 1]!);
    expect(vendorRerollCost(30, 0)).toBeGreaterThan(vendorRerollCost(5, 0));
  });

  it('takes the gold, counts it for the date and starts again on a new date', () => {
    const a = emptyAccount();
    const i = inv(10_000);
    const first = vendorRerollCost(10, 0);
    expect(payVendorReroll(i, 10, a.vendor, '2026-10-05')).toEqual({ ok: true });
    expect(i.gold).toBe(10_000 - first);
    expect(rerollsToday(a.vendor, '2026-10-05')).toBe(1);
    expect(payVendorReroll(i, 10, a.vendor, '2026-10-05')).toEqual({ ok: true });
    expect(10_000 - i.gold).toBe(first + vendorRerollCost(10, 1));
    expect(rerollsToday(a.vendor, '2026-10-06')).toBe(0);
    const before = i.gold;
    expect(payVendorReroll(i, 10, a.vendor, '2026-10-06')).toEqual({ ok: true });
    expect(before - i.gold).toBe(first);
  });

  it('refuses without the gold and charges nothing', () => {
    const a = emptyAccount();
    const i = inv(1);
    expect(payVendorReroll(i, 10, a.vendor, '2026-10-05')).toEqual({ ok: false, reason: 'gold' });
    expect(i.gold).toBe(1);
    expect(a.vendor.rerolls).toBe(0);
  });
});

describe('D09 salvage preview', () => {
  it('lists the materials the same way the salvage pays them', () => {
    const items = [item('common'), item('magic'), item('rare'), item('legendary'), item('legendary')];
    expect(salvagePreview([])).toEqual({ lumen_dust: 0 });
    expect(salvagePreview(items.slice(0, 3)).lumen_dust).toBe(0);
    const expected = items.reduce((sum, i) => sum + salvageDust(i), 0);
    expect(expected).toBeGreaterThan(0);
    expect(salvagePreview(items).lumen_dust).toBe(expected);
  });

  it('salvaging junk reports each salvaged item so its materials can be paid', () => {
    const i = inv(0);
    const marked = item('legendary');
    marked.junk = true;
    i.grid[0] = item('common');
    i.grid[1] = marked;
    i.grid[2] = item('rare');
    const seen: string[] = [];
    salvageJunk(i, undefined, (it) => seen.push(it.uid));
    expect(seen).toHaveLength(2);
    expect(i.grid[2]).not.toBeNull();
    expect(salvagePreview(seen.map((uid2) => marked.uid === uid2 ? marked : item('common'))).lumen_dust).toBe(salvageDust(marked));
  });
});

describe('D10 deposit all materials', () => {
  it('moves every material into the account pool and back', () => {
    const a = emptyAccount();
    const mine: Record<string, number> = { lumen_dust: 12, rift_shard: 3, empty: 0 };
    expect(depositMaterials(mine, a.materials)).toBe(15);
    expect(mine).toEqual({ empty: 0 });
    expect(a.materials).toEqual({ lumen_dust: 12, rift_shard: 3 });
    mine.lumen_dust = 2;
    expect(depositMaterials(mine, a.materials)).toBe(2);
    expect(a.materials.lumen_dust).toBe(14);
    const other: Record<string, number> = { rift_shard: 1 };
    expect(withdrawMaterials(other, a.materials)).toBe(17);
    expect(other).toEqual({ lumen_dust: 14, rift_shard: 4 });
    expect(a.materials).toEqual({});
    expect(depositMaterials({}, a.materials)).toBe(0);
  });
});
