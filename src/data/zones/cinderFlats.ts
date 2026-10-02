/**
 * Region 1: Cinder Flats (levels 1–10). Plan and map: docs/regions/cinder-flats.md.
 * Hand-placed anchors (roads, hub, landmarks, POIs) plus deterministic, seeded decoration along
 * the roads and inside each subzone, so the layout is identical every time.
 */
import { Rng } from '../../core/rng';
import type { PoiDef, PackSpawn, PropPlacement, Road, ZoneDef } from './zoneTypes';

const HALF = 340;

/** Collision circles spaced along the local x axis, for long props. */
const line = (length: number, r: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ x: -length / 2 + (length * i) / (count - 1), z: 0, r }));

const ROADS: Road[] = [
  {
    // The escape pod → Outpost Ember → east along the highway → The Maw.
    id: 'route7',
    width: 9,
    points: [
      [-305, -220], [-275, -160], [-235, -110], [-150, -82], [-90, -42], [-30, -12], [40, 18], [120, 40],
      [200, 58], [262, 86], [292, 132], [292, 172],
    ],
  },
  {
    // North through Ash Valley to the Meridian, then east to the Maw.
    id: 'valley',
    width: 6,
    points: [[-30, -12], [-62, 58], [-84, 140], [-44, 205], [40, 228], [140, 206], [232, 176], [292, 172]],
  },
  {
    // South-east to Checkpoint Sierra and Bunker Sierra-4.
    id: 'sierra',
    width: 6,
    points: [[120, 40], [160, -30], [214, -98], [238, -140], [290, -212]],
  },
  {
    // West spur past the signal tower.
    id: 'spur',
    width: 5,
    points: [[-235, -110], [-280, -50], [-290, -20], [-250, 60], [-190, 120]],
  },
];

export const CINDER_FLATS_HUB = { id: 'hub.ember', x: -150, z: -66, radius: 24 };
export const POD_SPAWN = { x: -300, z: -228 };

/** Points every `step` metres along a polyline, with the direction at that point. */
export function alongRoad(points: [number, number][], step: number, start = 0): { x: number; z: number; dx: number; dz: number }[] {
  const out: { x: number; z: number; dx: number; dz: number }[] = [];
  let carry = start;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    let d = carry;
    while (d < len) {
      out.push({ x: ax + dx * d, z: az + dz * d, dx, dz });
      d += step;
    }
    carry = d - len;
  }
  return out;
}

/** Shortest distance from a point to any road centre line. */
export function distanceToRoad(x: number, z: number, roads: Road[] = ROADS): number {
  let best = Infinity;
  for (const r of roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i]!;
      const [bx, bz] = r.points[i + 1]!;
      const vx = bx - ax;
      const vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
    }
  }
  return best;
}

const emergency = (x: number, z: number): PropPlacement => ({
  asset: 'prop.emergency_light',
  x,
  z,
  collider: 0.3,
  light: { color: '#ff7a1a', intensity: 90, distance: 16, height: 3.1 },
});
const growth = (x: number, z: number, scale = 1): PropPlacement => ({
  asset: 'prop.lumen_growth',
  x,
  z,
  scale,
  collider: 0.55 * scale,
  light: { color: '#5dff6a', intensity: 14, distance: 9, height: 1.6 },
});
const fire = (x: number, z: number, scale = 1): PropPlacement => ({
  asset: 'prop.fuel_tank',
  x,
  z,
  scale,
  rot: (x * 7 + z * 3) % 6.28,
  collider: 1.1 * scale,
  light: { color: '#ff5a1a', intensity: 60, distance: 14, height: 1.4 },
});
const wall = (x: number, z: number, rot: number): PropPlacement => ({ asset: 'env.wall_segment', x, z, rot, colliders: line(3.4, 0.5, 5) });
const barricade = (x: number, z: number, rot: number): PropPlacement => ({ asset: 'prop.barricade', x, z, rot, colliders: line(2.2, 0.6, 3) });
const crate = (x: number, z: number, rot: number, scale = 1): PropPlacement => ({
  asset: 'prop.cargo_crate',
  x,
  z,
  rot,
  scale,
  collider: 0.95 * scale,
});

/** A square-ish ring of walls with gaps (outposts, the checkpoint, the boss arena). */
function walledRing(cx: number, cz: number, radius: number, segments: number, gaps: number[]): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let i = 0; i < segments; i++) {
    if (gaps.includes(i)) continue;
    const a = (i / segments) * Math.PI * 2;
    out.push(wall(cx + Math.sin(a) * radius, cz + Math.cos(a) * radius, a + Math.PI / 2));
  }
  return out;
}

function buildProps(): PropPlacement[] {
  const rng = new Rng('cinder-flats-props');
  const props: PropPlacement[] = [];
  const hub = CINDER_FLATS_HUB;

  // Road lights on alternating sides, and wrecked convoys on Route 7.
  for (const road of ROADS) {
    alongRoad(road.points, road.id === 'route7' ? 28 : 40, 10).forEach((p, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const off = road.width / 2 + 2;
      if (Math.hypot(p.x - hub.x, p.z - hub.z) < hub.radius + 4) return;
      props.push(emergency(p.x - p.dz * off * side, p.z + p.dx * off * side));
    });
  }
  alongRoad(ROADS[0]!.points, 55, 30).forEach((p, i) => {
    if (Math.hypot(p.x - hub.x, p.z - hub.z) < hub.radius + 10) return;
    const side = i % 2 === 0 ? 1 : -1;
    const ox = -p.dz * 3.2 * side;
    const oz = p.dx * 3.2 * side;
    const rot = Math.atan2(p.dx, p.dz) + rng.range(-0.4, 0.4);
    if (i % 3 === 0) props.push({ asset: 'prop.crashed_lander', x: p.x + ox * 2, z: p.z + oz * 2, rot, scale: 0.7, colliders: line(3.5, 1.1, 4) });
    else props.push(barricade(p.x + ox, p.z + oz, rot + Math.PI / 2));
    props.push(crate(p.x + ox * 1.6 + rng.range(-1, 1), p.z + oz * 1.6 + rng.range(-1, 1), rng.range(0, 6.28)));
  });

  // The Impact Fields: burning wreckage, landers and Lumen around the escape pod.
  props.push({ asset: 'prop.escape_pod', x: POD_SPAWN.x - 4, z: POD_SPAWN.z - 3, rot: 0.6, collider: 1.4 });
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(25, 110);
    const x = -250 + Math.sin(a) * d;
    const z = -200 + Math.cos(a) * d;
    if (distanceToRoad(x, z) < 8 || Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) continue;
    if (i % 3 === 0) props.push({ asset: 'prop.crashed_lander', x, z, rot: rng.range(0, 6.28), colliders: line(5, 1.5, 4) });
    else if (i % 3 === 1) props.push(fire(x, z, rng.range(0.7, 1.2)));
    else props.push(growth(x, z, rng.range(0.8, 1.6)));
  }

  // Outpost Ember: the fuel station inside a barricaded ring with two gates.
  // Placed on the far side of the hub (−x, −z is screen-up) so its canopy never hides the player.
  props.push({ asset: 'prop.fuel_station', x: hub.x - 6, z: hub.z - 6, rot: Math.PI / 4, colliders: [{ x: -4, z: 0, r: 2.6 }, { x: 4, z: 0, r: 2.6 }] });
  props.push(...walledRing(hub.x, hub.z, hub.radius - 2, 18, [4, 5, 13, 14]));
  props.push(emergency(hub.x - 8, hub.z - 8), emergency(hub.x + 8, hub.z - 8), emergency(hub.x - 8, hub.z + 12), emergency(hub.x + 9, hub.z + 12));
  props.push(crate(hub.x + 11, hub.z - 2, 0.4), crate(hub.x + 11.5, hub.z, 1.2), crate(hub.x - 12, hub.z + 1, 0.8, 1.2));

  // Checkpoint Sierra: walled compound with watchtowers and a fuel depot.
  const cs = { x: 232, z: -132 };
  props.push(...walledRing(cs.x, cs.z, 30, 24, [9, 10, 21, 22]));
  for (const [dx, dz] of [[-26, -26], [26, -26], [-26, 26], [26, 26]] as const) {
    props.push({ asset: 'prop.signal_tower', x: cs.x + dx, z: cs.z + dz, collider: 1, scale: 0.8 });
  }
  for (let i = 0; i < 8; i++) props.push(barricade(cs.x + rng.range(-18, 18), cs.z + rng.range(-18, 18), rng.range(0, 6.28)));
  for (let i = 0; i < 4; i++) props.push({ asset: 'prop.control_terminal', x: cs.x + rng.range(-12, 12), z: cs.z + rng.range(-12, 12), rot: rng.range(0, 6), collider: 0.45 });
  props.push(emergency(cs.x - 6, cs.z), emergency(cs.x + 6, cs.z));

  // Ash Valley: Lumen fields, broken pipes and debris.
  for (let i = 0; i < 70; i++) {
    const x = rng.range(-200, 160);
    const z = rng.range(100, 320);
    if (distanceToRoad(x, z) < 7) continue;
    const r = rng.next();
    if (r < 0.45) props.push(growth(x, z, rng.range(0.7, 1.8)));
    else if (r < 0.7) props.push({ asset: 'prop.pipe_section', x, z, rot: rng.range(0, 6.28), colliders: line(4, 0.6, 4) });
    else props.push(crate(x, z, rng.range(0, 6.28), rng.range(0.9, 1.3)));
  }

  // Scattered debris and wrecks elsewhere so no stretch of road is empty.
  for (let i = 0; i < 90; i++) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = rng.range(-HALF + 10, HALF - 10);
    const d = distanceToRoad(x, z);
    if (d < 6 || d > 60) continue;
    if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + 6) continue;
    const r = rng.next();
    if (r < 0.3) props.push(crate(x, z, rng.range(0, 6.28)));
    else if (r < 0.5) props.push({ asset: 'prop.pipe_section', x, z, rot: rng.range(0, 6.28), colliders: line(4, 0.6, 4) });
    else if (r < 0.65) props.push(fire(x, z, rng.range(0.8, 1.1)));
    else if (r < 0.85) props.push(growth(x, z, rng.range(0.8, 1.4)));
    else props.push({ asset: 'prop.crashed_lander', x, z, rot: rng.range(0, 6.28), scale: 0.8, colliders: line(4, 1.2, 4) });
  }

  // The Maw: the boss arena ringed by walls and wreckage.
  props.push(...walledRing(292, 196, 26, 22, [0, 1, 11]));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    props.push(growth(292 + Math.sin(a) * 18, 196 + Math.cos(a) * 18, 1.4));
  }

  // Landmarks (visible across the region): the Meridian, the elevator foundation, the refinery glow.
  props.push({
    asset: 'prop.meridian_freighter',
    x: 74,
    z: 262,
    rot: 0.5,
    landmark: true,
    colliders: [-24, -12, 0, 12, 24].map((x) => ({ x: 0, z: x, r: 9 })),
    light: { color: '#ff8a3a', intensity: 120, distance: 30, height: 6 },
  });
  props.push({ asset: 'prop.elevator_foundation', x: 318, z: 268, landmark: true, collider: 12 });
  props.push({ asset: 'prop.refinery_silhouette', x: 520, z: 470, rot: -0.7, landmark: true });
  return props;
}

function buildPacks(): PackSpawn[] {
  const rng = new Rng('cinder-flats-packs');
  const packs: PackSpawn[] = [];
  const hub = CINDER_FLATS_HUB;
  const safe = (x: number, z: number) =>
    Math.hypot(x - hub.x, z - hub.z) > hub.radius + 22 && Math.hypot(x - POD_SPAWN.x, z - POD_SPAWN.z) > 30;
  const templateAt = (x: number, z: number): string => {
    if (Math.hypot(x + 250, z + 200) < 110) return 'impact';
    if (Math.hypot(x - 232, z + 132) < 60) return 'military';
    if (z > 100) return x > 150 ? 'maw_approach' : 'valley';
    return 'road';
  };
  let n = 0;
  for (const road of ROADS) {
    alongRoad(road.points, 24, 18).forEach((p) => {
      const side = rng.chance(0.5) ? 1 : -1;
      const off = rng.range(4, 12) * side;
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (!safe(x, z) || Math.hypot(x - 292, z - 196) < 30) return;
      packs.push({ id: `pack.${n++}`, x, z, template: templateAt(x, z) });
    });
  }
  // Off-road packs reward exploration.
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-HALF + 20, HALF - 20);
    const z = rng.range(-HALF + 20, HALF - 20);
    const d = distanceToRoad(x, z);
    if (d < 20 || d > 90 || !safe(x, z)) continue;
    packs.push({ id: `pack.${n++}`, x, z, template: templateAt(x, z) });
  }
  return packs;
}

/** Points of interest (docs/regions/cinder-flats.md). Interaction arrives with the POI systems. */
function buildPois(): PoiDef[] {
  const rng = new Rng('cinder-flats-pois');
  const pois: PoiDef[] = [];
  const hub = CINDER_FLATS_HUB;
  const free = (x: number, z: number) => Math.hypot(x - hub.x, z - hub.z) > hub.radius + 4;
  // Supply crates along the roads (some off the road a little).
  ROADS.forEach((road) =>
    alongRoad(road.points, 70, 35).forEach((p, i) => {
      const off = (i % 2 ? 1 : -1) * rng.range(6, 14);
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (free(x, z)) pois.push({ id: `chest.${road.id}.${i}`, kind: 'chest', x, z });
    }),
  );
  // Locked chests with their keycard somewhere nearby.
  const locked: [number, number][] = [[-210, -170], [-20, -120], [180, -40], [-120, 180], [200, 150], [300, -60]];
  locked.forEach(([x, z], i) => {
    pois.push({ id: `locked.${i}`, kind: 'lockedChest', x, z, data: { key: `keycard.${i}` } });
    const a = rng.range(0, Math.PI * 2);
    pois.push({ id: `keycard.${i}`, kind: 'keycard', x: x + Math.sin(a) * 22, z: z + Math.cos(a) * 22, data: { opens: `locked.${i}` } });
  });
  const pylons = ['overcharge', 'kinetic', 'barrier', 'chainReaction', 'magnet', 'overclock'];
  const pylonAt: [number, number][] = [[-200, -130], [10, 0], [-70, 120], [200, 20], [250, 140], [130, -110]];
  pylonAt.forEach(([x, z], i) => pois.push({ id: `pylon.${i}`, kind: 'pylon', x, z, data: { type: pylons[i]! } }));
  const relics: [number, number][] = [
    [-320, -300], [-300, 40], [-200, 300], [-30, 290], [100, 320], [320, 320], [330, -320], [130, -200], [-120, -300], [0, 90],
  ];
  relics.forEach(([x, z], i) => pois.push({ id: `relic.${i}`, kind: 'relic', x, z, data: { stat: ['maxLife', 'damage', 'armor', 'moveSpeed', 'resourceGen'][i % 5]! } }));
  const lore: [number, number][] = [
    [-292, -212], [-262, -150], [-200, -92], [-150, -54], [-60, -30], [50, 30], [-70, 90], [-50, 200], [60, 236],
    [220, -110], [240, -150], [280, 160],
  ];
  lore.forEach(([x, z], i) => pois.push({ id: `lore.${i}`, kind: 'lore', x, z, data: { log: `cf.${i}` } }));
  const towers: [number, number][] = [[-292, -26], [40, 120], [176, -224]];
  towers.forEach(([x, z], i) => pois.push({ id: `tower.${i}`, kind: 'signalTower', x, z }));
  // Explosive barrels in clusters near fights.
  const barrelSpots: [number, number][] = [[-240, -120], [-40, -20], [130, 44], [230, -110], [-70, 150], [260, 110]];
  barrelSpots.forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) pois.push({ id: `barrel.${i}.${k}`, kind: 'barrel', x: x + rng.range(-3, 3), z: z + rng.range(-3, 3) });
  });
  pois.push(
    { id: 'dungeon.meridian', kind: 'dungeon', x: 54, z: 236, data: { dungeon: 'meridians_hold' } },
    { id: 'dungeon.sierra4', kind: 'dungeon', x: 292, z: -220, data: { dungeon: 'bunker_sierra4' } },
    { id: 'dungeon.drainage', kind: 'dungeon', x: -58, z: 62, data: { dungeon: 'drainage_tunnels' } },
    { id: 'stronghold.sierra', kind: 'stronghold', x: 232, z: -132 },
    { id: 'boss.first', kind: 'boss', x: 292, z: 196 },
    { id: 'feature.autocannon', kind: 'feature', x: 214, z: -118, data: { feature: 'autocannon' } },
    { id: 'feature.depot', kind: 'feature', x: 120, z: 64, data: { feature: 'fuelDepot' } },
  );
  const bunkers: [number, number][] = [[-250, -110], [-80, -200], [110, -50], [-190, 120], [150, 150], [320, 10]];
  bunkers.forEach(([x, z], i) => pois.push({ id: `bunker.${i}`, kind: 'bunker', x, z, data: { bunker: i } }));
  const events: [string, number, number][] = [
    ['convoy', 40, 18], ['sporeNest', -170, 210], ['rescue', 60, -160], ['signalJam', -20, -20], ['eliteHunt', -40, 220], ['supplyDrop', 100, 100],
  ];
  events.forEach(([type, x, z]) => pois.push({ id: `event.${type}`, kind: 'event', x, z, data: { event: type } }));
  return pois;
}

export const CINDER_FLATS: ZoneDef = {
  id: 'zone.cinder_flats',
  key: 'cinderFlats',
  halfSize: HALF,
  levels: [1, 10],
  playerSpawn: POD_SPAWN,
  ambient: { color: '#5a6170', intensity: 0.45 },
  moon: { color: '#8fa3c0', intensity: 1.1 },
  fog: { color: '#16161a', density: 0.022 },
  playerLight: { color: '#ffd2a1', intensity: 45, distance: 12 },
  props: buildProps(),
  scatter: [{ asset: 'env.debris_rock', count: 9000, seed: 'cinder-debris', minScale: 0.4, maxScale: 2.2 }],
  subzones: [
    { id: 'impactFields', center: [-250, -200], radius: 120 },
    { id: 'route7', center: [0, 0], radius: 0 },
    { id: 'ashValley', center: [-40, 200], radius: 150, storms: true },
    { id: 'checkpointSierra', center: [232, -132], radius: 90 },
  ],
  roads: ROADS,
  hubs: [CINDER_FLATS_HUB],
  teleporters: [
    { id: 'tp.ember', x: CINDER_FLATS_HUB.x + 6, z: CINDER_FLATS_HUB.z - 12, hub: true },
    { id: 'tp.impact', x: -262, z: -168 },
    { id: 'tp.route7', x: 118, z: 30 },
    { id: 'tp.valley', x: -78, z: 150 },
    { id: 'tp.sierra', x: 196, z: -78 },
    { id: 'tp.maw', x: 262, z: 150 },
  ],
  packs: buildPacks(),
  pois: buildPois(),
  mapCell: 8,
};
