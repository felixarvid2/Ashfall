/**
 * Item generation (brief §5). Pure functions driven by a seeded Rng, so a seed
 * always produces the same loot — essential for reproducing bugs and for tests.
 */
import type { Rng } from '../../core/rng';
import { AFFIX_DEFS, ASPECT_DEFS, BASE_ITEMS, CRYSTAL_DEFS, PROGRESSION, UNIQUE_DEFS, baseItem, rarityDef } from '../../data/loot/db';
import { resolveEffects, type Effect } from '../../data/effects';
import {
  RARITIES,
  type AspectDef,
  type UniqueDef,
  type AffixDef,
  type BaseItemDef,
  type DropTable,
  type Item,
  type ItemType,
  type Rarity,
  type RolledStat,
} from '../../data/loot/schemas';

export const GREATER_MULTIPLIER = 1.5;

/** Value multiplier for an item power (1.0 at item power 100). */
export function powerScale(scaling: 'linear' | 'sqrt' | 'none', itemPower: number): number {
  const linear = (itemPower + 50) / 150;
  if (scaling === 'linear') return linear;
  if (scaling === 'sqrt') return Math.sqrt(linear);
  return 1;
}

/** Round to a sensible precision: whole numbers for flat stats, 0.1 % for fractions. */
export function roundStat(value: number): number {
  return Math.abs(value) >= 2 ? Math.round(value) : Math.round(value * 1000) / 1000;
}

/** Item power for drops from a monster of the given level. */
export function itemPowerFor(level: number, rng: Rng): number {
  const { base, perLevel, spread } = PROGRESSION.itemPower;
  return Math.max(1, Math.round(base + perLevel * level + rng.range(-spread, spread)));
}

export function crystalTier(itemPower: number): number {
  return itemPower < 150 ? 0 : itemPower < 300 ? 1 : 2;
}

const rarityIndex = (r: Rarity) => RARITIES.indexOf(r);

/** Weighted rarity roll with per-table bias and a floor; disabled rarities never drop. */
export function rollRarity(rng: Rng, bias: Partial<Record<Rarity, number>> = {}, minRarity: Rarity = 'common'): Rarity {
  const options = RARITIES.filter((r) => rarityDef(r).enabled && rarityIndex(r) >= rarityIndex(minRarity)).map((r) => ({
    item: r,
    weight: (PROGRESSION.rarityWeights[r] ?? 0) * (bias[r] ?? 1),
  }));
  return rng.weighted(options);
}

export function canEquip(base: BaseItemDef, classId: string): boolean {
  return !base.classes || base.classes.includes(classId);
}

/**
 * Pick a base. With probability `ownClassShare` only bases the player's class can use
 * are considered (brief §5.6); otherwise any base can drop.
 */
export function pickBase(rng: Rng, itemPower: number, classId: string, type?: ItemType): BaseItemDef {
  const all = [...BASE_ITEMS.values()].filter((b) => b.type !== 'crystal' && b.minItemPower <= itemPower && (!type || b.type === type));
  const own = all.filter((b) => canEquip(b, classId));
  const pool = own.length > 0 && rng.chance(PROGRESSION.ownClassShare) ? own : all;
  return rng.weighted(pool.map((b) => ({ item: b, weight: b.weight })));
}

function rollValue(rng: Rng, def: { min: number; max: number; scaling: 'linear' | 'sqrt' | 'none' }, itemPower: number): number {
  return roundStat(rng.range(def.min, def.max) * powerScale(def.scaling, itemPower));
}

/** Roll distinct affixes from the pool allowed for this item type. */
export function rollAffixes(rng: Rng, type: ItemType, count: number, itemPower: number, greaterChance: number): RolledStat[] {
  const pool = [...AFFIX_DEFS.values()].filter((a) => a.types.includes(type));
  const chosen: AffixDef[] = [];
  while (chosen.length < count && chosen.length < pool.length) {
    const remaining = pool.filter((a) => !chosen.includes(a));
    chosen.push(rng.weighted(remaining.map((a) => ({ item: a, weight: a.weight }))));
  }
  return chosen.map((a) => {
    const greater = rng.chance(greaterChance);
    const value = rollValue(rng, a, itemPower) * (greater ? GREATER_MULTIPLIER : 1);
    return { stat: a.stat, value: roundStat(value), affix: a.id, ...(greater ? { greater: true } : {}) };
  });
}

const RARE_FIRST = ['Grim', 'Ashen', 'Scorched', 'Hollow', 'Rust', 'Cinder', 'Iron', 'Pale', 'Shattered', 'Black', 'Sullen', 'Dread'];
const RARE_SECOND = ['Bulwark', 'Grasp', 'Vigil', 'Remnant', 'Oath', 'Furnace', 'Marrow', 'Requiem', 'Spire', 'Wake', 'Bastion', 'Toll'];

/** Display name: base name for commons, "<adjective> <base>" for magic, two random words for rares. */
export function makeName(rng: Rng, baseName: string, rarity: Rarity, affixes: RolledStat[]): string {
  if (rarity === 'common' || affixes.length === 0) return baseName;
  if (rarity === 'magic') {
    const adjective = AFFIX_DEFS.get(affixes[0]!.affix ?? '')?.adjective;
    return adjective ? `${adjective} ${baseName}` : baseName;
  }
  return `${rng.pick(RARE_FIRST)} ${rng.pick(RARE_SECOND)}`;
}

export interface GenerateOptions {
  itemPower: number;
  classId: string;
  uid: string;
  rarity?: Rarity;
  baseId?: string;
  type?: ItemType;
  /** Localised base name lookup (defaults to the id). */
  nameOf?: (baseId: string) => string;
}

/** An aspect that fits the item type and the player's class (85 % own class, like bases). */
export function pickAspect(rng: Rng, type: ItemType, classId: string): AspectDef | null {
  const fits = [...ASPECT_DEFS.values()].filter((a) => a.types.includes(type));
  const own = fits.filter((a) => !a.classes || a.classes.includes(classId));
  const pool = own.length > 0 && rng.chance(PROGRESSION.ownClassShare) ? own : fits;
  return pool.length ? rng.pick(pool) : null;
}

export function rollAspectValue(rng: Rng, aspect: AspectDef, itemPower: number): number {
  return roundStat(rng.range(aspect.min, aspect.max) * powerScale(aspect.scaling, itemPower));
}

export function pickUnique(rng: Rng, rarity: 'unique' | 'mythic', classId: string): UniqueDef | null {
  const all = [...UNIQUE_DEFS.values()].filter((u) => u.rarity === rarity);
  const own = all.filter((u) => !u.classes || u.classes.includes(classId));
  const pool = own.length > 0 && rng.chance(PROGRESSION.ownClassShare) ? own : all;
  return pool.length ? rng.pick(pool) : null;
}

function rollSockets(rng: Rng, base: BaseItemDef, chance: number): (null)[] {
  let sockets = 0;
  for (let i = 0; i < base.maxSockets; i++) if (rng.chance(chance)) sockets++;
  return Array.from({ length: sockets }, () => null);
}

export function generateItem(rng: Rng, opts: GenerateOptions): Item {
  const rarity = opts.rarity ?? rollRarity(rng);
  const ip = opts.itemPower;

  // Unique and mythic items come from fixed definitions.
  if ((rarity === 'unique' || rarity === 'mythic') && !opts.baseId) {
    const def = pickUnique(rng, rarity, opts.classId);
    if (def) return generateUnique(rng, def, ip, opts.uid);
    return generateItem(rng, { ...opts, rarity: 'legendary' });
  }

  const base = opts.baseId ? baseItem(opts.baseId) : pickBase(rng, ip, opts.classId, opts.type);
  const def = rarityDef(rarity);
  const implicits = base.implicits.map((imp) => ({ stat: imp.stat, value: rollValue(rng, imp, ip) }));
  const count = rng.int(def.affixes[0], def.affixes[1]);
  const affixes = rollAffixes(rng, base.type, count, ip, def.greaterChance);
  const baseName = opts.nameOf?.(base.id) ?? base.id;
  const item: Item = {
    uid: opts.uid,
    base: base.id,
    rarity,
    itemPower: ip,
    name: makeName(rng, baseName, rarity, affixes),
    implicits,
    affixes,
    sockets: rollSockets(rng, base, def.socketChance),
  };
  if (rarity === 'legendary') {
    const aspect = pickAspect(rng, base.type, opts.classId);
    if (aspect) item.aspect = { id: aspect.id, value: rollAspectValue(rng, aspect, ip) };
    else item.rarity = 'rare';
  }
  return item;
}

export function generateUnique(rng: Rng, def: UniqueDef, itemPower: number, uid: string): Item {
  const base = baseItem(def.base);
  const mythic = def.rarity === 'mythic';
  return {
    uid,
    base: base.id,
    rarity: def.rarity,
    itemPower,
    name: def.id,
    implicits: base.implicits.map((imp) => ({ stat: imp.stat, value: rollValue(rng, imp, itemPower) })),
    affixes: def.affixes.map((a) => {
      const value = rollValue(rng, a, itemPower) * (mythic ? GREATER_MULTIPLIER : 1);
      return { stat: a.stat, value: roundStat(value), affix: `unique:${def.id}`, ...(mythic ? { greater: true } : {}) };
    }),
    sockets: rollSockets(rng, base, rarityDef(def.rarity).socketChance),
    unique: def.id,
  };
}

/** Effects granted by an item's aspect or unique power. */
export function itemEffects(item: Item): Effect[] {
  if (item.aspect) {
    const a = ASPECT_DEFS.get(item.aspect.id);
    if (a) return resolveEffects(a.effects as Effect[], item.aspect.value);
  }
  if (item.unique) {
    const u = UNIQUE_DEFS.get(item.unique);
    if (u) return resolveEffects(u.effects as Effect[], 0);
  }
  return [];
}

export function generateCrystal(rng: Rng, itemPower: number, uid: string, crystalId?: string): Item {
  const id = crystalId ?? rng.pick([...CRYSTAL_DEFS.keys()]);
  return {
    uid,
    base: 'crystal',
    rarity: 'common',
    itemPower,
    name: id,
    implicits: [],
    affixes: [],
    sockets: [],
    crystal: { id, tier: crystalTier(itemPower) },
  };
}

/** Which crystal effect applies on an item type. */
export function crystalSlotGroup(type: ItemType): 'weapon' | 'armor' | 'jewelry' {
  if (type === 'weapon' || type === 'offHand') return 'weapon';
  if (type === 'amulet' || type === 'ring') return 'jewelry';
  return 'armor';
}

/** Every stat an item grants: implicits, affixes and socketed crystals. */
export function itemStats(item: Item): RolledStat[] {
  const base = BASE_ITEMS.get(item.base);
  const out = [...item.implicits, ...item.affixes];
  if (base) {
    const group = crystalSlotGroup(base.type);
    for (const s of item.sockets) {
      if (!s) continue;
      const c = CRYSTAL_DEFS.get(s.crystal);
      if (!c) continue;
      out.push({ stat: c[group].stat, value: c[group].values[s.tier] ?? 0 });
    }
  }
  return out;
}

export function salvageValue(item: Item): number {
  return Math.max(1, Math.round((item.itemPower / 10) * rarityDef(item.rarity).salvageGold));
}

export interface DropResult {
  items: Item[];
  gold: number;
}

/** Roll a drop table for a monster of `level`. `nextUid` supplies unique item ids. */
export function rollDrops(
  rng: Rng,
  table: DropTable,
  level: number,
  classId: string,
  nextUid: () => string,
  nameOf?: (baseId: string) => string,
): DropResult {
  const items: Item[] = [];
  const rolls = 1 + table.extraItems;
  for (let i = 0; i < rolls; i++) {
    if (!rng.chance(table.itemChance)) continue;
    const ip = itemPowerFor(level, rng);
    const rarity = rollRarity(rng, table.rarityBias, table.minRarity);
    items.push(generateItem(rng, { itemPower: ip, classId, uid: nextUid(), rarity, nameOf }));
  }
  if (rng.chance(table.crystalChance)) items.push(generateCrystal(rng, itemPowerFor(level, rng), nextUid()));
  const gold = rng.chance(table.goldChance) ? Math.round(rng.range(table.gold[0], table.gold[1]) * level) : 0;
  return { items, gold };
}

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(PROGRESSION.xpBase * Math.pow(level, PROGRESSION.xpExponent));
}

/** XP for killing an enemy: drop-table XP scaled by its level. */
export function killXp(table: DropTable, enemyLevel: number): number {
  return Math.round(table.xp * (1 + PROGRESSION.xpPerEnemyLevel * (enemyLevel - 1)));
}
