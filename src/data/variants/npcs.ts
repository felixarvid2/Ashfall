/**
 * Own looks for the named NPCs (docs/blender.md): about forty hub and quest characters share five bodies
 * (npc.cook, npc.blacksmith, npc.technician, npc.pump_engineer, npc.defector). Each person is one variant: a clothing
 * tint plus one to three accessories (`part.npc_*`, scripts/blender/spec/npcs_loot.json) that fit who they are in
 * the strings (`npcs.*` in lang/en.json), so people in the same hub tell apart at a glance. The same person is the same
 * variant wherever they stand (Hekla in Outpost Ember and in the Last Camp, the three Okafors).
 *
 * Frames the parts were built for (scripts/blender/builders_npcs_loot.py): head parts hang on `Head` with the head centre at
 * y 0.12; `neck`, `Spine01` (chest and back) and `Hips` (belt) likewise. Every part follows its bone, so the idle
 * animation moves them. Tints multiply the (dark) bodies: keep them pale.
 */
import type { VariantDef } from '../variants';

const HEAD = { bone: 'Head' } as const;
const NECK = { bone: 'neck' } as const;
const CHEST = { bone: 'Spine01' } as const;
const HIPS = { bone: 'Hips' } as const;

export const NPC_VARIANTS: readonly VariantDef[] = [
  // ---- Outpost Ember (Cinder Flats) ----
  {
    // Benny Rusk, cook and trader: a cook's toque and the pot he stirs, hung from his belt.
    id: 'variant.npc_benny',
    base: 'npc.cook',
    look: { tint: '#f5ecdc' },
    parts: [
      { asset: 'part.npc_toque', ...HEAD },
      { asset: 'part.npc_pot_hip', ...HIPS },
    ],
  },
  {
    // Hekla Strand, former miner and smith: goggles up, a hammer on the belt, a leather shoulder guard; sooty overalls.
    id: 'variant.npc_hekla',
    base: 'npc.blacksmith',
    look: { tint: '#cfcdc9' },
    parts: [
      { asset: 'part.npc_goggles_amber', ...HEAD },
      { asset: 'part.npc_belt_hammer', ...HIPS },
      { asset: 'part.npc_shoulder_leather', bone: 'LeftShoulder', position: [0.1, 0.03, 0] },
    ],
  },
  {
    // Pell Varga, data engineer: a headset with an antenna and a radio pack; cool tint.
    id: 'variant.npc_pell',
    base: 'npc.technician',
    look: { tint: '#cfe1ee' },
    parts: [
      { asset: 'part.npc_headset_teal', ...HEAD },
      { asset: 'part.npc_radio_pack', ...CHEST },
    ],
  },
  {
    // Tomas Reyes, a survivor looking for a girl in a red jacket: a red scarf, a cap and a travelling pack.
    id: 'variant.npc_tomas',
    base: 'npc.blacksmith',
    look: { tint: '#ece5da' },
    parts: [
      { asset: 'part.npc_cap_brown', ...HEAD },
      { asset: 'part.npc_scarf_red', ...NECK },
      { asset: 'part.npc_rucksack_roll', ...CHEST },
    ],
  },

  // ---- Coolant Works (Refinery District) ----
  {
    // Mara Kowal, pump engineer ("minus forty"): a blue beanie and wool scarf, a pipe wrench on her belt.
    id: 'variant.npc_mara',
    base: 'npc.pump_engineer',
    look: { tint: '#d6dfec' },
    parts: [
      { asset: 'part.npc_beanie_blue', ...HEAD },
      { asset: 'part.npc_scarf_blue', ...NECK },
      { asset: 'part.npc_belt_wrench', ...HIPS },
    ],
  },
  {
    // Gus Abara, quartermaster ("salvaged, bartered or stolen"): a grey cap and a rucksack with a bedroll.
    id: 'variant.npc_gus',
    base: 'npc.cook',
    look: { tint: '#e2dfd2' },
    parts: [
      { asset: 'part.npc_cap_grey', ...HEAD },
      { asset: 'part.npc_rucksack_roll', ...CHEST },
    ],
  },
  {
    // Ines Varro, machinist: steel-blue goggles up, a shoulder guard and a pouch belt; cool grey overalls.
    id: 'variant.npc_ines',
    base: 'npc.blacksmith',
    look: { tint: '#c9cfd8' },
    parts: [
      { asset: 'part.npc_goggles_blue', ...HEAD },
      { asset: 'part.npc_shoulder_leather', bone: 'RightShoulder', position: [-0.1, 0.03, 0] },
      { asset: 'part.npc_belt_pouches', ...HIPS },
    ],
  },
  {
    // Tobin, a Smelter defector who wore the robe for two years: the robe's red sash as a scarf, and a plain cap.
    id: 'variant.npc_tobin',
    base: 'npc.defector',
    look: { tint: '#e1d8d4' },
    parts: [
      { asset: 'part.npc_beanie_grey', ...HEAD },
      { asset: 'part.npc_scarf_smelter', ...NECK },
    ],
  },
  {
    // Kofi Osei, Delta station engineer: a white hard hat with a blue lamp and a blue armband.
    id: 'variant.npc_osei',
    base: 'npc.technician',
    look: { tint: '#cfdadf' },
    parts: [
      { asset: 'part.npc_hardhat_white', ...HEAD, scale: 0.9 },
      { asset: 'part.npc_armband_blue', bone: 'LeftArm', position: [0.1, 0, 0] },
    ],
  },
  {
    // Rhee, crane operator: an orange hard hat with ear defenders and a hi-vis vest.
    id: 'variant.npc_rhee',
    base: 'npc.technician',
    look: { tint: '#e1dcd6' },
    parts: [
      { asset: 'part.npc_hardhat_muffs', ...HEAD, scale: 0.9 },
      { asset: 'part.npc_vest_orange', ...CHEST },
    ],
  },
  {
    // Brother Lenn, Smelter preacher: the dark-red robe tail and prayer beads.
    id: 'variant.npc_lenn',
    base: 'npc.defector',
    look: { tint: '#e7cfc9' },
    parts: [
      { asset: 'part.robe_flap', bone: 'Hips', position: [0, -0.02, -0.12], rotation: [0, 180, 0], scale: 0.9 },
      { asset: 'part.npc_prayer_beads', ...NECK },
    ],
  },

  // ---- Lab 9 (Hydroponic Vaults) ----
  {
    // Dr. Amara Okafor, botanist ("mask on, gloves on"): a respirator, pale spectacles, a lab coat. Also at the Mother Tree,
    // below in Station Zero and as the face Lumen takes.
    id: 'variant.npc_okafor',
    base: 'npc.technician',
    look: { tint: '#e7ece3' },
    parts: [
      { asset: 'part.npc_respirator_white', ...HEAD },
      { asset: 'part.npc_glasses_white', ...HEAD, position: [0, 0, 0.03] },
      { asset: 'part.npc_labcoat', ...HIPS },
    ],
  },
  {
    // Quill, quartermaster ("sealed twice"): a dark beanie and a sealed hazard crate on the back.
    id: 'variant.npc_quill',
    base: 'npc.cook',
    look: { tint: '#dae1d8' },
    parts: [
      { asset: 'part.npc_beanie_grey', ...HEAD },
      { asset: 'part.npc_crate_pack', ...CHEST },
    ],
  },
  {
    // Brann, blacksmith in the spore air: goggles with glowing green lenses and a moss-green shoulder guard.
    id: 'variant.npc_brann',
    base: 'npc.blacksmith',
    look: { tint: '#d4dccb' },
    parts: [
      { asset: 'part.npc_goggles_green', ...HEAD },
      { asset: 'part.npc_shoulder_green', bone: 'LeftShoulder', position: [0.1, 0.03, 0] },
    ],
  },
  {
    // Dace, aspect technician ("the filters hum"): a blue headset and a filter pack with a hose loop.
    id: 'variant.npc_dace',
    base: 'npc.pump_engineer',
    look: { tint: '#cfdfd8' },
    parts: [
      { asset: 'part.npc_headset_blue', ...HEAD },
      { asset: 'part.npc_filter_pack', ...CHEST },
    ],
  },
  {
    // Dr. Halvorsen, infected researcher: cracked spectacles, moss on the shoulder, a vine through the sleeve; sickly green.
    id: 'variant.npc_halvorsen',
    base: 'npc.defector',
    look: { tint: '#d6e5cb', emissive: '#1d3a12', emissiveIntensity: 0.25 },
    parts: [
      { asset: 'part.npc_glasses_cracked', ...HEAD },
      { asset: 'part.moss_clump', bone: 'LeftShoulder', position: [0.1, 0.06, 0], scale: 0.7 },
      { asset: 'part.vine_short', bone: 'LeftForeArm', position: [0.02, 0, 0], rotation: [180, 0, 0], scale: 0.8 },
    ],
  },

  // ---- Station Zero (Deep Mines) ----
  {
    // Foreman Hana Brask: a hard hat with a lit lamp, a wrench on the belt, a red foreman's armband. Also at the Last Camp.
    id: 'variant.npc_brask',
    base: 'npc.pump_engineer',
    look: { tint: '#e2dfd1' },
    parts: [
      { asset: 'part.dc_helmet_lamp', ...HEAD, position: [0, 0.12, 0] },
      { asset: 'part.npc_belt_wrench', ...HIPS },
      { asset: 'part.npc_armband_red', bone: 'LeftArm', position: [0.1, 0, 0] },
    ],
  },
  {
    // Oona, quartermaster ("batteries, flares, ration bars"): an orange beanie, a flare bandolier and a stock pack.
    id: 'variant.npc_oona',
    base: 'npc.cook',
    look: { tint: '#e7dacb' },
    parts: [
      { asset: 'part.npc_beanie_orange', ...HEAD },
      { asset: 'part.npc_flare_bandolier', ...CHEST },
      { asset: 'part.npc_rucksack_battery', ...CHEST },
    ],
  },
  {
    // Gerd, blacksmith in the crystal dust: Lumen-cyan goggles, a respirator and a hammer on the belt.
    id: 'variant.npc_gerd',
    base: 'npc.blacksmith',
    look: { tint: '#c6cfda' },
    parts: [
      { asset: 'part.npc_goggles_cyan', ...HEAD },
      { asset: 'part.npc_respirator_rust', ...HEAD },
      { asset: 'part.npc_belt_hammer', ...HIPS },
    ],
  },
  {
    // Nils, aspect technician ("the aspects resonate"): an amber headset and a tuning fork on his back.
    id: 'variant.npc_nils',
    base: 'npc.technician',
    look: { tint: '#d8e1dc' },
    parts: [
      { asset: 'part.npc_headset_amber', ...HEAD },
      { asset: 'part.npc_tuning_fork', ...CHEST },
    ],
  },
  {
    // Foreman Tam's daughter, keeping the hub's lamps: a mustard beanie, an amber scarf and a lantern on her belt.
    id: 'variant.npc_tam',
    base: 'npc.defector',
    look: { tint: '#e5d8cd' },
    parts: [
      { asset: 'part.npc_beanie_mustard', ...HEAD },
      { asset: 'part.npc_scarf_amber', ...NECK },
      { asset: 'part.npc_lantern', ...HIPS },
    ],
  },
  {
    // The Whisper, a voice in the Elder Halls: a pale cloak with a glowing hem and a ring of motes over its head.
    id: 'variant.npc_whisper',
    base: 'npc.defector',
    look: { tint: '#e1f0f5', emissive: '#0c3038', emissiveIntensity: 0.5 },
    parts: [
      { asset: 'part.npc_wisp_motes', ...HEAD },
      { asset: 'part.npc_cloak_pale', bone: 'Spine', position: [0, 0, 0] },
    ],
  },
  {
    // Teo Vasquez, Mining Station Aurum ("ninety-one miners"): a yellow hard hat, a yellow armband and a pickaxe on his back.
    id: 'variant.npc_vasquez',
    base: 'npc.defector',
    look: { tint: '#cfd4cb' },
    parts: [
      { asset: 'part.npc_hardhat_yellow', ...HEAD, scale: 0.9 },
      { asset: 'part.npc_armband_yellow', bone: 'LeftArm', position: [0.1, 0, 0] },
      { asset: 'part.npc_pick_back', ...CHEST },
    ],
  },

  // ---- The Last Camp (The Core) ----
  {
    // Maren Sol, elevator engineer: an olive cap, an amber headset and a pouch belt.
    id: 'variant.npc_maren',
    base: 'npc.technician',
    look: { tint: '#cfd8d4' },
    parts: [
      { asset: 'part.npc_cap_green', ...HEAD },
      { asset: 'part.npc_headset_amber', ...HEAD },
      { asset: 'part.npc_belt_pouches', ...HIPS },
    ],
  },
  {
    // Wren the Scribe: a flat cap, round gold spectacles and a satchel of scroll tubes.
    id: 'variant.npc_wren',
    base: 'npc.technician',
    look: { tint: '#dfdae3' },
    parts: [
      { asset: 'part.npc_cap_grey', ...HEAD },
      { asset: 'part.npc_glasses_gold', ...HEAD, position: [0, 0, 0.03] },
      { asset: 'part.npc_satchel', ...CHEST },
    ],
  },
  {
    // Idris Vale, the Listener: big grey headphones and a slate muffler.
    id: 'variant.npc_idris',
    base: 'npc.defector',
    look: { tint: '#cfd4dc' },
    parts: [
      { asset: 'part.npc_headphones', ...HEAD },
      { asset: 'part.npc_scarf_slate', ...NECK },
    ],
  },

  // ---- Not named, but seen in groups ----
  {
    // The Ember militia that comes to the Elevator Base: caps, red armbands and packs.
    id: 'variant.npc_militia',
    base: 'npc.defector',
    look: { tint: '#d8dccf' },
    parts: [
      { asset: 'part.npc_cap_green', ...HEAD },
      { asset: 'part.npc_armband_red', bone: 'LeftArm', position: [0.1, 0, 0] },
      { asset: 'part.npc_rucksack_roll', ...CHEST },
    ],
  },
  {
    // Survivors of a rescue event: a cap and a travelling pack on the technician body.
    id: 'variant.npc_survivor',
    base: 'npc.technician',
    look: { tint: '#dfdfd6' },
    parts: [
      { asset: 'part.npc_cap_brown', ...HEAD },
      { asset: 'part.npc_rucksack_roll', ...CHEST },
    ],
  },
];
