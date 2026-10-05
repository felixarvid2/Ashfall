/**
 * The effect sprites generated with FLUX.2 Turbo (fal.ai) for the particle system: what each one is
 * and the prompt that makes it. Every sprite is drawn on pure black; scripts/vfx/pack.ts turns black
 * into transparency and packs them into public/assets/vfx/atlas.webp.
 *
 * `mask: true` sprites are white shapes (smoke, dust, cracks, splats) that the game tints; the rest
 * keep their own colours and are drawn additively (fire, sparks, glows).
 */
export interface SpriteSpec {
  key: string;
  prompt: string;
  mask?: boolean;
}

const ISO =
  'single isolated element centered on a pure solid black background, nothing else in the frame, wide black margin on every side so nothing touches the edges, game visual effect sprite, high detail, no text, no watermark, no border, no frame';
const TOP = 'seen from directly above, flat top-down view, roughly circular, centered';

const v = (base: string, n: number, prompt: (i: number) => string, mask = false): SpriteSpec[] =>
  Array.from({ length: n }, (_, i) => ({ key: `${base}_${i}`, prompt: `${prompt(i)}, ${ISO}`, mask }));

const FLAME_SHAPES = ['tall and narrow', 'wide and flickering, splitting into two tongues', 'curling to the left', 'short and bushy'];
const SMOKE_SHAPES = ['round billowing', 'wispy stretched', 'lumpy cauliflower', 'thin curling'];
const BLAST_SHAPES = ['spherical', 'ragged and uneven with flying debris', 'mushrooming upward', 'flat and wide'];

export const SPRITES: SpriteSpec[] = [
  // ---- Fire ----
  ...v('flame', 4, (i) => `a single realistic flame tongue, ${FLAME_SHAPES[i]}, white-yellow hot core fading to orange and deep red at the tips, wispy edges, front view`),
  ...v('fire_core', 2, (i) => (i ? 'a cluster of small burning flames' : 'a soft round ball of fire') + ', bright yellow-orange glowing core, front view'),
  ...v('embers', 2, (i) => (i ? 'a spray of bright orange sparks with short motion streaks' : 'scattered tiny glowing orange embers of different sizes') + ', floating'),
  ...v('smoke', 4, (i) => `a soft ${SMOKE_SHAPES[i]} puff of smoke, white and light grey, volumetric`, true),
  ...v('scorch', 2, (i) => `a burnt scorch mark on the ground made only of thin glowing orange ember cracks and spots, ${i ? 'radial splash pattern' : 'branching web pattern'}, ${TOP}`),
  ...v('explosion', 4, (i) => `a ${BLAST_SHAPES[i]} fireball explosion, white-hot center, orange and red flames, front view`),
  ...v('heat_ring', 1, () => `a thin ring of fire expanding outward like a shockwave, orange flames along the ring, empty black center, ${TOP}`),
  // ---- Toxic and spores ----
  ...v('spore_cloud', 3, (i) => `a ${['round', 'drifting stretched', 'lumpy'][i]} cloud of glowing toxic green gas with tiny bright spores inside, volumetric`),
  ...v('bubbles', 2, (i) => (i ? 'falling drips of glowing green acid' : 'a cluster of glowing toxic green bubbles of different sizes')),
  ...v('toxic_splat', 1, () => `a splash of glowing green acid on the ground with droplets around it, ${TOP}`),
  ...v('spores', 1, () => 'many tiny glowing yellow-green spores and pollen specks floating, soft bokeh'),
  // ---- Cold ----
  ...v('frost_burst', 2, (i) => `${i ? 'a sharp radial' : 'a soft round'} burst of icy cyan frost and glittering ice particles, front view`),
  ...v('ice_shard', 2, (i) => (i ? 'a single jagged translucent ice crystal shard, pale cyan' : 'a small cluster of translucent pale cyan ice crystal shards')),
  ...v('steam', 2, (i) => `a soft ${i ? 'rising column' : 'round puff'} of white steam vapor, volumetric`, true),
  ...v('frost_ground', 1, () => `a ring of frost crystals and feathery ice patterns spreading on the ground, pale cyan and white, ${TOP}`),
  // ---- Energy ----
  ...v('arc', 3, (i) => `a ${['jagged', 'forked branching', 'thin crackling'][i]} electric lightning arc running horizontally from left to right, bright white core with electric blue glow`),
  ...v('energy_glow', 2, (i) => (i ? 'a soft orb of bright cyan plasma energy with a white center' : 'a soft round lens-flare glow, white center fading to warm orange')),
  ...v('plasma_bolt', 1, () => 'an elongated glowing energy bolt pointing to the right with a short fading tail, white core, cyan glow'),
  ...v('hit_spark', 2, (i) => (i ? 'a small star-shaped impact flash with thin sharp rays' : 'an impact spark burst, bright white center with sharp yellow spark streaks flying outward')),
  ...v('hex_shield', 1, () => `a circular energy shield made of glowing thin hexagon cells, cyan, transparent, ${TOP}`),
  // ---- Physical ----
  ...v('slash', 2, (i) => `a curved crescent sword slash trail, ${i ? 'thin and sharp' : 'thick and fading'}, bright white sweeping arc, motion blur`),
  ...v('dust', 3, (i) => `a ${['round', 'wide low', 'billowing'][i]} cloud of dust and fine dirt, light grey and white, volumetric`, true),
  ...v('crack', 2, (i) => `${i ? 'radial' : 'branching'} cracks in the ground drawn as thin white lines on black, ${TOP}`, true),
  ...v('splat', 2, (i) => `a ${i ? 'small' : 'large'} splatter of liquid with droplets around it, white on black, ${TOP}`, true),
  // ---- Other ----
  ...v('heal', 2, (i) => (i ? 'many small glowing green and gold sparkles rising' : 'a soft column of gentle green and golden healing light')),
  ...v('rune_mark', 1, () => `a red glowing targeting reticle with thin concentric circles and tick marks, sci-fi, ${TOP}`),
  ...v('rune_trap', 1, () => `a glowing orange circular sci-fi tech glyph with segmented rings, ${TOP}`),
  ...v('blink', 1, () => 'a swirling vortex of violet and cyan energy, spiral, glowing'),
  ...v('wisp', 2, (i) => `a ghostly ${i ? 'green' : 'violet'} wisp of spirit energy, flowing and curling upward, glowing`),
  ...v('warn_ring', 1, () => `a thin glowing red warning ring with small chevrons pointing inward, ${TOP}`),
];
