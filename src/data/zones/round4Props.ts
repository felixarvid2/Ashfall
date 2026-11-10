/**
 * Round 4 (D16): ten Blender set-dressing props for under-dressed spots, scattered with each zone's own rule for open
 * ground (seeded, so a zone always looks the same). Models: scripts/blender/spec/round4_content.json.
 */
import { Rng } from '../../core/rng';
import type { PropPlacement } from './zoneTypes';

interface Spot {
  asset: string;
  count: number;
  /** Collider radius at scale 1 (0 = none). */
  collider: number;
  light?: PropPlacement['light'];
}

export const ROUND4_PROPS: Readonly<Record<string, readonly Spot[]>> = {
  'zone.cinder_flats': [
    { asset: 'prop.broken_turret', count: 7, collider: 0.7 },
    { asset: 'prop.drone_wreck', count: 8, collider: 0.5 },
    { asset: 'prop.cot_bedroll', count: 5, collider: 0 },
  ],
  'zone.refinery_district': [
    { asset: 'prop.fuel_barrel_stack', count: 9, collider: 0.8 },
    { asset: 'prop.broken_turret', count: 6, collider: 0.7 },
  ],
  'zone.hydroponic_vaults': [
    { asset: 'prop.spore_pod', count: 10, collider: 0.6, light: { color: '#8aff6a', intensity: 10, distance: 7, height: 1.1 } },
    { asset: 'prop.vine_planter', count: 8, collider: 0.8 },
  ],
  'zone.deep_mines': [
    { asset: 'prop.crystal_crate', count: 9, collider: 0.6, light: { color: '#5ac8ff', intensity: 12, distance: 7, height: 1 } },
    { asset: 'prop.ore_cart', count: 7, collider: 0.9 },
  ],
  'zone.the_core': [
    { asset: 'prop.server_rack', count: 7, collider: 0.5 },
    { asset: 'prop.obelisk_stub', count: 6, collider: 0.6, light: { color: '#ffe39a', intensity: 14, distance: 8, height: 1.4 } },
  ],
};

/** The zone's round 4 props: `ok(x, z)` is the zone's own test for open, unclaimed ground. */
export function round4Props(zoneId: string, half: number, ok: (x: number, z: number) => boolean): PropPlacement[] {
  const rng = new Rng(`round4-props:${zoneId}`);
  const out: PropPlacement[] = [];
  for (const spot of ROUND4_PROPS[zoneId] ?? []) {
    let placed = 0;
    for (let tries = 0; tries < 600 && placed < spot.count; tries++) {
      const x = rng.range(-half + 12, half - 12);
      const z = rng.range(-half + 12, half - 12);
      if (!ok(x, z)) continue;
      out.push({ asset: spot.asset, x, z, rot: rng.range(0, Math.PI * 2), ...(spot.collider > 0 ? { collider: spot.collider } : {}), ...(spot.light ? { light: spot.light } : {}) });
      placed++;
    }
  }
  return out;
}
