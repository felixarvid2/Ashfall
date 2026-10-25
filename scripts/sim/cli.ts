/**
 * Balance simulator: npm run sim [-- --seconds 60 --dummy security_trooper --pack 5 --filter "L30 ("]
 * Runs every sample build in scripts/sim/builds.ts against a training dummy.
 * --dummy <enemyId>  target (default spore_carrier, a lumen enemy, so "corrupted"; use security_trooper for a neutral one)
 * --pack <n>         n dummies on a 2.2 m ring, damage summed
 * --filter <text>    only builds whose name contains the text
 */
import { BUILDS } from './builds';
import { simulate } from './sim';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seconds = Number(arg('seconds') ?? 60);
const dummy = arg('dummy');
const pack = arg('pack') ? Number(arg('pack')) : undefined;
const filter = arg('filter')?.toLowerCase();

console.log(`Training dummy ${dummy ?? 'spore_carrier'}${pack && pack > 1 ? ` x${pack}` : ''}, ${seconds} s per build (seeded rolls, crits included)\n`);
console.log(`${'build'.padEnd(54)} ${'DPS'.padStart(8)}  ${'heat'.padStart(5)}  ${'overheat'.padStart(8)}  casts`);
for (const build of BUILDS) {
  if (filter && !build.name.toLowerCase().includes(filter)) continue;
  const r = simulate(build, seconds, 'sim', { dummy, pack });
  const casts = Object.entries(r.casts)
    .map(([id, n]) => `${id.split('.')[1]}x${n}`)
    .join(' ');
  console.log(
    `${r.name.padEnd(54)} ${r.dps.toFixed(1).padStart(8)}  ${r.avgHeat.toFixed(0).padStart(5)}  ${(r.overheated * 100).toFixed(0).padStart(7)}%  ${casts}`,
  );
}
