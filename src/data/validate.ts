/**
 * Startup data validation (run in dev mode and in tests): schemas plus
 * cross-references such as "every prop in a zone points at a real asset id".
 */
import manifestJson from '../../assets/manifest.json';
import { AssetManifestSchema } from './assetManifest';
import { CLASSES, ENCOUNTERS, ENEMY_DEFS, SKILLS } from './db';
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

  if (!SettingsSchema.safeParse({}).success) errors.push('settings: defaults do not validate');
  if (typeof en !== 'object') errors.push('lang/en.json: not an object');
  return errors;
}
