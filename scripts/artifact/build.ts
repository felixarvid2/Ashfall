/**
 * npm run build:artifact — a production build for publishing as a claude.ai artifact, in
 * dist-artifact/. Artifacts don't serve .glb and their CSP blocks WebAssembly and data: fetches, so
 * every model becomes a `.glb.json` (see below), and the small ones travel in a few packs (packs.ts) to stay
 * under the artifact host's file limit. Source maps are dropped.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { MAX_ARTIFACT_FILES, assertFileBudget, buildPacks, isPacked } from './packs';

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
const packedModels = new Map<string, string>();
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
  const base64 = Buffer.concat([header, body]).toString('base64');
  const path = relative(join(out, 'assets'), file).replace(/\.glb$/, '.glb.json');
  if (isPacked(path, base64)) packedModels.set(path, base64);
  else writeFileSync(join(out, 'assets', path), JSON.stringify({ glb: base64 }));
  rmSync(file);
  converted++;
}
// Small models travel together in assets/packs/<name>.json (src/render/modelPack.ts fetches a pack on the first
// request for one of its models); that keeps the version under the artifact host's file limit.
const packs = buildPacks(packedModels);
mkdirSync(join(out, 'assets', 'packs'), { recursive: true });
for (const [name, pack] of packs) writeFileSync(join(out, 'assets', 'packs', `${name}.json`), JSON.stringify(pack));
// The page published as the artifact: the game's markup without the document skeleton (the artifact
// service adds one), pointing at this build's hashed bundles. Publish it with `file_path` set to
// dist-artifact/artifact-page.html and the changed assets under `files` (see .claude/agents/shipper.md).
// The home-screen manifest and its icons only belong to the standalone build.
for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) rmSync(join(out, f), { force: true });
const built = readFileSync(join(out, 'index.html'), 'utf8');
const js = /src="\.\/assets\/(index-[^"]+\.js)"/.exec(built)?.[1];
const css = /href="\.\/assets\/([^"]+\.css)"/.exec(built)?.[1];
if (!js || !css) throw new Error('index bundle names not found in dist-artifact/index.html');
// The app is split into a few chunks (vendor-three, vendor-zod, lang, game-data, game-ui): the entry imports them
// by relative path, so they must be published beside it. Preload them in parallel, and fail the build if any chunk
// an import points at is missing from the output.
const chunks = [...built.matchAll(/<link rel="modulepreload"[^>]*href="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]!);
for (const chunk of [js, ...chunks]) {
  const code = readFileSync(join(out, 'assets', chunk), 'utf8');
  for (const m of code.matchAll(/(?:from|import\()\s*["']\.\/([^"']+\.js)["']/g)) {
    if (!statSync(join(out, 'assets', m[1]!), { throwIfNoEntry: false })) throw new Error(`${chunk} imports ./${m[1]}, which is not in dist-artifact/assets`);
  }
}
const preload = chunks.map((c) => `<link rel="modulepreload" href="./assets/${c}">`).join('\n');
writeFileSync(
  join(out, 'artifact-page.html'),
  `<title>Ashfall</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>
  /* Single dark look: the game paints its own scene. */
  :root { --bg: #0b0b0c; --fg: #d8d0c4; color-scheme: dark; }
  html, body { height: 100%; background: var(--bg); color: var(--fg); }
</style>
<link rel="stylesheet" href="./assets/${css}">
${preload}
<div id="app">
  <canvas id="game"></canvas>
  <div id="ui"></div>
</div>
<script type="module" src="./assets/${js}"></script>
`,
);

const files = walk(out);
assertFileBudget(files.map((f) => relative(out, f)));
const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
const packNote = [...packs].map(([n, p]) => `${n}: ${Object.keys(p).length} models, ${(statSync(join(out, 'assets', 'packs', `${n}.json`)).size / 1e6).toFixed(1)} MB`).join('; ');
console.log(`Converted ${converted} models (packed: ${packNote}). ${files.length} of max ${MAX_ARTIFACT_FILES} files, ${(bytes / 1e6).toFixed(1)} MB in dist-artifact/.`);
