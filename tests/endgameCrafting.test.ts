import { describe, expect, it } from 'vitest';
import type { Inventory } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { Rng } from '../src/core/rng';
import { SaveDataSchema } from '../src/core/save';
import { CODEX_ASPECTS, MASTERWORK, RECIPES, RECIPE_DEFS, RECIPE_IDS, SALVAGE_DUST, TEMPERING } from '../src/data/endgame/crafting';
import { INSTANCES } from '../src/data/instances';
import { TIER_TABLE } from '../src/data/endgame/tiers';
import { ASPECT_DEFS, BASE_ITEMS } from '../src/data/loot/db';
import { STAT_KEYS } from '../src/data/loot/schemas';
import {
  canTemper,
  codexDungeon,
  codexImprint,
  codexImprintCost,
  codexValue,
  grantMaterial,
  grantRecipe,
  grantSalvageDust,
  masterworkCost,
  masterworkRankUp,
  masterworkReset,
  masterworkResetCost,
  temperChargesLeft,
  temperCost,
  temperItem,
  unlockCodexForDungeon,
} from '../src/systems/endgame/crafting';
import { effectiveAffixes, masterworkMultiplier } from '../src/systems/endgame/itemMods';
import { generateItem, itemStats, powerScale, roundStat } from '../src/systems/loot/generate';
import { emptyInventory } from '../src/systems/loot/inventory';
import { salvage } from '../src/systems/loot/inventory';
import { makeCtx } from './helpers';

const WEAPON = 'hydraulic_hammer';
let uid = 0;
const rng = new Rng('endgame-crafting');

function item(rarity: 'common' | 'magic' | 'rare' | 'legendary' | 'unique' | 'mythic' = 'rare', baseId?: string) {
  const it = generateItem(rng, { itemPower: 140, classId: 'bastion', uid: `c-${uid++}`, rarity: rarity === 'unique' || rarity === 'mythic' ? 'rare' : rarity, ...(baseId ? { baseId } : {}) });
  if (rarity === 'unique' || rarity === 'mythic') it.rarity = rarity;
  return it;
}

function inv(gold = 1_000_000): Inventory {
  return { ...emptyInventory(10), gold };
}

/** A context with a character's endgame state and an account at the given World Tier. */
function ctxAt(tier = 2) {
  const ctx = makeCtx();
  ctx.endgame = SaveDataSchema.shape.endgame.parse(undefined);
  ctx.account = emptyAccount();
  ctx.account.endgame.tierUnlocked = tier;
  return ctx;
}

describe('recipes', () => {
  it('there are twelve, three per group, with valid stats and ranges', () => {
    expect(RECIPES).toHaveLength(12);
    expect(RECIPE_IDS).toEqual(RECIPES.map((r) => r.id));
    expect(new Set(RECIPE_IDS).size).toBe(12);
    for (const g of ['offense', 'defense', 'utility', 'mobility']) expect(RECIPES.filter((r) => r.group === g)).toHaveLength(3);
    for (const r of RECIPES) {
      expect(r.id.startsWith(`temper.${r.group}.`)).toBe(true);
      expect(r.options.length).toBeGreaterThan(0);
      for (const o of r.options) {
        expect(STAT_KEYS).toContain(o.stat);
        expect(o.max).toBeGreaterThan(o.min);
      }
    }
  });

  it('can be granted once, with the existing entry points', () => {
    const ctx = ctxAt();
    expect(grantRecipe(ctx, RECIPE_IDS[0]!)).toBe(true);
    expect(grantRecipe(ctx, RECIPE_IDS[0]!)).toBe(false);
    grantMaterial(ctx, 'rift_shard', 3.9);
    expect(ctx.endgame!.materials['rift_shard']).toBe(3);
  });
});

describe('tempering', () => {
  const recipe = 'temper.offense.crit';

  it('is locked below World Tier 2 and needs a learned recipe', () => {
    const it = item('rare');
    const bag = inv();
    const locked = ctxAt(1);
    grantRecipe(locked, recipe);
    expect(temperItem(rng, locked, bag, it, recipe)).toEqual({ ok: false, reason: 'locked' });
    const ctx = ctxAt(2);
    expect(temperItem(rng, ctx, bag, it, recipe)).toEqual({ ok: false, reason: 'recipe' });
    expect(it.tempered).toBeUndefined();
  });

  it('works on rare and better only', () => {
    const ctx = ctxAt();
    grantRecipe(ctx, recipe);
    expect(canTemper(item('magic'))).toBe(false);
    expect(temperItem(rng, ctx, inv(), item('magic'), recipe)).toEqual({ ok: false, reason: 'invalid' });
    for (const r of ['rare', 'legendary', 'unique', 'mythic'] as const) expect(canTemper(item(r))).toBe(true);
  });

  it('adds one affix from the recipe, scaled with item power, and at most two', () => {
    const ctx = ctxAt();
    grantRecipe(ctx, recipe);
    const bag = inv();
    const it = item('legendary');
    const gold = bag.gold;
    expect(temperItem(rng, ctx, bag, it, recipe)).toEqual({ ok: true });
    expect(it.tempered).toHaveLength(1);
    expect(bag.gold).toBe(gold - temperCost({ ...it, temperCharges: undefined } as never));
    const stats = RECIPE_DEFS.get(recipe)!.options.map((o) => o.stat);
    expect(stats).toContain(it.tempered![0]!.stat);
    expect(it.tempered![0]!.affix).toBe(recipe);
    expect(temperItem(rng, ctx, bag, it, recipe)).toEqual({ ok: true });
    expect(it.tempered).toHaveLength(2);
    expect(new Set(it.tempered!.map((a) => a.stat)).size).toBe(2);
    // Full: adding needs a slot to replace.
    expect(temperItem(rng, ctx, bag, it, recipe)).toEqual({ ok: false, reason: 'slots' });
  });

  it('replacing a slot costs a charge, and five charges is all an item gets', () => {
    const ctx = ctxAt();
    grantRecipe(ctx, 'temper.offense.fury');
    const bag = inv();
    const it = item('rare');
    expect(temperChargesLeft(it)).toBe(TEMPERING.charges);
    expect(temperItem(rng, ctx, bag, it, 'temper.offense.fury')).toEqual({ ok: true });
    expect(temperItem(rng, ctx, bag, it, 'temper.offense.fury')).toEqual({ ok: true });
    expect(temperItem(rng, ctx, bag, it, 'temper.offense.fury', 1)).toEqual({ ok: true });
    expect(it.tempered).toHaveLength(2);
    expect(it.tempered![0]!.stat).not.toBe(it.tempered![1]!.stat);
    expect(temperChargesLeft(it)).toBe(2);
    temperItem(rng, ctx, bag, it, 'temper.offense.fury', 0);
    temperItem(rng, ctx, bag, it, 'temper.offense.fury', 1);
    expect(temperChargesLeft(it)).toBe(0);
    const gold = bag.gold;
    expect(temperItem(rng, ctx, bag, it, 'temper.offense.fury', 0)).toEqual({ ok: false, reason: 'charges' });
    expect(bag.gold).toBe(gold);
  });

  it('costs more with each charge spent and refuses without gold', () => {
    const it = item('rare');
    const first = temperCost(it);
    it.temperCharges = 2;
    expect(temperCost(it)).toBeGreaterThan(first);
    const ctx = ctxAt();
    grantRecipe(ctx, recipe);
    expect(temperItem(rng, ctx, inv(0), item('rare'), recipe)).toEqual({ ok: false, reason: 'gold' });
  });
});

describe('masterworking', () => {
  it('costs gold and Lumen Dust, plus Rift Shards from rank 5', () => {
    const it = item('legendary');
    const costs = Array.from({ length: MASTERWORK.maxRank }, (_, i) => masterworkCost({ ...it, masterwork: i })!);
    expect(costs.slice(0, 4).every((c) => c.rift_shard === 0)).toBe(true);
    expect(costs.slice(4).every((c) => c.rift_shard > 0)).toBe(true);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]!.gold).toBeGreaterThan(costs[i - 1]!.gold);
      expect(costs[i]!.lumen_dust).toBeGreaterThanOrEqual(costs[i - 1]!.lumen_dust);
    }
    expect(costs[11]!.lumen_dust).toBeGreaterThan(costs[0]!.lumen_dust);
    expect(masterworkCost({ ...it, masterwork: 12 })).toBeNull();
  });

  it('refuses without materials and takes them when it works', () => {
    const ctx = ctxAt();
    const bag = inv();
    const it = item('legendary');
    expect(masterworkRankUp(rng, ctx, bag, it)).toEqual({ ok: false, reason: 'materials' });
    const cost = masterworkCost(it)!;
    grantMaterial(ctx, 'lumen_dust', cost.lumen_dust + 1);
    const gold = bag.gold;
    expect(masterworkRankUp(rng, ctx, bag, it)).toEqual({ ok: true });
    expect(it.masterwork).toBe(1);
    expect(bag.gold).toBe(gold - cost.gold);
    expect(ctx.endgame!.materials['lumen_dust']).toBe(1);
    expect(masterworkRankUp(rng, ctx, inv(0), it)).toEqual({ ok: false, reason: 'gold' });
  });

  it('adds 5% per rank to every affix and upgrades one affix at ranks 4, 8 and 12', () => {
    const ctx = ctxAt();
    grantMaterial(ctx, 'lumen_dust', 1000);
    grantMaterial(ctx, 'rift_shard', 1000);
    const bag = inv(100_000_000);
    const it = item('legendary');
    it.affixes = [{ stat: 'damage', value: 0.1, affix: 'damage' }, { stat: 'maxLife', value: 100, affix: 'max_life' }];
    for (let rank = 1; rank <= 3; rank++) {
      expect(masterworkRankUp(rng, ctx, bag, it)).toEqual({ ok: true });
      expect(it.masterworkUp ?? []).toHaveLength(0);
      expect(masterworkMultiplier(it, 0)).toBeCloseTo(1 + 0.05 * rank);
    }
    expect(effectiveAffixes(it)[1]!.value).toBe(115);
    masterworkRankUp(rng, ctx, bag, it);
    expect(it.masterwork).toBe(4);
    expect(it.masterworkUp).toHaveLength(1);
    const up = it.masterworkUp![0]!;
    expect(masterworkMultiplier(it, up)).toBeCloseTo(1 + 0.2 + 0.25);
    expect(masterworkMultiplier(it, 1 - up)).toBeCloseTo(1.2);
    while ((it.masterwork ?? 0) < 12) expect(masterworkRankUp(rng, ctx, bag, it)).toEqual({ ok: true });
    expect(it.masterworkUp).toHaveLength(3);
    expect(masterworkRankUp(rng, ctx, bag, it)).toEqual({ ok: false, reason: 'maxRank' });
  });

  it('resets for gold, clearing rank and upgrades', () => {
    const ctx = ctxAt();
    grantMaterial(ctx, 'lumen_dust', 100);
    grantMaterial(ctx, 'rift_shard', 100);
    const bag = inv(10_000_000);
    const it = item('rare');
    expect(masterworkReset(bag, it)).toEqual({ ok: false, reason: 'invalid' });
    for (let i = 0; i < 4; i++) masterworkRankUp(rng, ctx, bag, it);
    expect(it.masterworkUp).toHaveLength(1);
    expect(masterworkResetCost(it)).toBeGreaterThan(0);
    const gold = bag.gold;
    expect(masterworkReset(bag, it)).toEqual({ ok: true });
    expect(bag.gold).toBe(gold - masterworkResetCost({ ...it, masterwork: 4 }));
    expect(it.masterwork ?? 0).toBe(0);
    expect(it.masterworkUp).toBeUndefined();
    expect(masterworkReset(inv(0), { ...it, masterwork: 3 })).toEqual({ ok: false, reason: 'gold' });
  });
});

describe('salvage', () => {
  it('gives Lumen Dust for legendaries, uniques and mythics only', () => {
    const ctx = ctxAt();
    const bag = inv(0);
    for (const rarity of ['common', 'magic', 'rare'] as const) expect(grantSalvageDust(ctx, item(rarity))).toBe(0);
    expect(ctx.endgame!.materials['lumen_dust']).toBeUndefined();
    for (const rarity of ['legendary', 'unique', 'mythic'] as const) {
      const it = item(rarity);
      bag.grid[0] = it;
      expect(grantSalvageDust(ctx, it)).toBe(SALVAGE_DUST[rarity]);
      expect(salvage(bag, 0)).toBeGreaterThan(0);
    }
    expect(ctx.endgame!.materials['lumen_dust']).toBe(SALVAGE_DUST['legendary']! + SALVAGE_DUST['unique']! + SALVAGE_DUST['mythic']!);
  });
});

describe('item stats', () => {
  it('include tempered affixes and masterwork multipliers', () => {
    const it = item('rare');
    it.implicits = [];
    it.sockets = [];
    it.affixes = [{ stat: 'maxLife', value: 100, affix: 'max_life' }];
    const sum = (stat: string) => itemStats(it).filter((s) => s.stat === stat).reduce((a, s) => a + s.value, 0);
    expect(sum('maxLife')).toBe(100);
    it.tempered = [{ stat: 'moveSpeed', value: 0.08, affix: 'temper.mobility.stride' }, { stat: 'maxLife', value: 40, affix: 'temper.defense.vitality' }];
    expect(sum('moveSpeed')).toBeCloseTo(0.08);
    expect(sum('maxLife')).toBe(140);
    it.masterwork = 10;
    it.masterworkUp = [0];
    expect(sum('maxLife')).toBe(Math.round(100 * 1.75) + Math.round(40 * 1.5));
    expect(sum('moveSpeed')).toBeCloseTo(0.12);
  });

  it('are unchanged for plain items', () => {
    const it = item('rare');
    const plain = [...it.implicits, ...it.affixes].map((s) => [s.stat, s.value]);
    expect(itemStats({ ...it, sockets: [] }).map((s) => [s.stat, s.value])).toEqual(plain);
  });
});

describe('Codex of Power', () => {
  it('maps every dungeon to a distinct, real aspect', () => {
    const dungeons = INSTANCES.filter((i) => i.kind === 'dungeon' && i.id !== 'deep_rift').map((i) => i.id);
    expect(Object.keys(CODEX_ASPECTS).sort()).toEqual([...dungeons].sort());
    const aspects = Object.values(CODEX_ASPECTS);
    expect(new Set(aspects).size).toBe(aspects.length);
    for (const a of aspects) expect(ASPECT_DEFS.has(a)).toBe(true);
    expect(codexDungeon('brutality')).toBe('meridians_hold');
    expect(codexDungeon('echo')).toBeNull();
  });

  it('unlocks an aspect on the first clear only, for the account', () => {
    const ctx = ctxAt();
    expect(unlockCodexForDungeon(ctx, 'meridians_hold')).toBe('brutality');
    expect(unlockCodexForDungeon(ctx, 'meridians_hold')).toBeNull();
    expect(unlockCodexForDungeon(ctx, 'not_a_dungeon')).toBeNull();
    expect(unlockCodexForDungeon(ctx, 'dm_bunker')).toBeNull();
    expect(ctx.account!.endgame.codex).toEqual(['brutality']);
    expect(unlockCodexForDungeon(makeCtx(), 'archive')).toBeNull();
  });

  it('imprints unlocked aspects without limit and without a cache', () => {
    const ctx = ctxAt();
    const bag = inv();
    const weapon = item('rare', WEAPON);
    expect(codexImprint(ctx, bag, weapon, 'brutality')).toEqual({ ok: false, reason: 'locked' });
    unlockCodexForDungeon(ctx, 'meridians_hold');
    const gold = bag.gold;
    for (let i = 0; i < 3; i++) {
      const w = item('rare', weapon.base);
      expect(codexImprint(ctx, bag, w, 'brutality')).toEqual({ ok: true });
      expect(w.rarity).toBe('legendary');
      expect(w.aspect!.id).toBe('brutality');
      expect(w.aspect!.value).toBe(codexValue(ctx, 'brutality', w.itemPower));
    }
    expect(bag.gold).toBe(gold - 3 * codexImprintCost(weapon));
    expect(bag.aspects ?? []).toHaveLength(0);
    // Wrong item type: brutality is not for boots.
    expect(codexImprint(ctx, bag, item('rare', 'mag_boots'), 'brutality')).toEqual({ ok: false, reason: 'type' });
    expect(codexImprint(ctx, inv(0), item('rare', weapon.base), 'brutality')).toEqual({ ok: false, reason: 'gold' });
  });

  it('scales its value within the aspect range (and by the World Tier through tierMods)', () => {
    const ctx = ctxAt();
    const base = codexValue(ctx, 'brutality', 100);
    const def = ASPECT_DEFS.get('brutality')!;
    expect(base).toBeGreaterThanOrEqual(def.min);
    expect(base).toBeLessThanOrEqual(def.max * 1.7);
  });

  it('follows the real tierMods: stronger with every tier, from the chosen tier only', () => {
    const def = ASPECT_DEFS.get('brutality')!;
    const at = (unlocked: number, chosen: number) => {
      const ctx = ctxAt(unlocked);
      ctx.account!.endgame.tier = chosen;
      return codexValue(ctx, 'brutality', 140);
    };
    const values = [1, 2, 3, 4].map((n) => at(4, n));
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    // Tier 1 is the middle of the range at the item's own power.
    const mid = (def.min + def.max) / 2;
    expect(values[0]!).toBeCloseTo(roundStat(mid * powerScale(def.scaling, 140)), 5);
    // The exact formula, per tier.
    for (const n of [2, 3, 4] as const) {
      const row = TIER_TABLE[n];
      const tt = Math.min(1, 0.5 + row.greaterChance);
      expect(values[n - 1]!).toBeCloseTo(roundStat((def.min + (def.max - def.min) * tt) * powerScale(def.scaling, 140 + row.itemPower)), 5);
    }
    // A tier that is chosen but not unlocked does not count; neither does a context without an account.
    expect(at(1, 4)).toBe(values[0]);
    expect(codexValue(makeCtx(), 'brutality', 140)).toBe(values[0]);
  });
});
