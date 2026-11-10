/**
 * Bestiary pages (round 4, D19): one page per enemy family with its description, the enemies that belong to it and
 * how many the account has defeated (counter `family.<id>` in account.feats.stats, fed by systems/feats.ts).
 * Names and descriptions: lang/en.json -> bestiary.<family>. The 3D turntable the item asked for is not built.
 */
import { ENEMY_DEFS } from './db';
import { ENEMY_FAMILIES, type EnemyFamily } from './schemas';

export interface BestiaryRow {
  family: EnemyFamily;
  /** Enemies of this family (ids, regular enemies only, in data order). */
  members: string[];
  kills: number;
}

/** Counter key of a family's kills. */
export const familyKillKey = (family: string): string => `family.${family}`;

export function bestiaryRows(stats: Readonly<Record<string, number>>): BestiaryRow[] {
  return ENEMY_FAMILIES.map((family) => ({
    family,
    members: [...ENEMY_DEFS.values()].filter((e) => e.family === family && !e.id.startsWith('world_')).map((e) => e.id),
    kills: stats[familyKillKey(family)] ?? 0,
  }));
}
