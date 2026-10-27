import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOT_ASSET_IDS, classAssetIds, enemyAssetIds, instanceAssetIds, zoneAssetIds, zoneInstanceAssetIds, zoneLaterAssetIds } from '../src/data/assetSets';
import { CLASSES } from '../src/data/db';
import { NPCS, QUESTS } from '../src/data/quests/db';
import { World } from '../src/core/ecs';
import { Renderable } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { TIER_BEACONS } from '../src/data/endgame/beacons';
import { riftObeliskAt } from '../src/data/endgame/riftObelisks';
import { createQuestRuntime, rebuildQuestWorld, spawnNpc } from '../src/systems/quests';
import { spawnArenaProps } from '../src/world/arena';
import { spawnInteractables, syncInteractables } from '../src/world/interactables';
import { syncSetPieces } from '../src/world/setPieces';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx } from './helpers';
import { INSTANCES } from '../src/data/instances';
import { ZONES } from '../src/data/zones';
import { assetIdsOf, expandAssetIds } from '../src/data/variants';

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

  it('every model a zone spawns at entry is in its set (props, interactables, NPCs, quest targets, set pieces)', () => {
    const steps = Math.max(...[...QUESTS.values()].map((q) => q.steps.length));
    for (const def of ZONES) {
      const zone = createZoneRuntime(def);
      const world = new World();
      const quests = createQuestRuntime();
      const ctx = makeCtx({ zone, quests, account: emptyAccount(), worldHalfSize: def.halfSize });
      const spawned = new Set<string>();
      const collect = () => {
        for (const e of world.query(Renderable)) spawned.add(world.req(e, Renderable).assetId);
      };
      spawnArenaProps(world, def);
      const beacon = TIER_BEACONS[def.id];
      const obelisk = riftObeliskAt(def.id);
      spawnInteractables(world, zone, [
        { poi: 'stash', kind: 'stash', x: 0, z: 0 },
        ...(beacon ? [{ poi: 'tierBeacon', kind: 'beacon' as const, ...beacon }] : []),
        ...(obelisk ? [{ poi: 'riftObelisk', kind: 'riftObelisk' as const, ...obelisk }] : []),
      ]);
      // Reclaimed strongholds, defeated bosses: the state a saved game restores.
      for (const poi of def.pois) zone.found.add(poi.id);
      syncInteractables(world, zone);
      syncSetPieces(world, zone);
      for (const npc of NPCS.values()) if (npc.zone === def.id) spawnNpc(world, npc.id);
      collect();
      // Every quest at every step: named targets, objects, escorts, trigger objects.
      for (let i = 0; i < steps; i++) {
        quests.active.clear();
        quests.done.clear();
        for (const q of QUESTS.values()) quests.active.set(q.id, { step: Math.min(i, q.steps.length - 1), progress: 0 });
        rebuildQuestWorld(world, ctx);
        collect();
      }
      quests.active.clear();
      rebuildQuestWorld(world, ctx);
      collect();
      const set = new Set(zoneAssetIds(def));
      // A runtime variant (src/data/variants.ts) is in the set as its base and parts.
      const missing = expandAssetIds(spawned).filter((id) => !set.has(id));
      expect(missing, `${def.id}: spawned but not in its asset set`).toEqual([]);
    }
  });

  it('set-piece bosses, their waves and adds, and world events are in a zone\'s later set', () => {
    const files: Record<string, string[]> = {
      'zone.cinder_flats': ['setPieces'],
      'zone.refinery_district': ['districtSetPieces'],
      'zone.hydroponic_vaults': ['vaultSetPieces'],
      'zone.deep_mines': ['mineSetPieces'],
      'zone.the_core': ['elevatorBase', 'lumen'],
    };
    const read = (f: string) => readFileSync(new URL(`../src/world/${f}.ts`, import.meta.url), 'utf8');
    for (const [zoneId, names] of Object.entries(files)) {
      const def = ZONES.find((z) => z.id === zoneId)!;
      const have = new Set([...zoneAssetIds(def), ...zoneLaterAssetIds(def)]);
      for (const name of names) {
        const src = read(name);
        const literals = [...src.matchAll(/assetId: '([\w.]+)'/g)].map((m) => m[1]!);
        const enemies = [...src.matchAll(/(?:enemy: |spawnEnemy\(world, )'(\w+)'/g)].map((m) => m[1]!);
        for (const id of literals) for (const piece of assetIdsOf(id)) expect(have.has(piece), `${zoneId}: ${name} spawns ${id}`).toBe(true);
        for (const enemy of enemies) for (const id of enemyAssetIds([enemy])) expect(have.has(id), `${zoneId}: ${name} spawns ${enemy} (${id})`).toBe(true);
        // Scripted bosses bring their adds.
        for (const m of src.matchAll(/script: '(\w+)'/g)) for (const id of enemyAssetIds([], [m[1]!])) expect(have.has(id), `${zoneId}: script ${m[1]} brings ${id}`).toBe(true);
      }
    }
    const events = readFileSync(new URL('../src/world/worldEvents.ts', import.meta.url), 'utf8');
    const later = new Set(ZONES.flatMap(zoneLaterAssetIds));
    for (const id of [...events.matchAll(/(?:assetId: |, )'((?:prop|env|npc)\.\w+)'/g)].map((m) => m[1]!)) expect(later.has(id) || ZONES.some((z) => zoneAssetIds(z).includes(id)), `world event model ${id}`).toBe(true);
  });

  it('world bosses, boss adds and quest bosses resolve to real models', () => {
    for (const def of ZONES) for (const id of zoneLaterAssetIds(def)) expect(byId.has(id), id).toBe(true);
    // Hale brings his own model and the colonists his script summons; Lumen's phases bring shades.
    expect(enemyAssetIds(['commandant_hale'], ['hale'])).toEqual(expect.arrayContaining(['boss.commandant_hale', 'enemy.infected_colonist']));
    expect(enemyAssetIds(['lumen'], ['lumen']).length).toBeGreaterThan(2);
  });
});
