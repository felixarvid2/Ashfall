/**
 * Parsed, validated design data. Everything gameplay reads goes through here,
 * so schema defaults are applied and bad data fails loudly at startup.
 */
import { BASTION } from './classes/bastion';
import { SPECTRE } from './classes/spectre';
import { XENOMANT } from './classes/xenomant';
import { ENEMIES } from './enemies';
import { TEST_ARENA_WAVES } from './encounters';
import {
  ClassDefSchema,
  EncounterSchema,
  EnemyDefSchema,
  SkillDefSchema,
  StatusDefSchema,
  type ClassDef,
  type Encounter,
  type EnemyDef,
  type SkillDef,
  type StatusDef,
  type StatusId,
} from './schemas';
import { BASTION_SKILLS } from './skills/bastion';
import { SPECTRE_SKILLS } from './skills/spectre';
import { XENOMANT_SKILLS } from './skills/xenomant';
import { STATUSES } from './statuses';
import { SkillTreeSchema, type SkillTree } from './skillTree/schema';
import { BASTION_TREE } from './skillTree/bastion';
import { SPECTRE_TREE } from './skillTree/spectre';
import { XENOMANT_TREE } from './skillTree/xenomant';

function byId<T extends { id: string }>(items: T[], what: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`Duplicate ${what} id: ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

export const SKILLS: ReadonlyMap<string, SkillDef> = byId(
  [...BASTION_SKILLS, ...SPECTRE_SKILLS, ...XENOMANT_SKILLS].map((s) => SkillDefSchema.parse(s)),
  'skill',
);
export const CLASSES: ReadonlyMap<string, ClassDef> = byId([BASTION, SPECTRE, XENOMANT].map((c) => ClassDefSchema.parse(c)), 'class');
export const ENEMY_DEFS: ReadonlyMap<string, EnemyDef> = byId(
  ENEMIES.map((e) => EnemyDefSchema.parse(e)),
  'enemy',
);
export const STATUS_DEFS = Object.fromEntries(
  Object.entries(STATUSES).map(([id, def]) => [id, StatusDefSchema.parse(def)]),
) as Record<StatusId, StatusDef>;
export const ENCOUNTERS: ReadonlyMap<string, Encounter> = byId([EncounterSchema.parse(TEST_ARENA_WAVES)], 'encounter');

export const SKILL_TREES: ReadonlyMap<string, SkillTree> = new Map(
  [BASTION_TREE, SPECTRE_TREE, XENOMANT_TREE].map((t) => SkillTreeSchema.parse(t)).map((t) => [t.classId, t] as const),
);

export function skill(id: string): SkillDef {
  const def = SKILLS.get(id);
  if (!def) throw new Error(`Unknown skill: ${id}`);
  return def;
}

export function enemyDef(id: string): EnemyDef {
  const def = ENEMY_DEFS.get(id);
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}

export function classDef(id: string): ClassDef {
  const def = CLASSES.get(id);
  if (!def) throw new Error(`Unknown class: ${id}`);
  return def;
}
