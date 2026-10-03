/** Phase 0 test arena: a flat ash field with a few props and emergency lights. */
export interface PropPlacement {
  asset: string;
  x: number;
  z: number;
  /** Rotation around y, radians. */
  rot?: number;
  scale?: number;
  /** Static collision radius in metres (omit for walk-through props). */
  collider?: number;
  /** Extra collision circles in the prop's local space (long props: walls, pipes, wrecks). */
  colliders?: { x: number; z: number; r: number }[];
  light?: { color: string; intensity: number; distance: number; height: number };
  /** Huge far-away landmark: ignores fog and distance culling so it can be seen across the region. */
  landmark?: boolean;
  /** Constant emissive tint (a glowing landmark such as the Mother Tree). */
  glow?: string;
}

export interface ArenaDef {
  id: string;
  halfSize: number;
  /** Monster level range (Cinder Flats: 1–10). */
  levels: [number, number];
  playerSpawn: { x: number; z: number };
  ambient: { color: string; intensity: number };
  moon: { color: string; intensity: number };
  fog: { color: string; density: number };
  playerLight: { color: string; intensity: number; distance: number };
  props: PropPlacement[];
  scatter: { asset: string; count: number; seed: string; minScale: number; maxScale: number }[];
  /** Painted ground textures (zones without one keep the procedural ash ground). */
  ground?: GroundDef;
  /** Colour of the drifting particles (default grey ash). */
  particles?: string;
}

/** A ground texture in public/assets/textures/ground/ (file name without .webp). */
export type GroundTexture =
  | 'ash_plain'
  | 'scorched_ground'
  | 'lumen_infested'
  | 'military_concrete'
  | 'cracked_asphalt'
  | 'industrial_grit'
  | 'slag_ground'
  | 'cooling_slag'
  | 'steel_plating'
  | 'scorched_flagstones'
  | 'vault_soil'
  | 'fungal_moss'
  | 'root_mat'
  | 'frosted_concrete'
  | 'dry_silt'
  | 'overgrown_asphalt'
  | 'lab_tiles';

/**
 * Ground textures for an open-world zone: a base that covers everything, up to six overlay
 * textures painted in soft patches with ragged edges, and a road surface.
 */
export interface GroundDef {
  /** Covers the whole zone; omit to keep the procedural ground under the overlays and roads. */
  base?: GroundTexture;
  /** Metres one repeat of a texture covers. */
  tile: number;
  /** Overlay textures (at most six); patches pick one by index. */
  layers: GroundTexture[];
  patches: GroundPatch[];
  /** Road ribbons use this texture, one repeat across the road's width. */
  road?: GroundTexture;
}

export interface GroundPatch {
  /** Index into GroundDef.layers. */
  layer: number;
  x: number;
  z: number;
  radius: number;
  /** 0–1: how much the overlay covers at the centre (default 1). */
  strength?: number;
}

const emergency = (x: number, z: number): PropPlacement => ({
  asset: 'prop.emergency_light',
  x,
  z,
  collider: 0.3,
  light: { color: '#ff7a1a', intensity: 90, distance: 16, height: 3.1 },
});

/** Collision circles spaced along the local x axis, for long props. */
const line = (length: number, r: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ x: -length / 2 + (length * i) / (count - 1), z: 0, r }));

const growth = (x: number, z: number, scale = 1): PropPlacement => ({
  asset: 'prop.lumen_growth',
  x,
  z,
  scale,
  collider: 0.55 * scale,
  light: { color: '#5dff6a', intensity: 14, distance: 9, height: 1.6 },
});

export const TEST_ARENA: ArenaDef = {
  id: 'zone.test_arena',
  halfSize: 40,
  levels: [1, 10],
  playerSpawn: { x: 0, z: 0 },
  ambient: { color: '#5a6170', intensity: 0.45 },
  moon: { color: '#8fa3c0', intensity: 1.1 },
  fog: { color: '#16161a', density: 0.026 },
  playerLight: { color: '#ffd2a1', intensity: 45, distance: 11 },
  props: [
    emergency(-7, -5),
    emergency(9, 6),
    emergency(-12, 14),
    emergency(16, -12),
    growth(5, -9, 1.3),
    growth(-15, -3, 0.9),
    growth(12, 15, 1.6),
    { asset: 'prop.cargo_crate', x: -5, z: -6, rot: 0.3, collider: 0.95 },
    { asset: 'prop.cargo_crate', x: -5.6, z: -4.4, rot: 1.1, collider: 0.95 },
    { asset: 'prop.cargo_crate', x: 8, z: 4.5, rot: 0.7, scale: 1.2, collider: 1.15 },
    { asset: 'prop.cargo_crate', x: 3, z: 11, rot: 2.2, collider: 0.95 },
    { asset: 'prop.cargo_crate', x: -10, z: 9, rot: 0.1, collider: 0.95 },
    { asset: 'prop.cargo_crate', x: 14, z: -10, rot: 1.9, collider: 0.95 },
    // Cinder Flats kit: a crashed lander, a ruined checkpoint and colony debris.
    { asset: 'prop.crashed_lander', x: -19, z: -15, rot: 0.6, colliders: line(5, 1.5, 4) },
    { asset: 'env.wall_segment', x: 13, z: 15, rot: 0, colliders: line(3.4, 0.5, 5) },
    { asset: 'env.wall_segment', x: 17.2, z: 12.6, rot: Math.PI / 2, colliders: line(3.4, 0.5, 5) },
    { asset: 'prop.control_terminal', x: 11.5, z: 12.5, rot: 0.4, collider: 0.45 },
    { asset: 'prop.barricade', x: -3, z: 8.5, rot: 0.2, colliders: line(2.2, 0.6, 3) },
    { asset: 'prop.barricade', x: 6.5, z: -6.5, rot: 2.5, colliders: line(2.2, 0.6, 3) },
    { asset: 'prop.control_terminal', x: -8, z: -7.5, rot: -0.6, collider: 0.45 },
    { asset: 'prop.fuel_tank', x: 19, z: -4, rot: 1.2, collider: 1.1 },
    { asset: 'prop.fuel_tank', x: 20.5, z: -1, rot: 1.0, collider: 1.1 },
    { asset: 'prop.pipe_section', x: -14, z: 6, rot: 1.2, colliders: line(4, 0.6, 4) },
    { asset: 'prop.pipe_section', x: 4, z: 18, rot: -0.3, colliders: line(4, 0.6, 4) },
  ],
  scatter: [{ asset: 'env.debris_rock', count: 700, seed: 'arena-debris', minScale: 0.4, maxScale: 1.8 }],
};
