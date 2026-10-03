/**
 * npm run assets:check — lists manifest assets nothing in the game uses (orphans) and asset ids the
 * code mentions that the manifest doesn't have (docs/world-and-gameplay.md §15.2).
 *
 * "Used" means the id appears as a string literal anywhere in src/ (data files, zone layouts,
 * quests, instances, renderer) — every asset reference in this codebase is a literal id.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLASSES, SKILLS } from '../../src/data/db';
import { ZONES } from '../../src/data/zones';

const root = new URL('../..', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(root, 'assets/manifest.json'), 'utf8')) as { assets: { id: string; category: string }[] };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|json)$/.test(name) ? [p] : [];
  });
}

const sources = files(join(root, 'src')).map((f) => readFileSync(f, 'utf8'));
const text = sources.join('\n');
const ids = new Set(manifest.assets.map((a) => a.id));

// Ids built at runtime: skill icons (icon.skill_<name>) and class portraits (icon.portrait_<class>).
const derived = new Set<string>([
  ...[...SKILLS.keys()].map((id) => `icon.skill_${id.split('.')[1]}`),
  ...[...CLASSES.keys()].map((id) => `icon.portrait_${id}`),
]);
const used = (id: string) => derived.has(id) || text.includes(`'${id}'`) || text.includes(`"${id}"`);
const unused = manifest.assets.filter((a) => !used(a.id)).map((a) => `${a.id} (${a.category})`);
// Point-of-interest ids look like asset ids ("boss.first") but aren't.
const notAssets = new Set(ZONES.flatMap((z) => z.pois.map((p) => p.id)));

const mentioned = new Set<string>();
for (const m of text.matchAll(/['"]((?:prop|env|npc|boss|enemy|char|icon)\.[a-z0-9_]+)['"]/g)) mentioned.add(m[1]!);
const missing = [...mentioned].filter((id) => !ids.has(id) && !notAssets.has(id));

console.log(`Assets in manifest: ${ids.size}`);
console.log(`Unused (orphans): ${unused.length}`);
for (const u of unused) console.log(`  - ${u}`);
console.log(`Referenced but missing from the manifest: ${missing.length}`);
for (const m of missing) console.log(`  - ${m}`);
process.exitCode = unused.length || missing.length ? 1 : 0;
