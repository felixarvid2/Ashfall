/** Content pass C001-C010, C020, C024: the data and the small systems behind it keep their promises. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { CLASSES, SKILLS, classDef } from '../src/data/db';
import { CLASS_AFFIX_WEIGHTS, PRIMARY_ATTRIBUTE_WEIGHT } from '../src/data/loot/affixes';
import { AFFIX_DEFS, ASPECT_DEFS, BASE_ITEMS, CRYSTAL_DEFS, UNIQUE_DEFS, dropTable } from '../src/data/loot/db';
import { VENDOR } from '../src/data/services';
import { affixWeight, canEquip, generateCrystal, generateItem, itemStats, pickBase, pickUnique, rollAffixes } from '../src/systems/loot/generate';
import { rollVendorStock, vendorRarities } from '../src/systems/hub/services';
import { addToGrid, emptyInventory, socketCrystal } from '../src/systems/loot/inventory';
import { computePlayerStats } from '../src/systems/stats';
import type { Item } from '../src/data/loot/schemas';
import { worldBossUniques } from '../src/world/worldBoss';

const CLASS_IDS = [...CLASSES.keys()];
const next = (() => {
  let n = 0;
  return () => `cc-${n++}`;
})();

describe('aspects (C002, C003)', () => {
  it('every class has at least two own aspects for every armour and jewellery slot', () => {
    for (const cls of CLASS_IDS) {
      for (const slot of ['helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring'] as const) {
        const own = [...ASPECT_DEFS.values()].filter((a) => a.types.includes(slot) && a.classes?.includes(cls));
        expect(own.length, `${cls} ${slot}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('the skills that had no aspect or unique now have one', () => {
    const refs = new Set<string>();
    for (const e of [...ASPECT_DEFS.values(), ...UNIQUE_DEFS.values()]) {
      for (const fx of e.effects as { kind: string; skill?: string }[]) if (fx.kind === 'skillMod' && fx.skill) refs.add(fx.skill);
    }
    const formerlyBare = [
      'bastion.coolant_flush', 'spectre.holo_decoy', 'spectre.smoke_cloak', 'spectre.death_mark',
      'xenomant.spore_cocoon', 'xenomant.grasping_tendrils', 'lightbearer.censer_strike', 'lightbearer.blessing',
    ];
    for (const id of formerlyBare) {
      expect(SKILLS.has(id), id).toBe(true);
      expect(refs.has(id), id).toBe(true);
    }
  });
});

describe('uniques (C004, C005, C006)', () => {
  it('every class has a unique on gloves, a ring or an amulet', () => {
    for (const cls of CLASS_IDS) {
      const slots = [...UNIQUE_DEFS.values()]
        .filter((u) => u.classes?.includes(cls))
        .map((u) => BASE_ITEMS.get(u.base)!.type);
      expect(slots.some((t) => t === 'gloves' || t === 'ring' || t === 'amulet'), cls).toBe(true);
    }
  });

  it('every class can roll a mythic it can use, and the Bastion-only effect is Bastion-only', () => {
    for (const cls of CLASS_IDS) {
      const mythics = [...UNIQUE_DEFS.values()].filter((u) => u.rarity === 'mythic' && (!u.classes || u.classes.includes(cls)));
      expect(mythics.length, cls).toBeGreaterThanOrEqual(2);
      expect(mythics.some((u) => u.classes?.includes(cls)), cls).toBe(true);
    }
    for (const u of UNIQUE_DEFS.values()) {
      if ((u.effects as { kind: string }[]).some((e) => e.kind === 'overheat')) expect(u.classes, u.id).toEqual(['bastion']);
    }
    // At least one mythic works for everybody.
    expect([...UNIQUE_DEFS.values()].some((u) => u.rarity === 'mythic' && !u.classes)).toBe(true);
  });

  it('quest-only uniques never drop at random', () => {
    const quest = [...UNIQUE_DEFS.values()].filter((u) => u.source === 'quest').map((u) => u.id);
    expect(quest.sort()).toEqual(['ashen_heartwood', 'seed_of_accord']);
    const rng = new Rng('quest-only');
    for (const cls of CLASS_IDS) {
      for (let i = 0; i < 2500; i++) {
        expect(quest).not.toContain(pickUnique(rng, 'unique', cls)!.id);
        expect(quest).not.toContain(pickUnique(rng, 'mythic', cls)!.id);
      }
      expect(worldBossUniques(cls).filter((id) => quest.includes(id))).toEqual([]);
    }
  });
});

describe('bases (C007)', () => {
  const second = ['signal_visor', 'mesh_vest', 'grip_boots', 'lumen_locket', 'signet_band'];

  it('has a second base for five slots, gated by item power', () => {
    for (const id of second) {
      const b = BASE_ITEMS.get(id)!;
      expect(b, id).toBeDefined();
      expect(b.minItemPower).toBeGreaterThanOrEqual(150);
    }
    const slots = second.map((id) => BASE_ITEMS.get(id)!.type);
    expect(new Set(slots).size).toBe(second.length);
    for (const t of slots) expect([...BASE_ITEMS.values()].filter((b) => b.type === t).length, t).toBeGreaterThanOrEqual(2);
  });

  it('drops them only from item power 150', () => {
    const rng = new Rng('bases');
    const seen = (ip: number) => {
      const ids = new Set<string>();
      for (let i = 0; i < 3000; i++) ids.add(pickBase(rng, ip, 'bastion').id);
      return ids;
    };
    const low = seen(149);
    for (const id of second) expect(low.has(id), id).toBe(false);
    const high = seen(200);
    for (const id of second) expect(high.has(id), id).toBe(true);
  });
});

describe('ranged damage (C008)', () => {
  it('is an affix on weapon, gloves and rings, and a bonus against ranged hits', () => {
    const def = AFFIX_DEFS.get('ranged_damage')!;
    expect(def.stat).toBe('rangedDamage');
    expect(def.types).toEqual(AFFIX_DEFS.get('melee_damage')!.types);
    const ring: Item = {
      ...generateItem(new Rng('r'), { itemPower: 100, classId: 'spectre', uid: next(), rarity: 'common', baseId: 'conduit_ring' }),
      affixes: [{ stat: 'rangedDamage', value: 0.12, affix: 'ranged_damage' }],
    };
    const s = computePlayerStats(classDef('spectre'), 1, { ring1: ring });
    expect(s.combat.additive).toContainEqual({ value: 0.12, when: 'ranged', source: 'rangedDamage' });
  });

  it('classes roll the damage type they fight with', () => {
    const w = (cls: string, id: string) => affixWeight(AFFIX_DEFS.get(id)!, cls);
    expect(w('bastion', 'melee_damage')).toBeGreaterThan(w('bastion', 'ranged_damage'));
    for (const cls of ['spectre', 'xenomant', 'lightbearer']) expect(w(cls, 'ranged_damage'), cls).toBeGreaterThan(w(cls, 'melee_damage'));
    expect(Object.keys(CLASS_AFFIX_WEIGHTS).sort()).toEqual([...CLASS_IDS].sort());
  });
});

describe('attribute weights (C009)', () => {
  it('the primary attribute rolls 1.5x, the others alike', () => {
    for (const cls of CLASS_IDS) {
      const primary = classDef(cls).attributes.primary;
      const weights = Object.fromEntries(
        ['strength', 'dexterity', 'intelligence', 'willpower'].map((a) => [a, affixWeight(AFFIX_DEFS.get(a)!, cls)]),
      );
      const others = Object.entries(weights).filter(([a]) => a !== primary).map(([, v]) => v);
      expect(new Set(others).size, cls).toBe(1);
      expect(weights[primary]! / others[0]!, cls).toBeCloseTo(PRIMARY_ATTRIBUTE_WEIGHT, 5);
    }
  });

  it('a Lightbearer sees Intelligence more often than Strength, a Bastion the reverse', () => {
    const count = (cls: string, stat: string) => {
      const rng = new Rng(`attr-${cls}`);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (rollAffixes(rng, 'helm', 3, 100, 0, cls).some((a) => a.stat === stat)) n++;
      return n;
    };
    expect(count('lightbearer', 'intelligence')).toBeGreaterThan(count('lightbearer', 'strength'));
    expect(count('bastion', 'strength')).toBeGreaterThan(count('bastion', 'intelligence'));
    // Without a class the plain weights apply.
    const rng = new Rng('plain');
    expect(rollAffixes(rng, 'helm', 3, 100, 0)).toHaveLength(3);
  });
});

describe('trader (C010)', () => {
  it('sells unique stock only in the later regions, and more legendaries there', () => {
    expect(vendorRarities().some((r) => r.item === 'unique')).toBe(false);
    expect(vendorRarities('cinderFlats').some((r) => r.item === 'unique')).toBe(false);
    expect(vendorRarities('theCore').some((r) => r.item === 'unique')).toBe(true);
    const legendary = (r: string) => vendorRarities(r).find((x) => x.item === 'legendary')!.weight;
    const order = ['cinderFlats', 'refineryDistrict', 'hydroponicVaults', 'deepMines', 'theCore'];
    for (let i = 1; i < order.length; i++) expect(legendary(order[i]!)).toBeGreaterThan(legendary(order[i - 1]!));
    expect(Object.keys(VENDOR.regionStock).sort()).toEqual([...order].sort());
  });

  it('reserves a slot for a legendary the class can use', () => {
    for (const cls of CLASS_IDS) {
      for (let s = 0; s < 40; s++) {
        const stock = rollVendorStock(new Rng(`own-${cls}-${s}`), 30, cls, next, undefined, undefined, 'cinderFlats');
        expect(stock).toHaveLength(VENDOR.stockSize);
        const own = stock[stock.length - 1]!;
        expect(own.rarity).toBe('legendary');
        expect(canEquip(BASE_ITEMS.get(own.base)!, cls), `${cls} ${own.base}`).toBe(true);
        const aspect = own.aspect ? ASPECT_DEFS.get(own.aspect.id) : undefined;
        if (aspect?.classes) expect(aspect.classes, `${cls} ${own.aspect!.id}`).toContain(cls);
      }
    }
  });

  it('a later region stocks more legendaries and the Core sometimes a unique', () => {
    const tally = (region: string) => {
      let legendary = 0;
      let unique = 0;
      for (let s = 0; s < 300; s++) {
        for (const it of rollVendorStock(new Rng(`reg-${s}`), 40, 'spectre', next, undefined, undefined, region).slice(0, -1)) {
          if (it.rarity === 'legendary') legendary++;
          if (it.rarity === 'unique') unique++;
        }
      }
      return { legendary, unique };
    };
    const early = tally('cinderFlats');
    const late = tally('theCore');
    expect(late.legendary).toBeGreaterThan(early.legendary * 2);
    expect(early.unique).toBe(0);
    expect(late.unique).toBeGreaterThan(0);
  });
});

describe('drop tables and crystals (C020, C024)', () => {
  it('dungeon caches, locked chests and gold events weight uniques', () => {
    for (const id of ['dt.dungeon_cache', 'dt.locked_chest', 'dt.event_gold']) expect(dropTable(id).rarityBias.unique, id).toBeGreaterThan(1);
    // Still rarer than a boss.
    expect(dropTable('dt.dungeon_cache').rarityBias.unique!).toBeLessThan(dropTable('dt.boss').rarityBias.unique!);
  });

  it('has five crystal types whose socket stat depends on the item type', () => {
    expect([...CRYSTAL_DEFS.keys()]).toEqual(expect.arrayContaining(['ember', 'lumen', 'void', 'frost', 'storm']));
    const socket = (crystal: string, baseId: string) => {
      const inv = emptyInventory(4);
      const item: Item = { ...generateItem(new Rng('s'), { itemPower: 100, classId: 'bastion', uid: next(), rarity: 'common', baseId }), sockets: [null] };
      addToGrid(inv, item);
      addToGrid(inv, generateCrystal(new Rng('c'), 100, next(), crystal));
      expect(socketCrystal(inv, 1, { grid: 0 }).ok).toBe(true);
      return itemStats(item).map((s) => s.stat);
    };
    expect(socket('frost', 'hydraulic_hammer')).toContain('damageVsStunned');
    expect(socket('frost', 'combat_helm')).toContain('armor');
    expect(socket('frost', 'conduit_ring')).toContain('resistCold');
    expect(socket('storm', 'hydraulic_hammer')).toContain('attackSpeed');
    expect(socket('storm', 'plated_vest')).toContain('barrierBonus');
    expect(socket('storm', 'conduit_ring')).toContain('resistEnergy');
  });
});
