/** Load/save assets/manifest.json with schema validation and atomic writes. */
import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
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

const LOCK_PATH = resolve(ROOT, 'assets/.manifest.lock');

/**
 * Only one manifest-writing command may run at a time: two processes each hold their own copy
 * of the manifest and the last one to save would silently undo the other's changes.
 */
export function acquireManifestLock(): void {
  try {
    const fd = openSync(LOCK_PATH, 'wx');
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
  } catch {
    const pid = Number(readFileSync(LOCK_PATH, 'utf8'));
    let alive = false;
    try {
      if (pid > 0) {
        process.kill(pid, 0);
        alive = true;
      }
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`Another meshy command (pid ${pid}) is running; wait for it to finish.`);
    writeFileSync(LOCK_PATH, String(process.pid)); // stale lock from a crashed run
  }
  process.on('exit', () => {
    try {
      if (Number(readFileSync(LOCK_PATH, 'utf8')) === process.pid) unlinkSync(LOCK_PATH);
    } catch {
      // already gone
    }
  });
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
