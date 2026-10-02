/** Parsed and validated loot data. */
import { AFFIXES } from './affixes';
import { BASES } from './bases';
import {
  AffixDefSchema,
  BaseItemDefSchema,
  CrystalDefSchema,
  DropTableSchema,
  ProgressionSchema,
  RarityDefSchema,
  type AffixDef,
  type BaseItemDef,
  type CrystalDef,
  type DropTable,
  type Rarity,
  type RarityDef,
} from './schemas';
import { CRYSTALS, DROP_TABLES, PROGRESSION as PROGRESSION_INPUT, RARITY_DEFS } from './tables';

function byId<T extends { id: string }>(items: T[], what: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`Duplicate ${what} id: ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

export const BASE_ITEMS: ReadonlyMap<string, BaseItemDef> = byId(BASES.map((b) => BaseItemDefSchema.parse(b)), 'base item');
export const AFFIX_DEFS: ReadonlyMap<string, AffixDef> = byId(AFFIXES.map((a) => AffixDefSchema.parse(a)), 'affix');
export const RARITY: ReadonlyMap<Rarity, RarityDef> = new Map(
  RARITY_DEFS.map((r) => RarityDefSchema.parse(r)).map((r) => [r.id, r] as const),
);
export const CRYSTAL_DEFS: ReadonlyMap<string, CrystalDef> = byId(CRYSTALS.map((c) => CrystalDefSchema.parse(c)), 'crystal');
export const DROP_TABLE_DEFS: ReadonlyMap<string, DropTable> = byId(DROP_TABLES.map((d) => DropTableSchema.parse(d)), 'drop table');
export const PROGRESSION = ProgressionSchema.parse(PROGRESSION_INPUT);

export function baseItem(id: string): BaseItemDef {
  const b = BASE_ITEMS.get(id);
  if (!b) throw new Error(`Unknown base item: ${id}`);
  return b;
}

export function rarityDef(id: Rarity): RarityDef {
  return RARITY.get(id)!;
}

export function dropTable(id: string): DropTable {
  const t = DROP_TABLE_DEFS.get(id);
  if (!t) throw new Error(`Unknown drop table: ${id}`);
  return t;
}
