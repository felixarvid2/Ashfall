/**
 * Own looks for the Cinder Flats, Refinery and Hydroponic Vaults enemies and bosses (docs/blender.md): each id wore a
 * borrowed model, now a base + material look + a few Blender parts (scripts/blender/spec/regions123.json).
 * Parts are built at the base's own size; `EnemyDef.scale` scales parts with the body. Unrigged bases (drone, hound,
 * Slagborn, loader, tentacle, the First) attach to the root, measured from the model's feet along its axes.
 */
import type { VariantDef, VariantPart } from '../variants';

type V3 = readonly [number, number, number];

/** The same part on both sides: x (and the roll about z / yaw about y) mirrored for the creature's right. */
function pair(asset: string, leftBone: string, rightBone: string, position: V3, rotation: V3, scale?: number | V3): VariantPart[] {
  const [x, y, z] = position;
  const [rx, ry, rz] = rotation;
  return [
    { asset, bone: leftBone, position: [x, y, z], rotation: [rx, ry, rz], ...(scale ? { scale } : {}) },
    { asset, bone: rightBone, position: [-x, y, z], rotation: [rx, -ry, -rz], ...(scale ? { scale } : {}) },
  ];
}

export const REGIONS123_VARIANTS: readonly VariantDef[] = [
  // ---- Region 1: Cinder Flats ----
  {
    // A swollen spore carrier: ochre sacs bulging off both shoulders and the belly.
    id: 'variant.bloater',
    base: 'enemy.spore_carrier',
    look: { tint: '#d8c890', emissive: '#4a4210', emissiveIntensity: 0.2 },
    parts: [
      ...pair('part.sac_cluster', 'LeftShoulder', 'RightShoulder', [0.12, 0.02, 0], [0, 0, -40], 0.85),
      { asset: 'part.sac_cluster', bone: 'Spine01', position: [0, -0.08, 0.14], rotation: [75, 0, 0], scale: 1.0 },
    ],
  },
  // ---- Region 2: Refinery District ----
  {
    id: 'variant.ash_thrower',
    base: 'enemy.infected_colonist',
    look: { tint: '#cfc4b0', emissive: '#4a2a10', emissiveIntensity: 0.15 },
    parts: [
      { asset: 'part.tank_pair', bone: 'Spine02', position: [0, 0.02, -0.08], scale: 1.1 },
      { asset: 'part.nozzle', bone: 'RightHand', position: [0, 0, 0.05], rotation: [90, 0, 0], scale: 0.7 },
    ],
  },
  {
    id: 'variant.scorched_walker',
    base: 'enemy.infected_colonist',
    look: { tint: '#6a5a50', emissive: '#ff3a0a', emissiveIntensity: 0.3 },
    parts: [
      ...pair('part.charred_plate', 'LeftShoulder', 'RightShoulder', [0.1, 0.05, 0], [-75, 0, -20], 0.9),
      { asset: 'part.charred_plate', bone: 'Spine01', position: [0, -0.1, 0.1], rotation: [0, 0, 0], scale: 0.9 },
      { asset: 'part.charred_plate', bone: 'Spine02', position: [0, 0.0, -0.1], rotation: [-15, 180, 0], scale: 1.1 },
      { asset: 'part.charred_plate', bone: 'Head', position: [0, 0.14, -0.04], rotation: [-100, 0, 0], scale: 0.6 },
    ],
  },
  {
    id: 'variant.rust_drone',
    base: 'enemy.eye_drone',
    look: { tint: '#c08a5a', roughness: 0.95, metalness: 0.3 },
    parts: [
      { asset: 'part.dome_crack', position: [0, 0.93, 0], scale: 1.0 },
      { asset: 'part.cable_tangle', position: [0.36, 0.55, 0.12], scale: 1.4 },
    ],
  },
  {
    id: 'variant.flame_drone',
    base: 'enemy.eye_drone',
    look: { tint: '#9a8a80', emissive: '#ff4a0a', emissiveIntensity: 0.15 },
    parts: [
      { asset: 'part.burner_ring', position: [0, 0.5, 0.4], rotation: [90, 0, 0], scale: 1.2 },
      { asset: 'part.nozzle', position: [0, 0.15, 0.3], rotation: [90, 0, 0], scale: 0.8 },
      { asset: 'part.tank_pair', position: [0, 0.72, -0.25], scale: 1.0 },
    ],
  },
  {
    id: 'variant.slag_hound',
    base: 'enemy.quad_shell',
    look: { tint: '#a08a76', emissive: '#ff5a1a', emissiveIntensity: 0.3 },
    parts: [
      { asset: 'part.charred_plate', position: [0, 1.42, 0.38], rotation: [-60, 0, 0], scale: 0.8 },
      { asset: 'part.charred_plate', position: [0, 1.46, 0.08], rotation: [-60, 8, 0], scale: 0.9 },
      { asset: 'part.charred_plate', position: [0, 1.12, -0.26], rotation: [-40, -8, 0], scale: 0.8 },
    ],
  },
  {
    id: 'variant.fire_bloater',
    base: 'enemy.spore_carrier',
    look: { tint: '#b08a70', emissive: '#a02a08', emissiveIntensity: 0.3 },
    parts: [
      { asset: 'part.sac_cluster_fire', bone: 'Spine02', position: [0.12, 0.05, -0.12], rotation: [-55, 0, 18], scale: 1.3 },
      { asset: 'part.sac_cluster_fire', bone: 'Spine02', position: [-0.12, 0.05, -0.12], rotation: [-55, 0, -18], scale: 1.1 },
      { asset: 'part.sac_cluster_fire', bone: 'Head', position: [0, 0.15, 0], scale: 0.8 },
      { asset: 'part.sac_cluster_fire', bone: 'Spine01', position: [0, -0.08, 0.14], rotation: [75, 0, 0], scale: 0.9 },
    ],
  },
  {
    // Support elite: robed, mitred and haloed, a censer swinging from the hand.
    id: 'variant.smelter_priest',
    base: 'enemy.smelter',
    look: { tint: '#e0c880', emissive: '#6a4a10', emissiveIntensity: 0.2 },
    parts: [
      { asset: 'part.mitre', bone: 'Head', position: [0, 0.12, 0.03] },
      { asset: 'part.halo_ring', bone: 'Head', position: [0, 0.14, -0.15] },
      { asset: 'part.censer', bone: 'RightHand', position: [0, 0, 0.04] },
    ],
  },
  // ---- Region 3: Hydroponic Vaults ----
  {
    id: 'variant.overgrown_walker',
    base: 'enemy.infected_colonist',
    look: { tint: '#9ab88a', emissive: '#1a4a1a', emissiveIntensity: 0.15 },
    parts: [
      { asset: 'part.moss_clump', bone: 'LeftShoulder', position: [0.1, 0.06, 0], scale: 0.8 },
      { asset: 'part.moss_clump', bone: 'RightShoulder', position: [-0.1, 0.06, 0], scale: 0.6 },
      { asset: 'part.moss_clump', bone: 'Head', position: [0, 0.12, -0.02], scale: 0.55 },
      { asset: 'part.flower_bloom', bone: 'RightShoulder', position: [-0.14, 0.1, 0], rotation: [0, 0, 20], scale: 0.8 },
      { asset: 'part.vine_short', bone: 'LeftForeArm', position: [0.02, 0.0, 0], rotation: [180, 0, 0] },
      { asset: 'part.vine_short', bone: 'RightForeArm', position: [-0.02, 0.0, 0], rotation: [180, 0, 0], scale: 0.8 },
      { asset: 'part.vine_short', bone: 'Spine01', position: [0.0, -0.05, -0.1], rotation: [-50, 0, 0], scale: 1.2 },
    ],
  },
  {
    id: 'variant.swarm_bloater',
    base: 'enemy.spore_carrier',
    look: { tint: '#b0d890', emissive: '#3a7a1a', emissiveIntensity: 0.3 },
    parts: [
      ...pair('part.sac_cluster_spore', 'Hips', 'Hips', [0.22, 0.05, 0], [0, 0, -75], 0.85),
      { asset: 'part.sac_cluster_spore', bone: 'Spine02', position: [0, 0.05, -0.12], rotation: [-60, 0, 0], scale: 1.3 },
      { asset: 'part.flower_bloom', bone: 'Head', position: [0, 0.1, 0], scale: 0.9 },
    ],
  },
  {
    id: 'variant.mossborn',
    base: 'enemy.slagborn',
    look: { tint: '#7a9a70', emissive: '#1a5a2a', emissiveIntensity: 0.2 },
    parts: [
      { asset: 'part.moss_clump', position: [0.55, 2.0, 0], scale: 2.0 },
      { asset: 'part.moss_clump', position: [-0.55, 2.0, 0], scale: 1.8 },
      { asset: 'part.moss_clump', position: [0, 1.9, -0.3], scale: 2.4 },
      { asset: 'part.fungus_shelf', position: [0.3, 1.55, -0.3], rotation: [0, -35, 0], scale: 1.4 },
      { asset: 'part.fungus_shelf', position: [-0.3, 1.3, -0.3], rotation: [0, 215, 0], scale: 1.2 },
      { asset: 'part.vine_short', position: [0.78, 1.5, 0], rotation: [180, 0, 0], scale: 1.4 },
      { asset: 'part.vine_short', position: [-0.78, 1.5, 0], rotation: [180, 0, 0], scale: 1.2 },
    ],
  },
  {
    id: 'variant.vine_weaver',
    base: 'enemy.lumen_tentacle',
    look: { tint: '#7aa070', emissive: '#2a7a3a', emissiveIntensity: 0.25 },
    parts: [
      { asset: 'part.vine_long', position: [0.15, 0.5, 0], rotation: [0, 0, -65] },
      { asset: 'part.vine_long', position: [-0.1, 0.9, 0.1], rotation: [0, 140, -60], scale: 1.1 },
      { asset: 'part.vine_long', position: [0, 1.4, -0.12], rotation: [0, -110, -55], scale: 0.9 },
      { asset: 'part.vine_short', position: [0.1, 2.0, 0.1], rotation: [0, 60, -50] },
      { asset: 'part.flower_bloom', position: [0, 2.55, 0], scale: 1.0 },
      { asset: 'part.vine_long', position: [-0.1, 1.9, 0], rotation: [0, 250, -55], scale: 0.8 },
    ],
  },
  {
    id: 'variant.spore_swarm',
    base: 'enemy.security_drone',
    look: { tint: '#9ac870', emissive: '#5a8a1a', emissiveIntensity: 0.3 },
    parts: [{ asset: 'part.insect_wings', position: [0, 0.5, -0.05], scale: 0.7 }],
  },
  {
    // Guard: a soldier half-grown into a cocoon, its husk standing behind it.
    id: 'variant.cocoon_warden',
    base: 'enemy.sergeant',
    look: { tint: '#b0c0a0', emissive: '#2a6a2a', emissiveIntensity: 0.2 },
    parts: [
      { asset: 'part.cocoon_husk', bone: 'Spine02', position: [0, -0.05, -0.14], rotation: [-22, 0, 0], scale: 1.0 },
      { asset: 'part.vine_short', bone: 'LeftShoulder', position: [0.12, 0, 0], rotation: [180, 0, 0], scale: 1.1 },
      { asset: 'part.vine_short', bone: 'RightShoulder', position: [-0.12, 0, 0], rotation: [180, 0, 0], scale: 1.1 },
    ],
  },
  {
    id: 'variant.mutated_botanist',
    base: 'enemy.smelter',
    look: { tint: '#b0d0a0', emissive: '#2a6a1a', emissiveIntensity: 0.2 },
    parts: [
      { asset: 'part.goggles', bone: 'Head', position: [0, 0.04, 0.02] },
      { asset: 'part.spore_tank', bone: 'Spine02', position: [0, 0.02, -0.06], scale: 1.1 },
      { asset: 'part.flower_bloom', bone: 'RightShoulder', position: [-0.12, 0.1, 0], scale: 0.8 },
      { asset: 'part.moss_clump', bone: 'LeftShoulder', position: [0.1, 0.06, 0], scale: 0.9 },
      { asset: 'part.vine_short', bone: 'LeftForeArm', position: [0.02, 0, 0], rotation: [180, 0, 0] },
    ],
  },
  {
    // Elite: fungus, crystal and glass grown over an enormous body.
    id: 'variant.lumen_giant',
    base: 'boss.the_first',
    look: { tint: '#8aa89a', emissive: '#1a6a5a', emissiveIntensity: 0.3 },
    parts: [
      { asset: 'part.crystal_teal', position: [1.0, 4.4, -0.3], rotation: [-15, 0, -35], scale: 3.4 },
      { asset: 'part.crystal_teal', position: [-1.0, 4.4, -0.3], rotation: [-15, 0, 35], scale: 3.0 },
      { asset: 'part.fungus_shelf', position: [0.5, 3.2, -0.8], rotation: [0, -35, 0], scale: 4.0 },
      { asset: 'part.fungus_shelf', position: [-0.5, 2.6, -0.8], rotation: [0, 215, 0], scale: 3.4 },
      { asset: 'part.moss_clump', position: [0, 4.7, -0.3], scale: 5.0 },
      { asset: 'part.glass_shards', position: [0, 5.3, 0.1], scale: 3.5 },
    ],
  },
];
