/**
 * npm run blender:build — build the parts and models of scripts/blender/spec.json in Blender, optimize them and
 * register them in assets/manifest.json (docs/blender.md).
 *
 *   npm run blender:build                          build + optimize + register everything in the spec
 *   npm run blender:build -- --only part.crystal_shard,part.x
 *   npm run blender:build -- --sheet variant.crystal_walker [--out <dir>] [--glow]
 *                                                  contact sheet of a runtime variant (no manifest changes)
 *
 * Steps: Blender (CPU, headless) writes assets/source/<id>/refined.glb (gitignored) → the Meshy pipeline's own
 * optimizer (scripts/meshy/optimize.ts: weld, simplify to the target, meshopt) writes public/assets/parts/ or
 * public/assets/blender/ → the manifest entry (source "blender") gets its file and stats.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import type { AssetEntry } from '../../src/data/assetManifest';
import { VARIANTS } from '../../src/data/variants';
import { PUBLIC_ASSETS_DIR, SOURCE_DIR, acquireManifestLock, loadManifest, saveManifest } from '../meshy/manifest';
import { optimizeAssets } from '../meshy/optimize';
import { decodeGlbForBlender, runBlender } from './decode';

const HERE = dirname(fileURLToPath(import.meta.url));

interface SpecEntry {
  id: string;
  builder: string;
  params?: Record<string, unknown>;
  prompt: string;
  targetPolycount: number;
  /** Models only. */
  category?: AssetEntry['category'];
  heightMeters?: number;
  placeholder?: AssetEntry['placeholder'];
}
interface Spec {
  parts: SpecEntry[];
  models: SpecEntry[];
}
interface Report {
  id: string;
  triangles: number;
  boundsMin: number[];
  boundsMax: number[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Run Blender headless on one of our scripts (decode.ts). */
function blender(script: string, args: string[]): void {
  runBlender(script, args, /^(built |contact sheet|cycles still)/);
}

function manifestEntry(e: SpecEntry, part: boolean): AssetEntry {
  return {
    id: e.id,
    category: part ? 'part' : (e.category ?? 'prop'),
    prompt: e.prompt,
    source: 'blender',
    credit: 'Built in Blender from scripts/blender/spec.json (npm run blender:build)',
    targetPolycount: e.targetPolycount,
    ...(e.heightMeters ? { heightMeters: e.heightMeters } : {}),
    status: 'planned',
    meshy: {},
    ...(e.placeholder ? { placeholder: e.placeholder } : {}),
  };
}

async function build(): Promise<void> {
  // spec.json plus one file per region or group in spec/ (so several people can add assets without touching one file).
  const files = [join(HERE, 'spec.json'), ...(existsSync(join(HERE, 'spec')) ? readdirSync(join(HERE, 'spec')).filter((f) => f.endsWith('.json')).sort().map((f) => join(HERE, 'spec', f)) : [])];
  const spec: Spec = { parts: [], models: [] };
  for (const f of files) {
    const s = JSON.parse(readFileSync(f, 'utf8')) as Partial<Spec>;
    spec.parts.push(...(s.parts ?? []));
    spec.models.push(...(s.models ?? []));
  }
  const ids = [...spec.parts, ...spec.models].map((e) => e.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`${dup} is defined twice in scripts/blender/spec.json / spec/*.json`);
  mkdirSync(SOURCE_DIR, { recursive: true });
  const merged = join(SOURCE_DIR, 'blender-spec.json');
  writeFileSync(merged, JSON.stringify(spec));
  const only = arg('--only')?.split(',');
  const wanted = (e: SpecEntry) => !only || only.includes(e.id);
  const todo = [...spec.parts.map((e) => ({ e, part: true })), ...spec.models.map((e) => ({ e, part: false }))].filter((x) => wanted(x.e));
  if (todo.length === 0) throw new Error(`Nothing to build${only ? ` for ${only.join(', ')}` : ''}`);
  for (const { e, part } of todo) {
    if (!part && !e.placeholder) throw new Error(`${e.id}: models need a placeholder in the spec`);
    if (!/^[a-z]+(\.[a-z0-9_]+)+$/.test(e.id)) throw new Error(`${e.id}: not a valid asset id`);
  }

  blender('build.py', ['--spec', merged, '--out', SOURCE_DIR, ...(only ? ['--only', ...only] : [])]);
  const reports = JSON.parse(readFileSync(join(SOURCE_DIR, 'blender-report.json'), 'utf8')) as Report[];

  acquireManifestLock();
  const manifest = loadManifest();
  const entries: AssetEntry[] = [];
  for (const { e, part } of todo) {
    const fresh = manifestEntry(e, part);
    const at = manifest.assets.findIndex((a) => a.id === e.id);
    if (at >= 0) {
      if (manifest.assets[at]!.source !== 'blender') throw new Error(`${e.id} is already in the manifest and was not built by Blender`);
      manifest.assets[at] = fresh;
    } else manifest.assets.push(fresh);
    entries.push(fresh);
  }
  await optimizeAssets(manifest, entries, console.log);
  saveManifest(manifest);

  console.log('\nid'.padEnd(34) + 'tris'.padStart(6) + 'KB'.padStart(8));
  for (const entry of entries) {
    const r = reports.find((x) => x.id === entry.id);
    console.log(`${entry.id}`.padEnd(33) + String(entry.stats?.triangles ?? '?').padStart(6) + ((entry.stats?.bytes ?? 0) / 1024).toFixed(1).padStart(8) + (r ? `   bounds ${r.boundsMin.map((n) => n.toFixed(2))} .. ${r.boundsMax.map((n) => n.toFixed(2))}` : ''));
  }
}

/** A copy of a shipped GLB that Blender 4.0 can import: no meshopt, no quantization, PNG instead of WebP. */
const decodeForBlender = (rel: string, out: string): Promise<string> => decodeGlbForBlender(resolve(PUBLIC_ASSETS_DIR, rel), out);

/** Where each named node sits in the model's axes (metres, default pose): what the game reads from the cloned bones. */
async function jointPositions(glb: string): Promise<Record<string, number[]>> {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(glb);
  const joints: Record<string, number[]> = {};
  for (const skin of doc.getRoot().listSkins()) {
    for (const joint of skin.listJoints()) {
      const m = joint.getWorldMatrix();
      joints[joint.getName()] = [m[12]!, m[13]!, m[14]!].map((n) => Math.round(n * 1e5) / 1e5);
    }
  }
  return joints;
}

async function sheet(id: string): Promise<void> {
  const def = VARIANTS.get(id);
  if (!def) throw new Error(`Unknown variant ${id}. Known: ${[...VARIANTS.keys()].join(', ')}`);
  const manifest = loadManifest();
  const fileOf = (assetId: string): string => {
    const entry = manifest.assets.find((a) => a.id === assetId);
    if (!entry?.file) throw new Error(`${assetId} has no optimized file in the manifest`);
    return entry.file;
  };
  const out = resolve(arg('--out') ?? join(tmpdir(), 'ashfall-blender'));
  const decoded = join(out, 'decoded');
  const baseGlb = await decodeForBlender(fileOf(def.base), join(decoded, `${def.base}.glb`));
  const job = {
    id,
    base: baseGlb,
    joints: await jointPositions(baseGlb),
    parts: await Promise.all(def.parts.map(async (p, i) => ({ ...p, file: await decodeForBlender(fileOf(p.asset), join(decoded, `${i}-${p.asset}.glb`)) }))),
  };
  mkdirSync(out, { recursive: true });
  const jobFile = join(out, `${id}.job.json`);
  writeFileSync(jobFile, JSON.stringify(job, null, 2));
  blender('sheet.py', ['--job', jobFile, '--out', out, ...(process.argv.includes('--glow') ? ['--glow'] : [])]);
  console.log(`sheet files in ${out}`);
}

try {
  const variant = arg('--sheet');
  if (variant) await sheet(variant);
  else await build();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
