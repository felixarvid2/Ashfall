/**
 * The slim manifest the game loads at runtime (T006): only the fields `AssetLibrary` reads. The 162
 * prompts, Meshy task ids and stats stay out of the client bundle (136 kB on disk, 34 kB slim).
 * Used by tools/runtimeManifestPlugin.ts (the `virtual:asset-manifest` module) and by tests.
 */
import { readFileSync } from 'node:fs';
import { RuntimeManifestSchema, type RuntimeManifest } from '../../src/data/assetManifest';

const MANIFEST = new URL('../../assets/manifest.json', import.meta.url);

/** Project a full manifest (any object with `assets`) onto the runtime fields; entries are validated. */
export function toRuntimeManifest(full: unknown): RuntimeManifest {
  const parsed = RuntimeManifestSchema.parse(full);
  return {
    version: parsed.version,
    // Drop empty/undefined keys so the minified JSON stays small.
    assets: parsed.assets.map((e) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e)) if (v !== undefined) out[k] = v;
      if (!e.meshy.clips) out.meshy = {};
      return out as RuntimeManifest['assets'][number];
    }),
  };
}

export function readRuntimeManifest(): RuntimeManifest {
  return toRuntimeManifest(JSON.parse(readFileSync(MANIFEST, 'utf8')));
}
