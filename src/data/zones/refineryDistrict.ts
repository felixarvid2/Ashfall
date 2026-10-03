/**
 * Region 2: The Refinery District (levels 10–20). Plan and map: docs/regions/refinery-district.md.
 * Like Cinder Flats: design coordinates × 2.2, hand-placed anchors plus seeded decoration, so the
 * layout is the same every time. Every id is prefixed `rd.` so it never collides with region 1
 * (relics are stored account-wide by id).
 */
import { Rng } from '../../core/rng';
import { alongRoad, clearOfProps, distanceToRoad as roadDistance, line } from './layout';
import type { EnvFeature, PackSpawn, PoiDef, PropPlacement, Road, ZoneDef } from './zoneTypes';

const S = 2.2;
/** A design coordinate pair in metres. */
export const rd = (x: number, z: number): [number, number] => [x * S, z * S];
const scaled = (pts: [number, number][]): [number, number][] => pts.map(([x, z]) => rd(x, z));

const HALF = Math.round(340 * S);

const ROADS: Road[] = [
  // From the border crossing (Route 7 out of Cinder Flats) up to the Coolant Works.
  { id: 'route7', width: 9, points: scaled([[-334, -334], [-305, -290], [-262, -238], [-215, -175], [-175, -120], [-150, -96]]) },
  // The district's spine: Foundry Road from the hub to the Cathedral steps.
  {
    id: 'foundry',
    width: 8,
    points: scaled([[-150, -96], [-105, -50], [-50, -5], [0, 25], [40, 70], [80, 100], [150, 104], [220, 100], [240, 160], [215, 215]]),
  },
  { id: 'conveyor', width: 6, points: scaled([[-150, -96], [-200, -60], [-250, -20], [-290, 30], [-300, 90]]) },
  { id: 'stacks', width: 5, points: scaled([[-50, -5], [-75, 70], [-110, 140], [-160, 200], [-210, 250], [-250, 300]]) },
  { id: 'slag', width: 6, points: scaled([[0, 25], [60, -20], [110, -80], [150, -150], [190, -220], [240, -270]]) },
  { id: 'smelter', width: 6, points: scaled([[220, 100], [265, 50], [290, -10], [300, -60]]) },
  { id: 'delta', width: 6, points: scaled([[-215, -175], [-150, -190], [-100, -190]]) },
  // Narrow trails winding through the Smokestack Forest.
  { id: 'trailA', width: 3, points: scaled([[-110, 140], [-170, 130], [-230, 160], [-280, 210], [-300, 270]]) },
  { id: 'trailB', width: 3, points: scaled([[-160, 200], [-120, 250], [-90, 300], [-30, 320]]) },
];

const distanceToRoad = (x: number, z: number): number => roadDistance(x, z, ROADS);

export const COOLANT_WORKS = { id: 'hub.coolant', x: -150 * S, z: -90 * S, radius: 24 };
export const DELTA = { id: 'rd.stronghold.delta', x: -90 * S, z: -190 * S, radius: 30 };
export const CATHEDRAL = { id: 'rd.boss.vire', x: 220 * S, z: 262 * S, radius: 28 };
export const PILLAR = { x: 10 * S, z: 165 * S };
export const CRANE = { x: 150 * S, z: -60 * S };
/** The Smelters' shrine in the Smokestack Forest (main quest "The Faithful"): a clearing among the stacks. */
export const SHRINE = { x: -205 * S, z: 262 * S, radius: 16 };

/** The border crossing at the south-west corner, back to Cinder Flats. */
export const DISTRICT_GATE = {
  id: 'gate.rd.flats',
  x: -334 * S,
  z: -334 * S,
  radius: 7,
  to: { zone: 'zone.cinder_flats', gate: 'gate.cf.refinery' },
  arrive: { x: -322 * S, z: -318 * S },
};

const SUBZONES = {
  conveyor: { c: rd(-220, -20), r: 110 * S },
  slag: { c: rd(150, -90), r: 130 * S },
  cathedral: { c: rd(200, 250), r: 100 * S },
  stacks: { c: rd(-180, 230), r: 120 * S },
};
const inSub = (x: number, z: number, s: { c: [number, number]; r: number }) => Math.hypot(x - s.c[0], z - s.c[1]) < s.r;

// ---- Environment: belts, molten metal, vents -------------------------------------------------

function buildEnv(): EnvFeature[] {
  const rng = new Rng('refinery-env');
  const env: EnvFeature[] = [];
  // The Conveyor Lines: rows of belts running east or west, broken where roads cross.
  for (let row = 0; row < 6; row++) {
    const z = (-72 + row * 22) * S;
    const dir = row % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let x = -322 * S; x < -170 * S; x += 46) {
      const cx = x + 20;
      if (distanceToRoad(cx - 20, z) < 9 || distanceToRoad(cx, z) < 9 || distanceToRoad(cx + 20, z) < 9) continue;
      if (Math.hypot(cx - COOLANT_WORKS.x, z - COOLANT_WORKS.z) < COOLANT_WORKS.radius + 24) continue;
      env.push({ kind: 'conveyor', id: `rd.belt.${row}.${env.length}`, x: cx, z, length: 40, width: 4, dir, speed: 3.2 });
    }
  }
  // The Slag Fields: rivers of molten metal (bridged where a road crosses) and a few pools.
  const rivers: [number, number][][] = [
    scaled([[70, 40], [110, -30], [160, -75], [220, -115], [300, -130], [338, -128]]),
    scaled([[60, -150], [120, -175], [180, -185], [240, -215], [320, -210]]),
    scaled([[175, 20], [190, -40], [200, -110], [215, -180]]),
  ];
  let n = 0;
  for (const river of rivers) {
    for (const p of alongRoad(river, 7)) {
      if (distanceToRoad(p.x, p.z) < 10) continue;
      if (Math.abs(p.x) > HALF - 6 || Math.abs(p.z) > HALF - 6) continue;
      env.push({ kind: 'molten', id: `rd.molten.${n++}`, x: p.x, z: p.z, radius: rng.range(4.2, 6.2) });
    }
  }
  for (const [x, z, r] of [
    [300, 20, 9], [250, -250, 8], [260, 300, 7], [160, 300, 7], [-20, 160, 6],
  ] as const) env.push({ kind: 'molten', id: `rd.molten.${n++}`, x: x * S, z: z * S, radius: r });
  // Vents: fire in the Slag Fields, Smokestack Forest and around the Cathedral; steam near the hub.
  let v = 0;
  const vent = (x: number, z: number, element: 'fire' | 'steam') => {
    if (distanceToRoad(x, z) < 4 || Math.hypot(x - COOLANT_WORKS.x, z - COOLANT_WORKS.z) < COOLANT_WORKS.radius + 4) return;
    env.push({ kind: 'vent', id: `rd.vent.${v++}`, x, z, radius: 3.2, period: rng.range(6, 9), offset: rng.range(0, 6), element });
  };
  for (let i = 0; i < 40 && v < 14; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(10, SUBZONES.slag.r * 0.9);
    vent(SUBZONES.slag.c[0] + Math.sin(a) * d, SUBZONES.slag.c[1] + Math.cos(a) * d, 'fire');
  }
  // Along the forest trails, where the path is narrow and timing matters.
  for (const road of ROADS.filter((r) => r.id === 'stacks' || r.id.startsWith('trail'))) {
    alongRoad(road.points, 48, 30).forEach((p, i) => vent(p.x - p.dz * (i % 2 ? 4.5 : -4.5), p.z + p.dx * (i % 2 ? 4.5 : -4.5), 'fire'));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    vent(CATHEDRAL.x + Math.sin(a) * 42, CATHEDRAL.z + Math.cos(a) * 42, 'fire');
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.8;
    vent(COOLANT_WORKS.x + Math.sin(a) * 34, COOLANT_WORKS.z + Math.cos(a) * 34, 'steam');
  }
  return env;
}

export const DISTRICT_ENV = buildEnv();

// ---- Props ------------------------------------------------------------------------------------

const lamp = (x: number, z: number, color = '#ff7a1a'): PropPlacement => ({
  asset: 'prop.emergency_light',
  x,
  z,
  collider: 0.3,
  light: { color, intensity: 90, distance: 16, height: 3.1 },
});
const crate = (x: number, z: number, rot: number, scale = 1): PropPlacement => ({ asset: 'prop.cargo_crate', x, z, rot, scale, collider: 0.95 * scale });
const wall = (x: number, z: number, rot: number): PropPlacement => ({ asset: 'env.industrial_wall', x, z, rot, colliders: line(5.6, 0.6, 6) });
const stack = (x: number, z: number, scale: number): PropPlacement => ({
  asset: 'env.smokestack',
  x,
  z,
  scale,
  collider: 1.7 * scale,
  // Embers glow at every stack's base (the forest is otherwise pitch dark).
  light: { color: '#ff5a1a', intensity: scale > 1.15 ? 45 : 26, distance: scale > 1.15 ? 13 : 9, height: 1.2 },
});
const furnace = (x: number, z: number, rot: number): PropPlacement => ({
  asset: 'env.furnace_block',
  x,
  z,
  rot,
  colliders: line(5, 2.2, 3),
  light: { color: '#ff6a1a', intensity: 80, distance: 18, height: 2.2 },
});

function ring(cx: number, cz: number, radius: number, segments: number, gaps: number[]): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let i = 0; i < segments; i++) {
    if (gaps.includes(i)) continue;
    const a = (i / segments) * Math.PI * 2;
    out.push(wall(cx + Math.sin(a) * radius, cz + Math.cos(a) * radius, a + Math.PI / 2));
  }
  return out;
}

function buildProps(): PropPlacement[] {
  const rng = new Rng('refinery-props');
  const props: PropPlacement[] = [];
  const hub = COOLANT_WORKS;
  const nearPlace = (x: number, z: number, pad: number) =>
    [hub, DELTA, CATHEDRAL].some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + pad) ||
    Math.hypot(x - DISTRICT_GATE.x, z - DISTRICT_GATE.z) < 30;
  const onEnv = (x: number, z: number, pad: number) =>
    DISTRICT_ENV.some((e) =>
      e.kind === 'conveyor'
        ? Math.abs(z - e.z) < e.width / 2 + pad && Math.abs(x - e.x) < e.length / 2 + pad
        : Math.hypot(x - e.x, z - e.z) < e.radius + pad,
    );

  // Sodium lamps along every road (not the narrow trails).
  for (const road of ROADS) {
    if (road.id.startsWith('trail')) continue;
    alongRoad(road.points, road.id === 'foundry' || road.id === 'route7' ? 28 : 38, 12).forEach((p, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const off = road.width / 2 + 2;
      const x = p.x - p.dz * off * side;
      const z = p.z + p.dx * off * side;
      if (nearPlace(x, z, 2) || onEnv(x, z, 1)) return;
      props.push(lamp(x, z, '#ffa040'));
    });
  }

  // The border crossing: a broken checkpoint where Route 7 enters.
  const g = { x: DISTRICT_GATE.arrive.x + 10, z: DISTRICT_GATE.arrive.z + 10 };
  props.push({ asset: 'prop.barricade', x: g.x + 8, z: g.z - 4, rot: 0.8, colliders: line(2.2, 0.6, 3) });
  props.push({ asset: 'prop.barricade', x: g.x - 6, z: g.z + 8, rot: 0.7, colliders: line(2.2, 0.6, 3) });
  props.push(lamp(g.x + 4, g.z - 8), lamp(g.x - 8, g.z + 4));

  // The Coolant Works: pump house inside a walled yard; frost-blue lamps.
  props.push({ asset: 'env.pump_house', x: hub.x - 7, z: hub.z - 7, rot: Math.PI / 4, colliders: [{ x: -3, z: 0, r: 3.2 }, { x: 3, z: 0, r: 3.2 }] });
  props.push(...ring(hub.x, hub.z, hub.radius - 2, 14, [3, 4, 10, 11]));
  props.push(lamp(hub.x - 9, hub.z + 9, '#7ad8ff'), lamp(hub.x + 9, hub.z - 9, '#7ad8ff'), lamp(hub.x + 10, hub.z + 11, '#7ad8ff'));
  props.push({ asset: 'prop.generator', x: hub.x + 10, z: hub.z - 1, rot: 1.2, collider: 1 });
  props.push(crate(hub.x - 12, hub.z + 2, 0.4), crate(hub.x - 12, hub.z + 4, 1.1));

  // Pump Station Delta: walled compound with pipes and terminals (the stronghold).
  props.push(...ring(DELTA.x, DELTA.z, DELTA.radius, 18, [5, 6, 14, 15]));
  props.push({ asset: 'env.pump_house', x: DELTA.x + 4, z: DELTA.z - 6, rot: 0.3, colliders: [{ x: -3, z: 0, r: 3.2 }, { x: 3, z: 0, r: 3.2 }] });
  for (let i = 0; i < 4; i++) props.push({ asset: 'prop.control_terminal', x: DELTA.x + rng.range(-14, 14), z: DELTA.z + rng.range(-14, 14), rot: rng.range(0, 6), collider: 0.45 });
  for (let i = 0; i < 4; i++) props.push({ asset: 'env.pipe_cluster', x: DELTA.x + rng.range(-20, 20), z: DELTA.z + rng.range(-20, 20), rot: rng.range(0, 6), colliders: line(4, 1, 3) });

  // The Conveyor Lines: crates stacked beside the belts, catwalks across them.
  for (const e of DISTRICT_ENV) {
    if (e.kind !== 'conveyor') continue;
    const side = rng.chance(0.5) ? 1 : -1;
    props.push(crate(e.x + rng.range(-14, 14), e.z + side * (e.width / 2 + 2.2), rng.range(0, 6.28), rng.range(0.9, 1.3)));
    if (rng.chance(0.35)) props.push({ asset: 'env.catwalk', x: e.x + rng.range(-10, 10), z: e.z, rot: 0, collider: 0.5 });
  }

  // The Smokestack Forest: hundreds of stacks on a jittered grid, the trails left open.
  const st = SUBZONES.stacks;
  for (let x = st.c[0] - st.r; x < st.c[0] + st.r; x += 21) {
    for (let z = st.c[1] - st.r; z < st.c[1] + st.r; z += 21) {
      const px = x + rng.range(-7, 7);
      const pz = z + rng.range(-7, 7);
      if (!inSub(px, pz, st) || Math.abs(px) > HALF - 6 || Math.abs(pz) > HALF - 6) continue;
      if (distanceToRoad(px, pz) < 6 || onEnv(px, pz, 2)) continue;
      if (Math.hypot(px - SHRINE.x, pz - SHRINE.z) < SHRINE.radius) continue;
      if (rng.chance(0.7)) props.push(stack(px, pz, rng.range(0.8, 1.3)));
      else props.push({ asset: 'env.pipe_cluster', x: px, z: pz, rot: rng.range(0, 6.28), colliders: line(4, 1, 3) });
    }
  }

  // The Slag Fields: slag heaps between the rivers.
  for (let i = 0; i < 160; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, SUBZONES.slag.r);
    const x = SUBZONES.slag.c[0] + Math.sin(a) * d;
    const z = SUBZONES.slag.c[1] + Math.cos(a) * d;
    if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6 || distanceToRoad(x, z) < 6 || onEnv(x, z, 2)) continue;
    props.push({ asset: 'env.slag_rock', x, z, rot: rng.range(0, 6.28), scale: rng.range(0.7, 1.6), collider: 1.3 });
  }

  // The Cathedral: a walled precinct with furnaces burning along its approach.
  props.push(...ring(CATHEDRAL.x, CATHEDRAL.z, CATHEDRAL.radius, 20, [10, 11]));
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = CATHEDRAL.x + (rd(215, 215)[0] - CATHEDRAL.x) * t * 1.4;
    const z = CATHEDRAL.z - 40 - t * 40;
    props.push(furnace(x + (i % 2 ? 14 : -14), z, Math.PI / 2));
  }

  // Industrial clutter elsewhere so no stretch of road is empty.
  for (let i = 0; i < 420; i++) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = rng.range(-HALF + 10, HALF - 10);
    const d = distanceToRoad(x, z);
    if (d < 6 || d > 60 * S || nearPlace(x, z, 6) || onEnv(x, z, 2)) continue;
    if (inSub(x, z, st)) continue;
    const r = rng.next();
    if (r < 0.3) props.push(crate(x, z, rng.range(0, 6.28)));
    else if (r < 0.5) props.push({ asset: 'prop.pipe_section', x, z, rot: rng.range(0, 6.28), colliders: line(4, 0.6, 4) });
    else if (r < 0.65) props.push({ asset: 'env.pipe_cluster', x, z, rot: rng.range(0, 6.28), colliders: line(4, 1, 3) });
    else if (r < 0.8) props.push({ asset: 'prop.fuel_tank', x, z, rot: rng.range(0, 6.28), collider: 1.1, light: { color: '#ff5a1a', intensity: 50, distance: 12, height: 1.4 } });
    else if (r < 0.9) props.push(stack(x, z, rng.range(0.8, 1.1)));
    else props.push({ asset: 'env.slag_rock', x, z, rot: rng.range(0, 6.28), collider: 1.3 });
  }

  // Vent grates (the blast itself is a telegraph and an effect, src/world/environment.ts).
  for (const e of DISTRICT_ENV) if (e.kind === 'vent') props.push({ asset: 'prop.vent', x: e.x, z: e.z, rot: (e.x + e.z) % 6.28 });

  // Landmarks, visible across the district.
  props.push({
    asset: 'prop.the_pillar',
    x: PILLAR.x,
    z: PILLAR.z,
    landmark: true,
    collider: 9,
    light: { color: '#ff6a1a', intensity: 160, distance: 40, height: 10 },
  });
  props.push({ asset: 'prop.giant_crane', x: CRANE.x, z: CRANE.z, rot: 0.6, landmark: true, colliders: [{ x: -10, z: 0, r: 3 }, { x: 10, z: 0, r: 3 }] });
  props.push({
    asset: 'prop.smelters_cathedral',
    x: CATHEDRAL.x,
    z: CATHEDRAL.z + CATHEDRAL.radius + 18,
    landmark: true,
    colliders: [-14, 0, 14].map((x) => ({ x, z: 0, r: 9 })),
    light: { color: '#ff8a3a', intensity: 140, distance: 36, height: 8 },
  });
  return props;
}

// ---- Packs ------------------------------------------------------------------------------------

function buildPacks(): PackSpawn[] {
  const rng = new Rng('refinery-packs');
  const packs: PackSpawn[] = [];
  const safe = (x: number, z: number) =>
    Math.hypot(x - COOLANT_WORKS.x, z - COOLANT_WORKS.z) > COOLANT_WORKS.radius + 22 &&
    Math.hypot(x - DISTRICT_GATE.arrive.x, z - DISTRICT_GATE.arrive.z) > 40 &&
    Math.hypot(x - CATHEDRAL.x, z - CATHEDRAL.z) > CATHEDRAL.radius + 6;
  const templateAt = (x: number, z: number): string => {
    if (inSub(x, z, SUBZONES.stacks)) return 'rd_stacks';
    if (inSub(x, z, SUBZONES.cathedral)) return 'rd_cathedral';
    if (inSub(x, z, SUBZONES.slag)) return 'rd_slag';
    if (inSub(x, z, SUBZONES.conveyor)) return 'rd_conveyor';
    return 'rd_road';
  };
  let n = 0;
  // A little sparser than Cinder Flats' roads (5–8 s between fights, docs/regions/cinder-flats-playtest.md).
  for (const road of ROADS) {
    alongRoad(road.points, 31, 20).forEach((p) => {
      const side = rng.chance(0.5) ? 1 : -1;
      const off = rng.range(4, 12) * side;
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (!safe(x, z)) return;
      packs.push({ id: `rd.pack.${n++}`, x, z, template: templateAt(x, z) });
    });
  }
  for (let i = 0; i < 160; i++) {
    const x = rng.range(-HALF + 20, HALF - 20);
    const z = rng.range(-HALF + 20, HALF - 20);
    const d = distanceToRoad(x, z);
    if (d < 20 || d > 90 * S || !safe(x, z)) continue;
    packs.push({ id: `rd.pack.${n++}`, x, z, template: templateAt(x, z) });
  }
  return packs;
}

// ---- Points of interest -----------------------------------------------------------------------

/** Points of interest without a set piece behind them yet (dungeons, events and the stronghold arrive with their systems). */
function buildPois(): PoiDef[] {
  const rng = new Rng('refinery-pois');
  const pois: PoiDef[] = [];
  const free = (x: number, z: number) => Math.hypot(x - COOLANT_WORKS.x, z - COOLANT_WORKS.z) > COOLANT_WORKS.radius + 4;
  ROADS.forEach((road) =>
    alongRoad(road.points, 72, 36).forEach((p, i) => {
      const off = (i % 2 ? 1 : -1) * rng.range(6, 14);
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (free(x, z)) pois.push({ id: `rd.chest.${road.id}.${i}`, kind: 'chest', x, z });
    }),
  );
  const locked = scaled([[-290, -150], [-60, -110], [120, 30], [-230, 120], [260, 170], [300, -250]]);
  locked.forEach(([x, z], i) => {
    pois.push({ id: `rd.locked.${i}`, kind: 'lockedChest', x, z, data: { key: `rd.keycard.${i}` } });
    const a = rng.range(0, Math.PI * 2);
    pois.push({ id: `rd.keycard.${i}`, kind: 'keycard', x: x + Math.sin(a) * 22, z: z + Math.cos(a) * 22, data: { opens: `rd.locked.${i}` } });
  });
  const pylons = ['overcharge', 'kinetic', 'barrier', 'chainReaction', 'magnet', 'overclock'];
  scaled([[-240, -60], [-20, 0], [120, -120], [-120, 180], [180, 120], [270, -20]]).forEach(([x, z], i) =>
    pois.push({ id: `rd.pylon.${i}`, kind: 'pylon', x, z, data: { type: pylons[i]! } }),
  );
  // Hidden: on belt ends, behind smokestacks, on slag islands.
  scaled([
    [-328, -72], [-172, 38], [-300, 300], [-60, 320], [-200, 270], [130, -110], [230, -165], [330, 330], [320, -320], [40, -300],
  ]).forEach(([x, z], i) => pois.push({ id: `rd.relic.${i}`, kind: 'relic', x, z, data: { stat: ['maxLife', 'damage', 'armor', 'moveSpeed', 'resourceGen'][i % 5]! } }));
  scaled([
    [-318, -300], [-250, -200], [-165, -110], [-130, -80], [-80, -180], [-240, 0], [-120, 160], [-200, 240], [30, 60], [160, -60], [250, 40], [200, 210],
  ]).forEach(([x, z], i) => pois.push({ id: `rd.lore.${i}`, kind: 'lore', x, z, data: { log: `rd.${i}` } }));
  // One signal tower per outer subzone.
  scaled([[-290, -80], [-250, 200], [210, -230]]).forEach(([x, z], i) => pois.push({ id: `rd.tower.${i}`, kind: 'signalTower', x, z }));
  scaled([[-230, -30], [-40, 0], [100, 95], [140, -150], [-150, 210], [280, 30]]).forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) pois.push({ id: `rd.barrel.${i}.${k}`, kind: 'barrel', x: x + rng.range(-3, 3), z: z + rng.range(-3, 3) });
  });
  // Maintenance tunnels and control rooms.
  scaled([[-300, -230], [-200, -10], [60, -60], [-60, 230], [300, 100], [170, 300]]).forEach(([x, z], i) =>
    pois.push({ id: `rd.bunker.${i}`, kind: 'bunker', x, z, data: { bunker: i, instance: 'rd_bunker' } }),
  );
  const at = (x: number, z: number) => ({ x: x * S, z: z * S });
  pois.push(
    { id: 'rd.dungeon.smelter3', kind: 'dungeon', ...at(305, -72), data: { dungeon: 'smelter_3' } },
    { id: 'rd.dungeon.pipes', kind: 'dungeon', ...at(-262, 312), data: { dungeon: 'pipe_alleys' } },
    { id: 'rd.dungeon.crypt', kind: 'dungeon', ...at(130, 236), data: { dungeon: 'cathedral_crypt' } },
    { id: 'rd.dungeon.coldhall', kind: 'dungeon', ...at(-236, -128), data: { dungeon: 'cold_hall' } },
    { id: DELTA.id, kind: 'stronghold', x: DELTA.x, z: DELTA.z },
    { id: CATHEDRAL.id, kind: 'boss', x: CATHEDRAL.x, z: CATHEDRAL.z },
    {
      id: 'rd.feature.crane',
      kind: 'feature',
      x: CRANE.x + 18,
      z: CRANE.z - 12,
      data: { feature: 'crane', drops: [[-14, 8], [0, 15], [14, 8]].map(([dx, dz]) => `${CRANE.x + dx!},${CRANE.z + dz!}`).join(';') },
    },
  );
  // Coolant valves beside the slag rivers: steam a crossing open for a few seconds.
  const rivers = DISTRICT_ENV.filter((e): e is Extract<EnvFeature, { kind: 'molten' }> => e.kind === 'molten');
  [0.2, 0.45, 0.75].forEach((t, i) => {
    const m = rivers[Math.floor(rivers.length * t * 0.8)]!;
    // The first spot on the bank (around the pool, a little further out each ring) that is dry.
    outer: for (let ring = 0; ring < 4; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = m.x + Math.sin(a) * (m.radius + 3.5 + ring * 3);
        const z = m.z + Math.cos(a) * (m.radius + 3.5 + ring * 3);
        if (DISTRICT_ENV.some((f) => f.kind === 'molten' && Math.hypot(f.x - x, f.z - z) < f.radius + 1.5)) continue;
        pois.push({ id: `rd.feature.valve.${i}`, kind: 'feature', x, z, data: { feature: 'coolantValve' } });
        break outer;
      }
    }
  });
  const events: [string, number, number][] = [
    ['runawayBelt', -240, -40], ['slagTide', 150, -120], ['purgeFurnace', -200, 205], ['smelterRaid', -60, -30], ['eliteHunt', 40, -230], ['supplyDrop', 250, 30],
  ];
  events.forEach(([type, x, z]) => pois.push({ id: `rd.event.${type}`, kind: 'event', x: x * S, z: z * S, data: { event: type } }));
  return pois;
}

const PROPS = buildProps();

export const REFINERY_DISTRICT: ZoneDef = {
  id: 'zone.refinery_district',
  key: 'refineryDistrict',
  halfSize: HALF,
  levels: [10, 20],
  playerSpawn: DISTRICT_GATE.arrive,
  // Warmer, smokier air: the glow of the furnaces in the haze.
  ambient: { color: '#6a5248', intensity: 0.62 },
  moon: { color: '#c09070', intensity: 1.2 },
  fog: { color: '#1c1410', density: 0.021 },
  playerLight: { color: '#ffc890', intensity: 45, distance: 12 },
  props: PROPS,
  scatter: [{ asset: 'env.debris_rock', count: 26000, seed: 'refinery-debris', minScale: 0.4, maxScale: 2 }],
  subzones: [
    { id: 'foundryRoad', center: [0, 0], radius: 0 },
    { id: 'conveyorLines', center: SUBZONES.conveyor.c, radius: SUBZONES.conveyor.r },
    { id: 'slagFields', center: SUBZONES.slag.c, radius: SUBZONES.slag.r },
    { id: 'cathedral', center: SUBZONES.cathedral.c, radius: SUBZONES.cathedral.r },
    { id: 'smokestackForest', center: SUBZONES.stacks.c, radius: SUBZONES.stacks.r },
  ],
  roads: ROADS,
  hubs: [COOLANT_WORKS],
  teleporters: [
    { id: 'tp.coolant', x: COOLANT_WORKS.x + 6, z: COOLANT_WORKS.z - 12, hub: true },
    { id: 'tp.rdGate', x: -300 * S, z: -282 * S },
    { id: 'tp.conveyor', x: -245 * S, z: -8 * S },
    { id: 'tp.foundry', x: 100 * S, z: 92 * S },
    { id: 'tp.stacks', x: -150 * S, z: 192 * S },
    { id: 'tp.cathedral', x: 228 * S, z: 190 * S },
    // Inside Pump Station Delta: discovered when the station is reclaimed (or walked to).
    { id: 'tp.delta', x: DELTA.x - 6, z: DELTA.z + 8 },
  ],
  packs: buildPacks(),
  pois: clearOfProps(buildPois(), PROPS),
  mapCell: 8,
  gates: [DISTRICT_GATE],
  env: DISTRICT_ENV,
  region: 2,
  stash: { x: COOLANT_WORKS.x + 9, z: COOLANT_WORKS.z + 7 },
};
