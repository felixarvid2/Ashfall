/**
 * Region 4: The Deep Mines (levels 30–40). Plan and map: docs/regions/deep-mines.md.
 * Design coordinates × 2.2 like the earlier regions. Underground: only the tunnels (roads), the
 * caverns and the hub are walkable; everything else is solid rock drawn by the renderer. Dark: the
 * player's lamp, a few work lights and the floodlights the player switches on are the only light.
 * Every id is prefixed `dm.`. No new 3D models: the Main Drill, the crystal pillar and the Elder
 * Gate are existing models at new sizes and tints.
 */
import { Rng } from '../../core/rng';
import { caveGrid, nearestWalkable, openAt, type Cavern } from './caves';
import { alongRoad, clearOfProps, line } from './layout';
import type { GroundDef, GroundPatch } from './testArena';
import type { EnvFeature, PackSpawn, PoiDef, PropPlacement, Road, ZoneDef } from './zoneTypes';

const S = 2.2;
/** A design coordinate pair in metres. */
export const dm = (x: number, z: number): [number, number] => [x * S, z * S];
const scaled = (pts: [number, number][]): [number, number][] => pts.map(([x, z]) => dm(x, z));
const at = (x: number, z: number) => ({ x: x * S, z: z * S });

const HALF = Math.round(340 * S);

export const ZERO = { id: 'hub.zero', x: 20 * S, z: -290 * S, radius: 22 };
export const AURUM = { id: 'dm.stronghold.aurum', x: 240 * S, z: -190 * S, radius: 30 };
/** Drill Control: Governor Kade's arena on the shore beside the Main Drill. */
export const DRILL_CONTROL = { id: 'dm.boss.kade', x: 150 * S, z: 140 * S, radius: 32 };
export const MAIN_DRILL = { x: 222 * S, z: 72 * S };
export const ELDER_GATE = { x: 0, z: 150 * S };
export const CRYSTAL_PILLAR = { x: -200 * S, z: 18 * S };

/** The freight lift up to the Hydroponic Vaults, at the south edge. */
export const MINES_GATE = {
  id: 'gate.dm.vaults',
  x: 60 * S,
  z: -334 * S,
  radius: 7,
  to: { zone: 'zone.hydroponic_vaults', gate: 'gate.hv.mines' },
  arrive: { x: 60 * S, z: -320 * S },
};

export const MINE_SUBZONES = {
  shafts: { c: dm(0, -170), r: 130 * S },
  caves: { c: dm(-210, 40), r: 120 * S },
  lake: { c: dm(200, 50), r: 110 * S },
  elder: { c: dm(0, 250), r: 115 * S },
};
const inSub = (x: number, z: number, s: { c: [number, number]; r: number }) => Math.hypot(x - s.c[0], z - s.c[1]) < s.r;

// ---- Tunnels and caverns ----------------------------------------------------------------------

const ROADS: Road[] = [
  // The lift drift from the freight lift into Station Zero.
  { id: 'lift', width: 9, points: scaled([[60, -334], [60, -314], [44, -300], [20, -290]]) },
  // The main drift north: Station Zero, the Upper Shafts, the crossroads, the Elder Gate.
  { id: 'main', width: 12, points: scaled([[20, -290], [12, -240], [10, -200], [0, -150], [0, -120], [-4, -80], [0, -40], [4, 20], [0, 90], [0, 150], [0, 210], [0, 240]]) },
  { id: 'shaft', width: 9, points: scaled([[0, -150], [-40, -175], [-80, -200], [-100, -232]]) },
  { id: 'aurum', width: 10, points: scaled([[10, -200], [60, -208], [110, -212], [170, -202], [240, -190]]) },
  { id: 'west', width: 10, points: scaled([[0, -40], [-60, -30], [-120, -6], [-170, 20], [-210, 40]]) },
  { id: 'cavesSouth', width: 8, points: scaled([[-210, 40], [-240, 0], [-262, -40]]) },
  { id: 'labyrinth', width: 8, points: scaled([[-210, 40], [-236, 84], [-262, 112]]) },
  { id: 'cavesNorth', width: 9, points: scaled([[-210, 40], [-170, 92], [-150, 150], [-110, 216], [-84, 282]]) },
  { id: 'east', width: 10, points: scaled([[0, -40], [60, -36], [110, -16], [150, 10], [176, 30]]) },
  { id: 'shore', width: 10, points: scaled([[176, 30], [168, 80], [150, 140]]) },
  { id: 'sunken', width: 8, points: scaled([[176, 30], [222, 4], [266, -24]]) },
  { id: 'aurumLake', width: 8, points: scaled([[240, -190], [262, -120], [270, -60], [266, -24]]) },
  { id: 'elderWest', width: 9, points: scaled([[0, 240], [-40, 262], [-84, 282]]) },
  { id: 'elderEast', width: 9, points: scaled([[0, 240], [56, 270], [112, 302]]) },
  { id: 'controlLink', width: 9, points: scaled([[0, 210], [60, 186], [110, 162], [150, 140]]) },
  { id: 'workings', width: 8, points: scaled([[0, -120], [50, -126], [80, -118]]) },
  { id: 'west2', width: 8, points: scaled([[-4, -80], [-60, -64]]) },
];

const C = (x: number, z: number, r: number): Cavern => ({ x: x * S, z: z * S, radius: r * S });
const CAVERNS: Cavern[] = [
  // Upper Shafts
  C(20, -290, 16), C(0, -160, 20), C(-90, -214, 18), C(80, -120, 15), C(-62, -62, 13), C(130, -212, 11),
  // Crystal Caves
  C(-210, 40, 44), C(-262, -40, 22), C(-152, 96, 18), C(-266, 116, 17), C(-120, 210, 12),
  // Drill Lake
  C(214, 66, 56), C(150, 140, 20), C(268, -26, 16),
  // Elder Halls
  C(0, 238, 38), C(-86, 286, 22), C(112, 304, 20), C(64, 184, 13), C(0, 150, 14),
  // Mining Station Aurum
  C(240, -190, 25),
];

export const MINES_CAVES = { caverns: CAVERNS };
const GRID = caveGrid({ halfSize: HALF, roads: ROADS, hubs: [ZERO], caves: MINES_CAVES })!;
/** Open ground with room to spare (tests and placement). */
export const openGround = (x: number, z: number, pad = 0): boolean => openAt(GRID, x, z, pad);

// ---- Environment: the lake, cave-ins ----------------------------------------------------------

function buildEnv(): EnvFeature[] {
  const env: EnvFeature[] = [
    // Drill Lake: the water around the drill (the shore stays dry).
    { kind: 'water', id: 'dm.water.lake', x: 216 * S, z: 76 * S, radius: 36 * S },
    { kind: 'water', id: 'dm.water.lake.n', x: 200 * S, z: 104 * S, radius: 16 * S },
    { kind: 'water', id: 'dm.water.sunken', x: 250 * S, z: -8 * S, radius: 9 * S },
  ];
  // Cave-ins along the older tunnels: warned with dust and creaking.
  scaled([[6, -228], [-60, -184], [-90, -16], [-238, 2], [-162, 128], [-126, 186], [86, -24], [262, -100], [30, 184], [-30, 254]]).forEach(([x, z], i) =>
    env.push({ kind: 'caveIn', id: `dm.cavein.${i}`, x, z, radius: 4.5 }),
  );
  return env;
}
export const MINES_ENV = buildEnv();
const inWater = (x: number, z: number, pad = 0) =>
  MINES_ENV.some((f) => f.kind === 'water' && Math.hypot(x - f.x, z - f.z) < f.radius + pad);

// ---- Ground -----------------------------------------------------------------------------------

function buildGround(): GroundDef {
  const CRYSTAL = 0;
  const ELDER = 1;
  const SHORE = 2;
  const GRATING = 3;
  const lake = MINES_ENV.filter((f) => f.kind === 'water');
  const patches: GroundPatch[] = [
    { layer: CRYSTAL, x: MINE_SUBZONES.caves.c[0], z: MINE_SUBZONES.caves.c[1], radius: MINE_SUBZONES.caves.r * 0.8, strength: 0.8 },
    { layer: ELDER, x: MINE_SUBZONES.elder.c[0], z: MINE_SUBZONES.elder.c[1], radius: MINE_SUBZONES.elder.r * 0.75, strength: 0.9 },
    // Crystal creeps in at the Elder Gate.
    { layer: CRYSTAL, x: ELDER_GATE.x, z: ELDER_GATE.z + 20, radius: 26, strength: 0.4 },
    // Dried silt round the water.
    ...lake.map((w) => ({ layer: SHORE, x: w.x, z: w.z, radius: w.radius + 45, strength: 0.9 })),
    { layer: GRATING, x: ZERO.x, z: ZERO.z, radius: ZERO.radius + 10 },
    { layer: GRATING, x: AURUM.x, z: AURUM.z, radius: AURUM.radius + 10 },
    { layer: GRATING, x: DRILL_CONTROL.x, z: DRILL_CONTROL.z, radius: DRILL_CONTROL.radius },
  ];
  // The base stays region 2's grit until a mine-rock texture arrives; the tunnels carry cart rails.
  return { base: 'industrial_grit', tile: 9, layers: ['crystal_floor', 'elder_stone', 'lake_shore', 'steel_grating'], patches, road: 'rail_track' };
}

// ---- Props ------------------------------------------------------------------------------------

const lamp = (x: number, z: number, color = '#ffd8a0', intensity = 60): PropPlacement => ({
  asset: 'prop.emergency_light',
  x,
  z,
  collider: 0.3,
  light: { color, intensity, distance: 13, height: 3 },
});
const crystal = (x: number, z: number, scale: number, lit = false): PropPlacement => ({
  asset: 'prop.lumen_growth',
  x,
  z,
  scale,
  collider: 0.4 * scale,
  glow: '#5ac8ff',
  ...(lit ? { light: { color: '#7ad8ff', intensity: 45, distance: 12, height: 2.4 } } : {}),
});

function buildProps(): PropPlacement[] {
  const rng = new Rng('mines-props');
  const props: PropPlacement[] = [];
  const clear = (x: number, z: number, pad = 2) =>
    openGround(x, z, pad) && Math.hypot(x - ZERO.x, z - ZERO.z) > ZERO.radius + 3 && Math.hypot(x - DRILL_CONTROL.x, z - DRILL_CONTROL.z) > DRILL_CONTROL.radius + 2;

  // Station Zero: the lift tower, barricades round the edge, generators and crates.
  props.push({ asset: 'prop.elevator_foundation', x: ZERO.x + 10, z: ZERO.z - 12, rot: 0.3, scale: 0.8, collider: 4 });
  props.push({ asset: 'env.pump_house', x: ZERO.x - 9, z: ZERO.z - 8, rot: Math.PI / 5, colliders: [{ x: -3, z: 0, r: 3 }, { x: 3, z: 0, r: 3 }] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    if (i === 2 || i === 6) continue;
    props.push({ asset: 'prop.barricade', x: ZERO.x + Math.sin(a) * (ZERO.radius - 1), z: ZERO.z + Math.cos(a) * (ZERO.radius - 1), rot: a + Math.PI / 2, colliders: line(4, 0.7, 3) });
  }
  props.push(lamp(ZERO.x + 5, ZERO.z + 6, '#ffe2b0', 90), lamp(ZERO.x - 7, ZERO.z + 4, '#ffe2b0', 80), lamp(ZERO.x + 2, ZERO.z - 10, '#ffe2b0', 80));
  props.push({ asset: 'prop.generator', x: ZERO.x - 12, z: ZERO.z + 6, rot: 1, collider: 1 }, { asset: 'prop.cargo_crate', x: ZERO.x + 13, z: ZERO.z + 4, rot: 0.4, collider: 1 });

  // Tunnels: ore carts, timber props along the walls and the odd working lamp.
  for (const road of ROADS) {
    alongRoad(road.points, 26, 10).forEach((p, i) => {
      const side = i % 2 ? 1 : -1;
      const off = (road.width / 2 - 1.2) * side;
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (!clear(x, z, 0.5)) return;
      const r = rng.next();
      if (r < 0.35) props.push({ asset: 'prop.cargo_crate', x, z, rot: Math.atan2(p.dx, p.dz), scale: 0.75, collider: 0.8 });
      else if (r < 0.55) props.push({ asset: 'env.wall_segment', x, z, rot: Math.atan2(p.dx, p.dz), scale: 0.35, collider: 0.5 });
      else if (r < 0.65) props.push(lamp(x, z));
      else if (r < 0.75) props.push({ asset: 'prop.pipe_section', x, z, rot: Math.atan2(p.dx, p.dz), scale: 0.6, colliders: line(3, 0.4, 3) });
    });
  }
  // The Upper Shafts: drilling machines and catwalk scaffolds in the workings.
  for (const [x, z] of scaled([[0, -168], [-96, -214], [84, -124], [-8, -150]])) {
    props.push({ asset: 'prop.compressor', x: x + 6, z: z + 4, rot: rng.range(0, 6), collider: 1.4 });
    props.push({ asset: 'env.catwalk', x: x - 6, z: z - 3, rot: rng.range(0, 6), scale: 0.8, colliders: line(5, 0.6, 4) });
  }

  // The Crystal Caves: blue crystals, some huge, a few lit from within.
  const caves = MINE_SUBZONES.caves;
  for (let i = 0; i < 260; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, caves.r);
    const x = caves.c[0] + Math.sin(a) * d;
    const z = caves.c[1] + Math.cos(a) * d;
    if (!clear(x, z, 3)) continue;
    const big = rng.chance(0.2);
    props.push(crystal(x, z, big ? rng.range(2, 3.5) : rng.range(0.6, 1.4), big && rng.chance(0.5)));
  }
  // The crystal pillar from floor to ceiling.
  props.push({ asset: 'prop.lumen_wrath', x: CRYSTAL_PILLAR.x, z: CRYSTAL_PILLAR.z, scale: 4.2, landmark: true, glow: '#5ac8ff', collider: 4, light: { color: '#7ad8ff', intensity: 160, distance: 40, height: 10 } });

  // Drill Lake: the Main Drill half-sunk in the water, catwalks on the shore.
  props.push(
    { asset: 'prop.giant_crane', x: MAIN_DRILL.x, z: MAIN_DRILL.z, rot: 0.6, scale: 1.5, landmark: true, collider: 6, light: { color: '#ff9a4a', intensity: 80, distance: 30, height: 14 } },
    { asset: 'prop.the_pillar', x: MAIN_DRILL.x + 6, z: MAIN_DRILL.z - 4, rot: 0.2, scale: 1.2, landmark: true, collider: 4 },
    { asset: 'prop.pipe_section', x: MAIN_DRILL.x - 12, z: MAIN_DRILL.z + 6, rot: 1.2, scale: 2.2, colliders: line(8, 1, 5) },
  );
  for (const [x, z] of scaled([[184, 40], [176, 96], [252, 20], [246, 112]])) {
    if (clear(x, z, 1)) props.push({ asset: 'env.catwalk', x, z, rot: rng.range(0, 6), colliders: line(5, 0.6, 4) }, lamp(x + 3, z + 2, '#ffc890'));
  }

  // The Elder Halls: tall glowing slabs in rows, geometric and cold.
  const elder = MINE_SUBZONES.elder;
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(6, elder.r);
    const x = elder.c[0] + Math.sin(a) * d;
    const z = elder.c[1] + Math.cos(a) * d;
    if (!clear(x, z, 3)) continue;
    // Snap to a lattice so the halls read as built, not grown.
    const sx = Math.round(x / 9) * 9;
    const sz = Math.round(z / 9) * 9;
    if (!clear(sx, sz, 3)) continue;
    props.push({ asset: 'env.wall_segment', x: sx, z: sz, rot: Math.round(rng.range(0, 4)) * (Math.PI / 2), scale: rng.range(0.7, 1.2), glow: '#3aa8ff', collider: 1.6 });
  }
  // The Elder Gate: two tall pillars and a lintel across the main drift.
  props.push(
    { asset: 'env.wall_segment', x: ELDER_GATE.x - 9, z: ELDER_GATE.z, rot: Math.PI / 2, scale: 2.2, landmark: true, glow: '#6ad8ff', collider: 2.5, light: { color: '#6ad8ff', intensity: 90, distance: 22, height: 6 } },
    { asset: 'env.wall_segment', x: ELDER_GATE.x + 9, z: ELDER_GATE.z, rot: Math.PI / 2, scale: 2.2, landmark: true, glow: '#6ad8ff', collider: 2.5 },
  );

  // Mining Station Aurum: a walled compound with the governor's security lights.
  for (let i = 0; i < 14; i++) {
    if (i === 6 || i === 7 || i === 13) continue;
    const a = (i / 14) * Math.PI * 2;
    props.push({ asset: 'env.industrial_wall', x: AURUM.x + Math.sin(a) * AURUM.radius, z: AURUM.z + Math.cos(a) * AURUM.radius, rot: a + Math.PI / 2, colliders: line(5.6, 0.6, 6) });
  }
  props.push(
    { asset: 'env.pump_house', x: AURUM.x + 8, z: AURUM.z + 6, rot: 0.5, scale: 1.2, colliders: [{ x: -3, z: 0, r: 3.2 }, { x: 3, z: 0, r: 3.2 }] },
    lamp(AURUM.x - 6, AURUM.z + 4, '#9fd8ff', 90),
    lamp(AURUM.x + 2, AURUM.z - 10, '#9fd8ff', 90),
  );
  // Drill Control: the arena's walls are the cavern itself; consoles on the rim.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    props.push({ asset: 'prop.control_terminal', x: DRILL_CONTROL.x + Math.sin(a) * (DRILL_CONTROL.radius + 4), z: DRILL_CONTROL.z + Math.cos(a) * (DRILL_CONTROL.radius + 4), rot: a + Math.PI, collider: 0.8 });
  }

  // Rubble and loose rock in the open caverns.
  for (let i = 0; i < 500; i++) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = rng.range(-HALF + 10, HALF - 10);
    if (!clear(x, z, 3) || inWater(x, z, 3)) continue;
    props.push({ asset: 'env.slag_rock', x, z, rot: rng.range(0, 6.28), scale: rng.range(0.5, 1.4), collider: 0.7 * 1.4 });
  }
  return props;
}

// ---- Packs ------------------------------------------------------------------------------------

function buildPacks(): PackSpawn[] {
  const rng = new Rng('mines-packs');
  const packs: PackSpawn[] = [];
  const safe = (x: number, z: number) =>
    openGround(x, z, 2) &&
    !inWater(x, z, 1) &&
    Math.hypot(x - ZERO.x, z - ZERO.z) > ZERO.radius + 24 &&
    Math.hypot(x - MINES_GATE.arrive.x, z - MINES_GATE.arrive.z) > 40 &&
    Math.hypot(x - DRILL_CONTROL.x, z - DRILL_CONTROL.z) > DRILL_CONTROL.radius + 8 &&
    Math.hypot(x - AURUM.x, z - AURUM.z) > AURUM.radius + 4;
  const templateAt = (x: number, z: number): string => {
    if (Math.hypot(x - AURUM.x, z - AURUM.z) < AURUM.radius + 70) return 'dm_security';
    if (inSub(x, z, MINE_SUBZONES.elder)) return 'dm_elder';
    if (inSub(x, z, MINE_SUBZONES.lake)) return 'dm_lake';
    if (inSub(x, z, MINE_SUBZONES.caves)) return 'dm_caves';
    if (inSub(x, z, MINE_SUBZONES.shafts)) return 'dm_shafts';
    return 'dm_tunnel';
  };
  let n = 0;
  for (const road of ROADS) {
    alongRoad(road.points, 30, 18).forEach((p) => {
      const off = rng.range(-road.width / 4, road.width / 4);
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (!safe(x, z)) return;
      packs.push({ id: `dm.pack.${n++}`, x, z, template: templateAt(x, z) });
    });
  }
  for (const c of CAVERNS) {
    const count = Math.round(c.radius / 30);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, c.radius * 0.8);
      const x = c.x + Math.sin(a) * d;
      const z = c.z + Math.cos(a) * d;
      if (!safe(x, z)) continue;
      packs.push({ id: `dm.pack.${n++}`, x, z, template: templateAt(x, z) });
    }
  }
  return packs;
}

// ---- Points of interest -----------------------------------------------------------------------

/** Floodlights: old work-light generators; switched on, each lights its area for good. */
export const FLOODLIGHTS: { id: string; x: number; z: number }[] = [
  [24, -250], [-20, -160], [-90, -200], [80, -116], [-200, 60], [-258, -36], [160, 28], [150, 116], [0, 200], [-80, 278],
].map(([x, z], i) => ({ id: `dm.feature.light.${i}`, ...at(x!, z!) }));

function buildPois(): PoiDef[] {
  const rng = new Rng('mines-pois');
  const pois: PoiDef[] = [];
  const free = (x: number, z: number) => openGround(x, z, 1.5) && !inWater(x, z, 1) && Math.hypot(x - ZERO.x, z - ZERO.z) > ZERO.radius + 4;
  const place = (x: number, z: number) => {
    if (free(x, z)) return { x, z };
    for (let r = 2; r < 30; r += 2) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        if (free(x + Math.sin(a) * r, z + Math.cos(a) * r)) return { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
      }
    }
    return { x, z };
  };
  ROADS.forEach((road) =>
    alongRoad(road.points, 60, 30).forEach((p, i) => {
      const off = (i % 2 ? 1 : -1) * (road.width / 2 - 2);
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (free(x, z)) pois.push({ id: `dm.chest.${road.id}.${i}`, kind: 'chest', x, z });
    }),
  );
  scaled([[-96, -222], [-266, -46], [-270, 120], [262, -30], [-90, 290], [116, 306]]).forEach(([x, z], i) => {
    const l = place(x, z);
    pois.push({ id: `dm.locked.${i}`, kind: 'lockedChest', ...l, data: { key: `dm.keycard.${i}` } });
    const k = place(x + rng.range(-30, 30), z + rng.range(-30, 30));
    pois.push({ id: `dm.keycard.${i}`, kind: 'keycard', ...k, data: { opens: `dm.locked.${i}` } });
  });
  const pylons = ['overcharge', 'kinetic', 'barrier', 'chainReaction', 'magnet', 'overclock'];
  scaled([[0, -100], [-130, -2], [-210, 80], [130, -2], [0, 260], [200, -200]]).forEach(([x, z], i) =>
    pois.push({ id: `dm.pylon.${i}`, kind: 'pylon', ...place(x, z), data: { type: pylons[i]! } }),
  );
  // Hidden: behind crystals, under the lake catwalks, in dead-end elder alcoves.
  scaled([[-280, -50], [-150, 104], [-276, 126], [270, -34], [242, 116], [-100, 298], [124, 314], [140, -222], [-110, -232], [80, 190]]).forEach(([x, z], i) =>
    pois.push({ id: `dm.relic.${i}`, kind: 'relic', ...place(x, z), data: { stat: ['maxLife', 'damage', 'armor', 'moveSpeed', 'resourceGen'][i % 5]! } }),
  );
  scaled([[40, -300], [6, -176], [-80, -206], [70, -128], [-200, 20], [-250, -30], [180, 40], [160, 150], [0, 160], [-70, 280], [100, 300], [240, -176]]).forEach(([x, z], i) =>
    pois.push({ id: `dm.lore.${i}`, kind: 'lore', ...place(x, z), data: { log: `dm.${i}` } }),
  );
  scaled([[-30, -150], [-220, 60], [170, 60]]).forEach(([x, z], i) => pois.push({ id: `dm.tower.${i}`, kind: 'signalTower', ...place(x, z) }));
  scaled([[80, -110], [-60, -66], [130, -214]]).forEach(([x, z], i) => {
    const b = place(x, z);
    for (let k = 0; k < 3; k++) pois.push({ id: `dm.barrel.${i}.${k}`, kind: 'barrel', x: b.x + rng.range(-2, 2), z: b.z + rng.range(-2, 2) });
  });
  // Glowing crystals (as in the Vaults): break one to blind the enemies around it.
  let c = 0;
  for (let i = 0; i < 200 && c < 16; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(10, MINE_SUBZONES.caves.r);
    const x = MINE_SUBZONES.caves.c[0] + Math.sin(a) * d;
    const z = MINE_SUBZONES.caves.c[1] + Math.cos(a) * d;
    if (!free(x, z)) continue;
    pois.push({ id: `dm.crystal.${c++}`, kind: 'crystal', x, z });
  }
  // Safety refuges and pump rooms.
  scaled([[-60, -62], [80, -124], [-262, -44], [270, -28], [-120, 214], [64, 186]]).forEach(([x, z], i) =>
    pois.push({ id: `dm.bunker.${i}`, kind: 'bunker', ...place(x, z), data: { bunker: i, instance: 'dm_bunker' } }),
  );
  pois.push(
    { id: 'dm.dungeon.shaft13', kind: 'dungeon', ...place(...dm(-100, -230)), data: { dungeon: 'shaft_13' } },
    { id: 'dm.dungeon.labyrinth', kind: 'dungeon', ...place(...dm(-266, 116)), data: { dungeon: 'crystal_labyrinth' } },
    { id: 'dm.dungeon.sunken', kind: 'dungeon', ...place(...dm(270, -32)), data: { dungeon: 'sunken_drill' } },
    { id: 'dm.dungeon.archive', kind: 'dungeon', ...place(...dm(-90, 290)), data: { dungeon: 'archive' } },
    { id: 'dm.dungeon.burial', kind: 'dungeon', ...place(...dm(114, 308)), data: { dungeon: 'burial_chamber' } },
    { id: AURUM.id, kind: 'stronghold', x: AURUM.x, z: AURUM.z },
    { id: DRILL_CONTROL.id, kind: 'boss', x: DRILL_CONTROL.x, z: DRILL_CONTROL.z },
  );
  for (const f of FLOODLIGHTS) pois.push({ id: f.id, kind: 'feature', ...place(f.x, f.z), data: { feature: 'floodlight' } });
  const events: [string, number, number][] = [
    ['caveRescue', -62, -62], ['burrowerSwarm', -152, 96], ['lightsOut', 80, -120], ['securityPatrol', 130, -210], ['eliteHunt', -262, -40], ['supplyDrop', 64, 184],
  ];
  events.forEach(([type, x, z]) => pois.push({ id: `dm.event.${type}`, kind: 'event', ...place(...dm(x, z)), data: { event: type } }));
  return pois;
}

export const MINES_TELEPORTERS = [
  { id: 'tp.zero', x: ZERO.x - 4, z: ZERO.z + 12, hub: true },
  { id: 'tp.lift', ...at(62, -316) },
  { id: 'tp.shafts', ...at(4, -166) },
  { id: 'tp.caves', ...at(-196, 58) },
  { id: 'tp.lake', ...at(172, 44) },
  { id: 'tp.elder', ...at(14, 226) },
  // Inside Mining Station Aurum: discovered when it is reclaimed (or walked to).
  { id: 'tp.aurum', x: AURUM.x - 6, z: AURUM.z - 8 },
];

const PROPS = buildProps();
function insideProp(x: number, z: number): boolean {
  return PROPS.some((prop) => {
    const rot = prop.rot ?? 0;
    const scale = prop.scale ?? 1;
    if (prop.collider && Math.hypot(prop.x - x, prop.z - z) < prop.collider + 0.6) return true;
    return (prop.colliders ?? []).some((c) => {
      const cx = prop.x + (c.x * Math.cos(rot) + c.z * Math.sin(rot)) * scale;
      const cz = prop.z + (-c.x * Math.sin(rot) + c.z * Math.cos(rot)) * scale;
      return Math.hypot(cx - x, cz - z) < c.r * scale + 0.6;
    });
  });
}

export const DEEP_MINES: ZoneDef = {
  id: 'zone.deep_mines',
  key: 'deepMines',
  halfSize: HALF,
  levels: [30, 40],
  playerSpawn: MINES_GATE.arrive,
  // Almost black: the lamp, a few work lights and the floodlights are all there is.
  ambient: { color: '#2a3040', intensity: 0.1 },
  moon: { color: '#8aa0c8', intensity: 0.12 },
  fog: { color: '#030405', density: 0.03 },
  playerLight: { color: '#ffe2b8', intensity: 75, distance: 18 },
  dark: true,
  particles: '#6a6460',
  props: PROPS,
  scatter: [{ asset: 'env.debris_rock', count: 9000, seed: 'mines-debris', minScale: 0.3, maxScale: 1.3 }],
  ground: buildGround(),
  subzones: [
    { id: 'tunnels', center: [0, 0], radius: 0 },
    { id: 'upperShafts', center: MINE_SUBZONES.shafts.c, radius: MINE_SUBZONES.shafts.r },
    { id: 'crystalCaves', center: MINE_SUBZONES.caves.c, radius: MINE_SUBZONES.caves.r },
    { id: 'drillLake', center: MINE_SUBZONES.lake.c, radius: MINE_SUBZONES.lake.r },
    { id: 'elderHalls', center: MINE_SUBZONES.elder.c, radius: MINE_SUBZONES.elder.r },
  ],
  roads: ROADS,
  hubs: [ZERO],
  teleporters: MINES_TELEPORTERS,
  packs: buildPacks(),
  // Props can push a point of interest into the rock: snap it back onto open ground (a crate that
  // still lands in a prop is dropped).
  pois: clearOfProps(buildPois(), PROPS)
    .map((p) => (openGround(p.x, p.z) ? p : { ...p, ...(nearestWalkable(GRID, p.x, p.z) ?? p) }))
    .filter((p) => p.kind !== 'chest' || !insideProp(p.x, p.z)),
  mapCell: 8,
  gates: [MINES_GATE],
  env: MINES_ENV,
  caves: MINES_CAVES,
  region: 4,
  stash: { x: ZERO.x + 8, z: ZERO.z + 9 },
};
