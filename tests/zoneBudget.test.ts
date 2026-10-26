/**
 * C08: what a zone fetches before it shows (its models, LODs and ground textures, plus the playing class) stays
 * under a per-zone byte budget. `assetSets.test.ts` holds the shared 18 MB ceiling; these are tighter numbers
 * set from the sizes at the time (about 8 % headroom), so one zone cannot quietly grow by several megabytes.
 * Raise a budget on purpose, in the same change that adds the assets.
 */
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classAssetIds, zoneAssetIds } from '../src/data/assetSets';
import { CLASSES } from '../src/data/db';
import { ZONES } from '../src/data/zones';

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as {
  assets: { id: string; file?: string; lods?: string[] }[];
};
const byId = new Map(manifest.assets.map((a) => [a.id, a]));
const size = (rel: string): number => statSync(new URL(`../public/assets/${rel}`, import.meta.url)).size;
const MB = 1024 * 1024;

/** Bytes of one zone entry for one class. */
function entryBytes(zoneId: string, classId: string): number {
  const def = ZONES.find((z) => z.id === zoneId)!;
  const files = new Set<string>();
  for (const id of [...zoneAssetIds(def), ...classAssetIds(classId)]) {
    const a = byId.get(id)!;
    for (const f of [a.file, ...(a.lods ?? [])]) if (f) files.add(f);
  }
  const ground = new Set<string>([def.ground?.base, def.ground?.road, ...(def.ground?.layers ?? [])].filter((g) => !!g) as string[]);
  for (const g of ground) files.add(`textures/ground/${g}.webp`);
  return [...files].reduce((sum, f) => sum + size(f), 0);
}

/** MB per zone, for the heaviest class in it. */
const BUDGET_MB: Record<string, number> = {
  'zone.cinder_flats': 15.1, // 13.93
  'zone.refinery_district': 20.1, // 18.58
  'zone.hydroponic_vaults': 18.6, // 17.20
  'zone.deep_mines': 19.8, // 18.31
  'zone.the_core': 18.9, // 17.48
};

describe('zone entry byte budget (C08)', () => {
  const classes = [...CLASSES.keys()];

  it('every zone has a budget', () => {
    expect(ZONES.map((z) => z.id).sort()).toEqual(Object.keys(BUDGET_MB).sort());
  });

  for (const zone of ZONES) {
    it(`${zone.id} stays under ${BUDGET_MB[zone.id] ?? '?'} MB for every class`, () => {
      for (const classId of classes) {
        const bytes = entryBytes(zone.id, classId);
        expect(bytes / MB, `${zone.id} + ${classId}`).toBeLessThanOrEqual(BUDGET_MB[zone.id]!);
      }
    });
  }
});
