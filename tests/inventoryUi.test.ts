import { describe, expect, it } from 'vitest';
import type { Item } from '../src/data/loot/schemas';
import {
  defaultTargetSlot,
  filterMatches,
  itemCategory,
  needsSalvageConfirm,
  sortGrid,
  uidSequence,
  upgradeSign,
} from '../src/ui/inventoryLogic';
import { compareVerdict } from '../src/ui/itemTooltip';
import { relativeTime } from '../src/ui/characterSelect';
import { characterRows } from '../src/ui/characterPanel';

let n = 0;
function item(base: string, rarity: Item['rarity'], itemPower: number, extra: Partial<Item> = {}): Item {
  return { uid: `seed-${++n}`, base, rarity, itemPower, name: base, implicits: [], affixes: [], sockets: [], ...extra };
}
const crystal = (power: number): Item => item('crystal', 'common', power, { crystal: { id: 'ember', tier: 0 } });

describe('backpack sort (P048)', () => {
  const grid: (Item | null)[] = [
    item('mag_boots', 'magic', 40),
    null,
    crystal(90),
    item('hydraulic_hammer', 'legendary', 70),
    item('conduit_ring', 'rare', 120),
    item('combat_helm', 'common', 100),
  ];

  it('by item power puts the strongest gear first, crystals after the gear, empty cells last', () => {
    const sorted = sortGrid(grid, 'power');
    expect(sorted.map((i) => i?.itemPower ?? null)).toEqual([120, 100, 70, 40, 90, null]);
    expect(sorted).toHaveLength(grid.length);
    expect(sorted[0]!.itemPower).toBe(Math.max(...grid.filter((i): i is Item => !!i && !i.crystal).map((i) => i.itemPower)));
  });

  it('by rarity ranks legendary over rare over common, power breaks ties', () => {
    expect(sortGrid(grid, 'rarity').slice(0, 4).map((i) => i!.rarity)).toEqual(['legendary', 'rare', 'magic', 'common']);
  });

  it('by slot lists weapons first, then armour, then jewellery', () => {
    expect(sortGrid(grid, 'slot').slice(0, 4).map((i) => i!.base)).toEqual(['hydraulic_hammer', 'combat_helm', 'mag_boots', 'conduit_ring']);
  });

  it('newest orders by the running number in the uid', () => {
    const a = item('mag_boots', 'common', 10, { uid: 'abc-5' });
    const b = item('mag_boots', 'common', 10, { uid: 'abc-12' });
    expect(uidSequence('abc-12')).toBe(12);
    expect(sortGrid([a, b], 'newest')[0]).toBe(b);
  });

  it('keeps every item (a permutation)', () => {
    const sorted = sortGrid(grid, 'rarity');
    const uids = (g: (Item | null)[]) => g.filter((i): i is Item => !!i).map((i) => i.uid).sort();
    expect(uids(sorted)).toEqual(uids(grid));
  });
});

describe('filter chips (P049)', () => {
  const ring = item('conduit_ring', 'rare', 50);
  const vest = item('plated_vest', 'rare', 50);
  const sword = item('power_sword', 'rare', 50);
  const gem = crystal(40);

  it('puts every item in one category', () => {
    expect([ring, vest, sword, gem].map(itemCategory)).toEqual(['jewelry', 'armor', 'weapon', 'crystal']);
  });

  it('keeps matching cells at full strength and fades the rest, empty cells included', () => {
    expect(filterMatches(gem, 'crystals', false)).toBe(true);
    expect(filterMatches(ring, 'crystals', false)).toBe(false);
    expect(filterMatches(null, 'crystals', false)).toBe(false);
    expect(filterMatches(null, 'all', false)).toBe(true);
    expect(filterMatches(sword, 'weapons', false)).toBe(true);
    expect(filterMatches(vest, 'armor', false)).toBe(true);
    expect(filterMatches(ring, 'jewelry', false)).toBe(true);
  });

  it('"better" follows the comparison, not the item', () => {
    expect(filterMatches(vest, 'better', true)).toBe(true);
    expect(filterMatches(vest, 'better', false)).toBe(false);
  });
});

describe('upgrade arrow (P050)', () => {
  it('is green for more damage, red for less, and falls back to life and stats', () => {
    expect(upgradeSign({ damagePct: 0.002, life: 0, stats: [] })).toBe(1);
    expect(upgradeSign({ damagePct: -0.01, life: 50, stats: [] })).toBe(-1);
    expect(upgradeSign({ damagePct: 0, life: 20, stats: [] })).toBe(1);
    expect(upgradeSign({ damagePct: 0, life: 0, stats: [{ stat: 'armor', delta: 152 }] })).toBe(1);
    expect(upgradeSign({ damagePct: 0, life: 0, stats: [{ stat: 'armor', delta: 5 }, { stat: 'moveSpeed', delta: -0.1 }] })).toBe(0);
    expect(upgradeSign({ damagePct: 0, life: 0, stats: [] })).toBe(0);
  });
});

describe('rings and salvage rules (P053, P046)', () => {
  it('equips into an empty ring slot first, else replaces the weaker ring', () => {
    const weak = item('conduit_ring', 'common', 30);
    const strong = item('conduit_ring', 'rare', 90);
    expect(defaultTargetSlot(['ring1', 'ring2'], { ring1: strong })).toBe('ring2');
    expect(defaultTargetSlot(['ring1', 'ring2'], { ring1: strong, ring2: weak })).toBe('ring2');
    expect(defaultTargetSlot(['ring1', 'ring2'], { ring1: weak, ring2: strong })).toBe('ring1');
    expect(defaultTargetSlot(['mainHand'], {})).toBe('mainHand');
  });

  it('asks before salvaging rare and better, not common and magic', () => {
    expect(needsSalvageConfirm(item('mag_boots', 'common', 1))).toBe(false);
    expect(needsSalvageConfirm(item('mag_boots', 'magic', 1))).toBe(false);
    expect(needsSalvageConfirm(item('mag_boots', 'rare', 1))).toBe(true);
    expect(needsSalvageConfirm(item('mag_boots', 'legendary', 1))).toBe(true);
  });
});

describe('comparison verdict (P056)', () => {
  it('lists the headline changes as chips, with the socket difference last', () => {
    const worn = item('power_sword', 'rare', 60, { sockets: [null, null] });
    const next = item('hydraulic_hammer', 'legendary', 100, { sockets: [null] });
    const parts = compareVerdict({ damagePct: 0.002, life: 0, stats: [{ stat: 'armor', delta: 152 }, { stat: 'weaponDamage', delta: 9 }] }, next, worn);
    expect(parts.map((p) => p.text)).toEqual(['+0.2% Damage', '+152 Armor', '−1 socket']);
    expect(parts.map((p) => p.up)).toEqual([true, true, false]);
  });

  it('never shows more than four chips', () => {
    const stats = (['armor', 'strength', 'dexterity', 'willpower', 'intelligence'] as const).map((stat) => ({ stat, delta: 10 }));
    expect(compareVerdict({ damagePct: 0.1, life: 30, stats }, item('mag_boots', 'rare', 1), null)).toHaveLength(4);
  });
});

describe('last played (P041)', () => {
  const now = Date.parse('2026-06-01T12:00:00Z');
  it('reads as a short relative time', () => {
    expect(relativeTime('2026-06-01T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-06-01T11:55:00Z', now)).toBe('5 min ago');
    expect(relativeTime('2026-06-01T10:00:00Z', now)).toBe('2 h ago');
    expect(relativeTime('2026-05-29T12:00:00Z', now)).toBe('3 days ago');
    expect(relativeTime('not a date', now)).toBe('');
  });
});

describe('character panel rows (P058, P059)', () => {
  it('gives every row a key that has an explanation', async () => {
    const { t } = await import('../src/data/i18n');
    const snapshot = {
      className: 'Bastion',
      progression: { level: 10, xp: 5, skillPoints: 2 },
      combat: { armor: 80, weaponDamage: 20, critChance: 0.1, critDamage: 0.5, attackSpeed: 0, additive: [{ value: 0.1, source: 'damage' }], resist: {}, damageReduction: 0, cooldownReduction: 0, resourceGen: 0, barrierBonus: 0, potionHealing: 0, lifeOnKill: 0 },
      derived: { attributes: { strength: 10, dexterity: 5, intelligence: 5, willpower: 5 }, damageEstimate: 12.34, moveSpeedBonus: 0 },
      health: { max: 200 },
      resourceMax: 100,
    } as unknown as Parameters<typeof characterRows>[0];
    const rows = characterRows(snapshot);
    const all = Object.values(rows).flat();
    expect(all.length).toBeGreaterThan(20);
    expect(new Set(all.map((r) => r.key)).size).toBe(all.length);
    for (const r of all) expect(t(`ui.statInfo.${r.info}`), r.key).not.toMatch(/^ui\.statInfo\./);
    expect(rows.offense[0]!.value).toBe('12.3');
  });
});
