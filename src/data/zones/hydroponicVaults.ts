/**
 * Region 3: The Hydroponic Vaults (levels 20–30). Plan and map: docs/regions/hydroponic-vaults.md.
 * Design coordinates × 2.2 like the first two regions; hand-placed anchors plus seeded decoration.
 * Every id is prefixed `hv.`. No new 3D models: fungal trees, roots, crystals and the Mother Tree are
 * existing models at new sizes and tints; the glass domes are drawn by the renderer.
 */
import { Rng } from '../../core/rng';
import { alongRoad, clearOfProps, distanceToRoad as roadDistance, line } from './layout';
import type { GroundDef, GroundPatch } from './testArena';
import type { EnvFeature, PackSpawn, PoiDef, PropPlacement, Road, ZoneDef } from './zoneTypes';

const S = 2.2;
/** A design coordinate pair in metres. */
export const hv = (x: number, z: number): [number, number] => [x * S, z * S];
const scaled = (pts: [number, number][]): [number, number][] => pts.map(([x, z]) => hv(x, z));
const at = (x: number, z: number) => ({ x: x * S, z: z * S });

const HALF = Math.round(340 * S);

const ROADS: Road[] = [
  // The Service Road: from the border crossing past Lab 9, over the broken dam to the Great Dome.
  {
    id: 'service',
    width: 8,
    points: scaled([[150, -334], [150, -292], [122, -258], [90, -220], [60, -180], [35, -120], [30, -60], [40, 0], [48, 60], [52, 140], [58, 200], [60, 228]]),
  },
  // West through the Green Sea to Dome Gamma.
  { id: 'ringW', width: 7, points: scaled([[30, -60], [-40, -50], [-110, -30], [-170, -20], [-230, -50], [-262, -110], [-270, -140]]) },
  // East to the Seed Bank.
  { id: 'ringE', width: 7, points: scaled([[40, 0], [100, 40], [160, 80], [205, 110], [250, 150]]) },
  // The farm track between the outer domes' crop rows.
  { id: 'crops', width: 5, points: scaled([[60, -180], [0, -200], [-60, -220], [-120, -235]]) },
  // A narrow trail winding up into the Root Network.
  { id: 'roots', width: 4, points: scaled([[-170, -20], [-175, 60], [-160, 140], [-150, 200], [-175, 260], [-210, 300]]) },
];

const distanceToRoad = (x: number, z: number): number => roadDistance(x, z, ROADS);

export const LAB9 = { id: 'hub.lab9', x: 106 * S, z: -238 * S, radius: 24 };
export const GAMMA = { id: 'hv.stronghold.gamma', x: -270 * S, z: -172 * S, radius: 32 };
/** The Great Dome: the Warden's arena around the Mother Tree's trunk. */
export const GREAT_DOME = { id: 'hv.boss.warden', x: 60 * S, z: 262 * S, radius: 34 };
export const DAM = { x: 40 * S, z: 40 * S };
/** The Mother Tree stands just west of the Great Dome (screen-left), so its canopy never hides the fight. */
export const MOTHER_TREE = { x: GREAT_DOME.x - GREAT_DOME.radius - 18, z: GREAT_DOME.z + 4 };
/** Where Dr. Okafor waits for the burn-or-spare choice, outside the arena's south gap. */
export const TREE_FOOT = { x: GREAT_DOME.x, z: GREAT_DOME.z - GREAT_DOME.radius - 8 };

/** The border crossing at the south edge, back to the Refinery District. */
export const VAULTS_GATE = {
  id: 'gate.hv.refinery',
  x: 150 * S,
  z: -334 * S,
  radius: 7,
  to: { zone: 'zone.refinery_district', gate: 'gate.rd.vaults' },
  arrive: { x: 150 * S, z: -318 * S },
};

export const VAULT_SUBZONES = {
  outer: { c: hv(20, -190), r: 115 * S },
  sea: { c: hv(-190, -10), r: 135 * S },
  seed: { c: hv(210, 130), r: 105 * S },
  roots: { c: hv(-150, 250), r: 115 * S },
};
const inSub = (x: number, z: number, s: { c: [number, number]; r: number }) => Math.hypot(x - s.c[0], z - s.c[1]) < s.r;

/** Air filters: switched on, each clears the spore fields within FILTER_RADIUS for good. */
export const AIR_FILTERS: { id: string; x: number; z: number }[] = [
  [-40, -76], [-150, -42], [-236, 30], [-108, 70], [-168, 198], [-112, 292],
].map(([x, z], i) => ({ id: `hv.feature.filter.${i}`, ...at(x!, z!) }));
export const FILTER_RADIUS = 34 * S;

// ---- Environment: spore fields and the dam basin ---------------------------------------------

function buildEnv(): EnvFeature[] {
  const rng = new Rng('vaults-env');
  const env: EnvFeature[] = [];
  const clearOfPlaces = (x: number, z: number, pad: number) =>
    Math.hypot(x - LAB9.x, z - LAB9.z) > LAB9.radius + pad &&
    Math.hypot(x - GREAT_DOME.x, z - GREAT_DOME.z) > GREAT_DOME.radius + pad &&
    Math.hypot(x - VAULTS_GATE.arrive.x, z - VAULTS_GATE.arrive.z) > 40;
  // Spore fields drift over the Green Sea and the Root Network.
  let n = 0;
  for (const [sub, count] of [
    [VAULT_SUBZONES.sea, 26],
    [VAULT_SUBZONES.roots, 22],
  ] as const) {
    for (let i = 0, made = 0; i < count * 3 && made < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * sub.r * 0.95;
      const x = sub.c[0] + Math.sin(a) * d;
      const z = sub.c[1] + Math.cos(a) * d;
      if (Math.abs(x) > HALF - 12 || Math.abs(z) > HALF - 12 || !clearOfPlaces(x, z, 20)) continue;
      if (Math.hypot(x - GAMMA.x, z - GAMMA.z) < GAMMA.radius + 30) continue;
      env.push({ kind: 'spores', id: `hv.spores.${n++}`, x, z, radius: rng.range(14, 24) });
      made++;
    }
  }
  // Dome Gamma is one big spore nest until it is reclaimed.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const d = i === 0 ? 0 : 20;
    env.push({ kind: 'spores', id: `hv.spores.gamma.${i}`, x: GAMMA.x + Math.sin(a) * d, z: GAMMA.z + Math.cos(a) * d, radius: i === 0 ? 22 : 16, clearedBy: GAMMA.id });
  }
  // The flooded basin below the broken dam (the road crosses on the dam's spillway).
  let w = 0;
  for (const [x, z, r] of [
    [-30, 22, 11], [-12, 16, 12], [6, 12, 11], [20, 18, 9], [62, 14, 10], [80, 8, 12], [98, 16, 11], [-44, 30, 8], [112, 24, 8],
  ] as const) env.push({ kind: 'water', id: `hv.water.${w++}`, x: x * S, z: z * S, radius: r });
  return env;
}

export const VAULTS_ENV = buildEnv();

/**
 * Ground (existing textures until the region gets its own): farm soil everywhere, Lumen-infested
 * ground over the Green Sea, the Root Network, Dome Gamma and the Great Dome, concrete in Lab 9 and on
 * the dam, steel plating inside the Seed Bank.
 */
function buildGround(props: PropPlacement[]): GroundDef {
  const MOSS = 0;
  const ROOTS = 1;
  const FROST = 2;
  const SILT = 3;
  const CONCRETE = 4;
  const patches: GroundPatch[] = [
    { layer: MOSS, x: VAULT_SUBZONES.sea.c[0], z: VAULT_SUBZONES.sea.c[1], radius: VAULT_SUBZONES.sea.r * 0.85, strength: 0.85 },
    { layer: ROOTS, x: VAULT_SUBZONES.roots.c[0], z: VAULT_SUBZONES.roots.c[1], radius: VAULT_SUBZONES.roots.r * 0.85, strength: 0.9 },
    { layer: MOSS, x: GAMMA.x, z: GAMMA.z, radius: GAMMA.radius + 10 },
    { layer: ROOTS, x: GREAT_DOME.x, z: GREAT_DOME.z, radius: GREAT_DOME.radius + 10, strength: 0.8 },
    { layer: ROOTS, x: MOTHER_TREE.x, z: MOTHER_TREE.z, radius: 22 },
    { layer: MOSS, x: VAULT_SUBZONES.outer.c[0], z: VAULT_SUBZONES.outer.c[1], radius: VAULT_SUBZONES.outer.r * 0.7, strength: 0.3 },
    { layer: CONCRETE, x: LAB9.x, z: LAB9.z, radius: LAB9.radius - 4 },
    // The drained basin below the broken dam.
    { layer: SILT, x: DAM.x, z: DAM.z + 4, radius: 34 },
    { layer: FROST, x: VAULT_SUBZONES.seed.c[0], z: VAULT_SUBZONES.seed.c[1], radius: VAULT_SUBZONES.seed.r * 0.6, strength: 0.8 },
  ];
  // Moss spreads around every growth and fungal tree.
  for (const p of props) {
    if (p.asset === 'prop.lumen_growth') patches.push({ layer: MOSS, x: p.x, z: p.z, radius: 3.5 * (p.scale ?? 1), strength: 0.9 });
  }
  return { base: 'vault_soil', tile: 9, layers: ['fungal_moss', 'root_mat', 'frosted_concrete', 'dry_silt', 'military_concrete'], patches, road: 'overgrown_asphalt' };
}

// ---- Props ------------------------------------------------------------------------------------

const lamp = (x: number, z: number, color = '#c8ffd8'): PropPlacement => ({
  asset: 'prop.emergency_light',
  x,
  z,
  collider: 0.3,
  light: { color, intensity: 80, distance: 15, height: 3.1 },
});
const wall = (x: number, z: number, rot: number, scale = 1): PropPlacement => ({ asset: 'env.industrial_wall', x, z, rot, scale, colliders: line(5.6, 0.6, 6) });
/** A fungal tree: a Lumen growth tens of times its size, glowing faintly. */
const TELEPORTERS = [
  { id: 'tp.lab9', x: LAB9.x + 6, z: LAB9.z - 12, hub: true },
  { id: 'tp.hvGate', x: 150 * S, z: -298 * S },
  { id: 'tp.outer', x: 24 * S, z: -196 * S },
  { id: 'tp.sea', x: -168 * S, z: -30 * S },
  { id: 'tp.seed', x: 196 * S, z: 98 * S },
  { id: 'tp.roots', x: -158 * S, z: 168 * S },
  // Inside Dome Gamma: discovered when the dome is reclaimed (or walked to).
  { id: 'tp.gamma', x: GAMMA.x - 6, z: GAMMA.z + 8 },
];
const tree = (x: number, z: number, scale: number): PropPlacement => ({
  asset: 'prop.lumen_growth',
  x,
  z,
  scale,
  collider: 0.45 * scale,
  ...(scale > 4.5 ? { light: { color: '#5dff6a', intensity: 30, distance: 14, height: 3 } } : {}),
});
const growth = (x: number, z: number, scale = 1): PropPlacement => ({
  asset: 'prop.lumen_growth',
  x,
  z,
  scale,
  collider: 0.5 * scale,
  light: { color: '#5dff6a', intensity: 12, distance: 8, height: 1.4 },
});
const crate = (x: number, z: number, rot: number, scale = 1): PropPlacement => ({ asset: 'prop.cargo_crate', x, z, rot, scale, collider: 0.95 * scale });

function ring(cx: number, cz: number, radius: number, segments: number, gaps: number[]): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let i = 0; i < segments; i++) {
    if (gaps.includes(i)) continue;
    const a = (i / segments) * Math.PI * 2;
    out.push(wall(cx + Math.sin(a) * radius, cz + Math.cos(a) * radius, a + Math.PI / 2));
  }
  return out;
}

function onEnv(x: number, z: number, pad: number, kinds: EnvFeature['kind'][] = ['water']): boolean {
  return VAULTS_ENV.some((e) => kinds.includes(e.kind) && 'radius' in e && Math.hypot(x - e.x, z - e.z) < e.radius + pad);
}

function buildProps(): PropPlacement[] {
  const rng = new Rng('vaults-props');
  const props: PropPlacement[] = [];
  const nearPlace = (x: number, z: number, pad: number) =>
    [LAB9, GAMMA, GREAT_DOME, { ...MOTHER_TREE, radius: 16 }].some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + pad) ||
    Math.hypot(x - VAULTS_GATE.x, z - VAULTS_GATE.z) < 30 ||
    AIR_FILTERS.some((f) => Math.hypot(x - f.x, z - f.z) < 6) ||
    TELEPORTERS.some((t) => Math.hypot(x - t.x, z - t.z) < 8);

  // Pale lamps along the main roads.
  for (const road of ROADS) {
    if (road.id === 'roots') continue;
    alongRoad(road.points, road.id === 'service' ? 30 : 40, 12).forEach((p, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const off = road.width / 2 + 2;
      const x = p.x - p.dz * off * side;
      const z = p.z + p.dx * off * side;
      if (nearPlace(x, z, 2) || onEnv(x, z, 1)) return;
      props.push(lamp(x, z));
    });
  }

  // The border crossing: a quarantine checkpoint where the road leaves the refinery.
  const g = { x: VAULTS_GATE.arrive.x, z: VAULTS_GATE.arrive.z + 12 };
  props.push({ asset: 'prop.barricade', x: g.x + 9, z: g.z, rot: 0, colliders: line(2.2, 0.6, 3) });
  props.push({ asset: 'prop.barricade', x: g.x - 9, z: g.z, rot: 0, colliders: line(2.2, 0.6, 3) });
  props.push(lamp(g.x + 6, g.z + 4, '#ff5a3a'), lamp(g.x - 6, g.z + 4, '#ff5a3a'));

  // Lab 9: a sealed research block inside a walled yard; its red warning lights are a landmark.
  props.push({ asset: 'env.pump_house', x: LAB9.x - 7, z: LAB9.z - 7, rot: Math.PI / 4, scale: 1.2, colliders: [{ x: -3, z: 0, r: 3.2 }, { x: 3, z: 0, r: 3.2 }] });
  props.push(...ring(LAB9.x, LAB9.z, LAB9.radius - 2, 14, [3, 4, 10, 11]));
  props.push(lamp(LAB9.x - 9, LAB9.z + 9, '#ff3a2a'), lamp(LAB9.x + 9, LAB9.z - 9, '#ff3a2a'), lamp(LAB9.x + 10, LAB9.z + 11, '#c8ffd8'));
  props.push({ asset: 'prop.generator', x: LAB9.x + 10, z: LAB9.z - 1, rot: 1.2, collider: 1 });
  props.push({ asset: 'prop.control_terminal', x: LAB9.x - 12, z: LAB9.z + 3, rot: 0.6, collider: 0.45 });
  props.push(crate(LAB9.x - 12, LAB9.z - 2, 0.4), crate(LAB9.x + 3, LAB9.z + 14, 1.1));

  // The Outer Domes: rows of crops (irrigation pipes, half of them overgrown), tanks and pumps.
  const outer = VAULT_SUBZONES.outer;
  for (let row = 0; row < 14; row++) {
    const z = outer.c[1] - outer.r * 0.7 + row * 15;
    for (let x = outer.c[0] - outer.r * 0.8; x < outer.c[0] + outer.r * 0.8; x += 13) {
      const px = x + rng.range(-1.5, 1.5);
      if (!inSub(px, z, outer) || distanceToRoad(px, z) < 7 || nearPlace(px, z, 4) || onEnv(px, z, 2)) continue;
      if (rng.chance(0.55)) props.push({ asset: 'prop.pipe_section', x: px, z, rot: Math.PI / 2, colliders: line(4, 0.6, 4) });
      else if (rng.chance(0.6)) props.push(growth(px, z, rng.range(0.6, 1.2)));
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(20, outer.r * 0.8);
    const x = outer.c[0] + Math.sin(a) * d;
    const z = outer.c[1] + Math.cos(a) * d;
    if (distanceToRoad(x, z) < 8 || nearPlace(x, z, 6)) continue;
    props.push(rng.chance(0.5) ? { asset: 'prop.water_tanker', x, z, rot: rng.range(0, 6.28), colliders: line(4, 1.2, 3) } : { asset: 'prop.generator', x, z, rot: rng.range(0, 6.28), collider: 1 });
  }

  // The Green Sea: fungal trees tens of metres tall on a jittered grid, roads and trails left open.
  const sea = VAULT_SUBZONES.sea;
  for (let x = sea.c[0] - sea.r; x < sea.c[0] + sea.r; x += 19) {
    for (let z = sea.c[1] - sea.r; z < sea.c[1] + sea.r; z += 19) {
      const px = x + rng.range(-6, 6);
      const pz = z + rng.range(-6, 6);
      if (!inSub(px, pz, sea) || Math.abs(px) > HALF - 6 || Math.abs(pz) > HALF - 6) continue;
      if (distanceToRoad(px, pz) < 7 || nearPlace(px, pz, 6)) continue;
      const r = rng.next();
      if (r < 0.55) props.push(tree(px, pz, rng.range(3, 6.5)));
      else if (r < 0.8) props.push(growth(px, pz, rng.range(1, 2)));
      else props.push({ asset: 'prop.spore_nest', x: px, z: pz, scale: rng.range(0.8, 1.3), collider: 1.2 });
    }
  }

  // The Root Network: knotted roots (dark rock), fungus, and nests in a tight maze.
  const roots = VAULT_SUBZONES.roots;
  for (let x = roots.c[0] - roots.r; x < roots.c[0] + roots.r; x += 15) {
    for (let z = roots.c[1] - roots.r; z < roots.c[1] + roots.r; z += 15) {
      const px = x + rng.range(-5, 5);
      const pz = z + rng.range(-5, 5);
      if (!inSub(px, pz, roots) || Math.abs(px) > HALF - 6 || Math.abs(pz) > HALF - 6) continue;
      if (distanceToRoad(px, pz) < 5 || nearPlace(px, pz, 6)) continue;
      const r = rng.next();
      if (r < 0.5) props.push({ asset: 'env.slag_rock', x: px, z: pz, rot: rng.range(0, 6.28), scale: rng.range(1.4, 2.6), collider: 1.3 * 1.8 });
      else if (r < 0.8) props.push(growth(px, pz, rng.range(0.9, 2.2)));
      else props.push(tree(px, pz, rng.range(2.5, 4)));
    }
  }

  // The Seed Bank: concrete vault blocks, freezers and terminals under cold blue light.
  const seed = VAULT_SUBZONES.seed;
  for (let i = 0; i < 90; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(12, seed.r * 0.9);
    const x = seed.c[0] + Math.sin(a) * d;
    const z = seed.c[1] + Math.cos(a) * d;
    if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6 || distanceToRoad(x, z) < 7 || nearPlace(x, z, 6)) continue;
    const r = rng.next();
    if (r < 0.35) props.push(wall(x, z, rng.chance(0.5) ? 0 : Math.PI / 2));
    else if (r < 0.55) props.push({ asset: 'prop.generator', x, z, rot: rng.range(0, 6.28), collider: 1, light: { color: '#9fd8ff', intensity: 30, distance: 11, height: 1.6 } });
    else if (r < 0.7) props.push({ asset: 'prop.control_terminal', x, z, rot: rng.range(0, 6.28), collider: 0.45 });
    else if (r < 0.85) props.push(crate(x, z, rng.range(0, 6.28), rng.range(1, 1.4)));
    else props.push(growth(x, z, rng.range(0.8, 1.4)));
  }
  props.push({ asset: 'env.pump_house', x: seed.c[0] + 10, z: seed.c[1] + 6, rot: 0.4, scale: 1.3, colliders: [{ x: -3, z: 0, r: 3.4 }, { x: 3, z: 0, r: 3.4 }], light: { color: '#9fd8ff', intensity: 60, distance: 18, height: 3 } });

  // Dome Gamma: a walled dome gone to spores (its Root Nodes rise when the player arrives).
  props.push(...ring(GAMMA.x, GAMMA.z, GAMMA.radius, 18, [0, 1, 9, 10]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    props.push(growth(GAMMA.x + Math.sin(a) * (GAMMA.radius + 7), GAMMA.z + Math.cos(a) * (GAMMA.radius + 7), rng.range(1.2, 2)));
  }

  // The collapsed irrigation dam: two broken wall runs either side of the spillway.
  for (const [ax, az, bx, bz] of [
    [-24, 50, 26, 40],
    [58, 34, 112, 24],
  ] as const) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = (ax + (bx - ax) * t) * S;
      const z = (az + (bz - az) * t) * S;
      if (i === 2 && rng.chance(0.5)) continue;
      props.push(wall(x, z, Math.atan2(bx - ax, bz - az) + Math.PI / 2, 1.5));
    }
  }
  for (let i = 0; i < 14; i++) props.push({ asset: 'env.slag_rock', x: DAM.x + rng.range(-40, 40), z: DAM.z + rng.range(-14, -2), rot: rng.range(0, 6.28), scale: rng.range(0.8, 1.6), collider: 1.3 });

  // The Great Dome: walls around the arena; the Mother Tree beside it (seen from everywhere).
  props.push(...ring(GREAT_DOME.x, GREAT_DOME.z, GREAT_DOME.radius, 20, [10, 11]));
  props.push({
    asset: 'prop.lumen_wrath',
    x: MOTHER_TREE.x,
    z: MOTHER_TREE.z,
    scale: 5.5,
    landmark: true,
    // Lit from within, so it reads against the night sky from anywhere in the region.
    glow: '#2aff4a',
    collider: 5,
    light: { color: '#5dff6a', intensity: 180, distance: 46, height: 12 },
  });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    props.push({ ...growth(MOTHER_TREE.x + Math.sin(a) * 10, MOTHER_TREE.z + Math.cos(a) * 10, 2.4), landmark: i % 2 === 0 });
  }

  // Overgrowth and farm debris elsewhere so no stretch of road is empty.
  for (let i = 0; i < 380; i++) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = rng.range(-HALF + 10, HALF - 10);
    const d = distanceToRoad(x, z);
    if (d < 6 || d > 60 * S || nearPlace(x, z, 6) || onEnv(x, z, 2)) continue;
    if (inSub(x, z, sea) || inSub(x, z, roots)) continue;
    const r = rng.next();
    if (r < 0.3) props.push(growth(x, z, rng.range(0.8, 1.6)));
    else if (r < 0.5) props.push(crate(x, z, rng.range(0, 6.28)));
    else if (r < 0.65) props.push({ asset: 'prop.pipe_section', x, z, rot: rng.range(0, 6.28), colliders: line(4, 0.6, 4) });
    else if (r < 0.85) props.push(tree(x, z, rng.range(2.4, 4)));
    else props.push({ asset: 'prop.spore_nest', x, z, scale: rng.range(0.7, 1.1), collider: 1 });
  }
  return props;
}

// ---- Packs ------------------------------------------------------------------------------------

function buildPacks(): PackSpawn[] {
  const rng = new Rng('vaults-packs');
  const packs: PackSpawn[] = [];
  const safe = (x: number, z: number) =>
    Math.hypot(x - LAB9.x, z - LAB9.z) > LAB9.radius + 22 &&
    Math.hypot(x - VAULTS_GATE.arrive.x, z - VAULTS_GATE.arrive.z) > 40 &&
    Math.hypot(x - GREAT_DOME.x, z - GREAT_DOME.z) > GREAT_DOME.radius + 6 &&
    Math.hypot(x - GAMMA.x, z - GAMMA.z) > GAMMA.radius + 4;
  const templateAt = (x: number, z: number): string => {
    if (Math.hypot(x - GAMMA.x, z - GAMMA.z) < GAMMA.radius + 60) return 'hv_gamma';
    if (inSub(x, z, VAULT_SUBZONES.roots)) return 'hv_roots';
    if (inSub(x, z, VAULT_SUBZONES.seed)) return 'hv_seed';
    if (inSub(x, z, VAULT_SUBZONES.sea)) return 'hv_sea';
    if (inSub(x, z, VAULT_SUBZONES.outer)) return 'hv_outer';
    return 'hv_road';
  };
  let n = 0;
  for (const road of ROADS) {
    alongRoad(road.points, 31, 20).forEach((p) => {
      const side = rng.chance(0.5) ? 1 : -1;
      const off = rng.range(4, 12) * side;
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (!safe(x, z) || onEnv(x, z, 1)) return;
      packs.push({ id: `hv.pack.${n++}`, x, z, template: templateAt(x, z) });
    });
  }
  for (let i = 0; i < 160; i++) {
    const x = rng.range(-HALF + 20, HALF - 20);
    const z = rng.range(-HALF + 20, HALF - 20);
    const d = distanceToRoad(x, z);
    if (d < 20 || d > 90 * S || !safe(x, z) || onEnv(x, z, 2)) continue;
    packs.push({ id: `hv.pack.${n++}`, x, z, template: templateAt(x, z) });
  }
  return packs;
}

// ---- Points of interest -----------------------------------------------------------------------

function buildPois(): PoiDef[] {
  const rng = new Rng('vaults-pois');
  const pois: PoiDef[] = [];
  const free = (x: number, z: number) => Math.hypot(x - LAB9.x, z - LAB9.z) > LAB9.radius + 4 && !onEnv(x, z, 1);
  ROADS.forEach((road) =>
    alongRoad(road.points, 72, 36).forEach((p, i) => {
      const off = (i % 2 ? 1 : -1) * rng.range(6, 14);
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (free(x, z)) pois.push({ id: `hv.chest.${road.id}.${i}`, kind: 'chest', x, z });
    }),
  );
  const locked = scaled([[-60, -260], [-120, 20], [140, 30], [-260, 230], [280, 120], [220, -120]]);
  locked.forEach(([x, z], i) => {
    pois.push({ id: `hv.locked.${i}`, kind: 'lockedChest', x, z, data: { key: `hv.keycard.${i}` } });
    const a = rng.range(0, Math.PI * 2);
    pois.push({ id: `hv.keycard.${i}`, kind: 'keycard', x: x + Math.sin(a) * 22, z: z + Math.cos(a) * 22, data: { opens: `hv.locked.${i}` } });
  });
  const pylons = ['overcharge', 'kinetic', 'barrier', 'chainReaction', 'magnet', 'overclock'];
  scaled([[60, -120], [-90, -40], [-210, 80], [180, 60], [-120, 210], [120, 200]]).forEach(([x, z], i) =>
    pois.push({ id: `hv.pylon.${i}`, kind: 'pylon', x, z, data: { type: pylons[i]! } }),
  );
  // Hidden: under fungal trees, on dam rubble, deep in root tunnels.
  scaled([
    [-300, -60], [-210, 120], [-60, 30], [10, 34], [120, 32], [-280, 310], [-90, 330], [300, 250], [290, -300], [-150, -300],
  ]).forEach(([x, z], i) => pois.push({ id: `hv.relic.${i}`, kind: 'relic', x, z, data: { stat: ['maxLife', 'damage', 'armor', 'moveSpeed', 'resourceGen'][i % 5]! } }));
  scaled([
    [140, -300], [90, -250], [118, -228], [10, -150], [-80, -210], [-160, -60], [-250, 0], [-140, 120], [180, 130], [240, 180], [-200, 280], [30, 190],
  ]).forEach(([x, z], i) => pois.push({ id: `hv.lore.${i}`, kind: 'lore', x, z, data: { log: `hv.${i}` } }));
  // One signal tower per outer subzone.
  scaled([[-30, -230], [-250, -40], [250, 80]]).forEach(([x, z], i) => pois.push({ id: `hv.tower.${i}`, kind: 'signalTower', x, z }));
  scaled([[80, -160], [-20, -60], [170, 90]]).forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) pois.push({ id: `hv.barrel.${i}.${k}`, kind: 'barrel', x: x + rng.range(-3, 3), z: z + rng.range(-3, 3) });
  });
  // Glowing crystals: break one to blind the enemies around it.
  let c = 0;
  for (const [sub, count] of [
    [VAULT_SUBZONES.sea, 10],
    [VAULT_SUBZONES.roots, 8],
    [VAULT_SUBZONES.seed, 6],
  ] as const) {
    for (let i = 0, made = 0; i < count * 4 && made < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(10, sub.r * 0.9);
      const x = sub.c[0] + Math.sin(a) * d;
      const z = sub.c[1] + Math.cos(a) * d;
      if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8 || distanceToRoad(x, z) > 40 || !free(x, z)) continue;
      pois.push({ id: `hv.crystal.${c++}`, kind: 'crystal', x, z });
      made++;
    }
  }
  // Air-filter stations and hydro maintenance rooms.
  scaled([[180, -280], [-120, -140], [-260, 120], [-40, 250], [290, 40], [160, 260]]).forEach(([x, z], i) =>
    pois.push({ id: `hv.bunker.${i}`, kind: 'bunker', x, z, data: { bunker: i, instance: 'hv_bunker' } }),
  );
  pois.push(
    { id: 'hv.dungeon.seedbank', kind: 'dungeon', ...at(272, 188), data: { dungeon: 'seed_bank_depths' } },
    { id: 'hv.dungeon.cocoon', kind: 'dungeon', ...at(-236, 304), data: { dungeon: 'cocoon_chamber' } },
    { id: 'hv.dungeon.irrigation', kind: 'dungeon', ...at(118, 66), data: { dungeon: 'irrigation_system' } },
    { id: 'hv.dungeon.sleepinglab', kind: 'dungeon', ...at(-20, -272), data: { dungeon: 'sleeping_lab' } },
    { id: GAMMA.id, kind: 'stronghold', x: GAMMA.x, z: GAMMA.z },
    { id: GREAT_DOME.id, kind: 'boss', x: GREAT_DOME.x, z: GREAT_DOME.z },
  );
  for (const f of AIR_FILTERS) pois.push({ id: f.id, kind: 'feature', x: f.x, z: f.z, data: { feature: 'airFilter', radius: FILTER_RADIUS } });
  const events: [string, number, number][] = [
    ['sporeBloom', -200, 40], ['swarmMigration', 0, -120], ['rootEruption', -140, 240], ['rescue', 230, 160], ['eliteHunt', 120, -120], ['supplyDrop', -60, 140],
  ];
  events.forEach(([type, x, z]) => pois.push({ id: `hv.event.${type}`, kind: 'event', x: x * S, z: z * S, data: { event: type } }));
  return pois;
}

const PROPS = buildProps();

export const HYDROPONIC_VAULTS: ZoneDef = {
  id: 'zone.hydroponic_vaults',
  key: 'hydroponicVaults',
  halfSize: HALF,
  levels: [20, 30],
  playerSpawn: VAULTS_GATE.arrive,
  // Humid green mist and bioluminescence.
  ambient: { color: '#4e6e5c', intensity: 0.6 },
  moon: { color: '#a8e0bc', intensity: 1.1 },
  fog: { color: '#0d1a13', density: 0.022 },
  playerLight: { color: '#e0ffd8', intensity: 45, distance: 12 },
  // Drifting spores instead of ash.
  particles: '#8aff6a',
  props: PROPS,
  scatter: [{ asset: 'env.debris_rock', count: 22000, seed: 'vaults-debris', minScale: 0.4, maxScale: 1.8 }],
  ground: buildGround(PROPS),
  subzones: [
    { id: 'serviceRoad', center: [0, 0], radius: 0 },
    { id: 'outerDomes', center: VAULT_SUBZONES.outer.c, radius: VAULT_SUBZONES.outer.r },
    { id: 'greenSea', center: VAULT_SUBZONES.sea.c, radius: VAULT_SUBZONES.sea.r },
    { id: 'seedBank', center: VAULT_SUBZONES.seed.c, radius: VAULT_SUBZONES.seed.r },
    { id: 'rootNetwork', center: VAULT_SUBZONES.roots.c, radius: VAULT_SUBZONES.roots.r },
  ],
  roads: ROADS,
  hubs: [LAB9],
  teleporters: TELEPORTERS,
  packs: buildPacks(),
  pois: clearOfProps(buildPois(), PROPS),
  mapCell: 8,
  gates: [VAULTS_GATE],
  env: VAULTS_ENV,
  domes: [
    { ...at(40, -170), radius: 58 * S },
    { ...at(-60, -228), radius: 44 * S },
    { ...at(-190, -10), radius: 120 * S },
    { ...at(210, 130), radius: 82 * S },
    { ...at(-150, 250), radius: 96 * S },
    { x: GAMMA.x, z: GAMMA.z, radius: GAMMA.radius + 12 },
    { x: GREAT_DOME.x, z: GREAT_DOME.z, radius: 64 * S },
  ],
  region: 3,
  stash: { x: LAB9.x + 9, z: LAB9.z + 7 },
};
