/**
 * Post-processing with gltf-transform (brief §9.2 step 6):
 *  - weld/dedup/prune, simplify to the asset's target polycount
 *  - normalise scale (1 unit = 1 m, from heightMeters) and put the pivot at the feet, centred
 *  - rename animation clips to game states (idle, run, attack, …)
 *  - resize textures and convert them to WebP
 *  - meshopt-compress geometry
 *  - LOD files for static assets
 * Output goes to public/assets/<folder>/<name>.glb and the manifest is updated.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Document, NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import type { AssetEntry, AssetManifest } from '../../src/data/assetManifest';
import { GAME_TEXTURE_SIZE, LOD_RATIOS } from './config';
import { PUBLIC_ASSETS_DIR, sourcePath } from './manifest';

const FOLDERS: Record<AssetEntry['category'], string> = {
  character: 'characters',
  enemy: 'enemies',
  prop: 'props',
  environment: 'environment',
  icon: 'icons',
};

export function outputPath(entry: AssetEntry, suffix = ''): { rel: string; abs: string } {
  const name = entry.id.split('.').slice(1).join('_');
  const rel = `${FOLDERS[entry.category]}/${name}${suffix}.glb`;
  return { rel, abs: resolve(PUBLIC_ASSETS_DIR, rel) };
}

export function countTriangles(doc: Document): number {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      tris += Math.floor((idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3);
    }
  }
  return tris;
}

async function io(): Promise<NodeIO> {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
}

/** Wrap scene roots in one node that scales to `height` metres with the pivot at the feet, centred on x/z. */
function normalise(doc: Document, height: number | undefined): void {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return;
  const bounds = getBounds(scene);
  const size = bounds.max[1] - bounds.min[1];
  if (!(size > 0)) return;
  const scale = height ? height / size : 1;
  const root: Node = doc.createNode('AssetRoot');
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    root.addChild(child);
  }
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  root.setScale([scale, scale, scale]);
  root.setTranslation([-cx * scale, -bounds.min[1] * scale, -cz * scale]);
  scene.addChild(root);
}

function renameClips(doc: Document, entry: AssetEntry, log: (m: string) => void): Record<string, string> | undefined {
  const anims = doc.getRoot().listAnimations();
  if (!entry.rig || anims.length === 0) return undefined;
  const clips: Record<string, string> = {};
  if (anims.length !== entry.rig.actions.length) {
    log(`${entry.id}: expected ${entry.rig.actions.length} clips, found ${anims.length}; keeping original names`);
    anims.forEach((a, i) => {
      const state = entry.rig!.actions[i]?.state;
      if (state) clips[state] = a.getName();
    });
    return clips;
  }
  anims.forEach((a, i) => {
    const state = entry.rig!.actions[i]!.state;
    a.setName(state);
    clips[state] = state;
  });
  return clips;
}

export async function optimizeAssets(manifest: AssetManifest, entries: AssetEntry[], log: (m: string) => void): Promise<void> {
  const nodeIO = await io();
  for (const entry of entries) {
    const animated = sourcePath(entry, 'animated.glb');
    const input = entry.rig && existsSync(animated) ? animated : sourcePath(entry, 'refined.glb');
    log(`${entry.id}: optimizing ${input.split('/').slice(-2).join('/')}`);
    const doc = await nodeIO.read(input);
    const before = countTriangles(doc);
    const skinned = doc.getRoot().listSkins().length > 0;

    await doc.transform(dedup(), weld(), prune());
    const target = entry.targetPolycount;
    const tris = countTriangles(doc);
    if (tris > target * 1.1) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / tris, error: 0.02, lockBorder: false }));
    }
    normalise(doc, entry.heightMeters);
    const clips = renameClips(doc, entry, log);
    if (doc.getRoot().listAnimations().length) await doc.transform(resample());
    await doc.transform(
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [GAME_TEXTURE_SIZE, GAME_TEXTURE_SIZE] }),
    );

    // LODs for static meshes only (skinned characters use one level; see docs/decisions.md).
    const lods: string[] = [];
    if (!skinned) {
      for (const [i, ratio] of LOD_RATIOS.entries()) {
        const lodDoc = await nodeIO.readBinary(await nodeIO.writeBinary(doc));
        await lodDoc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.05 }), prune(), meshopt({ encoder: MeshoptEncoder }));
        const out = outputPath(entry, `_lod${i + 1}`);
        mkdirSync(dirname(out.abs), { recursive: true });
        await nodeIO.write(out.abs, lodDoc);
        lods.push(out.rel);
      }
    }

    await doc.transform(meshopt({ encoder: MeshoptEncoder }));
    const out = outputPath(entry);
    mkdirSync(dirname(out.abs), { recursive: true });
    await nodeIO.write(out.abs, doc);

    const after = countTriangles(doc);
    entry.file = out.rel;
    entry.lods = lods.length ? lods : undefined;
    entry.stats = {
      triangles: after,
      bytes: statSync(out.abs).size,
      textures: doc.getRoot().listTextures().length,
    };
    if (clips) entry.meshy.clips = clips;
    entry.status = 'optimized';
    log(`✓ ${entry.id}: ${before} → ${after} triangles, ${(entry.stats.bytes / 1024).toFixed(0)} KB → ${out.rel}`);
  }
}
