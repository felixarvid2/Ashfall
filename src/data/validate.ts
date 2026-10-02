/**
 * Startup data validation (run in dev mode and in tests): schemas plus
 * cross-references such as "every prop in a zone points at a real asset id".
 */
import manifestJson from '../../assets/manifest.json';
import { AssetManifestSchema } from './assetManifest';
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

  if (!SettingsSchema.safeParse({}).success) errors.push('settings: defaults do not validate');
  if (typeof en !== 'object') errors.push('lang/en.json: not an object');
  return errors;
}
