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
  light?: { color: string; intensity: number; distance: number; height: number };
}

export interface ArenaDef {
  id: string;
  halfSize: number;
  playerSpawn: { x: number; z: number };
  ambient: { color: string; intensity: number };
  moon: { color: string; intensity: number };
  fog: { color: string; density: number };
  playerLight: { color: string; intensity: number; distance: number };
  props: PropPlacement[];
  scatter: { asset: string; count: number; seed: string; minScale: number; maxScale: number }[];
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
  light: { color: '#5dff6a', intensity: 30, distance: 9, height: 0.8 },
});

export const TEST_ARENA: ArenaDef = {
  id: 'zone.test_arena',
  halfSize: 40,
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
  ],
  scatter: [{ asset: 'env.debris_rock', count: 700, seed: 'arena-debris', minScale: 0.4, maxScale: 1.8 }],
};
