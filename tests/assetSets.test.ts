import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOT_ASSET_IDS, classAssetIds, instanceAssetIds, zoneAssetIds, zoneInstanceAssetIds } from '../src/data/assetSets';
import { CLASSES } from '../src/data/db';
import { INSTANCES } from '../src/data/instances';
import { ZONES } from '../src/data/zones';

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as {
  assets: { id: string; category: string; status: string; file?: string; lods?: string[] }[];
};
const byId = new Map(manifest.assets.map((a) => [a.id, a]));
/** Bytes a model costs to fetch: its file and its LOD files. */
const bytes = (id: string): number => {
  const a = byId.get(id)!;
  return [a.file, ...(a.lods ?? [])].filter(Boolean).reduce((s, f) => s + statSync(new URL(`../public/assets/${f}`, import.meta.url)).size, 0);
};
const total = (ids: string[]) => [...new Set(ids)].reduce((s, id) => s + bytes(id), 0);
const MB = 1024 * 1024;

describe('asset sets (T003)', () => {
  const classes = [...CLASSES.keys()];
  const open = ZONES.filter((z) => z.ground?.base);

  it('every id is an optimized model in the manifest, with its files on disk', () => {
    const ids = [
      ...BOOT_ASSET_IDS,
      ...classes.flatMap(classAssetIds),
      ...ZONES.flatMap(zoneAssetIds),
      ...ZONES.flatMap(zoneInstanceAssetIds),
      ...INSTANCES.flatMap(instanceAssetIds),
    ];
    expect(ids.length).toBeGreaterThan(50);
    for (const id of new Set(ids)) {
      const a = byId.get(id);
      expect(a, `${id} is not in assets/manifest.json`).toBeDefined();
      expect(a!.category, id).not.toBe('icon');
      expect(a!.status, id).toBe('optimized');
      for (const f of [a!.file, ...(a!.lods ?? [])]) expect(existsSync(new URL(`../public/assets/${f}`, import.meta.url)), `${id}: ${f}`).toBe(true);
    }
  });

  it('boots with at most 6 MB of models (the character select needs none)', () => {
    expect(total([...BOOT_ASSET_IDS])).toBeLessThanOrEqual(6 * MB);
  });

  it('a zone plus the playing class stays within 18 MB', () => {
    for (const zone of open) {
      for (const classId of classes) {
        const sum = total([...zoneAssetIds(zone), ...classAssetIds(classId)]);
        expect(sum, `${zone.id} + ${classId}: ${(sum / MB).toFixed(1)} MB`).toBeLessThanOrEqual(18 * MB);
      }
    }
  });

  it('a zone names its props, scatter and pack monsters', () => {
    const cinder = ZONES.find((z) => z.id === 'zone.cinder_flats')!;
    const ids = zoneAssetIds(cinder);
    for (const p of cinder.props) expect(ids).toContain(p.asset);
    for (const s of cinder.scatter) expect(ids).toContain(s.asset);
    expect(ids).toContain('enemy.infected_colonist');
    // Another zone's own monsters are not in it.
    expect(ids).not.toContain('enemy.smelter');
    expect(zoneAssetIds(ZONES.find((z) => z.id === 'zone.refinery_district')!)).toContain('enemy.smelter');
  });

  it('a class brings its model, hand weapons and the bike', () => {
    expect(classAssetIds('bastion')).toEqual(expect.arrayContaining(['char.bastion', 'weapon.hydraulic_hammer', 'prop.motorbike']));
    expect(classAssetIds('spectre')).toContain('weapon.heavy_pistol');
    // The Lightbearer's censer is built in code: no model to fetch for it.
    expect(classAssetIds('lightbearer').filter((id) => id.startsWith('procedural.'))).toEqual([]);
  });

  it('a dungeon names its decor, lights and monsters; a zone prefetches the dungeons standing in it', () => {
    const def = INSTANCES.find((i) => i.id === 'shaft_13') ?? INSTANCES[0]!;
    const ids = instanceAssetIds(def);
    for (const d of def.theme.decor) expect(ids).toContain(d);
    expect(ids).toContain(def.theme.light.asset);
    expect(zoneInstanceAssetIds(ZONES.find((z) => z.id === 'zone.deep_mines')!).length).toBeGreaterThan(0);
  });
});
