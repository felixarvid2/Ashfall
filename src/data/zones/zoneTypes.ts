/**
 * Open-world zone data (docs/world-and-gameplay.md §2–3). A zone is an ArenaDef (props, scatter,
 * lighting) plus roads, subzones, hubs, teleporters, enemy pack spawns and points of interest.
 */
import type { ArenaDef, PropPlacement } from './testArena';

export interface Subzone {
  id: string;
  /** Display name key: zones.<zone>.<id>. */
  center: [number, number];
  radius: number;
  /** Ash storms can roll over this subzone. */
  storms?: boolean;
}

export interface Road {
  id: string;
  width: number;
  points: [number, number][];
}

export interface HubDef {
  id: string;
  x: number;
  z: number;
  /** Combat is disabled inside this radius and enemies stay out. */
  radius: number;
}

export interface TeleporterDef {
  id: string;
  x: number;
  z: number;
  /** Hubs' teleporters start discovered. */
  hub?: boolean;
}

/**
 * A border crossing to another zone (docs/regions/refinery-district.md, "Several zones"). Walking
 * into the trigger circle loads the other zone behind a short fade; you arrive at the paired gate's
 * `arrive` point, outside its trigger.
 */
export interface ZoneGateDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  /** Zone and gate on the other side. */
  to: { zone: string; gate: string };
  /** Where a player coming through from the other side appears. */
  arrive: { x: number; z: number };
}

/** Environmental mechanics placed in a zone (Refinery District). */
export type EnvFeature =
  /** A moving belt: everything standing on it is carried along `dir` (radians, 0 = +z). */
  | { kind: 'conveyor'; id: string; x: number; z: number; length: number; width: number; dir: number; speed: number }
  /** Molten metal: damages everyone standing in it; enemies avoid stepping in when they can. */
  | { kind: 'molten'; id: string; x: number; z: number; radius: number }
  /** A vent: a warned, timed fire or steam blast that hits everyone near it. */
  | { kind: 'vent'; id: string; x: number; z: number; radius: number; period: number; offset: number; element: 'fire' | 'steam' | 'frost' }
  /**
   * A spore field (Hydroponic Vaults): standing in it builds up poison. An air filter switched on
   * within `filterRadius` of the filter clears it for good; `clearedBy` names a set piece that
   * clears it instead (Dome Gamma).
   */
  | { kind: 'spores'; id: string; x: number; z: number; radius: number; clearedBy?: string }
  /** Shallow water: slows everyone wading through it. Drained water (dungeon levers) is gone. */
  | { kind: 'water'; id: string; x: number; z: number; radius: number };

export interface PackSpawn {
  id: string;
  x: number;
  z: number;
  /** Pack template id (src/data/packs.ts). */
  template: string;
}

export type PoiKind =
  | 'chest'
  | 'lockedChest'
  | 'keycard'
  | 'pylon'
  | 'relic'
  | 'lore'
  | 'signalTower'
  | 'barrel'
  | 'dungeon'
  | 'bunker'
  | 'event'
  | 'stronghold'
  | 'boss'
  | 'feature'
  | 'npc'
  // Hydroponic Vaults: glowing crystals that blind nearby enemies when broken.
  | 'crystal';

export interface PoiDef {
  id: string;
  kind: PoiKind;
  x: number;
  z: number;
  /** Kind-specific data (chest tier, pylon type, lore id, dungeon id, keycard for, …). */
  data?: Record<string, string | number | boolean>;
}

export interface ZoneDef extends ArenaDef {
  /** Language key prefix for names: zones.<id>. */
  key: string;
  subzones: Subzone[];
  roads: Road[];
  hubs: HubDef[];
  teleporters: TeleporterDef[];
  packs: PackSpawn[];
  pois: PoiDef[];
  /** Grid size (m) of the fog-of-war map. */
  mapCell: number;
  /** Border crossings to neighbouring zones. */
  gates: ZoneGateDef[];
  /** Belts, molten metal, vents, spore fields and water. */
  env?: EnvFeature[];
  /** Glass farming domes drawn as rings of ribs (Hydroponic Vaults). */
  domes?: { x: number; z: number; radius: number }[];
  /** Order on the world map (region number). */
  region: number;
  /** The account stash in this zone's hub. */
  stash?: { x: number; z: number };
}

export type { PropPlacement };
