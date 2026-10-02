/** Load/save assets/manifest.json with schema validation and atomic writes. */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AssetManifestSchema, type AssetEntry, type AssetManifest } from '../../src/data/assetManifest';
import { ROOT } from './env';

export const MANIFEST_PATH = resolve(ROOT, 'assets/manifest.json');
export const SOURCE_DIR = resolve(ROOT, 'assets/source');
export const PUBLIC_ASSETS_DIR = resolve(ROOT, 'public/assets');

export function loadManifest(): AssetManifest {
  return AssetManifestSchema.parse(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));
}

/**
 * Write via a temp file + rename so a crash mid-write never corrupts the manifest.
 * Called after every task id is recorded, so nothing paid for is ever lost.
 */
export function saveManifest(manifest: AssetManifest): void {
  const validated = AssetManifestSchema.parse(manifest);
  const tmp = `${MANIFEST_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(validated, null, 2) + '\n');
  renameSync(tmp, MANIFEST_PATH);
}

export function sourcePath(entry: AssetEntry, file: string): string {
  return resolve(SOURCE_DIR, entry.id, file);
}

/** Select assets by comma-separated ids or prefixes ("enemy." matches all enemies); empty = all. */
export function selectAssets(manifest: AssetManifest, ids: string[] | undefined): AssetEntry[] {
  if (!ids || ids.length === 0 || ids.includes('all')) return manifest.assets;
  const out = manifest.assets.filter((a) => ids.some((id) => a.id === id || (id.endsWith('.') && a.id.startsWith(id))));
  const unknown = ids.filter((id) => !id.endsWith('.') && !manifest.assets.some((a) => a.id === id));
  if (unknown.length) throw new Error(`Unknown asset id(s): ${unknown.join(', ')}`);
  return out;
}
