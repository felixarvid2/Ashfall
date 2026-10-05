/**
 * Generates the effect sprites (scripts/vfx/sprites.ts) with FLUX.2 Turbo on fal.ai.
 *
 *   npm run vfx:generate                 generate the sprites that are missing
 *   npm run vfx:generate -- --dry        show what would be generated and what it costs
 *   npm run vfx:generate -- --redo a,b   generate these again (new seed)
 *   npm run vfx:generate -- --only a,b   only these (if missing)
 *
 * Needs FAL_KEY in ashfall/.env (gitignored; never imported under src/). Images are 992 × 992 so each
 * is under one megapixel: $0.008 per image, rounded up per started megapixel so the estimate is never
 * below fal's charge. Spending is logged in scripts/vfx/ledger.json and capped at BUDGET in total.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPRITES, type SpriteSpec } from './sprites';

const ROOT = new URL('../..', import.meta.url).pathname;
export const RAW = process.env.VFX_RAW ?? join(ROOT, 'assets-src', 'vfx', 'raw');
const LEDGER = join(ROOT, 'scripts', 'vfx', 'ledger.json');
const ENDPOINT = 'https://fal.run/fal-ai/flux-2/turbo';
const SIZE = 992;
const PRICE_PER_MP = 0.008;
const BUDGET = 1.5;
const COST = Math.ceil((SIZE * SIZE) / 1e6) * PRICE_PER_MP;

const args = process.argv.slice(2);
const opt = (n: string) => {
  const k = args.indexOf(n);
  return k >= 0 ? args[k + 1] : undefined;
};
const redo = new Set((opt('--redo') ?? '').split(',').filter(Boolean));
const only = opt('--only')?.split(',');

interface Ledger {
  spent: number;
  images: number;
  /** Generation count per sprite (the seed changes on each redo). */
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

function key(): string {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const m = /^FAL_KEY=(.+)$/m.exec(env);
  if (!m) throw new Error('FAL_KEY missing from ashfall/.env');
  return m[1]!.trim();
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

async function generate(spec: SpriteSpec, attempt: number, auth: string): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Key ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: spec.prompt,
      image_size: { width: SIZE, height: SIZE },
      num_images: 1,
      output_format: 'png',
      seed: seedOf(`${spec.key}#${attempt}`),
      enable_prompt_expansion: false,
      sync_mode: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  const url = (JSON.parse(text) as { images?: { url: string }[] }).images?.[0]?.url;
  if (!url) throw new Error('no image in the response');
  const buf = url.startsWith('data:') ? Buffer.from(url.split(',')[1]!, 'base64') : Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(join(RAW, `${spec.key}.png`), buf);
}

async function main(): Promise<void> {
  mkdirSync(RAW, { recursive: true });
  const todo = SPRITES.filter((s) => (redo.has(s.key) || !existsSync(join(RAW, `${s.key}.png`))) && (!only || only.includes(s.key)));
  const ledger = readLedger();
  console.log(`To generate: ${todo.length} ($${(todo.length * COST).toFixed(3)}). Spent so far: $${ledger.spent.toFixed(3)} of $${BUDGET.toFixed(2)}.`);
  if (args.includes('--dry') || !todo.length) return;
  const auth = key();
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < todo.length) {
      const spec = todo[next++]!;
      if (ledger.spent + COST > BUDGET + 1e-9) {
        console.log(`Budget reached before ${spec.key}: stopping.`);
        next = todo.length;
        return;
      }
      // Reserve before the call so parallel calls can never overrun the budget.
      ledger.spent += COST;
      ledger.images++;
      const attempt = (ledger.tries[spec.key] ?? 0) + 1;
      ledger.tries[spec.key] = attempt;
      try {
        await generate(spec, attempt, auth);
        ledger.log.push({ key: spec.key, cost: COST, at: new Date().toISOString() });
        console.log(`✓ ${spec.key} (#${attempt})  $${ledger.spent.toFixed(3)}`);
      } catch (e) {
        failed++;
        const msg = (e as Error).message;
        // Rejected before generating (auth): nothing was charged.
        if (/^40[13] /.test(msg)) {
          ledger.spent -= COST;
          ledger.images--;
          next = todo.length;
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
