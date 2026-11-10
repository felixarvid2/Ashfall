/**
 * Painted art that new content borrows instead of getting its own file (round 4, D05/D06): `artUrl` (src/ui/art.ts)
 * looks a key up here when ART_FILES lacks it. Keeps the build small and needs no image generation.
 */
export const ART_ALIAS: Readonly<Record<string, string>> = {
  'aspects/cleaver': 'aspects/molten_fists',
  'aspects/afterburner': 'aspects/orbital_uplink',
  'aspects/long_arm': 'aspects/demolition',
  'aspects/steady_hand': 'aspects/bullet_storm',
  'aspects/venom_edge': 'aspects/virulent',
  'aspects/miasma': 'aspects/plague',
  'aspects/sacred_flame': 'aspects/radiant',
  'aspects/choir_of_light': 'aspects/litany',
};
