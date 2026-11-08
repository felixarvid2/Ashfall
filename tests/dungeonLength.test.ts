import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { INSTANCES } from '../src/data/instances';
import { CINDER_FLATS, ROAD_PACK_SPACING } from '../src/data/zones/cinderFlats';
import { alongRoad } from '../src/data/zones/layout';
import { generateLayout } from '../src/world/instance';

const avgRooms = (id: string) => {
  const def = INSTANCES.find((d) => d.id === id)!;
  let n = 0;
  for (let i = 0; i < 30; i++) n += generateLayout(new Rng(`${id}-${i}`), def).rooms.length;
  return n / 30;
};
/** The report's own model (scripts/sim/regionReport.ts) puts a room at about 1:15 including packs, objective and boss: these room counts are what it prices at 10-12 minutes. */
describe('A14 Core dungeon length', () => {
  it('the four Core dungeons are trimmed to about nine rooms (they were 14-15)', () => {
    for (const id of ['core_memory_of_ember', 'core_singing_halls', 'core_chamber_of_creation']) {
      const rooms = avgRooms(id);
      expect(rooms, id).toBeLessThan(10.5);
      expect(rooms, id).toBeGreaterThan(7);
    }
  });
  it('every Core dungeon still has its boss and objective', () => {
    for (const id of ['core_memory_of_ember', 'core_singing_halls', 'core_chamber_of_creation']) {
      const def = INSTANCES.find((d) => d.id === id)!;
      expect(def.boss).not.toBeNull();
      const layout = generateLayout(new Rng(`${id}-0`), def);
      expect(layout.rooms.some((r) => r.kind === 'main')).toBe(true);
    }
  });
});

describe('A15 Region 1 dungeons and road packs', () => {
  it('the Cinder Flats dungeons gained a room (they averaged 11.1-11.3)', () => {
    for (const id of ['meridians_hold', 'bunker_sierra4', 'drainage_tunnels']) expect(avgRooms(id), id).toBeGreaterThan(12.3);
  });
  it('road packs are 15 % fewer than at the old 26 m spacing', () => {
    let before = 0;
    let after = 0;
    for (const road of CINDER_FLATS.roads) {
      const pts = road.points as [number, number][];
      before += alongRoad(pts, 26, 18).length;
      after += alongRoad(pts, ROAD_PACK_SPACING, 18).length;
    }
    expect(after / before).toBeLessThanOrEqual(0.87);
    expect(after / before).toBeGreaterThan(0.75);
    expect(CINDER_FLATS.packs.filter((p) => p.template === 'road').length).toBeGreaterThan(0);
  });
});
