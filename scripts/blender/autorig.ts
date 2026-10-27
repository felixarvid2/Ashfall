/**
 * npm run blender:autorig — rig and animate Meshy models for free in Blender, with a donor's skeleton and clips
 * (docs/blender.md, "Rigging without Meshy").
 *
 *   npm run blender:autorig -- --ids npc.okafor,enemy.infected_miner   rig + optimize + contact sheet (default: every model in autorig.json)
 *   npm run blender:autorig -- --ids boss.brother_ash --raw            rig only: write animated.glb and a sheet of it, no optimize
 *   npm run blender:autorig -- --ids boss.brother_ash --sheet          only the contact sheet of the shipped file
 *   options: --out <dir> (sheets and landmark pictures; default $TMPDIR/ashfall-autorig), --debug (landmark picture)
 *
 * Steps per id: decode the mesh (assets/source/<id>/refined.glb) and the donor (public/assets/<donor>) for Blender →
 * autorig.py (Blender, headless) → assets/source/<id>/animated.glb with the clips in the order of the manifest's `rig.actions`
 * (the optimizer renames them by index) → optimizeAssets (what `npm run meshy -- optimize` does) → public/assets/<folder>/<name>.glb
 * and the manifest entry (file, stats, meshy.clips, status) → a contact sheet of the shipped file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import type { AssetEntry } from '../../src/data/assetManifest';
import { PUBLIC_ASSETS_DIR, acquireManifestLock, loadManifest, saveManifest, sourcePath } from '../meshy/manifest';
import { optimizeAssets } from '../meshy/optimize';
import { decodeGlbForBlender, runBlender } from './decode';

const HERE = dirname(fileURLToPath(import.meta.url));

interface RigJob {
  id: string;
  /** A shipped rigged model under public/assets with the wanted clips. */
  donor: string;
  /** Game state (a `rig.actions` state of the manifest entry) -> the donor's clip that plays for it. */
  clips: Record<string, string>;
  /** Overrides of the landmark search (see `landmarks` in autorig.py). */
  hints?: Record<string, unknown>;
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(name);
const log = (m: string): void => console.log(m);

/** The clips in the order of `rig.actions` (the optimizer names them by index), checked for a full set of channels. */
async function orderClips(file: string, entry: AssetEntry): Promise<void> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const root = doc.getRoot();
  const old = root.listAnimations();
  const states = entry.rig!.actions.map((a) => a.state);
  const byName = new Map(old.map((a) => [a.getName(), a]));
  const missing = states.filter((s) => !byName.has(s));
  if (missing.length || old.length !== states.length) throw new Error(`${entry.id}: clips ${old.map((a) => a.getName())} do not match rig.actions ${states}`);
  const joints = root.listSkins()[0]?.listJoints().length ?? 0;
  for (const state of states) {
    const a = byName.get(state)!;
    const n = a.listChannels().length;
    if (n !== joints * 3) log(`  warning: ${entry.id} clip ${state} has ${n} channels, expected ${joints * 3}`);
    const copy = doc.createAnimation(state);
    for (const ch of a.listChannels()) {
      const s = ch.getSampler()!;
      const sampler = doc.createAnimationSampler().setInput(s.getInput()).setOutput(s.getOutput()).setInterpolation(s.getInterpolation());
      copy.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()!).setSampler(sampler));
    }
  }
  for (const a of old) a.dispose();
  await io.write(file, doc);
}

async function sheet(entry: AssetEntry, glb: string, out: string, work: string): Promise<string> {
  const decoded = await decodeGlbForBlender(glb, join(work, `${entry.id}-sheet-decoded.glb`));
  const png = join(out, `${entry.id}-sheet.png`);
  const job = join(work, `${entry.id}.sheet.json`);
  writeFileSync(job, JSON.stringify({ glb: decoded, id: entry.id, out: png, out_dir: join(work, 'tiles'), height: entry.heightMeters ?? 1.9, states: entry.rig?.actions.map((a) => a.state) }, null, 2));
  mkdirSync(join(work, 'tiles'), { recursive: true });
  runBlender('autorig_sheet.py', ['--job', job], /^feet /);
  return png;
}

async function main(): Promise<void> {
  const config = JSON.parse(readFileSync(join(HERE, 'autorig.json'), 'utf8')) as { models: RigJob[] };
  const ids = arg('--ids')?.split(',');
  const jobs = config.models.filter((m) => !ids || ids.includes(m.id));
  const unknown = (ids ?? []).filter((id) => !config.models.some((m) => m.id === id));
  if (unknown.length) throw new Error(`Not in scripts/blender/autorig.json: ${unknown.join(', ')}`);
  const out = resolve(arg('--out') ?? join(tmpdir(), 'ashfall-autorig'));
  const work = join(out, 'work');
  mkdirSync(work, { recursive: true });
  const sheetOnly = flag('--sheet');
  const raw = flag('--raw');
  if (!sheetOnly && !raw) acquireManifestLock();
  const manifest = loadManifest();

  for (const job of jobs) {
    const entry = manifest.assets.find((a) => a.id === job.id);
    if (!entry?.rig || !entry.heightMeters) throw new Error(`${job.id}: needs a manifest entry with rig.actions and heightMeters`);
    const animated = sourcePath(entry, 'animated.glb');
    if (!sheetOnly) {
      const mesh = sourcePath(entry, 'refined.glb');
      if (!existsSync(mesh)) throw new Error(`${job.id}: ${mesh} is missing (the textured Meshy model)`);
      const states: string[] = entry.rig.actions.map((a) => a.state);
      const wrong = states.filter((s) => !job.clips[s]).concat(Object.keys(job.clips).filter((s) => !states.includes(s)));
      if (wrong.length) throw new Error(`${job.id}: clips ${wrong} do not match rig.actions ${states}`);
      const donor = await decodeGlbForBlender(resolve(PUBLIC_ASSETS_DIR, job.donor), join(work, `donor-${job.donor.replace(/[^a-z0-9]+/gi, '_')}.glb`));
      const meshFile = await decodeGlbForBlender(mesh, join(work, `${job.id}-mesh.glb`));
      const jobFile = join(work, `${job.id}.job.json`);
      const clips = Object.fromEntries(states.map((s) => [s, job.clips[s]!]));
      writeFileSync(jobFile, JSON.stringify({ id: job.id, mesh: meshFile, donor, out: animated, height: entry.heightMeters, clips, hints: job.hints ?? {}, ...(flag('--debug') ? { debug: out } : {}) }, null, 2));
      log(`${job.id}: rigging with ${job.donor}`);
      runBlender('autorig.py', ['--job', jobFile], /^(built |autorig )/);
      await orderClips(animated, entry);
      if (!raw) {
        entry.credit = `Rigged in Blender (npm run blender:autorig): the Meshy mesh with the skeleton and clips of ${job.donor}`;
        await optimizeAssets(manifest, [entry], log);
        saveManifest(manifest);
      }
    }
    const shipped = raw ? animated : resolve(PUBLIC_ASSETS_DIR, entry.file ?? '');
    if (!raw && !entry.file) throw new Error(`${job.id}: not optimized yet`);
    log(`contact sheet: ${await sheet(entry, shipped, out, work)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
