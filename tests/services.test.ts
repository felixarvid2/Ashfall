import { describe, expect, it } from 'vitest';
import type { Inventory } from '../src/core/components';
import { Rng } from '../src/core/rng';
import { emptyAccount, AccountSchema } from '../src/core/account';
import { ASPECT_DEFS, BASE_ITEMS } from '../src/data/loot/db';
import { BLACKSMITH, STASH, VENDOR } from '../src/data/services';
import { generateItem } from '../src/systems/loot/generate';
import { emptyInventory } from '../src/systems/loot/inventory';
import {
  buy,
  buyPrice,
  canImprint,
  extractAspect,
  fromStash,
  imprintAspect,
  rerollAffix,
  rerollCost,
  rollVendorStock,
  salvageJunk,
  sell,
  sellPrice,
  stashSlots,
  toStash,
} from '../src/systems/hub/services';

let uid = 0;
const next = () => `t-${uid++}`;
const rng = new Rng('services');

function item(rarity: 'common' | 'magic' | 'rare' | 'legendary', baseId?: string) {
  return generateItem(rng, { itemPower: 120, classId: 'bastion', uid: next(), rarity, ...(baseId ? { baseId } : {}) });
}

function inv(gold = 10000): Inventory {
  return { ...emptyInventory(10), gold };
}

describe('hub services', () => {
  it('the trader stocks items for your class and level, sells them at a markup', () => {
    const stock = rollVendorStock(new Rng('v'), 5, 'spectre', next);
    expect(stock).toHaveLength(VENDOR.stockSize);
    expect(stock.every((i) => i.rarity !== 'common')).toBe(true);
    const i = inv(0);
    expect(buy(i, stock, 0)).toEqual({ ok: false, reason: 'gold' });
    i.gold = buyPrice(stock[0]!);
    expect(buy(i, stock, 0)).toEqual({ ok: true });
    expect(i.gold).toBe(0);
    expect(stock[0]).toBeNull();
    expect(buyPrice(i.grid[0]!)).toBeGreaterThan(sellPrice(i.grid[0]!));
    const price = sellPrice(i.grid[0]!);
    expect(sell(i, 0)).toBe(price);
    expect(i.gold).toBe(price);
    expect(i.grid[0]).toBeNull();
  });

  it('the blacksmith rerolls one affix to a new one, and each try costs more', () => {
    const it = item('rare');
    const i = inv();
    const before = it.affixes.map((a) => a.affix);
    const cost = rerollCost(it);
    expect(rerollAffix(new Rng('r'), i, it, 0)).toEqual({ ok: true });
    expect(i.gold).toBe(10000 - cost);
    expect(it.affixes[0]!.affix).not.toBe(before[0]);
    expect(new Set(it.affixes.map((a) => a.affix)).size).toBe(it.affixes.length);
    expect(it.affixes.slice(1).map((a) => a.affix)).toEqual(before.slice(1));
    expect(rerollCost(it)).toBe(Math.round(cost * BLACKSMITH.rerollGrowth));
  });

  it('salvages the junk only', () => {
    const i = inv(0);
    i.grid[0] = item('common');
    i.grid[1] = item('magic');
    i.grid[2] = item('rare');
    expect(salvageJunk(i)).toBeGreaterThan(0);
    expect(i.grid.slice(0, 3).map((x) => x?.rarity ?? null)).toEqual([null, null, 'rare']);
  });

  it('the Technician extracts an aspect (destroying the item) and imprints it on a rare', () => {
    const i = inv();
    let legendary = item('legendary');
    while (!legendary.aspect) legendary = item('legendary');
    i.grid[0] = legendary;
    expect(extractAspect(i, 0)).toEqual({ ok: true });
    expect(i.grid[0]).toBeNull();
    expect(i.aspects).toEqual([legendary.aspect]);
    const types = ASPECT_DEFS.get(legendary.aspect!.id)!.types;
    const base = [...BASE_ITEMS.values()].find((b) => types.includes(b.type) && (!b.classes || b.classes.includes('bastion')))!;
    const target = item('rare', base.id);
    expect(canImprint(target, legendary.aspect!.id)).toBe(true);
    expect(imprintAspect(i, 0, target)).toEqual({ ok: true });
    expect(target.rarity).toBe('legendary');
    expect(target.aspect).toEqual(legendary.aspect);
    expect(i.aspects).toEqual([]);
    expect(extractAspect(i, 5)).toEqual({ ok: false, reason: 'empty' });
    i.grid[1] = item('rare');
    expect(extractAspect(i, 1)).toEqual({ ok: false, reason: 'noAspect' });
  });

  it('the stash is shared and survives the account round trip', () => {
    const account = emptyAccount();
    const stash = stashSlots(account.stash, 0);
    expect(stash).toHaveLength(STASH.baseSlots);
    const i = inv();
    i.grid[0] = item('rare');
    expect(toStash(i, 0, stash)).toEqual({ ok: true });
    const restored = AccountSchema.parse(JSON.parse(JSON.stringify(account)));
    expect(restored.stash.filter(Boolean)).toHaveLength(1);
    const other = inv();
    expect(fromStash(other, restored.stash, 0)).toEqual({ ok: true });
    expect(other.grid[0]?.rarity).toBe('rare');
  });
});
