/**
 * npm run assets:export — copies every asset made through an API (Meshy and FLUX.2 Turbo on fal.ai)
 * into the shared asset library at ../assets/ashfall-ai/, sorted by kind, with the prompts that made
 * them. Ground textures other than mine_rock were supplied by hand and are not included.
 *
 *  meshy/models/<category>/   game-ready GLB (meshopt removed so any glTF viewer opens it)
 *  meshy/previews/<category>/ Meshy's render of each model
 *  meshy/icons/               icons and class portraits (Meshy text to image)
 *  flux/<group>/              full-resolution images; frames, decals and effect sprites as the
 *                             transparent processed versions
 *  flux/vfx/atlas.webp        the packed particle atlas the game uses
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { ART } from '../art/catalog';
import { SPRITES } from '../vfx/sprites';

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT = join(ROOT, '..', 'assets', 'ashfall-ai');

interface ManifestEntry {
  id: string;
  category: string;
  prompt: string;
  conceptPrompt?: string;
  file?: string;
}

const ensure = (file: string) => mkdirSync(dirname(file), { recursive: true });
const plural: Record<string, string> = { character: 'characters', enemy: 'enemies', prop: 'props', environment: 'environment' };

async function meshy(): Promise<number> {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'assets', 'manifest.json'), 'utf8')) as { assets?: ManifestEntry[] } | ManifestEntry[];
  const list = Array.isArray(manifest) ? manifest : (manifest.assets ?? []);
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const prompts: Record<string, { prompt: string; concept?: string }> = {};
  let n = 0;
  for (const a of list) {
    const name = a.id.split('.').slice(1).join('.');
    const src = join(ROOT, 'assets', 'source', a.id);
    if (a.category === 'icon') {
      const png = join(src, 'preview.png');
      const out = join(OUT, 'meshy', 'icons', `${name}.webp`);
      ensure(out);
      if (existsSync(png)) await sharp(png).webp({ quality: 90 }).toFile(out);
      else if (a.file) copyFileSync(join(ROOT, 'public', 'assets', a.file.replace(/\.png$/, '.webp')), out);
      else continue;
    } else {
      if (!a.file) continue;
      const doc = await io.read(join(ROOT, 'public', 'assets', a.file));
      for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
      const dir = plural[a.category] ?? a.category;
      const out = join(OUT, 'meshy', 'models', dir, `${name}.glb`);
      ensure(out);
      writeFileSync(out, await io.writeBinary(doc));
      const preview = ['refined.png', 'preview.png', 'concept.png'].map((f) => join(src, f)).find(existsSync);
      if (preview) {
        const p = join(OUT, 'meshy', 'previews', dir, `${name}.webp`);
        ensure(p);
        await sharp(preview).resize(512, 512, { fit: 'inside' }).webp({ quality: 85 }).toFile(p);
      }
    }
    prompts[`${a.category}/${name}`] = { prompt: a.prompt, ...(a.conceptPrompt ? { concept: a.conceptPrompt } : {}) };
    n++;
  }
  writeFileSync(join(OUT, 'meshy', 'prompts.json'), JSON.stringify(prompts, null, 2) + '\n');
  return n;
}

async function flux(): Promise<number> {
  const prompts: Record<string, string> = {};
  let n = 0;
  for (const spec of ART) {
    if (spec.kind === 'vfx') continue; // with the other effect sprites below
    const raw = join(ROOT, 'assets-src', 'art', 'raw', `${spec.key}.png`);
    if (!existsSync(raw)) continue;
    const out = join(OUT, 'flux', `${spec.key}.webp`);
    ensure(out);
    if (spec.kind === 'frame' || spec.kind === 'decal') copyFileSync(join(ROOT, 'public', 'assets', 'art', `${spec.key}.webp`), out);
    else if (spec.kind === 'texture') copyFileSync(join(ROOT, 'public', 'assets', 'textures', 'ground', `${basename(spec.key)}.webp`), out);
    else await sharp(raw).webp({ quality: 90 }).toFile(out);
    prompts[spec.key] = spec.prompt;
    n++;
  }
  // Effect sprites (both batches), black already keyed to transparency by the packer.
  const vfxDir = join(ROOT, 'assets-src', 'vfx');
  const vfxPrompts = new Map([...SPRITES, ...ART.filter((s) => s.kind === 'vfx').map((s) => ({ key: s.key.replace('vfx/', ''), prompt: s.prompt }))].map((s) => [s.key, s.prompt]));
  for (const f of readdirSync(vfxDir).filter((f) => f.endsWith('.webp'))) {
    const key = f.replace(/\.webp$/, '');
    const out = join(OUT, 'flux', 'vfx', f);
    ensure(out);
    copyFileSync(join(vfxDir, f), out);
    if (vfxPrompts.has(key)) prompts[`vfx/${key}`] = vfxPrompts.get(key)!;
    n++;
  }
  copyFileSync(join(ROOT, 'public', 'assets', 'vfx', 'atlas.webp'), join(OUT, 'flux', 'vfx', 'atlas.webp'));
  writeFileSync(join(OUT, 'flux', 'prompts.json'), JSON.stringify(prompts, null, 2) + '\n');
  return n;
}

rmSync(join(OUT, 'meshy'), { recursive: true, force: true });
rmSync(join(OUT, 'flux'), { recursive: true, force: true });
const m = await meshy();
const f = await flux();
console.log(`Exported ${m} Meshy assets and ${f} FLUX images to ${OUT}.`);
