/**
 * Which 3D models a place needs, so the game loads them when it gets there instead of all 92 at boot (T003).
 *
 * These sets are what is known from data: a zone's props, scatter and pack enemies, its NPCs, interactables,
 * quest targets and objects, set pieces and their bosses (with the adds a boss script summons), a class's model
 * and weapons, a dungeon's decor and monsters. `zoneAssetIds` is everything standing in the zone when it loads;
 * it is prefetched during the fade into the zone, so the screen does not come up on placeholders and the fade does
 * not wait on a second round of downloads (it used to: 8.7 s for Hydroponic Vaults). `zoneLaterAssetIds` is what
 * the player meets further in (set-piece bosses and their waves, world events, dungeons): fetched quietly once the
 * zone is showing, so the fade does not wait on ~6 MB of bosses. Whatever both miss is loaded from the entities
 * actually spawned (`Game.settleAssets`), and a model asked for before it is loaded shows its placeholder and swaps
 * itself in (`AssetLibrary.create`). tests/assetSets.test.ts spawns a zone's entities and fails when one has a model
 * the sets miss. A runtime variant (src/data/variants.ts) is listed as the manifest ids it is built from, its base
 * and its parts, so the byte budgets count both.
 */
import { CLASS_WEAPONS, PROCEDURAL_PREFIX } from './weapons';
import { CLASSES, ENEMY_DEFS } from './db';
import { BOSS_SCRIPTS } from './bosses';
import { WORLD_BOSSES } from './endgame/worldBosses';
import { INSTANCES, type InstanceDef } from './instances';
import { PACK_TEMPLATES } from './packs';
import { expandAssetIds } from './variants';
import { NPCS, QUESTS } from './quests/db';
import type { ZoneDef } from './zones/zoneTypes';
import { interactableAssetIds } from '../world/interactables';
import { DELTA_TUNING } from '../world/districtSetPieces';
import { BASE_TUNING } from '../world/elevatorBase';
import { AURUM_TUNING } from '../world/mineSetPieces';
import { GAMMA_TUNING } from '../world/vaultSetPieces';

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
  return expandAssetIds(ids);
}

function templateEnemyAssets(templateIds: Iterable<string>): string[] {
  const ids: string[] = [];
  for (const id of templateIds) {
    const template = PACK_TEMPLATES.find((t) => t.id === id);
    for (const member of template?.members ?? []) {
      const asset = ENEMY_DEFS.get(member.enemy)?.assetId;
      if (asset) ids.push(...expandAssetIds([asset]));
    }
  }
  return ids;
}

/**
 * Set-piece models per zone: what src/world/*SetPieces.ts, setPieces.ts, elevatorBase.ts and lumen.ts spawn when the
 * player walks up to a stronghold or boss arena. `props` are the non-enemy models (feeders, nodes, gates, allies);
 * `bosses` are enemy ids and `scripts` their boss scripts (whose adds come along); `enemies` are the wave monsters,
 * read from the tuning tables the set pieces themselves use.
 */
const SET_PIECES: Record<string, { props: string[]; bosses: string[]; scripts?: string[]; enemies: string[] }> = {
  'zone.cinder_flats': {
    props: ['prop.spore_feeder', 'prop.barricade'],
    bosses: ['commandant_hale', 'the_first'],
    scripts: ['hale', 'the_first'],
    enemies: ['security_drone', 'infected_colonist'],
  },
  'zone.refinery_district': {
    props: ['npc.technician', 'prop.barricade'],
    bosses: ['brother_ash', 'vire'],
    scripts: ['brother_ash', 'vire'],
    enemies: DELTA_TUNING.waves.flatMap((w) => w.map(([enemy]) => enemy)),
  },
  'zone.hydroponic_vaults': {
    props: ['prop.spore_nest', 'prop.barricade'],
    bosses: ['gamma_bloom', 'warden'],
    scripts: ['gamma_bloom', 'warden'],
    enemies: GAMMA_TUNING.waves.flatMap((w) => w.map(([enemy]) => enemy)),
  },
  'zone.deep_mines': {
    props: ['prop.compressor', 'prop.barricade'],
    bosses: ['security_chief_holm', 'governor_kade'],
    scripts: ['holm', 'kade'],
    enemies: AURUM_TUNING.wave.map(([enemy]) => enemy),
  },
  'zone.the_core': {
    props: ['prop.barricade', 'prop.core_column', ...BASE_TUNING.allies.map((a) => a.asset)],
    bosses: ['lumen', ...BASE_TUNING.waves.flatMap((w) => (w.boss ? [w.boss] : []))],
    scripts: ['lumen', ...BASE_TUNING.waves.flatMap((w) => (w.boss ? [w.boss] : []))],
    enemies: BASE_TUNING.waves.flatMap((w) => w.enemies.map(([enemy]) => enemy)),
  },
};

/** Models of enemies, the enemies they bring (on death, as reinforcements) and the adds of boss scripts. */
export function enemyAssetIds(enemyIds: Iterable<string>, scripts: Iterable<string> = []): string[] {
  const ids = new Set<string>();
  const seen = new Set<string>();
  const addEnemy = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const def = ENEMY_DEFS.get(id);
    if (!def) return;
    for (const piece of expandAssetIds([def.assetId])) ids.add(piece);
    if (def.onDeath?.spawn) addEnemy(def.onDeath.spawn.enemy);
    if (def.reinforce) addEnemy(def.reinforce.enemy);
  };
  const addScript = (name: string): void => {
    for (const phase of BOSS_SCRIPTS[name] ?? []) {
      for (const spec of [phase.adds, phase.guards, phase.tentacles]) if (spec) addEnemy(spec.enemy);
      if (phase.rooted?.asset) for (const piece of expandAssetIds([phase.rooted.asset])) ids.add(piece);
      if (phase.beat) for (const piece of expandAssetIds([phase.beat.form.asset])) ids.add(piece);
      for (const memory of phase.memories ?? []) {
        for (const spec of [memory.adds, memory.tentacles, ...memory.shades]) if (spec) addEnemy(spec.enemy);
      }
    }
  };
  for (const id of enemyIds) addEnemy(id);
  for (const name of scripts) addScript(name);
  return [...ids];
}

/** Hub and quest NPCs standing in the zone, and what its quests put there: named targets, objects, escorts, triggers. */
function questAssetIds(zoneId: string): string[] {
  const ids: string[] = [];
  const enemies: string[] = [];
  for (const npc of NPCS.values()) if (npc.zone === zoneId) ids.push(npc.asset);
  for (const quest of QUESTS.values()) {
    if (quest.zone === zoneId && quest.trigger && 'object' in quest.trigger) ids.push(quest.trigger.object.asset);
    for (const step of quest.steps) {
      if ((step.zone ?? quest.zone) !== zoneId) continue;
      if (step.kind === 'kill' && step.spawn) enemies.push(step.spawn.enemy);
      else if (step.kind === 'interact') ids.push(...step.objects.map((o) => o.asset));
      else if (step.kind === 'escort') ids.push(step.asset);
    }
  }
  return [...ids, ...enemyAssetIds(enemies)];
}

/**
 * What an open-world zone has standing in it when it loads: props, scatter clutter and its pack monsters,
 * interactables, NPCs, quest targets and the props of its set pieces.
 */
export function zoneAssetIds(zone: ZoneDef): string[] {
  const ids = expandAssetIds([
    ...zone.props.map((p) => p.asset),
    ...zone.scatter.map((s) => s.asset),
    ...templateEnemyAssets(zone.packs.map((p) => p.template)),
    ...interactableAssetIds(zone),
    ...questAssetIds(zone.id),
    ...(SET_PIECES[zone.id]?.props ?? []),
  ]);
  return ids;
}

/** The zone's set-piece bosses, their adds and the monsters of their waves. */
export function zoneBossAssetIds(zone: ZoneDef): string[] {
  const sp = SET_PIECES[zone.id];
  return sp ? enemyAssetIds([...sp.bosses, ...sp.enemies], sp.scripts) : [];
}

/** What one dungeon, bunker or rift is built from. */
export function instanceAssetIds(def: InstanceDef): string[] {
  const ids = [...INSTANCE_SHARED, ...def.theme.decor, def.theme.light.asset, ...templateEnemyAssets(def.packs)];
  if (def.boss) {
    const asset = ENEMY_DEFS.get(def.boss.enemy)?.assetId;
    if (asset) ids.push(asset);
  }
  return expandAssetIds(ids);
}

/** Dungeons and bunkers whose entrance stands in this zone (prefetched quietly after arriving). */
export function zoneInstanceAssetIds(zone: ZoneDef): string[] {
  const ids: string[] = [];
  for (const poi of zone.pois) {
    if (poi.kind !== 'dungeon' && poi.kind !== 'bunker') continue;
    const wanted = poi.data?.dungeon ?? poi.data?.instance;
    const def = INSTANCES.find((i) => i.id === wanted);
    if (def) ids.push(...instanceAssetIds(def));
  }
  return [...new Set(ids)];
}

/** Props of the timed world events (src/world/worldEvents.ts `start`), by event type. */
const EVENT_ASSETS: Record<string, string[]> = {
  convoy: ['prop.water_tanker'],
  sporeNest: ['prop.spore_nest'],
  rescue: ['npc.technician'],
  signalJam: ['prop.signal_tower'],
  purgeFurnace: ['env.furnace_block'],
  smelterRaid: ['env.pump_house'],
  sporeBloom: ['prop.spore_nest'],
  caveRescue: ['env.slag_rock'],
  lightsOut: ['prop.generator'],
};

/**
 * What the zone brings up later, not at the border: its set-piece bosses and waves, dungeons and bunkers, the props
 * of its world events and the World Tier 2 bosses that can stand in it. Fetched quietly once the zone is showing.
 */
export function zoneLaterAssetIds(zone: ZoneDef): string[] {
  const ids = [...zoneBossAssetIds(zone), ...zoneInstanceAssetIds(zone)];
  for (const poi of zone.pois) if (poi.kind === 'event') ids.push(...(EVENT_ASSETS[String(poi.data?.event)] ?? []));
  const bosses = WORLD_BOSSES.filter((b) => b.spots.some((spot) => spot.zone === zone.id));
  ids.push(...enemyAssetIds(bosses.map((b) => b.enemy), bosses.map((b) => b.script)));
  return expandAssetIds(ids);
}
