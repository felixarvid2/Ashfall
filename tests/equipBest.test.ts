import { describe, expect, it } from 'vitest';
import { classDef } from '../src/data/db';
import { BASE_ITEMS } from '../src/data/loot/db';
import { slotsFor, type Item, type Slot, type StatKey } from '../src/data/loot/schemas';
import { emptyInventory, equipFromGrid } from '../src/systems/loot/inventory';
import { compareGear } from '../src/systems/stats';
import { bestLoadout, upgradeSign, type EquipMove } from '../src/ui/inventoryLogic';
import type { Inventory } from '../src/core/components';

const LEVEL = 20;
let n = 0;
function item(base: string, stats: Partial<Record<StatKey, number>>, extra: Partial<Item> = {}): Item {
  const id = ++n;
  return {
    uid: `eb-${id}`,
    base,
    rarity: 'rare',
    itemPower: 100,
    name: `${base} ${id}`,
    implicits: [],
    affixes: Object.entries(stats).map(([stat, value]) => ({ stat: stat as StatKey, value: value as number, affix: stat })),
    sockets: [],
    ...extra,
  };
}
const ring = (damage: number, extra: Partial<Item> = {}) => item('conduit_ring', { damage }, extra);
const helm = (armor: number, extra: Partial<Item> = {}) => item('combat_helm', { armor }, extra);
const hammer = (weaponDamage: number, extra: Partial<Item> = {}) => item('hydraulic_hammer', { weaponDamage }, extra);

function bag(items: (Item | null)[], equipped: Partial<Record<Slot, Item>> = {}, size = 12): Inventory {
  const inv = emptyInventory(size);
  items.forEach((it, i) => (inv.grid[i] = it));
  inv.equipped = { ...equipped };
  return inv;
}

/** The same comparison the game shows on the tooltip arrows (Game.compareIn). */
function plan(inv: Inventory, classId = 'bastion'): EquipMove[] {
  const cls = classDef(classId);
  return bestLoadout(inv.grid, inv.equipped, classId, (it, slot, eq) => {
    const base = BASE_ITEMS.get(it.base);
    return base && slotsFor(base.type).includes(slot) ? compareGear(cls, LEVEL, it, slot, eq) : null;
  });
}

function apply(inv: Inventory, moves: EquipMove[], classId = 'bastion'): void {
  for (const m of moves) expect(equipFromGrid(inv, m.index, classId, m.slot).ok).toBe(true);
}

const uids = (inv: Inventory) =>
  [...inv.grid, ...Object.values(inv.equipped)].filter((i): i is Item => !!i).map((i) => i.uid).sort();

describe('Equip best (bestLoadout)', () => {
  it('finds an upgrade, applies it, and the swapped-out item lands in the freed cell', () => {
    const worn = helm(10);
    const better = helm(30);
    const inv = bag([null, better], { helm: worn });
    const moves = plan(inv);
    expect(moves).toEqual([{ index: 1, slot: 'helm' }]);
    const before = uids(inv);
    apply(inv, moves);
    expect(inv.equipped.helm).toBe(better);
    expect(inv.grid[1]).toBe(worn);
    expect(uids(inv)).toEqual(before);
    expect(plan(inv)).toEqual([]);
  });

  it('fills an empty slot from the bag (the cell becomes free)', () => {
    const inv = bag([helm(5)]);
    const moves = plan(inv);
    expect(moves).toEqual([{ index: 0, slot: 'helm' }]);
    apply(inv, moves);
    expect(inv.grid[0]).toBeNull();
  });

  it('returns no moves when nothing in the bag is better, or the bag item is equal or worse', () => {
    expect(plan(bag([helm(10), helm(30), null], { helm: helm(30) }))).toEqual([]);
    expect(plan(bag([hammer(10)], { mainHand: hammer(50) }))).toEqual([]);
    expect(plan(bag([]))).toEqual([]);
  });

  it('picks the best of several candidates for one slot', () => {
    const inv = bag([helm(20), helm(60), helm(40)], { helm: helm(10) });
    expect(plan(inv)).toEqual([{ index: 1, slot: 'helm' }]);
  });

  it('skips items of another class', () => {
    const rifle = item('marksman_rifle', { weaponDamage: 500 });
    expect(plan(bag([rifle], { mainHand: hammer(30) }))).toEqual([]);
    // For a spectre the same rifle is the upgrade.
    const spectreWorn = item('marksman_rifle', { weaponDamage: 20 });
    expect(plan(bag([rifle], { mainHand: spectreWorn }), 'spectre')).toEqual([{ index: 0, slot: 'mainHand' }]);
  });

  it('skips junk-marked items but wears locked ones', () => {
    const worn = helm(10);
    expect(plan(bag([helm(60, { junk: true })], { helm: worn }))).toEqual([]);
    expect(plan(bag([helm(60, { locked: true })], { helm: worn }))).toEqual([{ index: 0, slot: 'helm' }]);
    // A junk item is passed over for the next-best one.
    expect(plan(bag([helm(90, { junk: true }), helm(40)], { helm: worn }))).toEqual([{ index: 1, slot: 'helm' }]);
  });

  it('never wears a crystal or an item that does not fit the slot', () => {
    const crystal = item('crystal', {}, { crystal: { id: 'ember', tier: 0 } });
    expect(plan(bag([crystal], {}))).toEqual([]);
  });

  describe('rings', () => {
    it('worn A weak, worn B strong, bag C medium: C replaces A and B stays', () => {
      const a = ring(0.02);
      const b = ring(0.1);
      const c = ring(0.06);
      const inv = bag([c], { ring1: a, ring2: b });
      expect(plan(inv)).toEqual([{ index: 0, slot: 'ring1' }]);
      apply(inv, plan(inv));
      expect(inv.equipped).toMatchObject({ ring1: c, ring2: b });
      expect(inv.grid[0]).toBe(a);
    });

    it('with the strong ring in ring1 the medium one takes ring2', () => {
      const a = ring(0.1);
      const b = ring(0.02);
      const c = ring(0.06);
      const inv = bag([c], { ring1: a, ring2: b });
      expect(plan(inv)).toEqual([{ index: 0, slot: 'ring2' }]);
    });

    it('keeps the best two of worn plus bag: a strong bag ring does not push out the second-best worn one', () => {
      const worn1 = ring(0.08);
      const worn2 = ring(0.01);
      const strong = ring(0.12);
      const medium = ring(0.05);
      const inv = bag([strong, medium], { ring1: worn1, ring2: worn2 });
      const before = uids(inv);
      apply(inv, plan(inv));
      expect(new Set([inv.equipped.ring1, inv.equipped.ring2])).toEqual(new Set([strong, worn1]));
      expect(uids(inv)).toEqual(before);
      expect(plan(inv)).toEqual([]);
    });

    it('fills both empty ring slots with the two best rings', () => {
      const inv = bag([ring(0.02), ring(0.09), ring(0.05)]);
      const moves = plan(inv);
      expect(moves).toHaveLength(2);
      apply(inv, moves);
      expect(new Set([inv.equipped.ring1, inv.equipped.ring2].map((r) => r?.affixes[0]!.value))).toEqual(new Set([0.09, 0.05]));
    });

    it('does nothing when both worn rings already are the best two', () => {
      expect(plan(bag([ring(0.01)], { ring1: ring(0.1), ring2: ring(0.08) }))).toEqual([]);
    });
  });

  describe('weapon and off-hand', () => {
    it('a weapon only ever goes to mainHand and an off-hand only to offHand', () => {
      const inv = bag([hammer(40), item('riot_shield', { armor: 40 })]);
      const moves = plan(inv);
      expect(moves.map((m) => m.slot).sort()).toEqual(['mainHand', 'offHand']);
      expect(moves.find((m) => m.slot === 'mainHand')!.index).toBe(0);
      expect(moves.find((m) => m.slot === 'offHand')!.index).toBe(1);
    });

    it('a weapon upgrade leaves the worn off-hand alone, and an empty off-hand is not filled with a weapon', () => {
      const shield = item('riot_shield', { armor: 40 });
      const inv = bag([hammer(60), hammer(55)], { mainHand: hammer(30), offHand: shield });
      expect(plan(inv)).toEqual([{ index: 0, slot: 'mainHand' }]);
      const noShield = bag([hammer(60)], { mainHand: hammer(70) });
      expect(plan(noShield)).toEqual([]);
    });
  });

  describe('applying and the arrows', () => {
    function fullBag(): Inventory {
      return bag(
        [
          helm(50),
          item('mag_boots', { armor: 40 }),
          hammer(55),
          ring(0.09),
          ring(0.03),
          helm(8, { junk: true }),
          item('marksman_rifle', { weaponDamage: 900 }),
          item('signal_pendant', { damage: 0.1 }),
          ring(0.01),
          null,
        ],
        { helm: helm(10), mainHand: hammer(30), ring1: ring(0.02), ring2: ring(0.05) },
        14,
      );
    }

    it('applies in order without losing or duplicating an item, and a second run finds nothing', () => {
      const inv = fullBag();
      const before = uids(inv);
      const moves = plan(inv);
      expect(moves.length).toBeGreaterThanOrEqual(5);
      expect(new Set(moves.map((m) => m.index)).size).toBe(moves.length);
      apply(inv, moves);
      expect(uids(inv)).toEqual(before);
      expect(new Set(uids(inv)).size).toBe(before.length);
      expect(plan(inv)).toEqual([]);
    });

    it('agrees with the arrows: every move is an upgrade, and every non-ring "Better" item gets its slot filled', () => {
      const inv = fullBag();
      const cls = classDef('bastion');
      const moves = plan(inv);
      const worn: Partial<Record<Slot, Item>> = { ...inv.equipped };
      for (const m of moves) {
        const it = inv.grid[m.index]!;
        expect(upgradeSign(compareGear(cls, LEVEL, it, m.slot, worn))).toBe(1);
        worn[m.slot] = it;
      }
      inv.grid.forEach((it) => {
        const base = it && BASE_ITEMS.get(it.base);
        if (!it || !base || base.type === 'ring' || it.junk || (base.classes && !base.classes.includes('bastion'))) return;
        const [slot] = slotsFor(base.type);
        if (slot && upgradeSign(compareGear(cls, LEVEL, it, slot, inv.equipped)) > 0) expect(moves.some((m) => m.slot === slot)).toBe(true);
      });
    });
  });
});
