/**
 * Generates the art in scripts/art/catalog.ts with FLUX.2 Turbo on fal.ai.
 *
 *   npm run art:generate                       generate what is missing
 *   npm run art:generate -- --dry              show what would be generated and what it costs
 *   npm run art:generate -- --only items/,maps/  only keys starting with these
 *   npm run art:generate -- --redo a,b         generate these again (new seed)
 *
 * Needs FAL_KEY in ashfall/.env (gitignored; never imported under src/). fal bills per started
 * megapixel ($0.008): 992 × 992 and 1280 × 720 images are under one, so $0.008 each; a map edit
 * also pays for its (≤ 1 MP) input drawing. Spending is logged in scripts/art/ledger.json and capped
 * at BUDGET in total over all runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { ZONES } from '../../src/data/zones';
import { ART, type ArtSpec } from './catalog';

const ROOT = new URL('../..', import.meta.url).pathname;
export const RAW = join(ROOT, 'assets-src', 'art', 'raw');
const LAYOUTS = join(ROOT, 'assets-src', 'art', 'layouts');
const LEDGER = join(ROOT, 'scripts', 'art', 'ledger.json');
const PRICE_PER_MP = 0.008;
const BUDGET = 2.6;
const LAYOUT_SIZE = 992;

const args = process.argv.slice(2);
const opt = (n: string) => {
  const k = args.indexOf(n);
  return k >= 0 ? args[k + 1] : undefined;
};
const redo = new Set((opt('--redo') ?? '').split(',').filter(Boolean));
const only = opt('--only')?.split(',');

const mp = (w: number, h: number) => Math.ceil((w * h) / 1e6);
export const costOf = (s: ArtSpec) => (mp(s.w, s.h) + (s.kind === 'map' ? mp(LAYOUT_SIZE, LAYOUT_SIZE) : 0)) * PRICE_PER_MP;

interface Ledger {
  spent: number;
  images: number;
  tries: Record<string, number>;
  log: { key: string; cost: number; at: string }[];
}
const readLedger = (): Ledger => {
  try {
    return JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
  } catch {
    return { spent: 0, images: 0, tries: {}, log: [] };
  }
};

function falKey(): string {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const m = /^FAL_KEY=(.+)$/m.exec(readFileSync(join(ROOT, '.env'), 'utf8'));
  if (!m) throw new Error('FAL_KEY missing from ashfall/.env');
  return m[1]!.trim();
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A plain drawing of a zone's layout (roads, caverns, hubs, water, molten metal, spores, domes). */
export async function layoutDrawing(zoneId: string): Promise<Buffer> {
  const def = ZONES.find((z) => z.id === zoneId);
  if (!def) throw new Error(`unknown zone ${zoneId}`);
  const S = LAYOUT_SIZE;
  const k = S / (def.halfSize * 2);
  const P = (x: number, z: number) => `${((x + def.halfSize) * k).toFixed(1)},${((z + def.halfSize) * k).toFixed(1)}`;
  const parts: string[] = [`<rect width="${S}" height="${S}" fill="${def.caves ? '#121010' : '#3a3530'}"/>`];
  for (const f of def.env ?? []) {
    const color = f.kind === 'water' ? '#28485a' : f.kind === 'molten' ? '#d0601a' : f.kind === 'spores' ? '#4a6a2a' : null;
    if (color && 'radius' in f) parts.push(`<circle cx="${P(f.x, f.z).split(',')[0]}" cy="${P(f.x, f.z).split(',')[1]}" r="${(f.radius * k).toFixed(1)}" fill="${color}"/>`);
  }
  for (const c of def.caves?.caverns ?? []) {
    const [cx, cy] = P(c.x, c.z).split(',');
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(c.radius * k).toFixed(1)}" fill="#5a5048"/>`);
  }
  for (const r of def.roads) {
    parts.push(`<polyline points="${r.points.map(([x, z]) => P(x, z)).join(' ')}" fill="none" stroke="${def.caves ? '#5a5048' : '#8a7a62'}" stroke-width="${Math.max(3, r.width * k * (def.caves ? 1 : 0.8)).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const d of def.domes ?? []) {
    const [cx, cy] = P(d.x, d.z).split(',');
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(d.radius * k).toFixed(1)}" fill="none" stroke="#9ab8b0" stroke-width="3"/>`);
  }
  for (const h of def.hubs) {
    const [cx, cy] = P(h.x, h.z).split(',');
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(6, h.radius * k).toFixed(1)}" fill="#a89878"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${parts.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generate(spec: ArtSpec, attempt: number, auth: string): Promise<void> {
  const body: Record<string, unknown> = {
    prompt: spec.prompt,
    image_size: { width: spec.w, height: spec.h },
    num_images: 1,
    output_format: 'png',
    seed: seedOf(`${spec.key}#${attempt}`),
    enable_prompt_expansion: false,
    sync_mode: true,
  };
  let endpoint = 'https://fal.run/fal-ai/flux-2/turbo';
  if (spec.kind === 'map') {
    const drawing = await layoutDrawing(spec.zone!);
    mkdirSync(LAYOUTS, { recursive: true });
    writeFileSync(join(LAYOUTS, `${spec.zone}.png`), drawing);
    body.image_urls = [`data:image/png;base64,${drawing.toString('base64')}`];
    endpoint += '/edit';
  }
  const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Key ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  const url = (JSON.parse(text) as { images?: { url: string }[] }).images?.[0]?.url;
  if (!url) throw new Error('no image in the response');
  const buf = url.startsWith('data:') ? Buffer.from(url.split(',')[1]!, 'base64') : Buffer.from(await (await fetch(url)).arrayBuffer());
  const file = join(RAW, `${spec.key}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
}

async function main(): Promise<void> {
  const todo = ART.filter((s) => (redo.has(s.key) || !existsSync(join(RAW, `${s.key}.png`))) && (!only || only.some((o) => s.key === o || s.key.startsWith(o))));
  const ledger = readLedger();
  const need = todo.reduce((n, s) => n + costOf(s), 0);
  console.log(`To generate: ${todo.length} ($${need.toFixed(3)}). Spent so far: $${ledger.spent.toFixed(3)} of $${BUDGET.toFixed(2)}.`);
  if (args.includes('--dry') || !todo.length) return;
  const auth = falKey();
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < todo.length) {
      const spec = todo[next++]!;
      const cost = costOf(spec);
      if (ledger.spent + cost > BUDGET + 1e-9) {
        console.log(`Budget reached before ${spec.key}: stopping.`);
        next = todo.length;
        return;
      }
      // Reserve before the call so parallel calls can never overrun the budget.
      ledger.spent += cost;
      ledger.images++;
      const attempt = (ledger.tries[spec.key] ?? 0) + 1;
      ledger.tries[spec.key] = attempt;
      try {
        await generate(spec, attempt, auth);
        ledger.log.push({ key: spec.key, cost, at: new Date().toISOString() });
        console.log(`✓ ${spec.key} (#${attempt})  $${ledger.spent.toFixed(3)}`);
      } catch (e) {
        failed++;
        const msg = (e as Error).message;
        // Rejected before generating (auth, validation): nothing was charged.
        if (/^4(0[13]|22) /.test(msg)) {
          ledger.spent -= cost;
          ledger.images--;
          if (!/^422 /.test(msg)) next = todo.length;
        }
        console.log(`✗ ${spec.key}: ${msg}`);
      }
      writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  console.log(`Done. Spent (upper bound): $${ledger.spent.toFixed(3)}${failed ? `, ${failed} failed` : ''}.`);
}

if (process.argv[1]?.endsWith('generate.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
