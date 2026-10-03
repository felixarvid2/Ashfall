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
import { Document, Logger, NodeIO, type Node, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, getBounds, meshopt, prune, resample, textureCompress, weld } from '@gltf-transform/functions';
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
  return new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
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

/**
 * Simplify towards a triangle budget. Meshy meshes have many small UV islands, which
 * pin the regular simplifier, so we run meshoptimizer in "Permissive" mode (may collapse
 * across seams when the error stays low) and fall back to sloppy simplification for
 * aggressive LOD targets. Normals are recomputed smoothly afterwards.
 */
async function simplifyTo(doc: Document, target: number): Promise<void> {
  const total = countTriangles(doc);
  if (total <= target * 1.1) return;
  await doc.transform(weld());
  const ratio = target / countTriangles(doc);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      if (!pos || !idx || prim.getMode() !== 4) continue;
      const positions = new Float32Array(pos.getCount() * 3);
      const el: number[] = [];
      for (let i = 0; i < pos.getCount(); i++) positions.set(pos.getElement(i, el), i * 3);
      const indices = Uint32Array.from(idx.getArray()!);
      const targetIndices = Math.max(3, Math.floor((indices.length / 3) * ratio) * 3);
      let [result] = MeshoptSimplifier.simplify(indices, positions, 3, targetIndices, 0.05, ['Permissive']);
      if (result.length > targetIndices * 1.25) {
        [result] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, targetIndices, 1);
      }
      idx.setArray(new Uint32Array(result));
      compactPrimitive(prim);
    }
  }
  await doc.transform(prune());
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) smoothNormals(doc, prim);
}

/** Area-weighted smooth vertex normals for an indexed triangle primitive. */
function smoothNormals(doc: Document, prim: Primitive): void {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  if (!pos || !idx || prim.getMode() !== 4) return;
  const p = pos.getArray()!;
  const ind = idx.getArray()!;
  const n = new Float32Array(pos.getCount() * 3);
  for (let i = 0; i < ind.length; i += 3) {
    const a = ind[i]! * 3;
    const b = ind[i + 1]! * 3;
    const c = ind[i + 2]! * 3;
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      n[k] = n[k]! + nx;
      n[k + 1] = n[k + 1]! + ny;
      n[k + 2] = n[k + 2]! + nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1;
    n[i] = n[i]! / len;
    n[i + 1] = n[i + 1]! / len;
    n[i + 2] = n[i + 2]! / len;
  }
  const buffer = doc.getRoot().listBuffers()[0];
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(n).setBuffer(buffer ?? null));
}

/** Copy normal and metallic-roughness textures from `from` into `doc`'s matching materials. */
function restorePbr(doc: Document, from: Document, id: string, log: (m: string) => void): void {
  const src = from.getRoot().listMaterials();
  doc.getRoot().listMaterials().forEach((mat, i) => {
    const s = src[i];
    if (!s) return;
    const copy = (t: ReturnType<typeof s.getNormalTexture>) => {
      if (!t) return null;
      const image = t.getImage();
      return image ? doc.createTexture(t.getName()).setImage(image).setMimeType(t.getMimeType()) : null;
    };
    if (!mat.getNormalTexture() && s.getNormalTexture()) {
      mat.setNormalTexture(copy(s.getNormalTexture())).setNormalScale(s.getNormalScale());
    }
    if (!mat.getMetallicRoughnessTexture() && s.getMetallicRoughnessTexture()) {
      mat.setMetallicRoughnessTexture(copy(s.getMetallicRoughnessTexture())).setMetallicFactor(s.getMetallicFactor()).setRoughnessFactor(s.getRoughnessFactor());
    }
  });
  log(`${id}: restored PBR maps from the rigged model`);
}

export async function optimizeAssets(manifest: AssetManifest, entries: AssetEntry[], log: (m: string) => void): Promise<void> {
  const nodeIO = await io();
  for (const entry of entries) {
    const animated = sourcePath(entry, 'animated.glb');
    const input = entry.rig && existsSync(animated) ? animated : sourcePath(entry, 'refined.glb');
    log(`${entry.id}: optimizing ${input.split('/').slice(-2).join('/')}`);
    const doc = await nodeIO.read(input);
    // Meshy's animation step returns base colour only; the rigged model (same mesh and UVs) still
    // has the normal and metallic-roughness maps, so copy them back.
    const rigged = sourcePath(entry, 'rigged.glb');
    if (input === animated && existsSync(rigged)) restorePbr(doc, await nodeIO.read(rigged), entry.id, log);
    const before = countTriangles(doc);
    const skinned = doc.getRoot().listSkins().length > 0;

    await doc.transform(dedup(), weld(), prune());
    await simplifyTo(doc, entry.targetPolycount);
    // Rigged models are already sized by Meshy (height_meters); their bind-pose bounds ignore the
    // skeleton (centimetre bones under a 0.01-scaled armature), so measuring them would be wrong.
    if (!skinned) normalise(doc, entry.heightMeters);
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
        lodDoc.setLogger(new Logger(Logger.Verbosity.WARN));
        await simplifyTo(lodDoc, Math.max(100, Math.round(countTriangles(doc) * ratio)));
        await lodDoc.transform(prune(), meshopt({ encoder: MeshoptEncoder }));
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
