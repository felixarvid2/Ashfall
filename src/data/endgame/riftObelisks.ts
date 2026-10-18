/** Where the Rift Obelisk stands: in the Last Camp (the Core) and in Outpost Ember (Cinder Flats). */
import { CINDER_FLATS, CINDER_FLATS_HUB } from '../zones/cinderFlats';
import { LAST_CAMP, THE_CORE } from '../zones/theCore';

export const RIFT_OBELISKS: Record<string, { x: number; z: number }> = {
  [THE_CORE.id]: { x: LAST_CAMP.x - 9, z: LAST_CAMP.z - 9 },
  [CINDER_FLATS.id]: { x: CINDER_FLATS_HUB.x - 13, z: CINDER_FLATS_HUB.z - 2 },
};

export function riftObeliskAt(zoneId: string): { x: number; z: number } | undefined {
  return RIFT_OBELISKS[zoneId];
}
