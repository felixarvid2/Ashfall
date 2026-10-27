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
  {
    // Drainage Tunnels: a spore-mother crowned in horns, hung with egg-sacs.
    id: 'variant.brood_mother',
    base: 'enemy.spore_carrier',
    look: { tint: '#c8d08a', emissive: '#3a5a10', emissiveIntensity: 0.3 },
    parts: [
      { asset: 'part.sac_cluster_spore', bone: 'Spine02', position: [0, 0, -0.12], rotation: [-60, 0, 0], scale: 1.6 },
      { asset: 'part.sac_cluster_spore', bone: 'Spine01', position: [0, -0.1, 0.13], rotation: [75, 0, 0], scale: 1.5 },
      { asset: 'part.sac_cluster_spore', bone: 'Hips', position: [0.12, 0.0, 0.1], rotation: [70, 0, -50], scale: 1.1 },
      { asset: 'part.sac_cluster_spore', bone: 'Hips', position: [-0.12, 0.0, 0.1], rotation: [70, 0, 50], scale: 1.1 },
      ...pair('part.sac_cluster', 'LeftShoulder', 'RightShoulder', [0.12, 0.02, 0], [0, 0, -40], 1.0),
      { asset: 'part.spike_crown', bone: 'Head', position: [0, 0.1, 0], scale: 1.3 },
    ],
  },
  {
    // Checkpoint Sierra: Commandant Hale, an officer's cap, coat tails and Lumen growing through the coat.
    id: 'variant.commandant_hale',
    base: 'enemy.sergeant',
    look: { tint: '#e2eada', emissive: '#1f7a30', emissiveIntensity: 0.2 },
    parts: [
      { asset: 'part.officer_cap', bone: 'Head', position: [0, 0.22, 0.01], scale: 1.1 },
      ...pair('part.epaulette', 'LeftShoulder', 'RightShoulder', [0.12, 0.08, 0], [0, 0, -10], 1.6),
      ...pair('part.coat_flap', 'Hips', 'Hips', [0.09, 0.0, 0.12], [0, 0, 5], [0.75, 1, 1]),
      { asset: 'part.coat_flap', bone: 'Hips', position: [0, 0.0, -0.14], rotation: [0, 180, 0], scale: [1, 1.05, 1] },
      { asset: 'part.crystal_green', bone: 'Spine02', position: [0.04, 0.1, -0.12], rotation: [-45, 0, 12], scale: 1.4 },
      { asset: 'part.crystal_green', bone: 'RightShoulder', position: [-0.12, 0.05, 0], rotation: [-10, 0, 45], scale: 0.9 },
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
    base: 'enemy.security_drone',
    look: { tint: '#c08a5a', roughness: 0.95, metalness: 0.3 },
    parts: [
      { asset: 'part.dome_crack', position: [0, 0.5, 0] },
      { asset: 'part.cable_tangle', position: [0.12, 0.14, -0.06] },
    ],
  },
  {
    id: 'variant.flame_drone',
    base: 'enemy.security_drone',
    look: { tint: '#9a8a80', emissive: '#ff4a0a', emissiveIntensity: 0.15 },
    parts: [
      { asset: 'part.burner_ring', position: [0, 0.36, 0.22], rotation: [90, 0, 0], scale: 0.72 },
      { asset: 'part.nozzle', position: [0, 0.16, 0.18], rotation: [90, 0, 0], scale: 0.55 },
      { asset: 'part.tank_pair', position: [0, 0.42, -0.1], scale: 0.7 },
    ],
  },
  {
    id: 'variant.slag_hound',
    base: 'enemy.spore_hound',
    look: { tint: '#a08a76', emissive: '#ff5a1a', emissiveIntensity: 0.3 },
    parts: [
      { asset: 'part.charred_plate', position: [0, 0.8, 0.3], rotation: [-60, 0, 0], scale: 0.5 },
      { asset: 'part.charred_plate', position: [0, 0.82, 0.08], rotation: [-60, 8, 0], scale: 0.55 },
      { asset: 'part.charred_plate', position: [0, 0.8, -0.14], rotation: [-60, -8, 0], scale: 0.55 },
      { asset: 'part.charred_plate', position: [0, 0.76, -0.36], rotation: [-60, 6, 0], scale: 0.45 },
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
  {
    id: 'variant.brother_ash',
    base: 'enemy.smelter',
    look: { tint: '#c8a890', emissive: '#a03008', emissiveIntensity: 0.25 },
    parts: [
      ...pair('part.pauldron', 'LeftArm', 'RightArm', [0.0, 0.05, 0], [0, 0, -10], 1.1),
      { asset: 'part.spike_crown', bone: 'Head', position: [0, 0.12, 0.02], scale: 1.2 },
      { asset: 'part.censer', bone: 'LeftHand', position: [0, 0, 0.04], scale: 1.4 },
      ...pair('part.robe_flap', 'Hips', 'Hips', [0.09, 0.0, 0.12], [0, 0, 5], [0.75, 1, 1]),
      { asset: 'part.robe_flap', bone: 'Hips', position: [0, 0.0, -0.14], rotation: [0, 180, 0], scale: [1, 1.1, 1] },
    ],
  },
  {
    id: 'variant.pyre_warden',
    base: 'enemy.smelter',
    look: { tint: '#b8a090', emissive: '#c05a10', emissiveIntensity: 0.25 },
    parts: [
      { asset: 'part.brazier', bone: 'Spine02', position: [0, 0.05, -0.04], scale: 1.5 },
      { asset: 'part.pauldron', bone: 'LeftArm', position: [0, 0.05, 0], rotation: [0, 0, -10], scale: 1.4 },
      ...pair('part.robe_flap', 'Hips', 'Hips', [0.09, 0.0, 0.12], [0, 0, 5], [0.75, 1, 1]),
      { asset: 'part.robe_flap', bone: 'Hips', position: [0, 0.0, -0.14], rotation: [0, 180, 0], scale: [1, 1.2, 1] },
      { asset: 'part.halo_ring', bone: 'Head', position: [0, 0.14, -0.15], scale: 1.2 },
    ],
  },
  {
    // The Cold Hall: a welder frozen into the cooling plant, ice bursting out of the suit.
    id: 'variant.frozen_welder',
    base: 'enemy.welder',
    look: { tint: '#b8d8f0', emissive: '#2a5a8a', emissiveIntensity: 0.25, roughness: 0.5 },
    parts: [
      { asset: 'part.frost_cluster', bone: 'Spine02', position: [0, 0.1, -0.1], rotation: [-45, 0, 0], scale: 1.4 },
      { asset: 'part.frost_cluster', bone: 'LeftShoulder', position: [0.12, 0.05, 0], rotation: [-10, 0, -45], scale: 0.9 },
      { asset: 'part.frost_cluster', bone: 'RightShoulder', position: [-0.12, 0.05, 0.02], rotation: [10, 0, 45], scale: 0.8 },
      { asset: 'part.frost_shard', bone: 'Head', position: [0.05, 0.15, 0], rotation: [-20, 0, -20], scale: 1.1 },
      { asset: 'part.frost_shard', bone: 'Head', position: [-0.05, 0.14, -0.02], rotation: [-30, 0, 20], scale: 0.8 },
      { asset: 'part.frost_shard', bone: 'RightForeArm', position: [-0.05, -0.04, 0], rotation: [180, 0, 0], scale: 1.2 },
      { asset: 'part.frost_shard', bone: 'LeftForeArm', position: [0.05, -0.04, 0], rotation: [180, 0, 0], scale: 1.0 },
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
  // ---- Region 3 bosses ----
  {
    // Seed Bank Depths: a Mossborn frozen into the gene vault, still tending it.
    id: 'variant.the_keeper',
    base: 'enemy.slagborn',
    look: { tint: '#b0c8d8', emissive: '#4a8ab0', emissiveIntensity: 0.3, roughness: 0.55 },
    parts: [
      { asset: 'part.frost_cluster', position: [0.6, 2.0, -0.1], rotation: [-15, 0, -40], scale: 2.0 },
      { asset: 'part.frost_cluster', position: [-0.6, 2.0, -0.1], rotation: [-15, 0, 40], scale: 1.7 },
      { asset: 'part.frost_cluster', position: [0, 1.9, -0.35], rotation: [-45, 0, 0], scale: 2.4 },
      { asset: 'part.frost_shard', position: [0, 2.55, 0.05], rotation: [-15, 0, 0], scale: 1.8 },
      { asset: 'part.frost_shard', position: [0.15, 2.5, 0.0], rotation: [-15, 0, -30], scale: 1.4 },
      { asset: 'part.frost_shard', position: [-0.15, 2.5, 0.0], rotation: [-15, 0, 30], scale: 1.4 },
      { asset: 'part.moss_clump', position: [0, 1.7, 0.3], rotation: [40, 0, 0], scale: 1.8 },
      { asset: 'part.vine_short', position: [0.78, 1.5, 0], rotation: [180, 0, 0], scale: 1.4 },
    ],
  },
  {
    // The Cocoon Chamber: the brood's oldest warden, crowned in bone, two husks on its back.
    id: 'variant.brood_warden',
    base: 'enemy.sergeant',
    look: { tint: '#a8c098', emissive: '#2a7a2a', emissiveIntensity: 0.25 },
    parts: [
      { asset: 'part.cocoon_husk', bone: 'Spine02', position: [0.08, -0.05, -0.14], rotation: [-12, 0, 8], scale: 1.4 },
      { asset: 'part.cocoon_husk', bone: 'Spine02', position: [-0.14, -0.05, -0.12], rotation: [-5, 0, -20], scale: 0.9 },
      { asset: 'part.spike_crown', bone: 'Head', position: [0, 0.22, 0.02], scale: 1.4 },
      ...pair('part.sac_cluster_spore', 'LeftArm', 'RightArm', [0.0, 0.02, 0], [0, 0, -40], 0.9),
    ],
  },
  {
    // The Irrigation System: a great knot of vines, a bloom at its crown.
    id: 'variant.vine_matriarch',
    base: 'enemy.lumen_tentacle',
    look: { tint: '#6a9a60', emissive: '#2a8a3a', emissiveIntensity: 0.35 },
    parts: [
      { asset: 'part.vine_long', position: [0.15, 0.4, 0], rotation: [0, 0, -65], scale: 1.2 },
      { asset: 'part.vine_long', position: [-0.15, 0.6, 0.1], rotation: [0, 150, -60], scale: 1.3 },
      { asset: 'part.vine_long', position: [0, 1.0, -0.15], rotation: [0, -100, -60], scale: 1.2 },
      { asset: 'part.vine_long', position: [0.1, 1.5, 0.1], rotation: [0, 60, -55], scale: 1.0 },
      { asset: 'part.vine_long', position: [-0.1, 1.9, 0], rotation: [0, 220, -50], scale: 1.0 },
      { asset: 'part.vine_short', position: [0.1, 2.3, 0.1], rotation: [0, 100, -50], scale: 1.1 },
      { asset: 'part.flower_bloom', position: [0, 2.5, 0], scale: 2.2 },
      { asset: 'part.flower_bloom', position: [0.2, 1.6, 0.2], rotation: [30, 0, -60], scale: 1.2 },
    ],
  },
  {
    // The Sleeping Lab: Dr. Ilse Varga in her lab coat, a spore rig on her back, flowers in her hair.
    id: 'variant.ilse_varga',
    base: 'enemy.smelter',
    look: { tint: '#d8e0cc', emissive: '#4a8a1a', emissiveIntensity: 0.15 },
    parts: [
      ...pair('part.lab_coat_flap', 'Hips', 'Hips', [0.09, 0.0, 0.12], [0, 0, 5], [0.75, 1, 1]),
      { asset: 'part.lab_coat_flap', bone: 'Hips', position: [0, 0.0, -0.14], rotation: [0, 180, 0], scale: [1, 1.2, 1] },
      { asset: 'part.goggles', bone: 'Head', position: [0, 0.08, 0.02], rotation: [-15, 0, 0], scale: 1.1 },
      { asset: 'part.spore_tank', bone: 'Spine02', position: [0, 0.02, -0.06], scale: 1.4 },
      { asset: 'part.flower_bloom', bone: 'Head', position: [0.08, 0.14, -0.03], rotation: [0, 0, -25], scale: 0.9 },
      { asset: 'part.flower_bloom', bone: 'LeftShoulder', position: [0.12, 0.08, 0], rotation: [0, 0, -20], scale: 0.9 },
      { asset: 'part.vine_short', bone: 'LeftForeArm', position: [0.02, 0, 0], rotation: [180, 0, 0] },
    ],
  },
  {
    // Dome Gamma: the bloom at the heart of the nest, a huge flower crowning it.
    id: 'variant.gamma_bloom',
    base: 'boss.the_first',
    look: { tint: '#9ab8a0', emissive: '#3a8a4a', emissiveIntensity: 0.3 },
    parts: [
      { asset: 'part.flower_bloom', position: [0, 3.9, -0.1], rotation: [-10, 0, 0], scale: 9 },
      { asset: 'part.sac_cluster_spore', position: [1.2, 4.2, -0.2], rotation: [0, 0, -40], scale: 2.2 },
      { asset: 'part.sac_cluster_spore', position: [-1.2, 4.2, -0.2], rotation: [0, 0, 40], scale: 2.0 },
      { asset: 'part.sac_cluster_spore', position: [0, 3.2, 0.9], rotation: [70, 0, 0], scale: 1.6 },
      { asset: 'part.moss_clump', position: [0, 3.6, -0.7], scale: 3.5 },
      { asset: 'part.flower_bloom', position: [1.5, 3.9, -0.3], rotation: [0, 0, -35], scale: 3.5 },
      { asset: 'part.flower_bloom', position: [-1.5, 3.9, -0.3], rotation: [0, 0, 35], scale: 3.0 },
    ],
  },
  {
    // The Great Dome: an old harvester fused with the Mother Tree's roots, scythes out, glass dome broken.
    id: 'variant.warden',
    base: 'enemy.cargo_loader',
    look: { tint: '#9aaa80', emissive: '#2a6a2a', emissiveIntensity: 0.25 },
    parts: [
      { asset: 'part.harvest_blade', position: [1.0, 1.9, 0.2], rotation: [-15, 0, -35], scale: 1.0 },
      { asset: 'part.harvest_blade', position: [-1.0, 1.9, 0.2], rotation: [-15, 0, 35], scale: 1.0 },
      { asset: 'part.root_long', position: [0.5, 0.0, 0.5], rotation: [0, 30, 10], scale: 1.4 },
      { asset: 'part.root_long', position: [-0.5, 0.0, 0.4], rotation: [0, -30, -10], scale: 1.3 },
      { asset: 'part.root_long', position: [0.4, 0.0, -0.5], rotation: [0, 150, 10], scale: 1.4 },
      { asset: 'part.moss_clump', position: [0.2, 3.0, -0.2], scale: 2.5 },
      { asset: 'part.flower_bloom', position: [-0.3, 3.0, 0], scale: 2.2 },
      { asset: 'part.glass_shards', position: [0, 2.9, 0.1], scale: 2.0 },
    ],
  },
  {
    // The Warden's third phase: the Mother Tree's roots burst up and lash out.
    id: 'variant.mother_root',
    base: 'enemy.lumen_tentacle',
    look: { tint: '#8a7050', emissive: '#2a6a2a', emissiveIntensity: 0.2 },
    parts: [
      { asset: 'part.root_long', position: [0.2, 0.3, 0], rotation: [0, 0, -60], scale: 1.8 },
      { asset: 'part.root_long', position: [-0.2, 0.6, 0.1], rotation: [0, 150, -55], scale: 1.7 },
      { asset: 'part.root_long', position: [0, 1.0, -0.15], rotation: [0, -100, -50], scale: 1.5 },
      { asset: 'part.root_long', position: [0.1, 1.5, 0.1], rotation: [0, 60, -50], scale: 1.2 },
      { asset: 'part.crystal_green', position: [0.1, 0.1, 0.25], rotation: [20, 0, 20], scale: 1.6 },
      { asset: 'part.crystal_green', position: [0, 1.9, 0.35], rotation: [45, 0, 0], scale: 1.2 },
      { asset: 'part.moss_clump', position: [0, 0.15, 0], scale: 2.0 },
    ],
  },
];
