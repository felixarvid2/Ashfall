/**
 * Which 3D models a place needs, so the game loads them when it gets there instead of all 92 at boot (T003).
 *
 * These sets are what is known from data: a zone's props, scatter and pack enemies, a class's model and
 * weapons, a dungeon's decor and monsters. They are prefetched during the fade into a zone. Anything they miss
 * (a set piece, a quest NPC, a boss) is loaded from the entities actually spawned (`Game.settleAssets`), and a
 * model asked for before it is loaded shows its placeholder and swaps itself in (`AssetLibrary.create`).
 */
import { CLASS_WEAPONS, PROCEDURAL_PREFIX } from './weapons';
import { CLASSES, ENEMY_DEFS } from './db';
import { INSTANCES, type InstanceDef } from './instances';
import { PACK_TEMPLATES } from './packs';
import type { ZoneDef } from './zones/zoneTypes';

/** Models needed before the character select: none (portraits and icons are plain images). */
export const BOOT_ASSET_IDS: readonly string[] = [];

/** Props every dungeon builds from, whatever its theme (src/world/instance.ts, instanceObjectives.ts). */
const INSTANCE_SHARED = ['env.wall_segment', 'prop.barricade', 'prop.spore_nest', 'prop.teleporter'];

/** The player's own model, hand-held weapons and the motorbike; the same for every zone. */
export function classAssetIds(classId: string): string[] {
  const cls = CLASSES.get(classId);
  const ids = ['prop.motorbike'];
  if (cls) ids.push(cls.assetId);
  for (const mount of CLASS_WEAPONS[classId] ?? []) if (!mount.asset.startsWith(PROCEDURAL_PREFIX)) ids.push(mount.asset);
  return ids;
}

function templateEnemyAssets(templateIds: Iterable<string>): string[] {
  const ids: string[] = [];
  for (const id of templateIds) {
    const template = PACK_TEMPLATES.find((t) => t.id === id);
    for (const member of template?.members ?? []) {
      const asset = ENEMY_DEFS.get(member.enemy)?.assetId;
      if (asset) ids.push(asset);
    }
  }
  return ids;
}

/** What an open-world zone shows from the start: props, scatter clutter and its pack monsters. */
export function zoneAssetIds(zone: ZoneDef): string[] {
  const ids = [...zone.props.map((p) => p.asset), ...zone.scatter.map((s) => s.asset), ...templateEnemyAssets(zone.packs.map((p) => p.template))];
  return [...new Set(ids)];
}

/** What one dungeon, bunker or rift is built from. */
export function instanceAssetIds(def: InstanceDef): string[] {
  const ids = [...INSTANCE_SHARED, ...def.theme.decor, def.theme.light.asset, ...templateEnemyAssets(def.packs)];
  if (def.boss) {
    const asset = ENEMY_DEFS.get(def.boss.enemy)?.assetId;
    if (asset) ids.push(asset);
  }
  return [...new Set(ids)];
}

/** Dungeons and bunkers whose entrance stands in this zone (prefetched quietly after arriving). */
export function zoneInstanceAssetIds(zone: ZoneDef): string[] {
  const ids: string[] = [];
  for (const poi of zone.pois) {
    if (poi.kind !== 'dungeon' && poi.kind !== 'bunker') continue;
    const wanted = poi.data?.dungeon ?? poi.data?.bunker;
    const def = INSTANCES.find((i) => i.id === wanted);
    if (def) ids.push(...instanceAssetIds(def));
  }
  return [...new Set(ids)];
}
