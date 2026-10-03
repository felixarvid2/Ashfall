/**
 * npm run build:artifact — a production build for publishing as a claude.ai artifact, in
 * dist-artifact/. Artifacts don't serve .glb and their CSP blocks WebAssembly and data: fetches, so
 * every model becomes a `.glb.json` (see below). Source maps are dropped.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const root = new URL('../..', import.meta.url).pathname;
const out = join(root, 'dist-artifact');
execSync('npx vite build --outDir dist-artifact --emptyOutDir', { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_MODEL_FORMAT: 'json' } });

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

// Artifact pages run under a CSP that blocks WebAssembly and fetches of data: URIs, so each model is
// rebuilt without meshopt compression (decoded here), its textures become data: images (loaded through
// <img>), and the GLB itself travels base64-encoded inside a JSON file the page can fetch.
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function pad4(buf: Buffer, fill: number): Buffer {
  const extra = (4 - (buf.length % 4)) % 4;
  return extra ? Buffer.concat([buf, Buffer.alloc(extra, fill)]) : buf;
}

let converted = 0;
for (const file of walk(out)) {
  if (file.endsWith('.map') || file.endsWith('.gitkeep')) {
    rmSync(file);
    continue;
  }
  if (!file.endsWith('.glb')) continue;
  // The artifact loads only each model's full-detail level.
  if (/_lod\d\.glb$/.test(file)) {
    rmSync(file);
    continue;
  }
  const doc = await io.read(file);
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  const glb = Buffer.from(await io.writeBinary(doc));
  // Split the GLB, move images out of the binary chunk into data: URIs, and pack it again.
  let offset = 12;
  let json: { images?: { bufferView?: number; mimeType?: string; uri?: string }[]; bufferViews?: { byteOffset?: number; byteLength: number }[] } | null = null;
  let bin: Buffer | null = null;
  while (offset < glb.length) {
    const length = glb.readUInt32LE(offset);
    const type = glb.readUInt32LE(offset + 4);
    const chunk = glb.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error(`${file} has no JSON chunk`);
  for (const img of json.images ?? []) {
    if (img.bufferView === undefined || !bin) continue;
    const view = json.bufferViews![img.bufferView]!;
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    img.uri = `data:${img.mimeType ?? 'image/png'};base64,${bytes.toString('base64')}`;
    delete img.bufferView;
  }
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const parts = [jsonChunk.length, 0x4e4f534a];
  const chunks: Buffer[] = [Buffer.from(new Uint32Array(parts).buffer), jsonChunk];
  if (bin) {
    const b = pad4(Buffer.from(bin), 0);
    chunks.push(Buffer.from(new Uint32Array([b.length, 0x004e4942]).buffer), b);
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.from(new Uint32Array([0x46546c67, 2, 12 + body.length]).buffer);
  writeFileSync(file.replace(/\.glb$/, '.glb.json'), JSON.stringify({ glb: Buffer.concat([header, body]).toString('base64') }));
  rmSync(file);
  converted++;
}
const files = walk(out);
const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
console.log(`Converted ${converted} models. ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB in dist-artifact/.`);
