/**
 * npm run assets:textures — texture size caps per category (C07). Local only, no paid API.
 *
 *   npm run assets:textures            report every category and exit 1 when a texture is above its cap
 *   npm run assets:textures -- --fix   downsize the textures above their cap, in place (aspect kept)
 *
 * Two kinds of textures count: standalone images under public/assets (ground, art, icons, vfx atlas) and the
 * textures inside the models' .glb files. A model texture is rewritten through glTF-Transform (webp, as the
 * Meshy pipeline writes them) and the file is re-encoded with meshopt, so it loads exactly as before; the
 * geometry, materials and animations are not touched.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// A rewritten file must be read afresh (libvips would otherwise serve its cached copy).
sharp.cache(false);

const root = new URL('../..', import.meta.url).pathname;
const publicAssets = resolve(root, 'public/assets');

/** Longest side allowed, per category (the first path segment under public/assets). */
export const TEXTURE_CAPS: Readonly<Record<string, number>> = {
  characters: 1024,
  enemies: 1024,
  props: 1024,
  environment: 1024,
  env: 1024,
  textures: 1024,
  art: 1280,
  icons: 320,
  ui: 128,
  vfx: 2304,
};
/** Anything in a category with no entry above. */
export const DEFAULT_CAP = 1024;

export function capFor(category: string): number {
  return TEXTURE_CAPS[category] ?? DEFAULT_CAP;
}

export interface TextureRow {
  /** File relative to public/assets, plus `#<n>` for the n-th texture inside a model. */
  file: string;
  category: string;
  width: number;
  height: number;
  cap: number;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

async function makeIo(): Promise<NodeIO> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

/** A model's own `textureSize` from assets/manifest.json (small clutter asks for less than its category's cap). */
function manifestCaps(): Map<string, number> {
  const manifest = JSON.parse(readFileSync(resolve(root, 'assets/manifest.json'), 'utf8')) as { assets: { file?: string; lods?: string[]; textureSize?: number }[] };
  const out = new Map<string, number>();
  for (const a of manifest.assets) {
    if (!a.textureSize) continue;
    for (const f of [a.file, ...(a.lods ?? [])]) if (f) out.set(f, a.textureSize);
  }
  return out;
}

/** Every texture under public/assets with its size and cap. */
export async function scanTextures(): Promise<TextureRow[]> {
  const io = await makeIo();
  const rows: TextureRow[] = [];
  const own = manifestCaps();
  for (const path of walk(publicAssets).sort()) {
    const rel = relative(publicAssets, path);
    const category = rel.split('/')[0]!;
    if (/\.(webp|png|jpe?g)$/.test(rel)) {
      const m = await sharp(path).metadata();
      rows.push({ file: rel, category, width: m.width ?? 0, height: m.height ?? 0, cap: capFor(category) });
    } else if (rel.endsWith('.glb')) {
      const doc = await io.read(path);
      doc.getRoot().listTextures().forEach((tex, i) => {
        const size = tex.getSize() ?? [0, 0];
        rows.push({ file: `${rel}#${i}`, category, width: size[0], height: size[1], cap: Math.min(own.get(rel) ?? Infinity, capFor(category)) });
      });
    }
  }
  return rows;
}

export const over = (r: TextureRow): boolean => Math.max(r.width, r.height) > r.cap;

/** Rewrites one file so no texture is larger than `cap` on its longest side (aspect kept, never enlarged). */
export async function shrinkFile(path: string, cap: number): Promise<void> {
  if (path.endsWith('.glb')) {
    const io = await makeIo();
    const doc = await io.read(path);
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [cap, cap] }), meshopt({ encoder: MeshoptEncoder }));
    writeFileSync(path, await io.writeBinary(doc));
  } else {
    const buf = await sharp(path).resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true }).toFormat(path.endsWith('.png') ? 'png' : 'webp', { quality: 85 }).toBuffer();
    writeFileSync(path, buf);
  }
}

async function fix(rows: TextureRow[]): Promise<void> {
  const files = new Map<string, TextureRow[]>();
  for (const r of rows.filter(over)) {
    const file = r.file.split('#')[0]!;
    files.set(file, [...(files.get(file) ?? []), r]);
  }
  for (const [file, list] of files) {
    const path = join(publicAssets, file);
    const before = statSync(path).size;
    await shrinkFile(path, Math.min(...list.map((r) => r.cap)));
    console.log(`  resized ${file}: ${list.map((r) => `${r.width}x${r.height}`).join(', ')} -> cap ${list[0]!.cap}; ${before} -> ${statSync(path).size} bytes`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const rows = await scanTextures();
  const byCat = new Map<string, TextureRow[]>();
  for (const r of rows) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  console.log('category      textures  largest  cap   over');
  for (const [cat, list] of [...byCat].sort()) {
    const largest = Math.max(...list.map((r) => Math.max(r.width, r.height)));
    console.log(`${cat.padEnd(13)} ${String(list.length).padStart(8)}  ${String(largest).padStart(7)}  ${String(capFor(cat)).padStart(4)}  ${list.filter(over).length}`);
  }
  const bad = rows.filter(over);
  for (const r of bad) console.log(`  over cap: ${r.file} ${r.width}x${r.height} (cap ${r.cap})`);
  if (process.argv.includes('--fix') && bad.length) {
    await fix(bad);
    console.log(`Downsized ${new Set(bad.map((r) => r.file.split('#')[0])).size} files.`);
  } else {
    process.exitCode = bad.length ? 1 : 0;
  }
}
