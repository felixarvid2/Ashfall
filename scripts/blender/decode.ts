/** Helpers shared by the Blender scripts: running Blender headless, and decoding GLBs (Blender 4.0 reads neither meshopt, WebP nor (reliably) quantized skinned meshes). */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

/** A copy of a GLB (shipped or raw) that Blender 4.0 can import: no meshopt, no quantization, PNG instead of WebP. */
export async function decodeGlbForBlender(src: string, out: string): Promise<string> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(src);
  await doc.transform(dequantize());
  for (const t of doc.getRoot().listTextures()) {
    const image = t.getImage();
    if (image && t.getMimeType() !== 'image/png' && t.getMimeType() !== 'image/jpeg') t.setImage(new Uint8Array(await sharp(image).png().toBuffer())).setMimeType('image/png');
  }
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === EXTTextureWebP.EXTENSION_NAME || ext.extensionName === 'EXT_meshopt_compression' || ext.extensionName === 'KHR_mesh_quantization') ext.dispose();
  }
  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  return out;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALL = 'apt-get install -y blender python3-numpy';

/**
 * Run Blender headless on one of the scripts in this folder. Stops with the install line when Blender is missing.
 * Blender prints a harmless "Draco mesh compression is not available" line on every glTF export: only lines
 * matching `show` are echoed on success, everything on failure.
 */
export function runBlender(script: string, args: string[], show: RegExp): void {
  const probe = spawnSync('blender', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    throw new Error(`Blender is not installed or not on PATH. Install it with:\n  ${INSTALL}`);
  }
  const run = spawnSync('blender', ['-b', '--factory-startup', '--python-exit-code', '1', '-P', join(HERE, script), '--', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (run.status !== 0) {
    process.stderr.write(run.stdout + run.stderr);
    throw new Error(`blender ${script} failed (exit ${run.status})`);
  }
  for (const line of run.stdout.split('\n')) if (show.test(line)) console.log(line);
}
