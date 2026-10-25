/**
 * Ground splat build time per zone (T004): `npx tsx scripts/perf/splat.ts`.
 * Times the 1024 px splat each open-world zone builds on entry, then a second entry (cache hit).
 */
import { ZONES } from '../../src/data/zones';
import { groundSplatCached } from '../../src/render/groundSplat';

for (const z of ZONES) {
  const g = z.ground;
  if (!g?.base) continue;
  const size = z.halfSize * 2 + 40;
  const count = Math.min(g.layers.length, 6);
  let t = performance.now();
  groundSplatCached(z.id, g.patches, size, 1024, z.id, count);
  const first = performance.now() - t;
  t = performance.now();
  groundSplatCached(z.id, g.patches, size, 1024, z.id, count);
  console.log(`${z.id.padEnd(28)} ${first.toFixed(0).padStart(5)} ms  (${g.patches.length} patches)  second entry ${(performance.now() - t).toFixed(1)} ms`);
}
