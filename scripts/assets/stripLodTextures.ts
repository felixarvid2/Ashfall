/**
 * npm run assets:strip-lods — removes the textures from every LOD file in public/assets (T002).
 *
 * Each `_lod1.glb` / `_lod2.glb` used to carry its own copy of the base model's textures (18.75 MB of
 * identical bytes across 144 files). Now the LODs keep geometry and material parameters only, and
 * `AssetLibrary` points their materials at the base model's textures after loading
 * (`shareLodTextures` in src/render/assets.ts). Local processing only; idempotent (a LOD without
 * textures is left alone); the Meshy pipeline (scripts/meshy/optimize.ts) now writes LODs this way too.
 *
 *   npx tsx scripts/assets/stripLodTextures.ts            # rewrite the files
 *   npx tsx scripts/assets/stripLodTextures.ts --dry-run  # only report what would change
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { stripTextures } from '../meshy/optimize';

const root = new URL('../..', import.meta.url).pathname;
const publicAssets = resolve(root, 'public/assets');
const dryRun = process.argv.includes('--dry-run');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .setLogger(new Logger(Logger.Verbosity.WARN))
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const manifest = JSON.parse(readFileSync(resolve(root, 'assets/manifest.json'), 'utf8')) as { assets: { id: string; lods?: string[] }[] };
let changed = 0;
let before = 0;
let after = 0;
for (const asset of manifest.assets) {
  for (const lod of asset.lods ?? []) {
    const file = resolve(publicAssets, lod);
    const size = statSync(file).size;
    before += size;
    const doc = await io.read(file);
    if (doc.getRoot().listTextures().length === 0) {
      after += size;
      continue;
    }
    if (dryRun) {
      console.log(`would strip ${lod} (${doc.getRoot().listTextures().length} textures, ${size} bytes)`);
      after += size;
      continue;
    }
    stripTextures(doc);
    await doc.transform(meshopt({ encoder: MeshoptEncoder }));
    const bytes = await io.writeBinary(doc);
    writeFileSync(file, bytes);
    after += bytes.length;
    changed++;
  }
}
console.log(`${dryRun ? 'Would rewrite' : 'Rewrote'} ${changed} LOD files; LOD bytes ${before} -> ${after} (${((before - after) / 1e6).toFixed(2)} MB saved)`);
