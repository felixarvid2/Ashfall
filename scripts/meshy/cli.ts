/**
 * Meshy asset pipeline CLI (brief §9.2). Run with:  npm run meshy -- <command> [options]
 *
 * Commands
 *   status                         Asset table, statuses and account balance
 *   preview  [--ids a,b]           Untextured previews for `planned` assets (cheap stage)
 *   approve-preview <ids|all>      Mark previews as approved for texturing
 *   reject <ids>                   Throw away a preview/refine and go back to `planned`
 *   refine   [--ids a,b]           Texture approved previews  → status `refined`
 *   rig      [--ids a,b]           Rig + animate refined characters (assets with a `rig` spec)
 *   approve <ids|all>              Final approval of refined assets → status `approved`
 *   optimize [--ids a,b]           Simplify/LOD/compress into public/assets → status `optimized`
 *   sheet [preview|refined]        Contact sheet of all thumbnails (assets/source/contact-*.png)
 *   icons [--ids a,b]              Generate 2D item/skill icons (category "icon") → public/assets/icons
 *
 * Options
 *   --dry-run      Show what would be sent and the estimated cost; send nothing
 *   --force        Regenerate even if a task already exists
 *   --budget <n>   Ask before batches above n credits (default 800, scripts/meshy/config.ts)
 *   --yes          Skip the budget question (only when the owner has approved the spend)
 */
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import type { AssetEntry, AssetManifest } from '../../src/data/assetManifest';
import { MeshyClient, MeshyError, download, type MeshyTask } from './api';
import { DEFAULT_AI_MODEL, DEFAULT_BUDGET_CREDITS, FALLBACK_AI_MODEL, MAX_CONCURRENT_TASKS, TEXTURE_RESOLUTION } from './config';
import { stageCost, type Stage } from './costs';
import { loadApiKey } from './env';
import { PUBLIC_ASSETS_DIR, loadManifest, saveManifest, selectAssets, sourcePath } from './manifest';
import { applyReview } from './actions';
import { contactSheet } from './contactSheet';
import { optimizeAssets } from './optimize';
import { buildConceptPrompt, buildIconPrompt, isPortrait, isSkillIcon, buildNegativePrompt, buildPrompt, buildTexturePrompt } from './style';
import { CONCEPT_IMAGE_MODEL, ICON_IMAGE_MODEL } from './costs';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { copyFileSync, readFileSync } from 'node:fs';

interface Options {
  command: string;
  ids?: string[];
  dryRun: boolean;
  force: boolean;
  yes: boolean;
  budget: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { command: argv[0] ?? 'status', dryRun: false, force: false, yes: false, budget: DEFAULT_BUDGET_CREDITS };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--yes') opts.yes = true;
    else if (a === '--budget') opts.budget = Number(argv[++i]);
    else if (a === '--ids') opts.ids = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (!a.startsWith('--')) opts.ids = [...(opts.ids ?? []), ...a.split(',').filter(Boolean)];
    else throw new Error(`Unknown option ${a}`);
  }
  if (!Number.isFinite(opts.budget) || opts.budget < 0) throw new Error('--budget must be a positive number');
  return opts;
}

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

/** Run jobs with at most `limit` in flight (Meshy queue limit). */
async function pool<T>(items: T[], limit: number, job: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await job(item);
  });
  await Promise.all(workers);
}

/** Print the plan and enforce the budget. Returns false if the batch should not run. */
async function confirmBatch(client: MeshyClient | null, stage: Stage, assets: AssetEntry[], opts: Options): Promise<boolean> {
  if (assets.length === 0) {
    log(`${stage}: nothing to do`);
    return false;
  }
  const rows = assets.map((a) => ({
    id: a.source === 'image' ? `${a.id} (${stage === 'preview' ? 'concept image' : 'image→3D'})` : a.id,
    credits: stageCost(a, stage, DEFAULT_AI_MODEL),
  }));
  const total = rows.reduce((s, r) => s + r.credits, 0);
  console.log(`\n${stage.toUpperCase()} batch — ${assets.length} asset(s)`);
  for (const r of rows) console.log(`  ${r.id.padEnd(44)} ~${r.credits} credits`);
  console.log(`  ${'TOTAL (estimate)'.padEnd(44)} ~${total} credits   (budget threshold ${opts.budget})\n`);
  if (opts.dryRun) {
    log('dry run: nothing sent');
    return false;
  }
  if (client) {
    const balance = await client.balance();
    log(`balance: ${balance} credits`);
    if (balance < total) {
      log(`not enough credits (${balance} < ${total}); aborting`);
      return false;
    }
  }
  if (total > opts.budget && !opts.yes) {
    if (!process.stdin.isTTY) {
      log(`estimate ${total} exceeds the ${opts.budget}-credit threshold. Re-run with --yes once approved.`);
      return false;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Spend ~${total} credits? [y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      log('cancelled');
      return false;
    }
  }
  return true;
}

function fail(entry: AssetEntry, manifest: AssetManifest, message: string): void {
  entry.meshy.lastError = message;
  saveManifest(manifest);
  log(`✗ ${entry.id}: ${message}`);
}

function spent(entry: AssetEntry, task: MeshyTask): void {
  entry.meshy.creditsSpent = (entry.meshy.creditsSpent ?? 0) + (task.consumed_credits ?? 0);
}

// ---- Stages ---------------------------------------------------------------------

/** Image-sourced assets: the cheap "preview" is a concept image. */
async function runConcept(client: MeshyClient, manifest: AssetManifest, entry: AssetEntry, opts: Options): Promise<void> {
  if (!entry.meshy.previewTaskId || opts.force) {
    const body: Record<string, unknown> = {
      ai_model: CONCEPT_IMAGE_MODEL,
      prompt: buildConceptPrompt(entry),
      aspect_ratio: '1:1',
    };
    if (entry.pose) body.pose_mode = entry.pose;
    const id = await client.create('text-to-image', body);
    entry.meshy = { ...entry.meshy, previewTaskId: id, previewApproved: false, lastError: undefined };
    saveManifest(manifest);
    log(`${entry.id}: concept image task ${id}`);
  }
  const task = await client.wait('text-to-image', entry.meshy.previewTaskId!, `${entry.id} concept`);
  if (task.status !== 'SUCCEEDED' || !task.image_urls?.[0]) {
    entry.meshy.previewTaskId = undefined;
    return fail(entry, manifest, `concept image ${task.status}: ${task.task_error?.message ?? ''}`);
  }
  spent(entry, task);
  await download(task.image_urls[0], sourcePath(entry, 'concept.png'));
  copyFileSync(sourcePath(entry, 'concept.png'), sourcePath(entry, 'preview.png'));
  entry.status = 'preview';
  saveManifest(manifest);
  log(`✓ ${entry.id}: concept image downloaded`);
}

/** Image-sourced assets: image-to-3D with textures is the refine step. */
async function runImageTo3D(client: MeshyClient, manifest: AssetManifest, entry: AssetEntry, opts: Options): Promise<void> {
  if (!entry.meshy.refineTaskId || opts.force) {
    const png = readFileSync(sourcePath(entry, 'concept.png'));
    const body: Record<string, unknown> = {
      name: `${entry.id} (image to 3D)`,
      image_url: `data:image/png;base64,${png.toString('base64')}`,
      ai_model: DEFAULT_AI_MODEL,
      topology: 'triangle',
      target_polycount: entry.targetPolycount,
      should_remesh: true,
      should_texture: true,
      enable_pbr: true,
      texture_resolution: TEXTURE_RESOLUTION,
      remove_lighting: true,
      origin_at: 'bottom',
    };
    if (entry.pose) body.pose_mode = entry.pose;
    const id = await client.create('image-to-3d', body);
    entry.meshy = { ...entry.meshy, refineTaskId: id, lastError: undefined };
    saveManifest(manifest);
    log(`${entry.id}: image-to-3D task ${id}`);
  }
  const task = await client.wait('image-to-3d', entry.meshy.refineTaskId!, `${entry.id} image-to-3D`);
  if (task.status !== 'SUCCEEDED' || !task.model_urls?.glb) {
    entry.meshy.refineTaskId = undefined;
    return fail(entry, manifest, `image-to-3D ${task.status}: ${task.task_error?.message ?? ''}`);
  }
  spent(entry, task);
  entry.meshy.aiModel = typeof task.ai_model === 'string' ? task.ai_model : entry.meshy.aiModel;
  await download(task.model_urls.glb, sourcePath(entry, 'refined.glb'));
  if (task.thumbnail_url) await download(task.thumbnail_url, sourcePath(entry, 'refined.png'));
  entry.status = 'refined';
  saveManifest(manifest);
  log(`✓ ${entry.id}: textured model downloaded`);
}

const SKILL_ICON_INSET = 0.08;

/** 2D icon: text-to-image with a transparent background, resized to 128 px WebP for the UI. */
async function runIcon(client: MeshyClient, manifest: AssetManifest, entry: AssetEntry, opts: Options): Promise<void> {
  if (!entry.meshy.previewTaskId || opts.force) {
    const id = await client.create('text-to-image', {
      ai_model: ICON_IMAGE_MODEL,
      prompt: buildIconPrompt(entry),
      aspect_ratio: '1:1',
      remove_background: !isSkillIcon(entry),
    });
    entry.meshy = { ...entry.meshy, previewTaskId: id, lastError: undefined };
    saveManifest(manifest);
    log(`${entry.id}: icon task ${id}`);
  }
  const task = await client.wait('text-to-image', entry.meshy.previewTaskId!, `${entry.id} icon`);
  if (task.status !== 'SUCCEEDED' || !task.image_urls?.[0]) {
    entry.meshy.previewTaskId = undefined;
    return fail(entry, manifest, `icon ${task.status}: ${task.task_error?.message ?? ''}`);
  }
  spent(entry, task);
  await download(task.image_urls[0], sourcePath(entry, 'preview.png'));
  const name = entry.id.split('.').slice(1).join('_');
  const rel = `icons/${name}.webp`;
  const out = resolve(PUBLIC_ASSETS_DIR, rel);
  mkdirSync(dirname(out), { recursive: true });
  const img = sharp(sourcePath(entry, 'preview.png'));
  if (isSkillIcon(entry)) {
    // Crop the inset so the generator's rounded frame corners never show.
    const { width = 1024, height = 1024 } = await img.metadata();
    const inset = Math.round(Math.min(width, height) * SKILL_ICON_INSET);
    await img
      .extract({ left: inset, top: inset, width: width - inset * 2, height: height - inset * 2 })
      .resize(isPortrait(entry) ? 320 : 128, isPortrait(entry) ? 320 : 128, { fit: 'cover' })
      .webp({ quality: 86 })
      .toFile(out);
  }
  else await img.trim().resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 86 }).toFile(out);
  entry.file = rel;
  entry.stats = { triangles: 0, bytes: statSync(out).size };
  entry.status = 'optimized';
  saveManifest(manifest);
  log(`✓ ${entry.id}: icon → ${rel}`);
}

async function runPreview(client: MeshyClient, manifest: AssetManifest, entry: AssetEntry, opts: Options): Promise<void> {
  if (entry.source === 'image') return runConcept(client, manifest, entry, opts);
  if (!entry.meshy.previewTaskId || opts.force) {
    const body: Record<string, unknown> = {
      mode: 'preview',
      name: entry.id,
      prompt: buildPrompt(entry),
      negative_prompt: buildNegativePrompt(entry),
      ai_model: DEFAULT_AI_MODEL,
      topology: 'triangle',
      target_polycount: entry.targetPolycount,
      should_remesh: true,
      origin_at: 'bottom',
    };
    if (entry.pose) body.pose_mode = entry.pose;
    let id: string;
    try {
      id = await client.create('text-to-3d', body);
    } catch (err) {
      // Accounts without Meshy 7.x entitlement fall back to the previous generation.
      if (err instanceof MeshyError && err.status >= 400 && err.status < 500 && err.status !== 402 && err.status !== 429) {
        log(`${entry.id}: ${err.message} — retrying with ${FALLBACK_AI_MODEL}`);
        id = await client.create('text-to-3d', { ...body, ai_model: FALLBACK_AI_MODEL });
      } else throw err;
    }
    entry.meshy = { ...entry.meshy, previewTaskId: id, previewApproved: false, lastError: undefined };
    saveManifest(manifest);
    log(`${entry.id}: preview task ${id}`);
  } else {
    log(`${entry.id}: resuming preview task ${entry.meshy.previewTaskId}`);
  }

  const task = await client.wait('text-to-3d', entry.meshy.previewTaskId!, `${entry.id} preview`);
  if (task.status !== 'SUCCEEDED') {
    entry.meshy.previewTaskId = undefined;
    return fail(entry, manifest, `preview ${task.status}: ${task.task_error?.message ?? ''}`);
  }
  spent(entry, task);
  entry.meshy.aiModel = typeof task.ai_model === 'string' ? task.ai_model : entry.meshy.aiModel;
  if (task.model_urls?.glb) await download(task.model_urls.glb, sourcePath(entry, 'preview.glb'));
  if (task.thumbnail_url) await download(task.thumbnail_url, sourcePath(entry, 'preview.png'));
  entry.status = 'preview';
  saveManifest(manifest);
  log(`✓ ${entry.id}: preview downloaded`);
}

async function runRefine(client: MeshyClient, manifest: AssetManifest, entry: AssetEntry, opts: Options): Promise<void> {
  if (entry.source === 'image') return runImageTo3D(client, manifest, entry, opts);
  if (!entry.meshy.refineTaskId || opts.force) {
    const id = await client.create('text-to-3d', {
      mode: 'refine',
      name: `${entry.id} (refine)`,
      preview_task_id: entry.meshy.previewTaskId,
      enable_pbr: true,
      texture_prompt: buildTexturePrompt(entry),
      texture_resolution: TEXTURE_RESOLUTION,
      remove_lighting: true,
    });
    entry.meshy = { ...entry.meshy, refineTaskId: id, lastError: undefined };
    saveManifest(manifest);
    log(`${entry.id}: refine task ${id}`);
  } else {
    log(`${entry.id}: resuming refine task ${entry.meshy.refineTaskId}`);
  }
  const task = await client.wait('text-to-3d', entry.meshy.refineTaskId!, `${entry.id} refine`);
  if (task.status !== 'SUCCEEDED') {
    entry.meshy.refineTaskId = undefined;
    return fail(entry, manifest, `refine ${task.status}: ${task.task_error?.message ?? ''}`);
  }
  spent(entry, task);
  if (!task.model_urls?.glb) return fail(entry, manifest, 'refine returned no GLB');
  await download(task.model_urls.glb, sourcePath(entry, 'refined.glb'));
  if (task.thumbnail_url) await download(task.thumbnail_url, sourcePath(entry, 'refined.png'));
  entry.status = 'refined';
  saveManifest(manifest);
  log(`✓ ${entry.id}: refined model downloaded`);
}

async function runRig(client: MeshyClient, manifest: AssetManifest, entry: AssetEntry, opts: Options): Promise<void> {
  const rig = entry.rig!;
  if (!entry.meshy.rigTaskId || opts.force) {
    const id = await client.create('rigging', {
      input_task_id: entry.meshy.refineTaskId,
      animation_type: rig.type,
      height_meters: rig.heightMeters,
    });
    entry.meshy = { ...entry.meshy, rigTaskId: id, animationTaskId: undefined, lastError: undefined };
    saveManifest(manifest);
    log(`${entry.id}: rigging task ${id}`);
  }
  const rigTask = await client.wait('rigging', entry.meshy.rigTaskId!, `${entry.id} rig`);
  if (rigTask.status !== 'SUCCEEDED') {
    entry.meshy.rigTaskId = undefined;
    return fail(entry, manifest, `rigging ${rigTask.status}: ${rigTask.task_error?.message ?? ''}`);
  }
  if (!existsSync(sourcePath(entry, 'rigged.glb'))) {
    spent(entry, rigTask);
    const url = (rigTask.result as { rigged_character_glb_url?: string } | undefined)?.rigged_character_glb_url;
    if (url) await download(url, sourcePath(entry, 'rigged.glb'));
  }

  if (!entry.meshy.animationTaskId || opts.force) {
    const id = await client.create('animations', {
      rig_task_id: entry.meshy.rigTaskId,
      action_ids: rig.actions.map((a) => a.actionId),
    });
    entry.meshy.animationTaskId = id;
    saveManifest(manifest);
    log(`${entry.id}: animation task ${id} (${rig.actions.length} actions)`);
  }
  const anim = await client.wait('animations', entry.meshy.animationTaskId!, `${entry.id} animate`);
  if (anim.status !== 'SUCCEEDED') {
    entry.meshy.animationTaskId = undefined;
    return fail(entry, manifest, `animation ${anim.status}: ${anim.task_error?.message ?? ''}`);
  }
  spent(entry, anim);
  const url = (anim.result as { animation_glb_url?: string } | undefined)?.animation_glb_url;
  if (!url) return fail(entry, manifest, 'animation returned no GLB');
  await download(url, sourcePath(entry, 'animated.glb'));
  saveManifest(manifest);
  log(`✓ ${entry.id}: rigged + animated model downloaded`);
}

// ---- Commands ----------------------------------------------------------------

function printStatus(manifest: AssetManifest): void {
  console.log(`\n${'asset'.padEnd(28)}${'status'.padEnd(11)}${'preview ok'.padEnd(12)}${'credits'.padEnd(9)}file`);
  for (const a of manifest.assets) {
    console.log(
      `${a.id.padEnd(28)}${a.status.padEnd(11)}${(a.meshy.previewApproved ? 'yes' : '').padEnd(12)}${String(a.meshy.creditsSpent ?? 0).padEnd(9)}${a.file ?? ''}${a.meshy.lastError ? `  ⚠ ${a.meshy.lastError}` : ''}`,
    );
  }
  const total = manifest.assets.reduce((s, a) => s + (a.meshy.creditsSpent ?? 0), 0);
  console.log(`\nTotal credits spent on assets: ${total}`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = loadManifest();
  const needsApi = ['preview', 'refine', 'rig', 'status', 'icons'].includes(opts.command) && !opts.dryRun;
  const client = needsApi ? new MeshyClient(loadApiKey(), log) : null;

  switch (opts.command) {
    case 'status': {
      printStatus(manifest);
      if (client) log(`balance: ${await client.balance()} credits`);
      break;
    }
    case 'preview': {
      const todo = selectAssets(manifest, opts.ids).filter((a) => opts.force || a.status === 'planned');
      if (!(await confirmBatch(client, 'preview', todo, opts))) break;
      await pool(todo, MAX_CONCURRENT_TASKS, (a) => runPreview(client!, manifest, a, opts).catch((e) => fail(a, manifest, String(e))));
      break;
    }
    case 'approve-preview':
    case 'approve':
    case 'reject': {
      if (!opts.ids?.length) throw new Error(`${opts.command} needs asset ids (or "all")`);
      for (const a of selectAssets(manifest, opts.ids)) {
        try {
          log(applyReview(a, opts.command));
        } catch (err) {
          log(String((err as Error).message));
        }
      }
      saveManifest(manifest);
      break;
    }
    case 'refine': {
      const todo = selectAssets(manifest, opts.ids).filter(
        (a) => a.meshy.previewApproved && (a.status === 'preview' || (opts.force && a.meshy.previewTaskId)),
      );
      if (!(await confirmBatch(client, 'refine', todo, opts))) break;
      await pool(todo, MAX_CONCURRENT_TASKS, (a) => runRefine(client!, manifest, a, opts).catch((e) => fail(a, manifest, String(e))));
      break;
    }
    case 'rig': {
      const todo = selectAssets(manifest, opts.ids).filter(
        (a) =>
          a.rig &&
          a.meshy.refineTaskId &&
          ['refined', 'approved', 'optimized'].includes(a.status) &&
          (opts.force || !existsSync(sourcePath(a, 'animated.glb'))),
      );
      if (!(await confirmBatch(client, 'rig', todo, opts))) break;
      await pool(todo, MAX_CONCURRENT_TASKS, (a) => runRig(client!, manifest, a, opts).catch((e) => fail(a, manifest, String(e))));
      break;
    }
    case 'optimize': {
      const todo = selectAssets(manifest, opts.ids).filter(
        (a) => ['refined', 'approved', 'optimized'].includes(a.status) && existsSync(sourcePath(a, 'refined.glb')),
      );
      if (opts.dryRun) {
        log(`would optimize: ${todo.map((a) => a.id).join(', ') || 'nothing'}`);
        break;
      }
      await optimizeAssets(manifest, todo, log);
      saveManifest(manifest);
      break;
    }
    case 'icons': {
      const todo = selectAssets(manifest, opts.ids).filter((a) => a.category === 'icon' && (opts.force || a.status === 'planned'));
      if (!(await confirmBatch(client, 'preview', todo, opts))) break;
      await pool(todo, MAX_CONCURRENT_TASKS, (a) => runIcon(client!, manifest, a, opts).catch((e) => fail(a, manifest, String(e))));
      break;
    }
    case 'sheet': {
      const stage = opts.ids?.[0] === 'refined' ? 'refined' : 'preview';
      log(`contact sheet: ${await contactSheet(manifest, stage)}`);
      break;
    }
    default:
      throw new Error(`Unknown command "${opts.command}". See the header of scripts/meshy/cli.ts.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
