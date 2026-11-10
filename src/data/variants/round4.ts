/** Round 4 variants (D04): the look raised minions wear. */
import type { VariantDef } from '../variants';

export const ROUND4_VARIANTS: readonly VariantDef[] = [
  {
    // What a raised minion looks like on the infected colonist body; the renderer attaches the same crest to any raised corpse.
    id: 'variant.minion_husk',
    base: 'enemy.infected_colonist',
    look: { tint: '#b8e6c4', emissive: '#2f8f55', emissiveIntensity: 0.35 },
    parts: [{ asset: 'part.bone_shards', position: [0, 0, 0], rotation: [0, 0, 0] }],
  },
];
