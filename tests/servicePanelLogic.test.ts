import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { RECIPE_DEFS } from '../src/data/endgame/crafting';
import { RIFT } from '../src/data/endgame/rifts';
import { TIER_TABLE, WORLD_TIERS } from '../src/data/endgame/tiers';
import type { Item } from '../src/data/loot/schemas';
import { generateItem, salvageValue } from '../src/systems/loot/generate';
import { salvageJunk } from '../src/systems/hub/services';
import { CONFIRM_GOLD, junkSummary, needsConfirm, rangeText, temperRange } from '../src/ui/servicePanel';
import { tierChips } from '../src/ui/tierPanel';

function item(rarity: Item['rarity'], power = 200, uid = `i-${rarity}-${power}`): Item {
  return generateItem(new Rng(7), { itemPower: power, classId: 'bastion', uid, rarity });
}

describe('service panel confirmations (P013)', () => {
  it('asks for rare or better items and for costs from the gold threshold', () => {
    expect(needsConfirm(item('common'), 10)).toBe(false);
    expect(needsConfirm(item('magic'), CONFIRM_GOLD - 1)).toBe(false);
    expect(needsConfirm(item('magic'), CONFIRM_GOLD)).toBe(true);
    for (const r of ['rare', 'legendary', 'unique', 'mythic'] as const) expect(needsConfirm(item(r), 1)).toBe(true);
  });
});

describe('salvage all (P091)', () => {
  it('counts exactly the common and magic items, with their gold', () => {
    const grid: (Item | null)[] = [item('common', 100, 'a'), null, item('magic', 120, 'b'), item('rare', 200, 'c'), item('legendary', 300, 'd')];
    const junk = junkSummary(grid);
    expect(junk.items.map((e) => e.index)).toEqual([0, 2]);
    expect(junk.gold).toBe(salvageValue(grid[0]!) + salvageValue(grid[2]!));
  });

  it('keeps the indexes it is told to keep and removes the rest', () => {
    const grid: (Item | null)[] = [item('common', 100, 'a'), item('magic', 120, 'b'), item('rare', 200, 'c')];
    const inv = { gold: 0, grid, equipped: {} } as never as Parameters<typeof salvageJunk>[0];
    const gold = salvageJunk(inv, new Set([0]));
    expect(inv.grid.map((i) => i?.uid ?? null)).toEqual(['a', null, 'c']);
    expect(gold).toBe(salvageValue(item('magic', 120, 'b')));
    expect(salvageJunk(inv)).toBe(salvageValue(item('common', 100, 'a')));
    expect(inv.grid.map((i) => i?.uid ?? null)).toEqual([null, null, 'c']);
  });
});

describe('tempering ranges (P089)', () => {
  it('scales the recipe option range with item power like a rolled affix', () => {
    const crit = RECIPE_DEFS.get('temper.offense.crit')!;
    const [chance, damage] = crit.options;
    expect(temperRange(chance!, 100)).toEqual({ min: 0.03, max: 0.05 });
    const hi = temperRange(damage!, 400);
    expect(hi.min).toBeGreaterThan(damage!.min);
    expect(hi.max).toBeGreaterThan(hi.min);
    expect(rangeText(chance!, 100)).toBe('+3.0–5.0% Critical Strike Chance');
  });

  it('shows flat stats without a percent sign', () => {
    const ward = RECIPE_DEFS.get('temper.defense.ward')!;
    const armor = ward.options.find((o) => o.stat === 'armor')!;
    expect(rangeText(armor, 100)).toMatch(/^\+\d+–\d+ /);
  });
});

describe('tier chips (P097)', () => {
  it('compares each tier with the one in effect', () => {
    const chips = tierChips(3, 2);
    expect(chips).toHaveLength(3);
    expect(chips[0]!.tone).toBe('harder');
    expect(chips[1]!.tone).toBe('better');
    expect(tierChips(1, 3)[0]!.tone).toBe('easier');
    expect(tierChips(2, 2).every((c) => c.tone === '')).toBe(true);
  });

  it('every locked rift tier has a rift level to show progress against', () => {
    expect(RIFT.tierUnlocks.map((u) => u.tier)).toEqual([3, 4]);
    expect(WORLD_TIERS.every((n) => n in TIER_TABLE)).toBe(true);
  });
});
