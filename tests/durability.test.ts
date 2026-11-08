import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/components';
import { World } from '../src/core/ecs';
import { CLASSES } from '../src/data/db';
import { Rng } from '../src/core/rng';
import { computePlayerStats } from '../src/systems/stats';
import { generateItem, itemEffects, itemStats } from '../src/systems/loot/generate';
import { DURABILITY, durabilityOf, isBroken, repairAll, repairAllCost, repairCost, wearEquipment } from '../src/systems/loot/durability';
import { ItemSchema } from '../src/data/loot/schemas';
import { spawnPlayer } from '../src/world/spawn';

function gear(uid: string, rarity: 'rare' | 'legendary' = 'rare') {
  return generateItem(new Rng(uid), { itemPower: 300, classId: 'bastion', uid, rarity, baseId: 'power_sword' });
}

describe('A12 durability', () => {
  it('death wears every equipped item by 10 %, and 10 deaths break it', () => {
    const world = new World();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const inv = world.req(player, Inventory);
    const sword = gear('s1');
    inv.equipped.weapon = sword;
    expect(durabilityOf(sword)).toBe(100);
    expect(wearEquipment(inv)).toEqual({ worn: 1, broken: 0 });
    expect(sword.durability).toBe(90);
    for (let i = 0; i < 8; i++) wearEquipment(inv);
    expect(sword.durability).toBe(10);
    expect(wearEquipment(inv)).toEqual({ worn: 1, broken: 1 });
    expect(isBroken(sword)).toBe(true);
    // Already broken: nothing more to lose.
    expect(wearEquipment(inv)).toEqual({ worn: 0, broken: 0 });
    // Carried (not worn) items do not wear.
    const spare = gear('s2');
    inv.grid[0] = spare;
    wearEquipment(inv);
    expect(spare.durability).toBeUndefined();
  });

  it('a broken item gives only its base stats, no affixes and no powers, until repaired', () => {
    const item = gear('s3', 'legendary');
    expect(item.affixes.length).toBeGreaterThan(0);
    const full = itemStats(item);
    expect(full.length).toBeGreaterThan(item.implicits.length);
    item.durability = 0;
    expect(itemStats(item)).toEqual(item.implicits);
    expect(itemEffects(item)).toEqual([]);
    const cls = CLASSES.get('bastion')!;
    const broken = computePlayerStats(cls, 10, { weapon: item });
    delete item.durability;
    const fixed = computePlayerStats(cls, 10, { weapon: item });
    expect(fixed.damageEstimate).toBeGreaterThan(broken.damageEstimate);
    expect(itemStats(item)).toEqual(full);
  });

  it('the blacksmith repairs for gold, broken first when the purse is short', () => {
    const world = new World();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const inv = world.req(player, Inventory);
    const a = gear('a');
    const b = gear('b');
    inv.equipped.weapon = a;
    inv.grid[0] = b;
    a.durability = 0;
    b.durability = 70;
    expect(repairCost(gear('c'))).toBe(0);
    expect(repairCost(a)).toBeGreaterThan(repairCost(b));
    const total = repairAllCost(inv);
    expect(total).toBe(repairCost(a) + repairCost(b));
    inv.gold = repairCost(a);
    const part = repairAll(inv);
    expect(part).toMatchObject({ ok: false, repaired: 1 });
    expect(a.durability).toBeUndefined();
    expect(b.durability).toBe(70);
    expect(inv.gold).toBe(0);
    inv.gold = 10000;
    expect(repairAll(inv)).toMatchObject({ ok: true, repaired: 1 });
    expect(b.durability).toBeUndefined();
    expect(repairAllCost(inv)).toBe(0);
  });

  it('survives the save format; items without the field load at full durability', () => {
    const item = gear('s4');
    item.durability = 40;
    expect(ItemSchema.parse(JSON.parse(JSON.stringify(item))).durability).toBe(40);
    const old = { ...gear('s5') } as Record<string, unknown>;
    delete old.durability;
    expect(durabilityOf(ItemSchema.parse(old))).toBe(DURABILITY.max);
    expect(ItemSchema.safeParse({ ...gear('s6'), durability: 150 }).success).toBe(false);
  });
});
