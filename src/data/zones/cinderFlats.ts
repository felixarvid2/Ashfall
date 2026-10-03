/**
 * Region 1: Cinder Flats (levels 1–10). Plan and map: docs/regions/cinder-flats.md.
 * Hand-placed anchors (roads, hub, landmarks, POIs) plus deterministic, seeded decoration along
 * the roads and inside each subzone, so the layout is identical every time.
 */
import { Rng } from '../../core/rng';
import type { GroundDef, GroundPatch } from './testArena';
import type { PoiDef, PackSpawn, PropPlacement, Road, ZoneDef } from './zoneTypes';
import { alongRoad, clearOfProps, distanceToRoad as roadDistance, line } from './layout';

export { alongRoad };

/**
 * Layout scale: the coordinates below are design coordinates multiplied by S, so the region takes
 * 5–7 minutes to walk straight through (docs/world-and-gameplay.md §2.2). Hubs, compounds, arenas
 * and props keep their real size; only distances between places grow.
 */
export const CINDER_SCALE = 2.2;
const S = CINDER_SCALE;
/** A design coordinate pair in metres. */
export const at = (x: number, z: number): [number, number] => [x * S, z * S];
const scaled = (pts: [number, number][]): [number, number][] => pts.map(([x, z]) => at(x, z));

const HALF = Math.round(340 * S);


const ROADS: Road[] = [
  {
    // The escape pod → Outpost Ember → east along the highway → The Maw.
    id: 'route7',
    width: 9,
    points: scaled([
      [-305, -220], [-275, -160], [-235, -110], [-150, -82], [-90, -42], [-30, -12], [40, 18], [120, 40],
      [200, 58], [262, 86], [292, 132], [292, 172],
    ]),
  },
  {
    // North through Ash Valley to the Meridian, then east to the Maw.
    id: 'valley',
    width: 6,
    points: scaled([[-30, -12], [-62, 58], [-84, 140], [-44, 205], [40, 228], [140, 206], [232, 176], [292, 172]]),
  },
  {
    // South-east to Checkpoint Sierra and Bunker Sierra-4.
    id: 'sierra',
    width: 6,
    points: scaled([[120, 40], [160, -30], [214, -98], [238, -140], [290, -212]]),
  },
  {
    // West spur past the signal tower.
    id: 'spur',
    width: 5,
    points: scaled([[-235, -110], [-280, -50], [-290, -20], [-250, 60], [-190, 120]]),
  },
  {
    // Route 7 continues past The Maw to the border crossing into the Refinery District.
    id: 'border',
    width: 7,
    points: scaled([[292, 132], [325, 170], [330, 250], [334, 334]]),
  },
];

/** The border crossing at the north-east corner (Route 7 → the Refinery District). */
export const CINDER_GATE = {
  id: 'gate.cf.refinery',
  x: 334 * S,
  z: 334 * S,
  radius: 7,
  to: { zone: 'zone.refinery_district', gate: 'gate.rd.flats' },
  arrive: { x: 322 * S, z: 318 * S },
};

/** Shortest distance from a point to any Cinder Flats road. */
export const distanceToRoad = (x: number, z: number): number => roadDistance(x, z, ROADS);

export const CINDER_FLATS_HUB = { id: 'hub.ember', x: -150 * S, z: -66 * S, radius: 24 };
export const POD_SPAWN = { x: -300 * S, z: -228 * S };



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
  for (let i = 0; i < 60; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(25 * S, 110 * S);
    const x = -250 * S + Math.sin(a) * d;
    const z = -200 * S + Math.cos(a) * d;
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
  const cs = { x: 232 * S, z: -132 * S };
  props.push(...walledRing(cs.x, cs.z, 30, 24, [9, 10, 21, 22]));
  for (const [dx, dz] of [[-26, -26], [26, -26], [-26, 26], [26, 26]] as const) {
    props.push({ asset: 'prop.signal_tower', x: cs.x + dx, z: cs.z + dz, collider: 1, scale: 0.8 });
  }
  for (let i = 0; i < 8; i++) props.push(barricade(cs.x + rng.range(-18, 18), cs.z + rng.range(-18, 18), rng.range(0, 6.28)));
  for (let i = 0; i < 4; i++) props.push({ asset: 'prop.control_terminal', x: cs.x + rng.range(-12, 12), z: cs.z + rng.range(-12, 12), rot: rng.range(0, 6), collider: 0.45 });
  props.push(emergency(cs.x - 6, cs.z), emergency(cs.x + 6, cs.z));

  // Ash Valley: Lumen fields, broken pipes and debris.
  for (let i = 0; i < 240; i++) {
    const x = rng.range(-200 * S, 160 * S);
    const z = rng.range(100 * S, 320 * S);
    if (distanceToRoad(x, z) < 7) continue;
    const r = rng.next();
    if (r < 0.45) props.push(growth(x, z, rng.range(0.7, 1.8)));
    else if (r < 0.7) props.push({ asset: 'prop.pipe_section', x, z, rot: rng.range(0, 6.28), colliders: line(4, 0.6, 4) });
    else props.push(crate(x, z, rng.range(0, 6.28), rng.range(0.9, 1.3)));
  }

  // Scattered debris and wrecks elsewhere so no stretch of road is empty.
  for (let i = 0; i < 380; i++) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = rng.range(-HALF + 10, HALF - 10);
    const d = distanceToRoad(x, z);
    if (d < 6 || d > 60 * S) continue;
    if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + 6) continue;
    const r = rng.next();
    if (r < 0.3) props.push(crate(x, z, rng.range(0, 6.28)));
    else if (r < 0.5) props.push({ asset: 'prop.pipe_section', x, z, rot: rng.range(0, 6.28), colliders: line(4, 0.6, 4) });
    else if (r < 0.65) props.push(fire(x, z, rng.range(0.8, 1.1)));
    else if (r < 0.85) props.push(growth(x, z, rng.range(0.8, 1.4)));
    else props.push({ asset: 'prop.crashed_lander', x, z, rot: rng.range(0, 6.28), scale: 0.8, colliders: line(4, 1.2, 4) });
  }

  // The Maw: the boss arena ringed by walls and wreckage.
  const maw = { x: 292 * S, z: 196 * S };
  props.push(...walledRing(maw.x, maw.z, 26, 22, [0, 1, 11]));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    props.push(growth(maw.x + Math.sin(a) * 18, maw.z + Math.cos(a) * 18, 1.4));
  }

  // Landmarks (visible across the region): the Meridian, the elevator foundation, the refinery glow.
  props.push({
    asset: 'prop.meridian_freighter',
    x: 74 * S,
    z: 262 * S,
    rot: 0.5,
    landmark: true,
    colliders: [-24, -12, 0, 12, 24].map((x) => ({ x: 0, z: x, r: 9 })),
    light: { color: '#ff8a3a', intensity: 120, distance: 30, height: 6 },
  });
  props.push({ asset: 'prop.elevator_foundation', x: 318 * S, z: 268 * S, landmark: true, collider: 12 });
  // Beyond the north-east edge, pointing the way to region 2.
  props.push({ asset: 'prop.refinery_silhouette', x: HALF + 150, z: HALF + 100, rot: -0.7, landmark: true });
  return props;
}

function buildPacks(): PackSpawn[] {
  const rng = new Rng('cinder-flats-packs');
  const packs: PackSpawn[] = [];
  const hub = CINDER_FLATS_HUB;
  const safe = (x: number, z: number) =>
    Math.hypot(x - hub.x, z - hub.z) > hub.radius + 22 && Math.hypot(x - POD_SPAWN.x, z - POD_SPAWN.z) > 30;
  const templateAt = (x: number, z: number): string => {
    if (Math.hypot(x + 250 * S, z + 200 * S) < 110 * S) return 'impact';
    if (Math.hypot(x - 232 * S, z + 132 * S) < 60 * S) return 'military';
    if (z > 100 * S) return x > 150 * S ? 'maw_approach' : 'valley';
    return 'road';
  };
  let n = 0;
  for (const road of ROADS) {
    alongRoad(road.points, 26, 18).forEach((p) => {
      const side = rng.chance(0.5) ? 1 : -1;
      const off = rng.range(4, 12) * side;
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (!safe(x, z) || Math.hypot(x - 292 * S, z - 196 * S) < 30) return;
      packs.push({ id: `pack.${n++}`, x, z, template: templateAt(x, z) });
    });
  }
  // Off-road packs reward exploration.
  for (let i = 0; i < 160; i++) {
    const x = rng.range(-HALF + 20, HALF - 20);
    const z = rng.range(-HALF + 20, HALF - 20);
    const d = distanceToRoad(x, z);
    if (d < 20 || d > 90 * S || !safe(x, z)) continue;
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
  const locked: [number, number][] = scaled([[-210, -170], [-20, -120], [180, -40], [-120, 180], [200, 150], [300, -60]]);
  locked.forEach(([x, z], i) => {
    pois.push({ id: `locked.${i}`, kind: 'lockedChest', x, z, data: { key: `keycard.${i}` } });
    const a = rng.range(0, Math.PI * 2);
    pois.push({ id: `keycard.${i}`, kind: 'keycard', x: x + Math.sin(a) * 22, z: z + Math.cos(a) * 22, data: { opens: `locked.${i}` } });
  });
  const pylons = ['overcharge', 'kinetic', 'barrier', 'chainReaction', 'magnet', 'overclock'];
  const pylonAt: [number, number][] = scaled([[-200, -130], [10, 0], [-70, 120], [200, 20], [250, 140], [130, -110]]);
  pylonAt.forEach(([x, z], i) => pois.push({ id: `pylon.${i}`, kind: 'pylon', x, z, data: { type: pylons[i]! } }));
  const relics: [number, number][] = scaled([
    [-320, -300], [-300, 40], [-200, 300], [-30, 290], [100, 320], [320, 320], [330, -320], [130, -200], [-120, -300], [0, 90],
  ]);
  relics.forEach(([x, z], i) => pois.push({ id: `relic.${i}`, kind: 'relic', x, z, data: { stat: ['maxLife', 'damage', 'armor', 'moveSpeed', 'resourceGen'][i % 5]! } }));
  const lore: [number, number][] = scaled([
    [-292, -212], [-262, -150], [-200, -92], [-150, -54], [-60, -30], [50, 30], [-70, 90], [-50, 200], [60, 236],
    [220, -110], [240, -150], [280, 160],
  ]);
  lore.forEach(([x, z], i) => pois.push({ id: `lore.${i}`, kind: 'lore', x, z, data: { log: `cf.${i}` } }));
  const towers: [number, number][] = scaled([[-292, -26], [40, 120], [176, -224]]);
  towers.forEach(([x, z], i) => pois.push({ id: `tower.${i}`, kind: 'signalTower', x, z }));
  // Explosive barrels in clusters near fights.
  const barrelSpots: [number, number][] = scaled([[-240, -120], [-40, -20], [130, 44], [230, -110], [-70, 150], [260, 110]]);
  barrelSpots.forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) pois.push({ id: `barrel.${i}.${k}`, kind: 'barrel', x: x + rng.range(-3, 3), z: z + rng.range(-3, 3) });
  });
  pois.push(
    { id: 'dungeon.meridian', kind: 'dungeon', x: 54 * S, z: 236 * S, data: { dungeon: 'meridians_hold' } },
    { id: 'dungeon.sierra4', kind: 'dungeon', x: 292 * S, z: -220 * S, data: { dungeon: 'bunker_sierra4' } },
    { id: 'dungeon.drainage', kind: 'dungeon', x: -58 * S, z: 62 * S, data: { dungeon: 'drainage_tunnels' } },
    { id: 'stronghold.sierra', kind: 'stronghold', x: 232 * S, z: -132 * S },
    { id: 'boss.first', kind: 'boss', x: 292 * S, z: 196 * S },
    { id: 'feature.autocannon', kind: 'feature', x: 232 * S - 18, z: -132 * S + 14, data: { feature: 'autocannon' } },
    { id: 'feature.depot', kind: 'feature', x: 120 * S, z: 64 * S, data: { feature: 'fuelDepot' } },
  );
  const bunkers: [number, number][] = scaled([[-250, -110], [-80, -200], [110, -50], [-190, 120], [150, 150], [320, 10]]);
  bunkers.forEach(([x, z], i) => pois.push({ id: `bunker.${i}`, kind: 'bunker', x, z, data: { bunker: i } }));
  const events: [string, number, number][] = [
    ['convoy', 40, 18], ['sporeNest', -170, 210], ['rescue', 60, -160], ['signalJam', -20, -20], ['eliteHunt', -40, 220], ['supplyDrop', 100, 100],
  ];
  events.forEach(([type, x, z]) => pois.push({ id: `event.${type}`, kind: 'event', x: x * S, z: z * S, data: { event: type } }));
  return pois;
}


const PROPS = buildProps();

/**
 * Ground textures: ash everywhere, scorched earth over the Impact Fields and under every fire and
 * wreck, Lumen-infested ground in Ash Valley, at The Maw and under each growth, concrete inside
 * Outpost Ember and Checkpoint Sierra, and cracked asphalt on the roads.
 */
function buildGround(): GroundDef {
  const SCORCHED = 0;
  const LUMEN = 1;
  const CONCRETE = 2;
  const patches: GroundPatch[] = [
    { layer: SCORCHED, x: -250 * S, z: -200 * S, radius: 105 * S, strength: 0.75 },
    { layer: LUMEN, x: -40 * S, z: 210 * S, radius: 120 * S, strength: 0.55 },
    { layer: LUMEN, x: 292 * S, z: 196 * S, radius: 24 },
    { layer: CONCRETE, x: CINDER_FLATS_HUB.x, z: CINDER_FLATS_HUB.z, radius: CINDER_FLATS_HUB.radius - 5 },
    { layer: CONCRETE, x: 232 * S, z: -132 * S, radius: 25 },
  ];
  for (const p of PROPS) {
    const scale = p.scale ?? 1;
    if (p.asset === 'prop.fuel_tank') patches.push({ layer: SCORCHED, x: p.x, z: p.z, radius: 6 * scale });
    else if (p.asset === 'prop.crashed_lander') patches.push({ layer: SCORCHED, x: p.x, z: p.z, radius: 7 * scale, strength: 0.8 });
    else if (p.asset === 'prop.lumen_growth') patches.push({ layer: LUMEN, x: p.x, z: p.z, radius: 3.5 * scale, strength: 0.9 });
  }
  return { base: 'ash_plain', tile: 9, layers: ['scorched_ground', 'lumen_infested', 'military_concrete'], patches, road: 'cracked_asphalt' };
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
  props: PROPS,
  scatter: [{ asset: 'env.debris_rock', count: 30000, seed: 'cinder-debris', minScale: 0.4, maxScale: 2.2 }],
  ground: buildGround(),
  subzones: [
    { id: 'impactFields', center: at(-250, -200), radius: 120 * S },
    { id: 'route7', center: [0, 0], radius: 0 },
    { id: 'ashValley', center: at(-40, 200), radius: 150 * S, storms: true },
    { id: 'checkpointSierra', center: at(232, -132), radius: 90 * S },
  ],
  roads: ROADS,
  hubs: [CINDER_FLATS_HUB],
  teleporters: [
    { id: 'tp.ember', x: CINDER_FLATS_HUB.x + 6, z: CINDER_FLATS_HUB.z - 12, hub: true },
    { id: 'tp.impact', x: -262 * S, z: -168 * S },
    { id: 'tp.route7', x: 118 * S, z: 30 * S },
    { id: 'tp.valley', x: -78 * S, z: 150 * S },
    { id: 'tp.sierra', x: 196 * S, z: -78 * S },
    { id: 'tp.maw', x: 262 * S, z: 150 * S },
  ],
  packs: buildPacks(),
  pois: clearOfProps(buildPois(), PROPS),
  mapCell: 8,
  gates: [CINDER_GATE],
  region: 1,
};
