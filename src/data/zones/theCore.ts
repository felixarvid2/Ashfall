/**
 * Region 5: The Core (levels 40–50). Plan and map: docs/regions/the-core.md.
 * Design coordinates × 2.2 like the earlier regions. One cathedral-sized cavern lit from within:
 * the open caverns (and the Hanging Gardens' islands and energy bridges) are walkable, the rest is
 * rock or open air, drawn by the renderer from the same grid the mines use (caves.ts). Not dark.
 * Every id is prefixed `core.` (hub, teleporters and gates keep the earlier zones' naming).
 * R5-A is the greybox: zone, gate, hazards, hub, markers and packs of existing enemies; the
 * dungeons, mirrors, the Elevator Base and Lumen are markers until R5-C.
 */
import { Rng } from '../../core/rng';
import { caveGrid, nearestWalkable, openAt, type Bridge, type Cavern, type CaveDef } from './caves';
import { alongRoad, clearOfProps, line } from './layout';
import type { GroundDef, GroundPatch, ScatterDef } from './testArena';
import type { EnvFeature, PackSpawn, PoiDef, PropPlacement, Road, ZoneDef } from './zoneTypes';

const S = 2.2;
/** A design coordinate pair in metres. */
export const cr = (x: number, z: number): [number, number] => [x * S, z * S];
const scaled = (pts: [number, number][]): [number, number][] => pts.map(([x, z]) => cr(x, z));
const at = (x: number, z: number) => ({ x: x * S, z: z * S });

const HALF = Math.round(340 * S);

/** The Last Camp: a sealed section of the elevator shaft's service tunnel. */
export const LAST_CAMP = { id: 'hub.camp', x: 0, z: -110 * S, radius: 24 };
/** The space elevator shaft: the landmark at the centre. */
export const SHAFT = { x: 0, z: 60 * S };
/** The Elevator Base stronghold site at the shaft's foot (R5-C builds the battle). */
export const ELEVATOR_BASE = { id: 'core.stronghold.base', x: SHAFT.x, z: SHAFT.z, radius: 34 };
/** Lumen's heart: the final arena (R5-C). */
export const LUMEN_HEART = { id: 'core.boss.lumen', x: 0, z: 285 * S, radius: 44 };

/** The bore Kade's Main Drill punched through: the way up from the Deep Mines, at the south edge. */
export const CORE_GATE = {
  id: 'gate.core.mines',
  x: 0,
  z: -334 * S,
  radius: 7,
  to: { zone: 'zone.deep_mines', gate: 'gate.dm.core' },
  arrive: { x: 0, z: -318 * S },
};

export const CORE_SUBZONES = {
  borderland: { c: cr(0, -230), r: 135 * S },
  gardens: { c: cr(-205, 100), r: 125 * S },
  halls: { c: cr(205, 45), r: 130 * S },
  heart: { c: cr(0, 265), r: 105 * S },
};
const inSub = (x: number, z: number, s: { c: [number, number]; r: number }) => Math.hypot(x - s.c[0], z - s.c[1]) < s.r;

// ---- Walkable ground ----------------------------------------------------------------------------

/**
 * Roads are paths of the base ground (`surface` = the base texture draws no ribbon): the rusty plate of the
 * old workings comes from the ground patches along the bore and the camp drift, and fades into Lumen matter.
 */
const SURFACE = 'lumen_matter' as const;
const ROADS: Road[] = [
  // The bore from the Deep Mines into the Borderland, then the old drift to the Last Camp.
  { id: 'bore', width: 12, points: scaled([[0, -334], [0, -296]]), surface: SURFACE },
  { id: 'camp', width: 12, points: scaled([[0, -296], [0, -268], [-6, -200], [0, -140], [0, -110]]), surface: SURFACE },
  // Drifts out to the machinery either side of the mouth.
  { id: 'west', width: 10, points: scaled([[-70, -232], [-100, -214], [-130, -195]]), surface: SURFACE },
  { id: 'east', width: 10, points: scaled([[72, -236], [100, -212], [130, -188]]), surface: SURFACE },
  // Up the middle to the elevator shaft, east into the Memory Halls, west to the Gardens.
  { id: 'spine', width: 12, points: scaled([[0, -110], [0, -40], [0, 20], [0, 60]]), surface: SURFACE },
  { id: 'halls', width: 12, points: scaled([[0, 40], [70, 44], [130, 50], [190, 58]]), surface: SURFACE },
  { id: 'gardens', width: 10, points: scaled([[0, -20], [-50, 0], [-100, 34]]), surface: SURFACE },
  // The heart causeway over the chasm, and the way on to the Heart.
  { id: 'causeway', width: 14, points: scaled([[0, 100], [0, 130], [0, 200]]), surface: SURFACE },
  { id: 'heart', width: 12, points: scaled([[0, 200], [0, 240], [0, 270]]), surface: SURFACE },
];

const C = (x: number, z: number, r: number): Cavern => ({ x: x * S, z: z * S, radius: r * S });
const CAVERNS: Cavern[] = [
  // The Borderland: the bore's mouth, the cavern it opens into, and the machinery either side.
  C(0, -268, 30), C(-70, -232, 34), C(72, -236, 36), C(0, -205, 45), C(-130, -195, 30), C(130, -188, 30), C(0, -140, 92),
  // The great cavern round the shaft, and a lobe towards the Gardens.
  C(0, 40, 112), C(-85, 140, 30),
  // The Memory Halls: four memories side by side.
  C(190, 60, 100), C(215, -30, 60), C(135, -45, 45), C(245, 125, 40),
  // The Heart.
  C(0, 275, 88), C(-60, 240, 40), C(60, 240, 40),
];

/** A floating island of Lumen matter in the Hanging Gardens (radius in metres, like caverns). */
export interface Island extends Cavern {
  id: string;
  /** Only energy bridges that switch on and off lead here. */
  cycleOnly?: boolean;
}
const I = (id: string, x: number, z: number, r: number, cycleOnly = false): Island => ({ id, x: x * S, z: z * S, radius: r * S, ...(cycleOnly ? { cycleOnly } : {}) });
export const ISLANDS: Island[] = [
  I('g1', -140, 58, 12),
  I('g2', -160, 30, 11, true),
  I('g3', -176, 92, 13),
  I('g4', -212, 110, 12),
  I('g5', -248, 84, 12),
  I('g6', -262, 140, 12),
  I('g7', -205, 160, 13),
  I('g8', -300, 185, 9),
  I('g9', -245, 205, 10),
  I('g10', -282, 75, 9, true),
  I('g11', -150, 150, 11),
];
export const island = (id: string): Island => ISLANDS.find((i) => i.id === id)!;

/** Seconds on / off, flicker warning, as in the plan: 8 s on (the last 1 s flickering), 3 s off. */
const CYCLE = { on: 8, off: 3, flicker: 1 };
const centre = (id: string): [number, number] => [island(id).x, island(id).z];
const BRIDGE_WIDTH = 8;
const bridge = (id: string, a: [number, number], b: [number, number], offset?: number): Bridge => ({
  id: `core.bridge.${id}`,
  a,
  b,
  width: BRIDGE_WIDTH,
  ...(offset === undefined ? {} : { cycle: { ...CYCLE, offset } }),
});
export const BRIDGES: Bridge[] = [
  // From the great cavern's edge, and from its lobe.
  bridge('in', cr(-108, 45), centre('g1')),
  bridge('in2', cr(-112, 142), centre('g11')),
  bridge('g1g3', centre('g1'), centre('g3')),
  bridge('g3g4', centre('g3'), centre('g4'), 5),
  bridge('g4g5', centre('g4'), centre('g5')),
  bridge('g4g6', centre('g4'), centre('g6')),
  bridge('g4g7', centre('g4'), centre('g7')),
  bridge('g6g8', centre('g6'), centre('g8')),
  bridge('g7g9', centre('g7'), centre('g9')),
  bridge('g8g9', centre('g8'), centre('g9')),
  bridge('g11g7', centre('g11'), centre('g7')),
  // Switching bridges: the only way to the two outer islands.
  bridge('g1g2', centre('g1'), centre('g2'), 0),
  bridge('g5g10', centre('g5'), centre('g10'), 2),
];

/** Melt pools in the Borderland: Lumen matter flowing through the old workings. Not walkable. */
const MELT: Cavern[] = [C(-45, -178, 8), C(50, -190, 9), C(-100, -240, 8), C(118, -200, 7), C(-125, -160, 8), C(95, -150, 8)];

export const CORE_CAVES: CaveDef = {
  caverns: [...CAVERNS, ...ISLANDS.map(({ x, z, radius }) => ({ x, z, radius }))],
  holes: MELT,
  // The abyss under the Gardens, and the chasm the heart causeway crosses.
  abyss: [{ x: -210 * S, z: 100 * S, radius: 126 * S }, { x: 0, z: 168 * S, radius: 48 * S }],
  bridges: BRIDGES,
};
const SOURCE = { halfSize: HALF, roads: ROADS, hubs: [LAST_CAMP], caves: CORE_CAVES };
const GRID = caveGrid(SOURCE)!;

/** Distance to the nearest bridge strip (the cells a switching bridge opens are not solid ground). */
function bridgeGap(x: number, z: number): number {
  let best = Infinity;
  for (const b of BRIDGES) {
    const dx = b.b[0] - b.a[0];
    const dz = b.b[1] - b.a[1];
    const t = Math.max(0, Math.min(1, ((x - b.a[0]) * dx + (z - b.a[1]) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (b.a[0] + dx * t), z - (b.a[1] + dz * t)) - b.width / 2);
  }
  return best;
}
/** Open ground with room to spare that is never a bridge (tests and placement). */
export const openGround = (x: number, z: number, pad = 0): boolean => openAt(GRID, x, z, pad) && bridgeGap(x, z) > pad + 1;

// ---- Environment: melt pools and Unstable Gravity -----------------------------------------------

function buildEnv(): EnvFeature[] {
  const env: EnvFeature[] = [];
  // Melt pools glow like molten metal; they sit inside the unwalkable holes, so nobody stands in them.
  MELT.forEach((m, i) => env.push({ kind: 'molten', id: `core.melt.${i}`, x: m.x, z: m.z, radius: m.radius - 1.6 }));
  // Hanging Gardens: islands pull towards the drop. Offsets keep the fields out of step.
  [['g3', 0], ['g4', 4], ['g5', 8], ['g6', 12], ['g7', 2], ['g8', 6], ['g9', 10]].forEach(([id, offset], i) => {
    const isl = island(id as string);
    env.push({ kind: 'gravity', id: `core.gravity.garden.${i}`, x: isl.x, z: isl.z, radius: Math.min(isl.radius - 3, 24), mode: 'abyss', period: 16, offset: offset as number });
  });
  // The Heart: the pull turns a quarter each wave.
  env.push(
    { kind: 'gravity', id: 'core.gravity.heart.0', x: LUMEN_HEART.x, z: LUMEN_HEART.z, radius: 38, mode: 'rotate', period: 18, offset: 0, dir: 0, turn: Math.PI / 2 },
    { kind: 'gravity', id: 'core.gravity.heart.1', ...at(-70, 255), radius: 33, rect: { hx: 28, hz: 18 }, mode: 'rotate', period: 18, offset: 6, dir: Math.PI / 2, turn: Math.PI / 2 },
    { kind: 'gravity', id: 'core.gravity.heart.2', ...at(70, 255), radius: 33, rect: { hx: 28, hz: 18 }, mode: 'rotate', period: 18, offset: 12, dir: -Math.PI / 2, turn: -Math.PI / 2 },
    { kind: 'gravity', id: 'core.gravity.heart.3', ...at(0, 228), radius: 26, mode: 'rotate', period: 18, offset: 9, dir: Math.PI, turn: Math.PI / 2 },
  );
  return env;
}
export const CORE_ENV = buildEnv();

// ---- Ground -------------------------------------------------------------------------------------

function buildGround(): GroundDef {
  const STEEL = 0;
  const ROCK = 1;
  const ASH = 2;
  const SLAG = 3;
  const MOSS = 4;
  const CONCRETE = 5;
  const patches: GroundPatch[] = [];
  // The Borderland: rusty mine plate along the bore and the old drift, mine rock round it, both fading into
  // the pale Lumen matter of the base ground as the cavern opens up (strength falls with the distance north).
  const worn = (z0: number, z1: number, layer: number, radius: number, step: number, from: number, to: number) => {
    for (let z = z0; z <= z1 + 0.1; z += step) {
      const k = (z - z0) / (z1 - z0);
      patches.push({ layer, x: 0, z: z * S, radius: radius * S, strength: from + (to - from) * k });
    }
  };
  worn(-334, -285, STEEL, 9, 14, 0.9, 0.1);
  worn(-330, -235, ROCK, 40, 22, 0.7, 0.1);
  // The machinery either side of the mouth stands on mine floor.
  for (const [x, z] of [[-130, -195], [130, -188], [-70, -232], [72, -236]] as const) patches.push({ layer: ROCK, x: x * S, z: z * S, radius: 24 * S, strength: 0.7 });
  // The Last Camp and the Elevator Base: the clean slabs of the shaft's service floor.
  patches.push({ layer: CONCRETE, x: LAST_CAMP.x, z: LAST_CAMP.z, radius: LAST_CAMP.radius + 10 });
  patches.push({ layer: CONCRETE, x: ELEVATOR_BASE.x, z: ELEVATOR_BASE.z, radius: ELEVATOR_BASE.radius + 4, strength: 0.9 });
  // The Memory Halls: each memory keeps its region's ground, full strength.
  patches.push(
    { layer: ASH, x: 240 * S, z: 110 * S, radius: 42 * S },
    { layer: SLAG, x: 225 * S, z: -35 * S, radius: 40 * S },
    { layer: MOSS, x: 175 * S, z: 70 * S, radius: 38 * S },
    { layer: ROCK, x: 130 * S, z: -40 * S, radius: 36 * S },
  );
  // The Gardens and the Heart are bare Lumen matter: the base ground.
  return { base: 'lumen_matter', tile: 9, layers: ['steel_plating', 'mine_rock', 'ash_plain', 'cooling_slag', 'fungal_moss', 'military_concrete'], patches, road: 'lumen_matter' };
}

// ---- Props --------------------------------------------------------------------------------------

const GOLD = '#ffd88a';
const VIOLET = '#b48cff';
const lamp = (x: number, z: number, color = '#ffe6b0', intensity = 70): PropPlacement => ({
  asset: 'prop.emergency_light',
  x,
  z,
  collider: 0.3,
  light: { color, intensity, distance: 14, height: 3 },
});
const growth = (x: number, z: number, scale: number, glow = GOLD, lit = false): PropPlacement => ({
  asset: 'prop.lumen_growth',
  x,
  z,
  scale,
  collider: 0.4 * scale,
  glow,
  ...(lit ? { light: { color: glow, intensity: 40, distance: 12, height: 2.4 } } : {}),
});
/** A Modular SciFi wall panel runs 4 m along its local z axis (3 m high): collision circles follow it. */
const panel = (x: number, z: number, rot: number, scale = 1): PropPlacement => ({
  asset: 'prop.core_wall_panel',
  x,
  z,
  rot,
  scale,
  colliders: [-1.4, 0, 1.4].map((p) => ({ x: 0, z: p, r: 0.75 })),
});
function ring(cx: number, cz: number, radius: number, gaps: number[], scale = 1): PropPlacement[] {
  const n = Math.round((Math.PI * 2 * radius) / (4 * scale));
  const out: PropPlacement[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Gaps are given as compass angles (radians); everything within a gap's half width is left open.
    if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 3.4 / radius)) continue;
    out.push(panel(cx + Math.sin(a) * radius, cz + Math.cos(a) * radius, a + Math.PI / 2, scale));
  }
  return out;
}

function buildProps(): PropPlacement[] {
  const rng = new Rng('core-props');
  const props: PropPlacement[] = [];
  const clear = (x: number, z: number, pad = 2) =>
    openGround(x, z, pad) &&
    Math.hypot(x - LAST_CAMP.x, z - LAST_CAMP.z) > LAST_CAMP.radius + 3 &&
    Math.hypot(x - ELEVATOR_BASE.x, z - ELEVATOR_BASE.z) > ELEVATOR_BASE.radius + 2 &&
    Math.hypot(x - CORE_GATE.arrive.x, z - CORE_GATE.arrive.z) > 8;
  const onPool = (x: number, z: number, pad: number) => MELT.some((m) => Math.hypot(x - m.x, z - m.z) < m.radius + pad);

  // The bore: lamps and timber where the old drill shaft meets Lumen matter.
  for (const dz of [-8, 8, 24]) {
    props.push(lamp(-8, CORE_GATE.arrive.z + dz, GOLD, 80), lamp(8, CORE_GATE.arrive.z + dz, GOLD, 80));
  }
  props.push(growth(-9, CORE_GATE.z + 14, 1.6, GOLD, true), growth(9, CORE_GATE.z + 20, 1.2, GOLD));

  // Tunnels and workings of the Borderland: crates, wall slabs, pipes (melting into the floor) and growths.
  for (const road of ROADS.filter((r) => r.id === 'bore' || r.id === 'camp')) {
    alongRoad(road.points, 24, 8).forEach((p, i) => {
      const side = i % 2 ? 1 : -1;
      const off = (road.width / 2 - 0.5) * side;
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (!clear(x, z, 0.5)) return;
      const r = rng.next();
      if (r < 0.3) props.push({ asset: 'prop.cargo_crate', x, z, rot: Math.atan2(p.dx, p.dz), scale: 0.8, collider: 0.85 });
      else if (r < 0.5) props.push({ asset: 'env.wall_segment', x, z, rot: Math.atan2(p.dx, p.dz), scale: 0.4, collider: 0.6 });
      else if (r < 0.65) props.push(lamp(x, z));
      else if (r < 0.8) props.push({ asset: 'prop.core_pipe', x, z, rot: Math.atan2(p.dx, p.dz), scale: 2.6, colliders: line(2.4, 0.4, 3) });
      else props.push(growth(x, z, rng.range(0.6, 1.2)));
    });
  }
  // Machinery west and east, half swallowed by Lumen matter.
  for (const [x, z] of scaled([[-130, -195], [130, -188], [-70, -232], [72, -236]])) {
    props.push({ asset: 'prop.compressor', x: x + 6, z: z + 4, rot: rng.range(0, 6), collider: 1.4 });
    props.push({ asset: 'env.catwalk', x: x - 7, z: z - 3, rot: rng.range(0, 6), scale: 0.8, colliders: line(5, 0.6, 4) });
    props.push(growth(x + 2, z - 8, rng.range(1.4, 2.4), GOLD, true));
    // Pipes of the old plant, half sunk into the floor, with the collars Lumen grew round them.
    for (let k = 0; k < 6; k++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, 3.5);
      const px = x - 2 + Math.sin(a) * d;
      const pz = z + 9 + Math.cos(a) * d;
      const sc = rng.range(3, 7);
      props.push({ asset: k % 2 ? 'prop.core_pipe' : 'prop.core_pipe_ring', x: px, z: pz, rot: rng.range(0, 6), scale: sc, collider: 0.12 * sc + 0.3 });
    }
  }
  // Lumen matter creeping over the Borderland floor.
  for (let i = 0; i < 160; i++) {
    const x = rng.range(-130, 130) * S;
    const z = rng.range(-300, -100) * S;
    if (!clear(x, z, 3) || onPool(x, z, 4)) continue;
    props.push(growth(x, z, rng.range(0.5, 1.6), GOLD, rng.chance(0.08)));
  }

  // The Last Camp: a sealed section of the shaft's service tunnel: a ring of plates with two doors,
  // cables across the floor, consoles, lamps and the stash.
  const L = LAST_CAMP;
  props.push(...ring(L.x, L.z, L.radius - 1.5, [0, Math.PI], 1.4));
  props.push({ asset: 'prop.core_door', x: L.x, z: L.z - (L.radius - 1.5), rot: 0, scale: 1 }, { asset: 'prop.core_door', x: L.x, z: L.z + (L.radius - 1.5), rot: 0, scale: 1 });
  props.push(
    { asset: 'prop.core_console', x: L.x - 9, z: L.z + 8, rot: 0.6, scale: 1.1, collider: 0.7 },
    { asset: 'prop.core_console', x: L.x + 10, z: L.z + 6, rot: -0.5, scale: 1.1, collider: 0.7 },
    { asset: 'prop.core_platform', x: L.x, z: L.z, scale: 1.3 },
    { asset: 'prop.core_cable', x: L.x - 5, z: L.z - 6, rot: 0.9, scale: 1.4 },
    { asset: 'prop.core_cable', x: L.x + 6, z: L.z + 12, rot: -1.1, scale: 1.4 },
    { asset: 'prop.generator', x: L.x + 14, z: L.z - 6, rot: 1, collider: 1 },
    { asset: 'prop.cargo_crate', x: L.x - 14, z: L.z - 4, rot: 0.4, collider: 1 },
    lamp(L.x - 6, L.z + 3, '#fff0c8', 90),
    lamp(L.x + 6, L.z - 3, '#fff0c8', 90),
    lamp(L.x + 2, L.z + 14, '#fff0c8', 80),
  );

  // The space elevator shaft: a steel core with a column of light rising out of it (ZoneDef.beams) and six
  // columns round its foot, lit from inside. A column is 5 m at scale 1: the core is about 17 m, the rest 6.5 m.
  props.push(
    { asset: 'prop.core_column', x: SHAFT.x, z: SHAFT.z, scale: 3.4, landmark: true, collider: 2.2, light: { color: '#fff0c8', intensity: 90, distance: 46, height: 11 } },
    ...[0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2;
      return { asset: 'prop.core_column', x: SHAFT.x + Math.sin(a) * 12, z: SHAFT.z + Math.cos(a) * 12, scale: 1.3, collider: 1.1, ...(i % 2 ? { light: { color: VIOLET, intensity: 50, distance: 18, height: 4 } } : {}) } as PropPlacement;
    }),
  );
  // The Elevator Base: a plated ring round the shaft's foot with four doors, consoles on the rim (greybox).
  const B = ELEVATOR_BASE;
  props.push(...ring(B.x, B.z, B.radius, [0, Math.PI / 2, Math.PI, -Math.PI / 2], 1.4));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({ asset: 'prop.core_door', x: B.x + Math.sin(a) * B.radius, z: B.z + Math.cos(a) * B.radius, rot: a, scale: 1 });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    props.push({ asset: 'prop.core_console', x: B.x + Math.sin(a) * (B.radius - 5), z: B.z + Math.cos(a) * (B.radius - 5), rot: a + Math.PI, collider: 0.7 });
  }
  props.push({ asset: 'prop.elevator_foundation', x: B.x + 20, z: B.z - 18, rot: 0.3, scale: 0.8, collider: 4 });

  // The heart causeway: columns either side, lit.
  alongRoad(scaled([[0, 104], [0, 200]]), 18, 6).forEach((p, i) => {
    for (const side of [-1, 1]) props.push({ asset: 'prop.core_column', x: p.x + side * 9.5, z: p.z, scale: 1.2, collider: 0.7, ...(i % 3 === 0 ? { light: { color: GOLD, intensity: 60, distance: 16, height: 4 } } : {}) });
  });

  // The Hanging Gardens: Lumen growths and ruined columns on the islands, lit gold and violet.
  for (const isl of ISLANDS) {
    props.push({ asset: 'prop.core_column', x: isl.x + isl.radius * 0.3, z: isl.z - isl.radius * 0.2, scale: 1.3, collider: 0.9, light: { color: VIOLET, intensity: 60, distance: 20, height: 4 } });
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.15, 0.85) * isl.radius;
      const x = isl.x + Math.sin(a) * d;
      const z = isl.z + Math.cos(a) * d;
      if (!clear(x, z, 2.5)) continue;
      props.push(growth(x, z, rng.range(0.8, 2.4), i % 3 ? GOLD : VIOLET, i % 4 === 0));
    }
  }
  // A lamp beside each bridge mouth, where the rails start (the bridge itself is drawn by the renderer).
  for (const b of BRIDGES) {
    const dx = b.b[0] - b.a[0];
    const dz = b.b[1] - b.a[1];
    const len = Math.hypot(dx, dz);
    for (const [end, dir] of [[b.a, 1], [b.b, -1]] as const) {
      const isl = ISLANDS.find((i) => i.x === end[0] && i.z === end[1]);
      if (!isl) continue;
      const x = end[0] + (dx / len) * dir * (isl.radius - 3.5) + (-dz / len) * (BRIDGE_WIDTH / 2 + 1.2);
      const z = end[1] + (dz / len) * dir * (isl.radius - 3.5) + (dx / len) * (BRIDGE_WIDTH / 2 + 1.2);
      if (clear(x, z, 1)) props.push(lamp(x, z, VIOLET, 60));
    }
  }

  // The Memory Halls: each patch keeps its region's props.
  const patch = (cx: number, cz: number, r: number, n: number, fn: (x: number, z: number) => PropPlacement | null) => {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, r * S);
      const x = cx * S + Math.sin(a) * d;
      const z = cz * S + Math.cos(a) * d;
      if (!clear(x, z, 3)) continue;
      const p = fn(x, z);
      if (p) props.push(p);
    }
  };
  // Ash: wrecks and drifts, as the Flats.
  patch(240, 110, 42, 40, (x, z) => {
    const r = rng.next();
    if (r < 0.15) return { asset: 'prop.escape_pod', x, z, rot: rng.range(0, 6), scale: 0.9, collider: 1.6 };
    if (r < 0.22) return { asset: 'prop.crashed_lander', x, z, rot: rng.range(0, 6), scale: 0.5, collider: 4 };
    if (r < 0.6) return { asset: 'env.slag_rock', x, z, rot: rng.range(0, 6), scale: rng.range(0.7, 1.6), collider: 1 };
    return growth(x, z, rng.range(0.6, 1.2), '#8fd48a');
  });
  // Fire: smokestacks, furnace blocks and vents, as the Refinery.
  patch(225, -35, 40, 34, (x, z) => {
    const r = rng.next();
    if (r < 0.12) return { asset: 'env.smokestack', x, z, scale: rng.range(0.5, 0.8), collider: 2 };
    if (r < 0.4) return { asset: 'env.furnace_block', x, z, rot: rng.range(0, 6), scale: rng.range(0.7, 1.1), collider: 2.2 };
    if (r < 0.6) return { asset: 'prop.vent', x, z, rot: rng.range(0, 6), collider: 0.8 };
    return { asset: 'env.slag_rock', x, z, rot: rng.range(0, 6), scale: rng.range(0.7, 1.4), collider: 1 };
  });
  // Jungle: fungal trees and nests, as the Vaults.
  patch(175, 70, 38, 44, (x, z) => {
    const r = rng.next();
    if (r < 0.4) return growth(x, z, rng.range(2.5, 5.5), '#5dff6a', rng.chance(0.2));
    if (r < 0.7) return growth(x, z, rng.range(0.8, 1.8), '#5dff6a');
    return { asset: 'prop.spore_nest', x, z, scale: rng.range(0.8, 1.2), collider: 1.2 };
  });
  // Darkness: black crystal and rock, as the Mines.
  patch(130, -40, 34, 34, (x, z) => (rng.chance(0.5) ? growth(x, z, rng.range(1, 3), '#5ac8ff', rng.chance(0.2)) : { asset: 'env.moon_rock_a', x, z, rot: rng.range(0, 6), scale: rng.range(1, 2.4), collider: 1.4 }));
  // The Halls' ceiling is a mirror image of Outpost Ember: that decoration is R5-D.

  // The Heart: columns of light round the arena.
  const H = LUMEN_HEART;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    props.push({ asset: 'prop.core_column', x: H.x + Math.sin(a) * (H.radius + 6), z: H.z + Math.cos(a) * (H.radius + 6), scale: 1.4, collider: 0.8, light: { color: i % 2 ? VIOLET : GOLD, intensity: 70, distance: 22, height: 5 } });
  }
  props.push({ asset: 'prop.lumen_wrath', x: H.x, z: H.z + 14, scale: 3, glow: '#fff0c8', landmark: true, collider: 3, light: { color: '#fff0c8', intensity: 90, distance: 46, height: 8 } });

  // Rubble and loose rock in the open caverns.
  for (let i = 0; i < 420; i++) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = rng.range(-HALF + 10, HALF - 10);
    if (!clear(x, z, 3) || onPool(x, z, 3) || Math.hypot(x - H.x, z - H.z) < H.radius) continue;
    props.push({ asset: 'env.slag_rock', x, z, rot: rng.range(0, 6.28), scale: rng.range(0.5, 1.4), collider: 0.7 * 1.4 });
  }
  return props;
}

// ---- Packs --------------------------------------------------------------------------------------

/** The Memory Halls' four memories: ash (Cinder Flats), fire (Refinery), jungle (Vaults), darkness (Mines). */
const HALL_MEMORIES = [
  { x: 240 * S, z: 110 * S, template: 'core_halls_ash' },
  { x: 225 * S, z: -35 * S, template: 'core_halls_fire' },
  { x: 175 * S, z: 70 * S, template: 'core_halls_jungle' },
  { x: 130 * S, z: -40 * S, template: 'core_halls_dark' },
];

/** Pack templates are src/data/packs.ts `core_*`; R5-B swaps their members for the Core roster. */
function templateAt(x: number, z: number): string {
  if (Math.hypot(x - ELEVATOR_BASE.x, z - ELEVATOR_BASE.z) < ELEVATOR_BASE.radius + 50) return 'core_base';
  if (inSub(x, z, CORE_SUBZONES.heart)) return 'core_heart';
  if (inSub(x, z, CORE_SUBZONES.gardens)) return 'core_gardens';
  if (inSub(x, z, CORE_SUBZONES.halls)) {
    // Each memory owns the ground nearest its heart.
    const near = HALL_MEMORIES.reduce((best, m) => (Math.hypot(x - m.x, z - m.z) < Math.hypot(x - best.x, z - best.z) ? m : best));
    return near.template;
  }
  if (inSub(x, z, CORE_SUBZONES.borderland) || z < -60 * S) return 'core_borderland';
  return 'core_base';
}

function buildPacks(): PackSpawn[] {
  const rng = new Rng('core-packs');
  const packs: PackSpawn[] = [];
  const safe = (x: number, z: number) =>
    openGround(x, z, 2) &&
    Math.hypot(x - LAST_CAMP.x, z - LAST_CAMP.z) > LAST_CAMP.radius + 24 &&
    Math.hypot(x - CORE_GATE.arrive.x, z - CORE_GATE.arrive.z) > 50 &&
    Math.hypot(x - ELEVATOR_BASE.x, z - ELEVATOR_BASE.z) > 18 &&
    Math.hypot(x - LUMEN_HEART.x, z - LUMEN_HEART.z) > LUMEN_HEART.radius - 14 &&
    !MELT.some((m) => Math.hypot(x - m.x, z - m.z) < m.radius + 4);
  let n = 0;
  // Along the roads, then a jittered grid over the open caverns and islands (about 1 pack per 3 000 m²).
  for (const road of ROADS) {
    alongRoad(road.points, 46, 24).forEach((p) => {
      const off = rng.range(-road.width / 4, road.width / 4);
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (safe(x, z)) packs.push({ id: `core.pack.${n++}`, x, z, template: templateAt(x, z) });
    });
  }
  // Every island holds a pack of its own (the outer ones a lighter one).
  for (const isl of ISLANDS) {
    const a = rng.range(0, Math.PI * 2);
    const x = isl.x + Math.sin(a) * isl.radius * 0.4;
    const z = isl.z + Math.cos(a) * isl.radius * 0.4;
    if (safe(x, z)) packs.push({ id: `core.pack.${n++}`, x, z, template: 'core_gardens' });
  }
  const STEP = 56;
  for (let gx = -HALF + STEP / 2; gx < HALF; gx += STEP) {
    for (let gz = -HALF + STEP / 2; gz < HALF; gz += STEP) {
      const x = gx + rng.range(-STEP / 3, STEP / 3);
      const z = gz + rng.range(-STEP / 3, STEP / 3);
      if (!safe(x, z) || packs.some((p) => Math.hypot(p.x - x, p.z - z) < 34)) continue;
      packs.push({ id: `core.pack.${n++}`, x, z, template: templateAt(x, z) });
    }
  }
  return packs;
}

// ---- Points of interest -------------------------------------------------------------------------

function buildPois(): PoiDef[] {
  const rng = new Rng('core-pois');
  const pois: PoiDef[] = [];
  const free = (x: number, z: number) =>
    openGround(x, z, 1.5) && Math.hypot(x - LAST_CAMP.x, z - LAST_CAMP.z) > LAST_CAMP.radius + 4 && !MELT.some((m) => Math.hypot(x - m.x, z - m.z) < m.radius + 2);
  const place = (x: number, z: number) => {
    if (free(x, z)) return { x, z };
    for (let r = 2; r < 40; r += 2) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        if (free(x + Math.sin(a) * r, z + Math.cos(a) * r)) return { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
      }
    }
    return { x, z };
  };
  // Supply crates along the roads and scattered through the caverns and on the islands.
  ROADS.forEach((road) =>
    alongRoad(road.points, 70, 36).forEach((p, i) => {
      const off = (i % 2 ? 1 : -1) * (road.width / 2 - 2);
      const x = p.x - p.dz * off;
      const z = p.z + p.dx * off;
      if (free(x, z)) pois.push({ id: `core.chest.${road.id}.${i}`, kind: 'chest', x, z });
    }),
  );
  for (let i = 0, c = 0; i < 400 && c < 56; i++) {
    const x = rng.range(-HALF + 20, HALF - 20);
    const z = rng.range(-HALF + 20, HALF - 20);
    if (!free(x, z) || Math.hypot(x - ELEVATOR_BASE.x, z - ELEVATOR_BASE.z) < ELEVATOR_BASE.radius + 4) continue;
    pois.push({ id: `core.chest.field.${c++}`, kind: 'chest', x, z });
  }
  scaled([[-100, -240], [-285, 183], [255, 120], [225, -50], [-176, 100], [50, 262]]).forEach(([x, z], i) => {
    const l = place(x, z);
    pois.push({ id: `core.locked.${i}`, kind: 'lockedChest', ...l, data: { key: `core.keycard.${i}` } });
    const k = place(x + rng.range(-40, 40), z + rng.range(-40, 40));
    pois.push({ id: `core.keycard.${i}`, kind: 'keycard', ...k, data: { opens: `core.locked.${i}` } });
  });
  const pylons = ['overcharge', 'kinetic', 'barrier', 'chainReaction', 'magnet', 'overclock'];
  scaled([[0, -180], [-212, 118], [170, 20], [-30, 120], [0, 250], [235, 96]]).forEach(([x, z], i) =>
    pois.push({ id: `core.pylon.${i}`, kind: 'pylon', ...place(x, z), data: { type: pylons[i]! } }),
  );
  // Hidden: on the outer islands (only switching bridges lead there), behind machinery, in dead-end alcoves.
  const hidden: [number, number][] = [[-160, 30], [-282, 82], [-300, 190], [-130, -205], [133, -180], [280, 100], [120, -75], [-60, 250], [60, 285], [-95, 150]];
  hidden.forEach(([x, z], i) =>
    pois.push({ id: `core.relic.${i}`, kind: 'relic', ...place(x * S, z * S), data: { stat: ['maxLife', 'damage', 'armor', 'moveSpeed', 'resourceGen'][i % 5]! } }),
  );
  scaled([[0, -300], [-70, -232], [60, -150], [0, -80], [-100, 38], [-176, 96], [-245, 205], [180, 20], [255, 100], [0, 205], [-40, 270], [0, 100]]).forEach(([x, z], i) =>
    pois.push({ id: `core.lore.${i}`, kind: 'lore', ...place(x, z), data: { log: `core.${i}` } }),
  );
  scaled([[-30, -160], [-212, 128], [200, 40]]).forEach(([x, z], i) => pois.push({ id: `core.tower.${i}`, kind: 'signalTower', ...place(x, z) }));
  scaled([[-132, -190], [128, -184], [75, -234]]).forEach(([x, z], i) => {
    const b = place(x, z);
    for (let k = 0; k < 3; k++) pois.push({ id: `core.barrel.${i}.${k}`, kind: 'barrel', x: b.x + rng.range(-2, 2), z: b.z + rng.range(-2, 2) });
  });
  // Glowing crystals (as in the Vaults and Mines): break one to blind the enemies around it.
  for (let i = 0, c = 0; i < 400 && c < 14; i++) {
    const isl = ISLANDS[i % ISLANDS.length]!;
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(4, isl.radius * 0.8);
    const x = isl.x + Math.sin(a) * d;
    const z = isl.z + Math.cos(a) * d;
    if (!free(x, z)) continue;
    pois.push({ id: `core.crystal.${c++}`, kind: 'crystal', x, z });
  }
  // Markers only until R5-C: the four dungeons, three Memory Mirrors, the Elevator Base and Lumen's heart.
  pois.push(
    { id: 'core.dungeon.ember', kind: 'dungeon', ...place(...cr(258, 128)), data: { dungeon: 'core_memory_of_ember' } },
    { id: 'core.dungeon.shaft', kind: 'dungeon', ...place(...cr(-134, -196)), data: { dungeon: 'core_endless_shaft' } },
    { id: 'core.dungeon.halls', kind: 'dungeon', ...place(...cr(-262, 140)), data: { dungeon: 'core_singing_halls' } },
    { id: 'core.dungeon.creation', kind: 'dungeon', ...place(...cr(62, 262)), data: { dungeon: 'core_chamber_of_creation' } },
    { id: 'core.mirror.0', kind: 'bunker', ...place(...cr(212, -50)), data: { bunker: 0, instance: 'core_mirror_ash' } },
    { id: 'core.mirror.1', kind: 'bunker', ...place(...cr(150, 8)), data: { bunker: 1, instance: 'core_mirror_refinery' } },
    { id: 'core.mirror.2', kind: 'bunker', ...place(...cr(-285, 70)), data: { bunker: 2, instance: 'core_mirror_vault' } },
    { id: ELEVATOR_BASE.id, kind: 'stronghold', x: ELEVATOR_BASE.x, z: ELEVATOR_BASE.z },
    { id: LUMEN_HEART.id, kind: 'boss', x: LUMEN_HEART.x, z: LUMEN_HEART.z },
  );
  return pois;
}

export const CORE_TELEPORTERS = [
  { id: 'tp.camp', x: LAST_CAMP.x - 4, z: LAST_CAMP.z + 12, hub: true },
  { id: 'tp.gardens', ...at(-98, 34) },
  { id: 'tp.halls', ...at(122, 48) },
  // Inside the Elevator Base: discovered when it is reclaimed (or walked to).
  { id: 'tp.base', x: ELEVATOR_BASE.x - 6, z: ELEVATOR_BASE.z - 14 },
  { id: 'tp.heart', ...at(10, 206) },
];

/**
 * The Memory Halls' clutter: each memory's own props, but wrong the way remembered things are: leaning,
 * floating a little, translucent at the edges and rimmed with that region's light. Visual only.
 */
const MEMORY_SCATTER: ScatterDef[] = (() => {
  const memories = [
    { id: 'ash', x: 240, z: 110, r: 42, ghost: '#b48cff', assets: [['env.old_tyre', 90, 1, 1.2], ['env.wheel_rim', 50, 1, 1.2], ['env.oil_drum', 50, 1, 1.2], ['env.debris_rock', 200, 1, 3], ['env.jerrycan', 40, 1, 1.2]] },
    { id: 'fire', x: 225, z: -35, r: 40, ghost: '#ff9a60', assets: [['env.oil_drum', 80, 1, 1.2], ['env.steel_drum', 70, 1, 1.2], ['env.propane_tank', 50, 1, 1.3], ['env.utility_box', 50, 1, 1.3]] },
    { id: 'jungle', x: 175, z: 70, r: 38, ghost: '#7dffa0', assets: [['prop.lumen_growth', 120, 1.2, 3.4], ['env.trash_can', 30, 1, 1.2], ['env.wheel_rim', 30, 1, 1.2]] },
    { id: 'dark', x: 130, z: -40, r: 34, ghost: '#7ad8ff', assets: [['env.moon_rock_a', 35, 0.7, 1.8], ['env.moon_rock_b', 35, 0.7, 1.8], ['env.moon_rock_c', 25, 0.7, 1.8], ['env.ammo_box', 30, 1, 1.2], ['env.military_crate', 25, 1, 1.2]] },
  ] as const;
  return memories.flatMap((m) =>
    m.assets.map(([asset, count, minScale, maxScale]): ScatterDef => ({
      asset,
      count,
      seed: `core-memory-${m.id}-${asset}`,
      minScale,
      maxScale,
      within: { x: m.x * S, z: m.z * S, radius: m.r * S },
      tilt: 0.55,
      lift: 2.2,
      ghost: m.ghost,
    })),
  );
})();

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

export const THE_CORE: ZoneDef = {
  id: 'zone.the_core',
  key: 'theCore',
  halfSize: HALF,
  levels: [40, 50],
  playerSpawn: CORE_GATE.arrive,
  // Not dark: Lumen's heart lights the cavern from within, gold-white and violet.
  ambient: { color: '#c9b6f0', intensity: 1.1 },
  hemisphere: { sky: '#fbf4ff', ground: '#6a40c0' },
  moon: { color: '#fff4e4', intensity: 1.7 },
  fog: { color: '#3a2a66', density: 0.008 },
  playerLight: { color: '#fff0c8', intensity: 40, distance: 12 },
  particles: '#ffe39a',
  // Warm and rich: lit from within, not the cold grade of the mines.
  grade: { saturation: 1.0, tint: '#fffaf6' },
  // The shaft's column of light.
  beams: [
    { x: SHAFT.x, z: SHAFT.z, radius: 2.6, color: '#fff0c8' },
    // Lumen's heart pulses violet.
    { x: LUMEN_HEART.x, z: LUMEN_HEART.z, radius: 3.6, color: '#c8a4ff' },
  ],
  props: PROPS,
  scatter: [
    { asset: 'env.debris_rock', count: 6000, seed: 'core-debris', minScale: 0.3, maxScale: 1.3 },
    { asset: 'env.moon_rock_a', count: 120, seed: 'core-moon_rock_a', minScale: 0.4, maxScale: 1.6, near: 'roads', spread: 3 },
    { asset: 'env.moon_rock_b', count: 120, seed: 'core-moon_rock_b', minScale: 0.4, maxScale: 1.6, near: 'roads', spread: 3 },
    { asset: 'prop.core_pipe', count: 60, seed: 'core-pipe', minScale: 1.5, maxScale: 3, near: 'roads', spread: 2 },
    { asset: 'env.oil_drum', count: 20, seed: 'core-oil_drum', minScale: 0.9, maxScale: 1.1, near: 'roads', spread: 2 },
    { asset: 'env.military_crate', count: 20, seed: 'core-military_crate', minScale: 0.9, maxScale: 1.1, near: 'roads', spread: 2 },
    ...MEMORY_SCATTER,
  ],
  ground: buildGround(),
  subzones: [
    { id: 'greatCavern', center: [0, 0], radius: 0 },
    { id: 'borderland', center: CORE_SUBZONES.borderland.c, radius: CORE_SUBZONES.borderland.r },
    { id: 'hangingGardens', center: CORE_SUBZONES.gardens.c, radius: CORE_SUBZONES.gardens.r },
    { id: 'memoryHalls', center: CORE_SUBZONES.halls.c, radius: CORE_SUBZONES.halls.r },
    { id: 'heart', center: CORE_SUBZONES.heart.c, radius: CORE_SUBZONES.heart.r },
  ],
  roads: ROADS,
  hubs: [LAST_CAMP],
  teleporters: CORE_TELEPORTERS,
  packs: buildPacks(),
  // Props can push a point of interest off the ground: snap it back onto open ground (a crate that
  // still lands in a prop is dropped).
  pois: clearOfProps(buildPois(), PROPS)
    .map((p) => (openGround(p.x, p.z) ? p : { ...p, ...(nearestWalkable(GRID, p.x, p.z) ?? p) }))
    .filter((p) => p.kind !== 'chest' || !insideProp(p.x, p.z)),
  mapCell: 8,
  gates: [CORE_GATE],
  env: CORE_ENV,
  caves: CORE_CAVES,
  region: 5,
  stash: { x: LAST_CAMP.x + 9, z: LAST_CAMP.z - 9 },
};
