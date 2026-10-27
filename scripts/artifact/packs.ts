/**
 * Which converted models the artifact build packs (src/render/modelPack.ts reads them back at run time).
 * Everything under parts/ and blender/ is packed (tiny files, ~160 of them); props/ and environment/ pack only models
 * up to MAX_PACKED_BYTES, so a pack stays a few MB and the big models keep their own files and load on demand.
 */
import { packNameFor, type Pack } from '../../src/render/modelPack';

/** Largest base64 GLB (bytes) packed from a folder that is only packed by size. */
export const MAX_PACKED_BYTES = 450_000;
/** Folders packed whatever their size. */
const ALWAYS_PACKED = new Set(['parts', 'blender']);
/** The artifact host refuses a version of 512 or more files; the build stops here, with room to spare. */
export const MAX_ARTIFACT_FILES = 500;

/** Does this model (path under assets/, base64 GLB) go into a pack? */
export function isPacked(path: string, base64: string): boolean {
  if (!packNameFor(path)) return false;
  return ALWAYS_PACKED.has(path.slice(0, path.indexOf('/'))) || base64.length <= MAX_PACKED_BYTES;
}

/** The packs to write, pack name → content, from the models that isPacked (paths sorted, so builds repeat). */
export function buildPacks(models: ReadonlyMap<string, string>): Map<string, Pack> {
  const packs = new Map<string, Record<string, string>>();
  for (const path of [...models.keys()].sort()) {
    const name = packNameFor(path);
    if (!name) continue;
    const pack = packs.get(name) ?? {};
    pack[path] = models.get(path)!;
    packs.set(name, pack);
  }
  return packs;
}

/** Throws when the output has too many files for an artifact, naming where they are. */
export function assertFileBudget(files: readonly string[], limit = MAX_ARTIFACT_FILES): void {
  if (files.length <= limit) return;
  const dirs = new Map<string, number>();
  for (const f of files) {
    const dir = f.slice(0, f.lastIndexOf('/'));
    dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
  }
  const top = [...dirs].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, n]) => `${d} (${n})`).join(', ');
  throw new Error(`dist-artifact has ${files.length} files; a claude.ai artifact accepts at most 511 per version and this build stops at ${limit}. Most files: ${top}. Pack more models (scripts/artifact/packs.ts) or drop assets.`);
}
