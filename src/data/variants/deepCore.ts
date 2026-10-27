/**
 * Own looks for the Deep Mines and The Core enemies, bosses and world bosses (docs/blender.md): each id wore a borrowed
 * model, now a base + material look + a few Blender parts (scripts/blender/spec/deep_core.json, `part.dc_*`).
 * Parts are built at the base's own size; `EnemyDef.scale` scales parts with the body. Unrigged bases (drone, hound,
 * Slagborn, loader, tentacle, the First, the Core's guardian and singer) attach to the root, measured from the model's
 * feet along its axes; rigged ones follow a joint and so move with the animation.
 *
 * Core ids keep the `look` of their EnemyDef ('shade' / 'lumen'): the renderer repaints the base after creating it and
 * leaves the parts alone, so no `look` is set here for them (a LOOKS key in a variant would lose its fresnel rim).
 */
import type { VariantDef, VariantPart } from '../variants';

type V3 = readonly [number, number, number];

/** The same part on both sides: x (and the roll about z / yaw about y) mirrored for the creature's right. */
function pair(asset: string, leftBone: string | undefined, rightBone: string | undefined, position: V3, rotation: V3, scale?: number): VariantPart[] {
  const [x, y, z] = position;
  const [rx, ry, rz] = rotation;
  return [
    { asset, ...(leftBone ? { bone: leftBone } : {}), position: [x, y, z], rotation: [rx, ry, rz], ...(scale ? { scale } : {}) },
    { asset, ...(rightBone ? { bone: rightBone } : {}), position: [-x, y, z], rotation: [rx, -ry, -rz], ...(scale ? { scale } : {}) },
  ];
}

export const DEEP_CORE_VARIANTS: readonly VariantDef[] = [
  // ---- Deep Mines enemies ----
  {
    // The governor's drone: dark hull in gold and blue, a gold collar and a shield antenna.
    id: 'variant.governor_drone',
    base: 'enemy.security_drone',
    look: { tint: '#cdb890', roughness: 0.5 },
    parts: [
      { asset: 'part.dc_antenna', position: [0, 0.5, 0] },
      { asset: 'part.dc_collar', position: [0, 0.36, 0] },
    ],
  },
  {
    // Heavy: a loader with a crusher's drills at both fists, rusted.
    id: 'variant.ore_crusher',
    base: 'enemy.cargo_loader',
    look: { tint: '#c89a78', roughness: 0.85 },
    parts: [
      ...pair('part.dc_drill_arm', undefined, undefined, [0.85, 1.35, 0.4], [90, 0, 0], 1.5),
    ],
  },
  {
    // Elite: one great spinning drill on the chest, crystal bursting from the cab.
    id: 'variant.drill_colossus',
    base: 'enemy.cargo_loader',
    look: { tint: '#a8c4dc', emissive: '#1d5f86', emissiveIntensity: 0.3, roughness: 0.6 },
    parts: [
      { asset: 'part.dc_drill_arm', position: [0, 1.7, 0.5], rotation: [90, 0, 0], scale: 3 },
      { asset: 'part.crystal_cluster_large', position: [0, 2.9, -0.2], rotation: [-30, 0, 0], scale: 1.4 },
      ...pair('part.dc_crystal_pauldron', undefined, undefined, [0.75, 2.5, 0], [0, 0, -15], 1.4),
    ],
  },
  {
    // Kamikaze: a spore carrier swollen with glowing crystal sacs.
    id: 'variant.shard_bloater',
    base: 'enemy.spore_carrier',
    look: { tint: '#a8d4ec', emissive: '#1a5a8a', emissiveIntensity: 0.3 },
    parts: [
      { asset: 'part.dc_shard_sac', bone: 'Spine02', position: [0, 0.08, -0.2], rotation: [-55, 0, 0], scale: 1.4 },
      { asset: 'part.dc_shard_sac', bone: 'Spine01', position: [0, -0.06, 0.16], rotation: [70, 0, 0], scale: 1.2 },
      { asset: 'part.dc_shard_sac', bone: 'RightShoulder', position: [-0.1, 0.05, 0], rotation: [0, 0, 55], scale: 0.9 },
    ],
  },
  {
    // Ambusher: the tentacle in rock armour, a toothed drill maw on top.
    id: 'variant.burrower',
    base: 'enemy.lumen_tentacle',
    look: { tint: '#8a8a98', roughness: 0.9 },
    parts: [
      { asset: 'part.dc_maw', position: [0, 2.85, 0], scale: 1.1 },
      { asset: 'part.dc_stone_collar', position: [0, 1.0, 0], scale: 1.1 },
      { asset: 'part.dc_stone_collar', position: [0, 1.9, 0], scale: 0.85 },
    ],
  },
  {
    // Tank: Slagborn in a crystal shell: pauldrons, a crown and a spire.
    id: 'variant.crystal_sentinel',
    base: 'enemy.slagborn',
    look: { tint: '#a0b8d0', emissive: '#1d5f86', emissiveIntensity: 0.35, roughness: 0.7 },
    parts: [
      ...pair('part.dc_crystal_pauldron', undefined, undefined, [0.62, 2.0, 0], [0, 0, -15], 1.1),
      { asset: 'part.dc_crystal_crown', position: [0, 2.35, 0.0], scale: 1.4 },
      { asset: 'part.dc_crystal_spire', position: [0, 1.5, -0.3], rotation: [-35, 0, 0], scale: 1.1 },
    ],
  },
  {
    // Brawler: a miner with a headlamp hard hat, a drill on the fist and dynamite on the belt.
    id: 'variant.infected_miner',
    base: 'enemy.welder',
    look: { tint: '#b4a494' },
    parts: [
      { asset: 'part.dc_helmet_lamp', bone: 'Head', position: [0, 0.09, 0.01] },
      { asset: 'part.dc_drill_arm', bone: 'RightHand', position: [-0.05, 0, 0], rotation: [0, 0, 90], scale: 0.9 },
      { asset: 'part.dc_dynamite', bone: 'Hips', position: [0.16, 0.0, 0.1], rotation: [0, 0, 12] },
      { asset: 'part.dc_dynamite', bone: 'Hips', position: [-0.12, 0.02, 0.1], rotation: [0, 0, -8], scale: 0.8 },
    ],
  },
  {
    // The governor's trooper: blue visor and crest, blue shoulder plates, a generator on the back.
    id: 'variant.security_trooper',
    base: 'enemy.sergeant',
    look: { tint: '#a8b8e8' },
    parts: [
      { asset: 'part.dc_trooper_visor', bone: 'Head', position: [0, 0.13, 0] },
      ...pair('part.dc_shoulder_plate_blue', 'LeftShoulder', 'RightShoulder', [0.14, 0.06, 0], [0, 0, -12]),
      { asset: 'part.dc_backpack_gen', bone: 'Spine01', position: [0, 0.05, -0.17], rotation: [0, 180, 0], scale: 0.8 },
    ],
  },
  {
    // Shield officer: an energy shield on the arm, gold plates and a tall generator.
    id: 'variant.shield_officer',
    base: 'enemy.sergeant',
    look: { tint: '#c8c0a8' },
    parts: [
      { asset: 'part.dc_trooper_visor', bone: 'Head', position: [0, 0.13, 0] },
      { asset: 'part.dc_shield_panel', bone: 'LeftForeArm', position: [0.1, 0, 0.2], scale: 1.1 },
      ...pair('part.dc_shoulder_plate_gold', 'LeftShoulder', 'RightShoulder', [0.14, 0.06, 0], [0, 0, -12]),
      { asset: 'part.dc_backpack_gen', bone: 'Spine01', position: [0, 0.05, -0.17], rotation: [0, 180, 0] },
    ],
  },
  {
    // Skirmisher: a hologram trailing broken blades of light and an angular crown.
    id: 'variant.echo',
    base: 'char.spectre',
    parts: [
      { asset: 'part.dc_glitch_fan', bone: 'Spine01', position: [0, 0.02, -0.16], rotation: [-18, 0, 0], scale: 1.2 },
      { asset: 'part.dc_glitch_fan', bone: 'Spine01', position: [0, 0.02, -0.16], rotation: [-18, 0, 180], scale: 0.7 },
      { asset: 'part.dc_crystal_crown', bone: 'Head', position: [0, 0.14, 0], scale: 0.9 },
    ],
  },

  // ---- Deep Mines bosses ----
  {
    // Crystal Sentinel champion: huge crystal pauldrons, a tall crown and a prism floating over its head.
    id: 'variant.the_prism',
    base: 'enemy.slagborn',
    look: { tint: '#d0e4f4', emissive: '#5ac8ff', emissiveIntensity: 0.5, roughness: 0.45 },
    parts: [
      ...pair('part.dc_crystal_pauldron', undefined, undefined, [0.66, 2.05, 0], [0, 0, -15], 1.6),
      { asset: 'part.dc_crystal_crown', position: [0, 2.35, 0], scale: 1.8 },
      { asset: 'part.dc_prism', position: [0, 2.95, 0], scale: 1.4 },
      { asset: 'part.dc_crystal_spire', position: [0.3, 1.5, -0.3], rotation: [-30, 0, -18], scale: 1.5 },
      { asset: 'part.dc_crystal_spire', position: [-0.3, 1.5, -0.3], rotation: [-30, 0, 18], scale: 1.3 },
    ],
  },
  {
    // The First's elder cousin: an upright elder ring behind the head and glyph monoliths on the shoulders.
    id: 'variant.elder_guardian',
    base: 'boss.the_first',
    look: { tint: '#b8c8e0', emissive: '#2a6a9a', emissiveIntensity: 0.4, roughness: 0.6 },
    parts: [
      { asset: 'part.dc_elder_ring', position: [0, 4.6, -0.8], scale: 2.2 },
      ...pair('part.dc_elder_slab', undefined, undefined, [1.4, 4.0, 0], [0, 0, -10], 1.8),
      { asset: 'part.dc_prism', position: [0, 5.9, 0], scale: 1.6 },
    ],
  },
  {
    // The Drill Colossus drowned: cables, moss and a big drill, wet and green.
    id: 'variant.drowned_engine',
    base: 'enemy.cargo_loader',
    look: { tint: '#6a8078', roughness: 0.3 },
    parts: [
      { asset: 'part.dc_drill_arm', position: [-0.85, 1.35, 0.45], rotation: [90, 0, 0], scale: 2.2 },
      { asset: 'part.dc_cable_bundle', position: [0, 2.9, 0.3], scale: 1.6 },
      { asset: 'part.dc_cable_bundle', position: [0.5, 2.5, -0.4], rotation: [0, 120, 0], scale: 1.3 },
      { asset: 'part.dc_moss_mat', position: [0, 3.0, 0], scale: 1.6 },
      { asset: 'part.dc_moss_mat', position: [0.7, 2.4, 0.1], scale: 1.0 },
    ],
  },
  {
    // Echo champion: memory tablets circling it, a halo ring behind the head and trailing blades.
    id: 'variant.archivist',
    base: 'char.spectre',
    look: { tint: '#c0d0ec' },
    parts: [
      { asset: 'part.dc_tablets', bone: 'Spine02', position: [0, 0.05, 0], scale: 1.3 },
      { asset: 'part.dc_elder_ring', bone: 'Head', position: [0, 0.08, -0.16], scale: 0.28 },
      { asset: 'part.dc_glitch_fan', bone: 'Spine01', position: [0, 0.02, -0.16], rotation: [-18, 0, 0], scale: 1.0 },
    ],
  },
  {
    // Security Chief Holm: peaked cap, gold plates, a grenade bandolier and a generator.
    id: 'variant.security_chief_holm',
    base: 'enemy.sergeant',
    look: { tint: '#a8b4d8' },
    parts: [
      { asset: 'part.dc_peaked_cap', bone: 'Head', position: [0, 0.14, 0] },
      ...pair('part.dc_shoulder_plate_gold', 'LeftShoulder', 'RightShoulder', [0.14, 0.06, 0], [0, 0, -12], 1.15),
      { asset: 'part.dc_grenade_belt', bone: 'Spine02', position: [0, 0.1, 0.12] },
      { asset: 'part.dc_backpack_gen', bone: 'Spine01', position: [0, 0.05, -0.17], rotation: [0, 180, 0], scale: 1.1 },
    ],
  },
  {
    // Governor Kade: Lumen-amplifying armour with a grim crown, great gold pauldrons and a conduit pack.
    id: 'variant.governor_kade',
    // His own Meshy model (crown collar, coat, tower shield); the Lumen pack on his back drives the armour.
    base: 'boss.governor_kade',
    parts: [{ asset: 'part.dc_conduit_pack', bone: 'Spine01', position: [0, 0.05, -0.2], rotation: [0, 180, 0], scale: 1.1 }],
  },
  // ---- The Core: returning enemies as shades (their EnemyDef look 'shade' repaints the base; the parts stay violet and solid) ----
  {
    // A walker's memory: a halo of loose shards, a fan of blades behind and shards drifting round the legs.
    id: 'variant.shade_walker',
    base: 'enemy.infected_colonist',
    parts: [
      { asset: 'part.dc_shade_halo', bone: 'Head', position: [0, 0.32, 0], scale: 0.8 },
      { asset: 'part.dc_shade_fan', bone: 'Spine02', position: [0, 0.1, -0.12], rotation: [-22, 0, 0] },
      { asset: 'part.dc_shade_drift', bone: 'Hips', position: [0.2, -0.45, 0.05] },
    ],
  },
  {
    // Smaller and thinner: a pair of swept blades, shards drifting low.
    id: 'variant.shade_echo',
    base: 'enemy.infected_colonist',
    parts: [
      ...pair('part.dc_shade_wing', 'LeftShoulder', 'RightShoulder', [0.08, 0.05, -0.1], [-30, 0, 35], 1.2),
      { asset: 'part.dc_shade_drift', bone: 'Hips', position: [-0.1, -0.3, 0.1], scale: 1.4 },
    ],
  },
  {
    // A hound: a ridge of violet shards along the back and loose ones behind.
    id: 'variant.shade_hound',
    base: 'enemy.spore_hound',
    parts: [
      { asset: 'part.dc_shade_spine', position: [0, 0.62, 0.38], scale: 1.1 },
      { asset: 'part.dc_shade_drift', position: [0, 0.45, -0.75], scale: 1.2 },
    ],
  },
  {
    // A smelter: a spiked crown and two swept blades.
    id: 'variant.shade_smelter',
    base: 'enemy.smelter',
    parts: [
      { asset: 'part.dc_shade_crown', bone: 'Head', position: [0, 0.14, 0] },
      ...pair('part.dc_shade_wing', 'LeftShoulder', 'RightShoulder', [0.08, 0.06, -0.12], [-25, 0, 45], 1.3),
    ],
  },
  {
    // A weaver: a halo at the top of the column, shards drifting round the middle and foot.
    id: 'variant.shade_weaver',
    base: 'enemy.lumen_tentacle',
    parts: [
      { asset: 'part.dc_shade_halo', position: [0, 2.7, 0], scale: 1.5 },
      { asset: 'part.dc_shade_drift', position: [0.3, 1.5, 0.2], scale: 2 },
      { asset: 'part.dc_shade_drift', position: [-0.3, 0.7, -0.2], scale: 1.6, rotation: [0, 90, 0] },
    ],
  },
  {
    // A sentinel: a tall crown, violet plates on the shoulders and a fan of blades on the back.
    id: 'variant.shade_sentinel',
    base: 'enemy.slagborn',
    parts: [
      { asset: 'part.dc_shade_crown', position: [0, 2.35, 0], scale: 2 },
      ...pair('part.dc_shoulder_plate_violet', undefined, undefined, [0.62, 2.0, 0], [0, 0, -12], 1.7),
      { asset: 'part.dc_shade_fan', position: [0, 1.6, -0.35], rotation: [-25, 0, 0], scale: 1.9 },
    ],
  },
  {
    // A drone: a violet halo round the hull and shards drifting below.
    id: 'variant.shade_drone',
    base: 'enemy.security_drone',
    parts: [
      { asset: 'part.dc_shade_halo', position: [0, 0.42, 0], scale: 1.1 },
      { asset: 'part.dc_shade_drift', position: [0, 0.1, 0], scale: 1.5 },
    ],
  },
  {
    // The First's shade: a vast crown, a halo high above and blades fanned behind.
    id: 'variant.shade_the_first',
    base: 'boss.the_first',
    parts: [
      { asset: 'part.dc_shade_crown', position: [0, 5.2, 0.2], scale: 6 },
      { asset: 'part.dc_shade_halo', position: [0, 6.6, 0], scale: 4 },
      { asset: 'part.dc_shade_fan', position: [0, 4.0, -1.0], rotation: [-20, 0, 0], scale: 4.5 },
    ],
  },
  {
    // Vire's shade: a crown, a vertical halo behind the head and blades on the back.
    id: 'variant.shade_vire',
    base: 'boss.vire',
    parts: [
      { asset: 'part.dc_shade_crown', bone: 'Head', position: [0, 0.14, 0], scale: 1.4 },
      { asset: 'part.dc_shade_halo', bone: 'Head', position: [0, 0.1, -0.18], rotation: [90, 0, 0], scale: 1.1 },
      { asset: 'part.dc_shade_fan', bone: 'Spine01', position: [0, 0.04, -0.15], rotation: [-20, 0, 0], scale: 1.2 },
    ],
  },
  {
    // The Warden's shade: vines hanging off the cab, a halo above and blades behind.
    id: 'variant.shade_warden',
    base: 'enemy.cargo_loader',
    parts: [
      { asset: 'part.dc_shade_halo', position: [0, 3.5, 0], scale: 3 },
      { asset: 'part.dc_vines_violet', position: [0.6, 2.9, 0.2], scale: 1.8 },
      { asset: 'part.dc_vines_violet', position: [-0.6, 2.9, -0.2], scale: 1.8, rotation: [0, 180, 0] },
      { asset: 'part.dc_shade_fan', position: [0, 2.5, -1.0], rotation: [-20, 0, 0], scale: 3 },
    ],
  },
  {
    // Kade's shade: the same crown, plates and conduits, gone violet.
    id: 'variant.shade_kade',
    base: 'boss.governor_kade',
    parts: [{ asset: 'part.dc_conduit_pack_violet', bone: 'Spine01', position: [0, 0.05, -0.2], rotation: [0, 180, 0], scale: 1.1 }],
  },

  // ---- The Core: the Absorbed (Lumen look on the body; gold-white crystal growth and what each of them did) ----
  {
    // Ostrow the smith: a crystal hammer in the fist, wings of light and a halo.
    id: 'variant.absorbed_ostrow',
    base: 'npc.blacksmith',
    parts: [
      { asset: 'part.dc_abs_crown', bone: 'Head', position: [0, 0.34, 0] },
      { asset: 'part.dc_abs_hammer', bone: 'RightHand', position: [-0.05, 0, 0], rotation: [0, 0, 0], scale: 1.1 },
      ...pair('part.dc_abs_wings', undefined, undefined, [0.08, 1.3, -0.16], [-30, 0, 35], 1.2),
    ],
  },
  {
    // Brother Lenn the cook: a crystal toque with a halo above it.
    id: 'variant.absorbed_lenn',
    base: 'npc.cook',
    parts: [
      { asset: 'part.dc_abs_toque', bone: 'Head', position: [0, 0.14, 0] },
      { asset: 'part.dc_abs_crown', bone: 'Head', position: [0, 0.6, 0], scale: 1.1 },
      ...pair('part.dc_abs_wings', undefined, undefined, [0.08, 1.3, -0.14], [-35, 0, 50], 0.9),
    ],
  },
  {
    // Dr. Halvorsen the pump engineer: brass pipes on the back and a halo.
    id: 'variant.absorbed_halvorsen',
    base: 'npc.pump_engineer',
    parts: [
      { asset: 'part.dc_abs_pipes', bone: 'Spine01', position: [0, 0.05, -0.18], rotation: [0, 180, 0], scale: 1.2 },
      { asset: 'part.dc_abs_crown', bone: 'Head', position: [0, 0.34, 0] },
    ],
  },
  {
    // Rhee the technician: an antenna dish on the shoulder, a halo and light-wings.
    id: 'variant.absorbed_rhee',
    base: 'npc.technician',
    parts: [
      { asset: 'part.dc_abs_dish', bone: 'RightShoulder', position: [-0.05, 0.05, -0.05], rotation: [-10, 0, 10], scale: 1.2 },
      { asset: 'part.dc_abs_crown', bone: 'Head', position: [0, 0.34, 0], scale: 0.9 },
      { asset: 'part.dc_abs_wings', bone: 'Spine01', position: [0, 0.05, -0.15], rotation: [-30, 0, 0], scale: 1.0 },
    ],
  },
  {
    // Pvt. Danner the defector: a crystal helmet, wings and a halo.
    id: 'variant.absorbed_danner',
    base: 'npc.defector',
    parts: [
      { asset: 'part.dc_abs_helm', bone: 'Head', position: [0, 0.12, 0] },
      { asset: 'part.dc_abs_crown', bone: 'Head', position: [0, 0.36, 0], scale: 1.15 },
      ...pair('part.dc_abs_wings', undefined, undefined, [0.08, 1.3, -0.16], [-30, 0, 40], 1.4),
    ],
  },

  // ---- The Core: choir and machines ----
  {
    // The Choir Mother: a tiara of spires and long veils.
    id: 'variant.choir_mother',
    base: 'enemy.choir_singer',
    parts: [
      { asset: 'part.dc_choir_crown', position: [0, 1.3, 0.05], scale: 1.6 },
      { asset: 'part.dc_veil', position: [0, 1.0, -0.5], scale: 1.6 },
    ],
  },
  {
    // The Brood Engine: hatch pods stacked on its back (root parts do not follow the clips, so they sit on the torso, not on the arms).
    id: 'variant.brood_engine',
    base: 'enemy.core_guardian',
    parts: [
      { asset: 'part.dc_hatch_pods', position: [0, 3.5, -1.15], rotation: [-12, 0, 0], scale: 2.8 },
      { asset: 'part.dc_hatch_pods', position: [0, 5.0, -0.95], rotation: [-30, 0, 0], scale: 1.5 },
    ],
  },
  {
    // The Hollow Engine: a heavy ring standing behind the torso.
    id: 'variant.hollow_engine',
    base: 'enemy.core_guardian',
    parts: [
      { asset: 'part.dc_hollow_ring', position: [0, 4.3, -1.2], scale: 2.4 },
    ],
  },
  {
    // The Echo Engine: broken blades of light behind the shoulders and prisms above.
    id: 'variant.echo_engine',
    base: 'enemy.core_guardian',
    parts: [
      ...pair('part.dc_glitch_fan_core', undefined, undefined, [1.0, 4.6, -0.8], [-15, 0, -40], 4),
      { asset: 'part.dc_prism_core', position: [0, 6.6, 0], scale: 3 },
    ],
  },
  {
    // The Choir of Stone: a crown of stone spires and a ring of floating blocks.
    id: 'variant.choir_of_stone',
    base: 'enemy.choir_singer',
    parts: [
      { asset: 'part.dc_stone_crown', position: [0, 1.3, 0.05], scale: 1.8 },
      { asset: 'part.dc_stone_orbit', position: [0, 0.2, 0], scale: 1.5 },
    ],
  },

  // ---- World bosses ----
  {
    // The Ashen Colossus: smokestacks on the cab, ash piles and horns along the back.
    id: 'variant.ashen_colossus',
    base: 'enemy.cargo_loader',
    look: { tint: '#a09c96', emissive: '#7a2a08', emissiveIntensity: 0.25, roughness: 0.9 },
    parts: [
      ...pair('part.dc_smokestack', undefined, undefined, [0.45, 2.85, -0.25], [0, 0, -8], 1.8),
      { asset: 'part.dc_ash_pile', position: [0, 3.2, 0.3], scale: 2 },
      ...pair('part.dc_ash_pile', undefined, undefined, [0.8, 2.3, 0], [0, 0, 0], 1.6),
      { asset: 'part.dc_horn_row', position: [0, 3.0, 0.3], scale: 1.8 },
    ],
  },
  {
    // The Mother of Spores: a mushroom crown, shelf fungus on the shoulders and swollen sacs.
    id: 'variant.mother_of_spores',
    base: 'enemy.spore_carrier',
    look: { tint: '#c0d098', emissive: '#2a3a10', emissiveIntensity: 0.3 },
    parts: [
      { asset: 'part.dc_mushroom_crown', bone: 'Head', position: [0, 0.1, 0], scale: 1.4 },
      { asset: 'part.dc_bracket_fungus', bone: 'LeftShoulder', position: [0.1, 0.05, -0.05], rotation: [0, 0, -15], scale: 1.4 },
      { asset: 'part.dc_bracket_fungus', bone: 'RightShoulder', position: [-0.1, 0.05, -0.05], rotation: [0, 180, 15], scale: 1.2 },
      { asset: 'part.dc_spore_sac_big', bone: 'Spine02', position: [0, 0.1, -0.2], rotation: [-55, 0, 0], scale: 1.6 },
      { asset: 'part.dc_spore_sac_big', bone: 'Spine01', position: [0, -0.06, 0.18], rotation: [70, 0, 0], scale: 1.3 },
    ],
  },
];
