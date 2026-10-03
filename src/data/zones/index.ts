/** Every open-world zone, in region order (docs/world-and-gameplay.md §5). */
import { CINDER_FLATS } from './cinderFlats';
import { REFINERY_DISTRICT } from './refineryDistrict';
import { HYDROPONIC_VAULTS } from './hydroponicVaults';
import type { ZoneDef } from './zoneTypes';

export const ZONES: readonly ZoneDef[] = [CINDER_FLATS, REFINERY_DISTRICT, HYDROPONIC_VAULTS];

/** New characters start here. */
export const START_ZONE = CINDER_FLATS;

export function zoneDef(id: string): ZoneDef {
  const z = ZONES.find((d) => d.id === id);
  if (!z) throw new Error(`Unknown zone: ${id}`);
  return z;
}

export function hasZone(id: string): boolean {
  return ZONES.some((d) => d.id === id);
}

/** The zone a teleporter belongs to (teleporter ids are unique across zones). */
export function zoneOfTeleporter(id: string): ZoneDef | undefined {
  return ZONES.find((d) => d.teleporters.some((t) => t.id === id));
}
