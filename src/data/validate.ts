/**
 * Startup data validation (run in dev mode and in tests): schemas plus
 * cross-references such as "every prop in a zone points at a real asset id".
 */
import manifestJson from '../../assets/manifest.json';
import { AssetManifestSchema } from './assetManifest';
import { fieldAccess } from '../systems/skillCompile';
import { CLASSES, ENCOUNTERS, ENEMY_DEFS, SKILLS, SKILL_TREES } from './db';
import type { Effect } from './effects';
import { ASPECT_DEFS, BASE_ITEMS, UNIQUE_DEFS } from './loot/db';
import en from './lang/en.json';
import { SettingsSchema } from './settings';
import { TEST_ARENA, type ArenaDef } from './zones/testArena';

export function validateGameData(): string[] {
  const errors: string[] = [];

  const manifest = AssetManifestSchema.safeParse(manifestJson);
  if (!manifest.success) {
    for (const issue of manifest.error.issues) errors.push(`manifest ${issue.path.join('.')}: ${issue.message}`);
    return errors;
  }
  const ids = new Set<string>();
  for (const asset of manifest.data.assets) {
    if (ids.has(asset.id)) errors.push(`manifest: duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    if (asset.status === 'optimized' && !asset.file) errors.push(`manifest: ${asset.id} is optimized but has no file`);
    if (asset.category !== 'icon' && !asset.placeholder) errors.push(`manifest: ${asset.id} needs a placeholder`);
  }

  const arenas: ArenaDef[] = [TEST_ARENA];
  for (const arena of arenas) {
    for (const prop of arena.props) {
      if (!ids.has(prop.asset)) errors.push(`${arena.id}: unknown asset ${prop.asset}`);
      if (Math.abs(prop.x) > arena.halfSize || Math.abs(prop.z) > arena.halfSize) {
        errors.push(`${arena.id}: ${prop.asset} at (${prop.x}, ${prop.z}) is outside the arena`);
      }
    }
    for (const s of arena.scatter) if (!ids.has(s.asset)) errors.push(`${arena.id}: unknown scatter asset ${s.asset}`);
  }

  // Combat data (schemas are enforced when db.ts loads; these are cross-references).
  for (const cls of CLASSES.values()) {
    if (!ids.has(cls.assetId)) errors.push(`class ${cls.id}: unknown asset ${cls.assetId}`);
    for (const id of cls.actionBar) {
      if (id === null) continue;
      const def = SKILLS.get(id);
      if (!def) errors.push(`class ${cls.id}: action bar references unknown skill ${id}`);
      else if (def.classId !== cls.id) errors.push(`class ${cls.id}: skill ${id} belongs to ${def.classId}`);
    }
  }
  for (const enemy of ENEMY_DEFS.values()) {
    if (!ids.has(enemy.assetId)) errors.push(`enemy ${enemy.id}: unknown asset ${enemy.assetId}`);
    const [min, max] = enemy.preferredRange ?? [0, 0];
    if (min > max) errors.push(`enemy ${enemy.id}: preferredRange min > max`);
  }
  for (const enc of ENCOUNTERS.values()) {
    for (const wave of enc.waves) {
      for (const g of wave.groups) if (!ENEMY_DEFS.has(g.enemy)) errors.push(`${enc.id}: unknown enemy ${g.enemy}`);
    }
    if (enc.spawnRing[0] > enc.spawnRing[1]) errors.push(`${enc.id}: spawnRing min > max`);
  }
  for (const def of SKILLS.values()) {
    const [cls, name] = def.id.split('.');
    const strings = (en as { skills?: Record<string, Record<string, unknown>> }).skills;
    if (!strings?.[cls!]?.[name!]) errors.push(`lang/en.json: missing strings for skill ${def.id}`);
  }
  for (const enemy of ENEMY_DEFS.values()) {
    const names = (en as { enemies?: Record<string, string> }).enemies;
    if (!names?.[enemy.id]) errors.push(`lang/en.json: missing name for enemy ${enemy.id}`);
  }

  // Effects (tree, aspects, uniques) must point at real skills and fields that skill has.
  const checkEffects = (where: string, effects: readonly Effect[], classId?: string) => {
    for (const eff of effects) {
      if (eff.kind !== 'skillMod') continue;
      const def = SKILLS.get(eff.skill);
      if (!def) {
        errors.push(`${where}: unknown skill ${eff.skill}`);
        continue;
      }
      if (classId && def.classId !== classId) errors.push(`${where}: skill ${eff.skill} belongs to ${def.classId}`);
      for (const m of eff.mods) {
        if ((m.op === 'mul' || m.op === 'add' || m.op === 'set') && !fieldAccess(def, m.field)) {
          errors.push(`${where}: ${eff.skill} has no field ${m.field}`);
        }
      }
    }
  };
  const lang = (key: string) => {
    let node: unknown = en;
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    if (typeof node !== 'string') errors.push(`lang/en.json: missing ${key}`);
  };

  for (const tree of SKILL_TREES.values()) {
    const where = `tree ${tree.classId}`;
    const nodes = new Map(tree.nodes.map((n) => [n.id, n]));
    if (nodes.size !== tree.nodes.length) errors.push(`${where}: duplicate node ids`);
    const start = nodes.get(tree.startingNode);
    if (!start || start.type !== 'skill') errors.push(`${where}: startingNode must be a skill node`);
    for (const n of tree.nodes) {
      if (n.type === 'skill') {
        const def = SKILLS.get(n.skill);
        if (!def) errors.push(`${where}: ${n.id} references unknown skill ${n.skill}`);
        else if (def.classId !== tree.classId) errors.push(`${where}: ${n.id} skill belongs to ${def.classId}`);
        continue;
      }
      if (n.type === 'enhancement' && nodes.get(n.parent)?.type !== 'skill') errors.push(`${where}: ${n.id} parent must be a skill`);
      if (n.type === 'modifier' && nodes.get(n.parent)?.type !== 'enhancement') errors.push(`${where}: ${n.id} parent must be an enhancement`);
      checkEffects(`${where} ${n.id}`, n.effects, tree.classId);
      lang(`tree.${n.id}.name`);
      lang(`tree.${n.id}.desc`);
    }
    const taught = new Set(tree.nodes.flatMap((n) => (n.type === 'skill' ? [n.skill] : [])));
    for (const def of SKILLS.values()) {
      if (def.classId === tree.classId && !taught.has(def.id)) errors.push(`${where}: skill ${def.id} is not in the tree`);
    }
  }
  for (const a of ASPECT_DEFS.values()) {
    if (a.min > a.max) errors.push(`aspect ${a.id}: min > max`);
    checkEffects(`aspect ${a.id}`, a.effects as Effect[], a.classes?.length === 1 ? a.classes[0] : undefined);
    lang(`aspects.${a.id}.name`);
    lang(`aspects.${a.id}.desc`);
  }
  for (const u of UNIQUE_DEFS.values()) {
    if (!BASE_ITEMS.has(u.base)) errors.push(`unique ${u.id}: unknown base ${u.base}`);
    for (const a of u.affixes) if (a.min > a.max) errors.push(`unique ${u.id}: ${a.stat} min > max`);
    checkEffects(`unique ${u.id}`, u.effects as Effect[], u.classes?.length === 1 ? u.classes[0] : undefined);
    for (const k of ['name', 'effect', 'flavor']) lang(`uniques.${u.id}.${k}`);
  }
  for (const b of ['basic', 'core', 'defensive', 'tactical', 'mastery', 'ultimate', 'key']) lang(`tree.branches.${b}`);

  if (!SettingsSchema.safeParse({}).success) errors.push('settings: defaults do not validate');
  if (typeof en !== 'object') errors.push('lang/en.json: not an object');
  return errors;
}
