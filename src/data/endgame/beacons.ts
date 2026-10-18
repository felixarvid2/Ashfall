/** Tier Beacon positions (docs/endgame.md): one interactable in each region hub. */
import { CINDER_FLATS_HUB } from '../zones/cinderFlats';
import { ZERO } from '../zones/deepMines';
import { LAB9 } from '../zones/hydroponicVaults';
import { COOLANT_WORKS } from '../zones/refineryDistrict';
import { LAST_CAMP } from '../zones/theCore';

/** Where each hub's Tier Beacon stands: inside the hub, clear of its NPCs, stash and teleporter. */
export const TIER_BEACONS: Readonly<Record<string, { x: number; z: number }>> = {
  'zone.cinder_flats': { x: CINDER_FLATS_HUB.x + 1, z: CINDER_FLATS_HUB.z + 4 },
  'zone.refinery_district': { x: COOLANT_WORKS.x, z: COOLANT_WORKS.z + 3 },
  'zone.hydroponic_vaults': { x: LAB9.x, z: LAB9.z + 1 },
  'zone.deep_mines': { x: ZERO.x + 9, z: ZERO.z - 6 },
  'zone.the_core': { x: LAST_CAMP.x, z: LAST_CAMP.z + 7 },
};
