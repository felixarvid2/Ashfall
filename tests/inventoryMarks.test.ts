import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { AFFIX_DEFS, BASE_ITEMS } from '../src/data/loot/db';
import type { Item } from '../src/data/loot/schemas';
import { slotsFor } from '../src/data/loot/schemas';
import { effectiveAffixes } from '../src/systems/endgame/itemMods';
import { generateItem } from '../src/systems/loot/generate';
import { emptyInventory, isJunk, salvage } from '../src/systems/loot/inventory';
import { sell, salvageJunk } from '../src/systems/hub/services';
import {
  affixRollRange,
  aspectStatus,
  bagFill,
  filterMatches,
  indexRange,
  isHighRoll,
  junkItems,
  otherSlot,
  powerDelta,
  powerDeltaText,
  setJunk,
  setLocked,
  textMatches,
  unlockedIndices,
} from '../src/ui/inventoryLogic';
import { itemSearchText, targetHeading } from '../src/ui/itemTooltip';

let n = 0;
function item(base: string, rarity: Item['rarity'], itemPower: number, extra: Partial<Item> = {}): Item {
  return { uid: `m-${++n}`, base, rarity, itemPower, name: base, implicits: [], affixes: [], sockets: [], ...extra };
}
const gen = (seed: string, over: Partial<Parameters<typeof generateItem>[1]> = {}) =>
  generateItem(new Rng(seed), { itemPower: 100, classId: 'bastion', uid: `g-${seed}`, ...over });

describe('lock and junk marks (B002, B003)', () => {
  it('locking and junk-marking exclude each other', () => {
    const it1 = item('mag_boots', 'magic', 40);
    setJunk(it1, true);
    expect(it1.junk).toBe(true);
    setLocked(it1, true);
    expect(it1).toMatchObject({ locked: true, junk: false });
    setJunk(it1, true);
    expect(it1).toMatchObject({ locked: false, junk: true });
    setJunk(it1, false);
    expect(it1.junk).toBe(false);
  });

  it('junk is common and magic gear plus marked items, never a locked one', () => {
    expect(isJunk(item('mag_boots', 'magic', 40))).toBe(true);
    expect(isJunk(item('mag_boots', 'common', 40))).toBe(true);
    expect(isJunk(item('mag_boots', 'rare', 40))).toBe(false);
    expect(isJunk(item('mag_boots', 'rare', 40, { junk: true }))).toBe(true);
    expect(isJunk(item('mag_boots', 'magic', 40, { locked: true }))).toBe(false);
    expect(isJunk(item('crystal', 'common', 40, { crystal: { id: 'ember', tier: 0 } }))).toBe(false);
    expect(isJunk(null)).toBe(false);
  });

  it('"Salvage junk" keeps a locked magic item and takes a rare marked as junk', () => {
    const inv = emptyInventory(6);
    const locked = item('mag_boots', 'magic', 40, { locked: true });
    const plain = item('mag_boots', 'magic', 40);
    const rare = item('conduit_ring', 'rare', 80);
    const marked = item('conduit_ring', 'rare', 80, { junk: true });
    inv.grid[0] = locked;
    inv.grid[1] = plain;
    inv.grid[2] = rare;
    inv.grid[3] = marked;
    const gold = salvageJunk(inv);
    expect(gold).toBeGreaterThan(0);
    expect(inv.grid[0]).toBe(locked);
    expect(inv.grid[1]).toBeNull();
    expect(inv.grid[2]).toBe(rare);
    expect(inv.grid[3]).toBeNull();
    // Unmarked, it stays.
    setJunk(rare, false);
    salvageJunk(inv);
    expect(inv.grid[2]).toBe(rare);
  });

  it('salvage and sell refuse a locked item and pay nothing', () => {
    const inv = emptyInventory(3);
    const locked = item('mag_boots', 'magic', 40, { locked: true });
    inv.grid[0] = locked;
    inv.gold = 5;
    expect(salvage(inv, 0)).toBe(0);
    expect(sell(inv, 0)).toBe(0);
    expect(inv.grid[0]).toBe(locked);
    expect(inv.gold).toBe(5);
    locked.locked = false;
    expect(sell(inv, 0)).toBeGreaterThan(0);
    expect(inv.grid[0]).toBeNull();
  });

  it('bulk helpers skip locked items', () => {
    const grid: (Item | null)[] = [item('mag_boots', 'magic', 1, { locked: true }), null, item('mag_boots', 'magic', 1), item('conduit_ring', 'rare', 1, { junk: true })];
    expect(unlockedIndices(grid, [0, 1, 2, 3])).toEqual([2, 3]);
    expect(junkItems(grid).map((e) => e.index)).toEqual([2, 3]);
  });
});

describe('comparison helpers (B006, B007, B011)', () => {
  it('power delta text', () => {
    const a = item('conduit_ring', 'rare', 112);
    expect(powerDelta(a, item('conduit_ring', 'rare', 61))).toBe(51);
    expect(powerDeltaText(51)).toBe('+51');
    expect(powerDeltaText(-12)).toBe('-12');
    expect(powerDeltaText(0)).toBe('');
    expect(powerDelta(a, null)).toBe(112);
  });

  it('Shift+right-click picks the ring slot the default would not', () => {
    const slots = slotsFor(BASE_ITEMS.get('conduit_ring')!.type);
    expect(slots).toEqual(['ring1', 'ring2']);
    const strong = item('conduit_ring', 'rare', 90);
    const weak = item('conduit_ring', 'rare', 50);
    // Default replaces the weaker ring (ring2); the other is ring1.
    expect(otherSlot(slots, { ring1: strong, ring2: weak })).toBe('ring1');
    expect(otherSlot(slots, { ring1: weak, ring2: strong })).toBe('ring2');
    // With an empty slot the default is the empty one.
    expect(otherSlot(slots, { ring1: strong })).toBe('ring1');
    expect(otherSlot(['helm'], {})).toBeUndefined();
  });

  it('a ring is compared with both worn rings, each named with its power', () => {
    const etched = item('conduit_ring', 'rare', 70, { name: 'Etched Ring' });
    const dull = item('conduit_ring', 'rare', 50, { name: 'Dull Ring' });
    const h1 = targetHeading({ slot: 'ring1', label: 'Ring 1', equipped: etched, comparison: null }, true);
    const h2 = targetHeading({ slot: 'ring2', label: 'Ring 2', equipped: dull, comparison: null }, true);
    expect(h1).toContain('Etched Ring');
    expect(h1).toContain('(70)');
    expect(h1.startsWith('vs')).toBe(true);
    expect(h2).toContain('Dull Ring');
    expect(h1).not.toBe(h2);
    expect(targetHeading({ slot: 'helm', label: 'Helm', equipped: etched, comparison: null }, false)).toBe('vs Etched Ring (70)');
    expect(targetHeading({ slot: 'ring2', label: 'Ring 2', equipped: null, comparison: null }, true)).toBe('vs empty Ring 2');
  });
});

describe('roll ranges (B009)', () => {
  it('every rolled affix lies inside its printed range, at several item powers, greater and masterworked', () => {
    let checked = 0;
    for (const power of [20, 100, 250, 400]) {
      for (let i = 0; i < 80; i++) {
        const it1 = gen(`r${power}-${i}`, { itemPower: power, rarity: i % 2 ? 'rare' : 'legendary', greaterBonus: 0.4 });
        if (i % 3 === 0) {
          it1.masterwork = 6;
          it1.masterworkUp = [0];
        }
        const eff = effectiveAffixes(it1);
        it1.affixes.forEach((a, idx) => {
          const range = affixRollRange(it1, idx);
          expect(range, a.affix).not.toBeNull();
          const v = eff[idx]!.value;
          expect(v).toBeGreaterThanOrEqual(range!.min - 1e-9);
          expect(v).toBeLessThanOrEqual(range!.max + 1e-9);
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('unique affixes have a range too, and tempered or unknown ones have none', () => {
    let unique: Item | undefined;
    for (let i = 0; i < 40 && !unique; i++) {
      const c = gen(`u${i}`, { rarity: 'unique' });
      if (c.unique) unique = c;
    }
    expect(unique).toBeDefined();
    const eff = effectiveAffixes(unique!);
    unique!.affixes.forEach((_, idx) => {
      const r = affixRollRange(unique!, idx)!;
      expect(eff[idx]!.value).toBeGreaterThanOrEqual(r.min - 1e-9);
      expect(eff[idx]!.value).toBeLessThanOrEqual(r.max + 1e-9);
    });
    expect(affixRollRange(unique!, 99)).toBeNull();
    expect(affixRollRange(item('conduit_ring', 'rare', 50, { affixes: [{ stat: 'strength', value: 5 }] }), 0)).toBeNull();
    expect(AFFIX_DEFS.size).toBeGreaterThan(5);
  });

  it('flags the top fifth of a range', () => {
    expect(isHighRoll(9.5, { min: 6, max: 10 })).toBe(true);
    expect(isHighRoll(7, { min: 6, max: 10 })).toBe(false);
    expect(isHighRoll(5, { min: 5, max: 5 })).toBe(false);
  });
});

describe('aspect status, bag fill, search, ranges (B014, B015, B016, B017)', () => {
  it('aspect status: Codex first, then the cache, else new', () => {
    expect(aspectStatus('fissuring', [{ id: 'fissuring' }], ['fissuring'])).toBe('codex');
    expect(aspectStatus('fissuring', [{ id: 'fissuring' }], [])).toBe('cache');
    expect(aspectStatus('fissuring', [], [])).toBe('new');
  });

  it('bag fill turns near at 36 of 40 and full at 40', () => {
    expect(bagFill(35, 40)).toBe('ok');
    expect(bagFill(36, 40)).toBe('near');
    expect(bagFill(39, 40)).toBe('near');
    expect(bagFill(40, 40)).toBe('full');
  });

  it('search matches names, stats and aspect text; every word must match', () => {
    expect(textMatches('Cinder Hammer +7.7% Critical Strike Chance', 'crit chance')).toBe(true);
    expect(textMatches('Cinder Hammer', 'cinder anvil')).toBe(false);
    expect(textMatches('anything', '')).toBe(true);
    const ring = item('conduit_ring', 'rare', 50, { affixes: [{ stat: 'critChance', value: 0.03, affix: 'crit_chance' }] });
    expect(textMatches(itemSearchText(ring), 'critical')).toBe(true);
    expect(textMatches(itemSearchText(ring), 'fissur')).toBe(false);
    const pass = (q: string) => (i: Item) => textMatches(itemSearchText(i), q);
    expect(filterMatches(ring, 'all', false, pass('critical'))).toBe(true);
    expect(filterMatches(ring, 'all', false, pass('zzzz'))).toBe(false);
    expect(filterMatches(ring, 'weapons', false, pass('critical'))).toBe(false);
    expect(filterMatches(null, 'all', false, pass('critical'))).toBe(false);
    expect(filterMatches(null, 'all', false)).toBe(true);
  });

  it('a drag over cells 30-39 selects ten', () => {
    expect(indexRange(30, 39)).toHaveLength(10);
    expect(indexRange(39, 30)).toEqual(indexRange(30, 39));
    expect(indexRange(4, 4)).toEqual([4]);
  });
});
