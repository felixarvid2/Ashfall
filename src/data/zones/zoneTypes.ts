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
  | 'npc';

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
}

export type { PropPlacement };
