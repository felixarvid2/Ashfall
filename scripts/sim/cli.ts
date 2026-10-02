/**
 * Balance simulator: npm run sim [-- --seconds 60]
 * Runs every sample build in scripts/sim/builds.ts against a training dummy.
 */
import { BUILDS } from './builds';
import { simulate } from './sim';

const arg = process.argv.indexOf('--seconds');
const seconds = arg >= 0 ? Number(process.argv[arg + 1]) : 60;

console.log(`Training dummy, ${seconds} s per build (seeded rolls, crits included)\n`);
console.log(`${'build'.padEnd(44)} ${'DPS'.padStart(8)}  ${'heat'.padStart(5)}  ${'overheat'.padStart(8)}  casts`);
for (const build of BUILDS) {
  const r = simulate(build, seconds);
  const casts = Object.entries(r.casts)
    .map(([id, n]) => `${id.split('.')[1]}×${n}`)
    .join(' ');
  console.log(
    `${r.name.padEnd(44)} ${r.dps.toFixed(1).padStart(8)}  ${r.avgHeat.toFixed(0).padStart(5)}  ${(r.overheated * 100).toFixed(0).padStart(7)}%  ${casts}`,
  );
}
