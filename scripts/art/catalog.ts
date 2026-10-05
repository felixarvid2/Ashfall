/**
 * Everything generated with FLUX.2 Turbo beyond the effect sprites: what it is, how big, and how
 * scripts/art/process.ts turns it into game files (public/assets/art/...).
 *
 *  icon      item, aspect and passive icons: object on black, kept as is (shown on dark slots)
 *  portrait  boss portraits for the boss bar and intro card
 *  frame     rarity frames: ornament on black, black becomes transparent
 *  decal     ground decals on a chroma-key background that becomes transparent
 *  vfx       extra effect sprites, added to the particle atlas (scripts/vfx/pack.ts)
 *  texture   seamless ground texture
 *  wide      1280 × 720 paintings (region cards, menu art)
 *  map       painted region maps made with the edit endpoint from a drawing of the zone's layout
 */
import type { SpriteSpec } from '../vfx/sprites';

export type ArtKind = 'icon' | 'portrait' | 'frame' | 'decal' | 'vfx' | 'texture' | 'wide' | 'map';

export interface ArtSpec {
  key: string;
  kind: ArtKind;
  prompt: string;
  w: number;
  h: number;
  /** Decals: the key colour to remove (green unless the decal itself is green). */
  chroma?: 'green' | 'magenta';
  /** Decals: share of the height to keep (the model sometimes adds a sticker underneath). */
  keep?: number;
  /** VFX: a white shape the game tints (see scripts/vfx/sprites.ts). */
  mask?: boolean;
  /** Maps: the zone whose layout drawing is the input image. */
  zone?: string;
}

const SQ = 992;
const WIDE: [number, number] = [1280, 720];

const STYLE_ICON =
  'game inventory icon, single object centered, three-quarter view, dark gritty sci-fi industrial colony, painterly realistic, dramatic rim light, isolated on a plain pure solid black background, no scenery, no environment, no floor, nothing else, no text, no border, no frame';

// ---- 5. Items: three looks per base (worn, military, masterwork) and one per unique ----------

const BASES: Record<string, string> = {
  hydraulic_hammer: 'a heavy two-handed hydraulic sledgehammer with pistons in the head',
  power_sword: 'a broad power sword with an energy edge along the blade',
  hydraulic_knuckles: 'a pair of armoured hydraulic knuckle gauntlets with pistons',
  riot_shield: 'a tall rectangular riot shield with a view slit',
  marksman_rifle: 'a long marksman rifle with a scope',
  twin_pistols: 'a pair of crossed heavy sci-fi pistols',
  vibroblade: 'a short vibrating combat knife with a serrated humming blade',
  scalpel_blade: 'a long surgical scalpel blade weapon with a bio-tech handle',
  bio_focus: 'an organic bio-focus orb in a metal claw holder with fungal tendrils',
  injector_rig: 'a wrist-mounted chemical injector rig with vials',
  combat_helm: 'a sealed combat helmet with a visor',
  plated_vest: 'an armoured plated combat vest',
  servo_gauntlets: 'a pair of servo-assisted armoured gauntlets',
  armored_greaves: 'armoured leg greaves with knee plates',
  mag_boots: 'heavy magnetic boots with thick soles',
  signal_pendant: 'a pendant on a chain with a small signal emitter',
  conduit_ring: 'a thick metal ring with an energy conduit groove',
};
const TIERS = [
  'battered salvaged scrap, scratched dull metal, rust, makeshift repairs',
  'well-made military issue, clean dark plating, faint cool glowing accents',
  'masterwork artefact, ornate engravings, gold inlays, strong glowing energy, radiant',
];
const items: ArtSpec[] = Object.entries(BASES).flatMap(([id, what]) =>
  TIERS.map((tier, t) => ({ key: `items/${id}_${t + 1}`, kind: 'icon' as const, prompt: `${what}, ${tier}, ${STYLE_ICON}`, w: SQ, h: SQ })),
);
const UNIQUES: Record<string, string> = {
  governors_crucible: "an ornate armoured breastplate (body armour worn on the torso, not a box or chest) with a molten crucible core glowing orange in its centre",
  ashwalker_treads: 'heavy boots with rocket thrusters in the heels trailing ash and embers',
  fist_of_kharos: 'a massive gauntlet forged from a drill bit, glowing green crystal veins',
  heart_of_lumen: 'a pendant holding a beating glowing green crystal heart',
  widowmaker: 'a black long-barrelled sniper rifle with red glowing runes along the barrel',
  echo_holsters: 'a pair of pistols with ghostly afterimages echoing behind them',
  mother_of_spores: 'a bio-focus shaped like a pulsing fungal womb releasing glowing spores',
  crown_of_the_hive: 'an insect-chitin crown helmet with small glowing eyes',
  ashen_heartwood: 'a pendant of charred heartwood with a glowing ember at its core',
  seed_of_accord: 'a ring holding a living green seed sprouting a tiny leaf, soft golden light',
};
const uniques: ArtSpec[] = Object.entries(UNIQUES).map(([id, what]) => ({
  key: `items/unique_${id}`,
  kind: 'icon',
  prompt: `${what}, legendary unique artefact, ${STYLE_ICON}`,
  w: SQ,
  h: SQ,
}));

// ---- 6. Aspects and passive skill-tree stats: engraved emblems ---------------------------------

const EMBLEM = 'circular engraved metal emblem medallion, glowing symbol in the middle, dark sci-fi, painterly, isolated on a pure solid black background, no text, no letters, no border';
const ASPECTS: Record<string, string> = {
  fissure: 'a burning crack splitting the ground', furnace: 'a furnace with roaring heat', momentum: 'a rocket boot leaping upward',
  aegis: 'a glowing energy shield', echo: 'concentric shockwave rings', molten_fists: 'a fist wreathed in fire',
  brutality: 'a skull cracked by a hammer', bulwark: 'a shield bubble over a fist', wrecking_ball: 'a heavy impact crater',
  vulnerability_matrix: 'a cracked armour plate with a target', heat_sink: 'cooling fins venting steam', gravity_well: 'a swirling gravity vortex',
  orbital_uplink: 'a satellite firing a beam down', cinder_core: 'a glowing cinder core', ricochet: 'a bullet bouncing in zigzags',
  marksman: 'a crosshair over an eye', bullet_storm: 'a spray of many bullets', trapper: 'a proximity mine',
  demolition: 'a grenade bursting', phantom: 'a fading ghostly silhouette', ambusher: 'a dagger from the shadows',
  predator: 'a hunting eye with a target mark', blade_dancer: 'two crossed vibrating blades', plague: 'a toxic spore burst',
  swarm: 'a swarm of small creatures', leech: 'a blade dripping red life energy', parasitic: 'a parasite with tendrils linking',
  detonation: 'a corpse bursting into green fire', carapace: 'insect chitin armour plates', hive: 'a hive with glowing cells',
  virulent: 'a dripping poison drop', ancient_wrath: 'an ancient glowing green eye of wrath', lifeblood: 'a glowing red heart',
  unbroken: 'an unbreakable fortress wall',
};
const aspects: ArtSpec[] = Object.entries(ASPECTS).map(([id, what]) => ({
  key: `aspects/${id}`,
  kind: 'icon',
  prompt: `${EMBLEM}, symbol: ${what}, amber and cyan glow`,
  w: SQ,
  h: SQ,
}));
const STATS: Record<string, string> = {
  damage: 'a sword striking with power', resourceGen: 'a flowing energy battery charging', maxLife: 'a heart with a plus sign',
  damageVsElite: 'a crowned skull being struck', armor: 'a thick armour plate', potionHealing: 'a glowing healing vial',
  moveSpeed: 'a winged boot', damageVsVulnerable: 'a cracked shield with a blade', damageReduction: 'a shield deflecting arrows',
  critChance: 'a crosshair with a star', cooldownReduction: 'an hourglass spinning fast', critDamage: 'a shattering impact star',
  attackSpeed: 'two blades in rapid motion', generic: 'a glowing skill node star',
};
const stats: ArtSpec[] = Object.entries(STATS).map(([id, what]) => ({
  key: `stats/${id}`,
  kind: 'icon',
  prompt: `${EMBLEM}, symbol: ${what}, pale steel and orange glow`,
  w: SQ,
  h: SQ,
}));

// ---- 3. Bosses -------------------------------------------------------------------------------

const PORTRAIT = 'dark sci-fi horror boss character portrait, head and shoulders, menacing, dramatic rim lighting, painterly realistic, dark smoky background, no text, no border';
const BOSSES: Record<string, string> = {
  foreman_dray: 'a hulking infected mining foreman, cracked hard hat, glowing green fungal growths bursting from his shoulders',
  the_prism: 'a towering crystalline construct of prismatic glowing crystal shards, no face, refracting light',
  drowned_engine: 'a rusted flooded mining machine with a drill face, water pouring from it, glowing pilot lights like eyes',
  archivist: 'a floating ancient alien archivist made of pale stone and cyan light, many glowing glyph rings around its head',
  elder_guardian: 'an ancient alien stone guardian statue, blue-black stone with thin glowing cyan seams, hollow glowing eyes',
  security_chief_holm: 'a grim corporate security chief in black tactical armour and helmet with a red visor',
  governor_kade: 'a tyrant governor in gold-trimmed heavy powered armour with a crown-like helmet, cold eyes',
  brood_mother: 'a huge infected insectoid brood mother with glistening carapace and many glowing green eyes',
  commandant_hale: 'an infected military commandant with a torn officer coat and fungal growth over half his face',
  the_first: 'the first infected, a giant horror overgrown with glowing green crystal and fungus, barely human',
  brother_ash: 'a zealot priest in ash-grey robes and a soot-covered mask holding a flamethrower nozzle',
  pyre_warden: 'a warden in heavy heat-scarred furnace armour with flames behind his visor',
  frozen_welder: 'a welder encased in frost and ice, cryo torch glowing pale blue, frozen breath',
  vire: 'High Priestess Vire, a cult leader in dark robes with a smelter crown of molten metal, glowing orange eyes',
  the_keeper: 'a tall faceless entity of green lumen light inside a cage of black metal',
  brood_warden: 'a hulking infected warden covered in pulsing egg sacs and chitin plates',
  vine_matriarch: 'a towering plant creature matriarch woven from thorny vines with a glowing flower for a face',
  ilse_varga: 'Dr. Ilse Varga, a mutated scientist in a stained lab coat, plant tendrils growing from her arms, cold glasses',
  gamma_bloom: 'a giant carnivorous fungal flower monster with glowing spores and toothed petals',
  warden: 'the Warden of the Mother Tree, a guardian armoured in bark and roots with glowing green eyes',
};
const bosses: ArtSpec[] = Object.entries(BOSSES).map(([id, what]) => ({ key: `bosses/${id}`, kind: 'portrait', prompt: `${what}, ${PORTRAIT}`, w: SQ, h: SQ }));

// ---- 14. Rarity frames ---------------------------------------------------------------------------

const FRAME = 'an ornate square inventory slot frame border, thin metal frame with corner ornaments, the inside of the frame is completely empty pure black, isolated on a pure solid black background, flat front view, symmetrical, no text';
const RARITY: Record<string, string> = {
  common: 'plain worn grey iron, simple',
  magic: 'brushed steel with glowing blue inlays',
  rare: 'bright brass with glowing yellow inlays',
  legendary: 'dark bronze with glowing orange fire inlays and engraved corners',
  unique: 'antique gold with intricate filigree corners',
  mythic: 'black metal with glowing red veins and spiked ornate corners',
};
const frames: ArtSpec[] = Object.entries(RARITY).map(([id, what]) => ({ key: `frames/${id}`, kind: 'frame', prompt: `${FRAME}, ${what}`, w: SQ, h: SQ }));

// ---- 9. Ground decals ------------------------------------------------------------------------------

const DECAL = 'seen from directly above, flat top-down view, a single ground decal, isolated on a perfectly flat solid';
const decal = (key: string, what: string, chroma: 'green' | 'magenta' = 'green', keep?: number): ArtSpec => ({
  key: `decals/${key}`,
  kind: 'decal',
  keep,
  prompt: `${what}, ${DECAL} ${chroma === 'green' ? 'pure bright green (#00ff00)' : 'pure bright magenta (#ff00ff)'} background, nothing else, no text, no shadow on the background`,
  w: SQ,
  h: SQ,
  chroma,
});
const decals: ArtSpec[] = [
  decal('oil_stain', 'a dark glossy oil stain puddle with rainbow sheen'),
  decal('blood_stain', 'a dried dark red blood splatter'),
  decal('scorch_mark', 'a black burnt scorch mark with ash'),
  decal('puddle', 'a shallow dark rain-water puddle reflecting the sky'),
  decal('rubble', 'a scattered pile of broken concrete rubble and small rocks', 'magenta', 0.82),
  decal('hazard_stripes', 'a worn painted yellow and black hazard stripe floor marking, rectangular'),
  decal('manhole', 'a rusty round manhole cover set in the ground', 'magenta', 0.79),
  decal('floor_grate', 'a square rusted metal drainage grate set in the ground', 'magenta', 0.78),
  decal('tire_tracks', 'muddy heavy vehicle tyre tracks crossing, straight'),
  decal('footprints', 'a trail of muddy boot footprints'),
  decal('moss_patch', 'a patch of glowing green fungal moss', 'magenta'),
  decal('lumen_growth', 'a creeping patch of glowing green crystal fungus growth', 'magenta'),
  decal('bones', 'scattered old bones and a cracked helmet', 'magenta'),
  decal('crystal_shards', 'scattered glowing cyan crystal shards', 'magenta', 0.78),
];

// ---- 11. More effect sprites (added to the particle atlas) -------------------------------------------

const ISO = 'single isolated element centered on a pure solid black background, nothing else in the frame, wide black margin on every side, game visual effect sprite, high detail, no text, no border';
const TOP = 'seen from directly above, flat top-down view, circular, centered';
const vfx = (key: string, what: string, mask = false): ArtSpec => ({ key: `vfx/${key}`, kind: 'vfx', prompt: `${what}, ${ISO}`, w: SQ, h: SQ, mask });
const vfxExtra: ArtSpec[] = [
  vfx('lumen_beam', 'a tall vertical column of bright white-cyan light beam from the sky, soft edges'),
  vfx('lightning_0', 'a jagged vertical lightning bolt striking downward, white core with violet-blue glow'),
  vfx('lightning_1', 'a branching vertical lightning strike, white core with electric blue glow'),
  vfx('magic_circle_red', `an ornate glowing red occult sci-fi magic circle with runes and rings, ${TOP}`),
  vfx('magic_circle_green', `an ornate glowing green bio-organic magic circle with vine patterns and rings, ${TOP}`),
  vfx('magic_circle_cyan', `an ornate glowing cyan alien tech circle with geometric segments, ${TOP}`),
  vfx('void_rift', 'a dark purple swirling void rift portal with a glowing edge'),
  vfx('blood_burst', 'a burst of dark red blood droplets splashing outward'),
  vfx('ichor_burst', 'a burst of glowing green ichor droplets splashing outward'),
  vfx('energy_ring', `a thin glowing white-blue energy shockwave ring, ${TOP}`),
  vfx('rock_debris', 'a cluster of flying broken rock chunks and pebbles, grey and brown', true),
  vfx('muzzle_flash', 'a sharp bright four-pointed gun muzzle flash star, yellow-white'),
  vfx('ash_flake', 'a few tiny thin papery grey-white ash flakes drifting, curled, faint glowing orange edges, not rocks'),
  vfx('electric_ball', 'a crackling ball of electricity with small arcs, blue-white'),
  vfx('green_flame', 'a single licking flame of ghostly green fire, vertical, wispy, no face, no eyes, no mouth'),
  vfx('shockwave_dust', 'a wide ring-shaped burst of dust and debris seen from the side, low and wide', true),
];

// ---- 10, 12. Paintings -------------------------------------------------------------------------------

const PAINT = 'cinematic concept art matte painting, wide shot, dark gritty sci-fi, alien colony planet, moody volumetric light, no text, no lettering, no signature, no watermark, no logo, no people in the foreground';
const wide = (key: string, what: string): ArtSpec => ({ key, kind: 'wide', prompt: `${what}, ${PAINT}`, w: WIDE[0], h: WIDE[1] });
const paintings: ArtSpec[] = [
  wide('regions/cinder_flats', 'an ash-covered crash site plain at night, a crashed colony ship smouldering, glowing green alien fungus, ash falling'),
  wide('regions/refinery_district', 'a massive industrial refinery district, smokestacks, rivers of molten metal, a cathedral-like smelter, orange glow'),
  wide('regions/hydroponic_vaults', 'overgrown hydroponic vaults, huge cracked glass domes swallowed by a giant glowing mother tree and fungus'),
  wide('regions/deep_mines', 'deep underground mines, mine cart rails disappearing into darkness, glowing cyan crystals, a vast cavern with a giant drill'),
  wide('menu/title', 'a lone armoured figure on a ridge overlooking a burning ruined colony city under a huge ringed gas giant, ash in the air'),
  wide('menu/bastion', 'a towering figure in a bulky battered industrial exosuit with hydraulic pistons, a huge sledgehammer resting on the shoulder, glowing orange visor, embers drifting, heroic pose'),
  wide('menu/spectre', 'a stealthy sniper in a dark cloak and a glowing visor crouched on a ruined rooftop with twin pistols, hero shot'),
  wide('menu/xenomant', 'a bio-mancer in organic armour with glowing green fungal tendrils and a scalpel blade, spores swirling around, hero shot'),
];

// ---- 1. Mine rock ground texture ------------------------------------------------------------------------

const texture: ArtSpec = {
  key: 'textures/mine_rock',
  kind: 'texture',
  prompt:
    'seamless tileable texture, the floor of an old mining tunnel seen from directly above, rough dark-grey bedrock worn flat by boots and carts, scattered gravel and rock chips, dusty patches, faint rust-brown ore streaks, a few tiny glinting mineral flecks, cool grey (#4e4c4a to #6e6a66), even and calm, no strong patterns, flat lighting, no perspective',
  w: SQ,
  h: SQ,
};

// ---- 13. Region maps (edit from a drawing of the layout) ------------------------------------------------

const MAP = 'repaint this exact layout drawing as a painted top-down terrain map, keep the exact composition: every line, road, cavern and circle stays exactly where it is with the same size and shape, the whole image is the map from edge to edge, no frame, no border, no plate, no paper edge, roads as worn paths, subtle terrain texture between them, muted colours, no text, no labels, no compass';
const maps: ArtSpec[] = [
  { key: 'maps/cinder_flats', kind: 'map', zone: 'zone.cinder_flats', prompt: `${MAP}, ash grey plains with scattered green fungus`, w: SQ, h: SQ },
  { key: 'maps/refinery_district', kind: 'map', zone: 'zone.refinery_district', prompt: `${MAP}, rusty industrial ground with orange molten channels`, w: SQ, h: SQ },
  { key: 'maps/hydroponic_vaults', kind: 'map', zone: 'zone.hydroponic_vaults', prompt: `${MAP}, overgrown dark green ground with glass domes`, w: SQ, h: SQ },
  { key: 'maps/deep_mines', kind: 'map', zone: 'zone.deep_mines', prompt: `${MAP}, black rock with tunnels and caverns as lit passages, cyan crystal glints`, w: SQ, h: SQ },
];

export const ART: ArtSpec[] = [texture, ...bosses, ...items, ...uniques, ...aspects, ...stats, ...decals, ...vfxExtra, ...paintings, ...maps, ...frames];

/** The extra effect sprites, in the shape the atlas packer expects. */
export const VFX_EXTRA: SpriteSpec[] = vfxExtra.map((v) => ({ key: v.key.replace('vfx/', ''), prompt: v.prompt, mask: v.mask }));
