/**
 * Runtime variants (docs/blender.md, docs/decisions.md 2026-10-27): a creature or NPC that gets its own look
 * without a new full GLB. A variant is composed when it is created: the base model (cloned), a material look,
 * and a few small Blender-made parts (category "part", a few KB each) attached to named bones.
 *
 * A variant id is accepted wherever an asset id is: `EnemyDef.assetId`, an NPC's `asset`, a prop. The asset sets
 * (assetSets.ts) list its base and parts, so a zone's byte budget counts both. Variants are not in
 * assets/manifest.json; their pieces are.
 */
import type { Look } from '../render/looks';

export type Vec3 = readonly [number, number, number];

/** The 24 joints every Meshy-rigged model has (characters, the rigged enemies and NPCs). */
export const RIG_JOINTS: readonly string[] = [
  'Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'head_end', 'headfront',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

/** A material look for the cloned base: `tint` multiplies the base colour (the texture stays), the rest replaces. */
export interface VariantMaterialLook {
  tint?: string;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
}

export interface VariantPart {
  /** Manifest id of the part (category "part"). */
  asset: string;
  /**
   * Joint the part follows. Omit to attach to the model root. Rigged models only (see RIG_JOINTS); a name the
   * clone does not have attaches to the root with a console warning.
   */
  bone?: string;
  /**
   * Where the part's origin sits, in metres from the joint (from the model root's origin without `bone`), measured
   * along the MODEL's axes in the bind pose (x = the creature's left, y up, z forward), whatever the bone's own roll.
   */
  position?: Vec3;
  /** Euler XYZ in degrees, in the same model axes. Parts are built growing along +Y. */
  rotation?: Vec3;
  /** Uniform number or per-axis. */
  scale?: number | Vec3;
}

export interface VariantDef {
  /** `variant.<name>`. */
  id: string;
  /** Manifest id of the model that is cloned. */
  base: string;
  /** An existing LOOKS key (src/render/looks.ts) or a tint/emissive/roughness spec. Omit to keep the base's look. */
  look?: Look | VariantMaterialLook;
  parts: readonly VariantPart[];
}

export const VARIANT_PREFIX = 'variant.';

const DEFS: readonly VariantDef[] = [
  {
    // Deep Mines: an infected colonist grown through with Lumen crystal (docs/regions/deep-mines.md).
    id: 'variant.crystal_walker',
    base: 'enemy.infected_colonist',
    look: { tint: '#9fb6cc', emissive: '#1d5f86', emissiveIntensity: 0.35, roughness: 0.75 },
    parts: [
      // The big cluster bursts out of the upper back, leaning up and away from the spine.
      { asset: 'part.crystal_cluster_large', bone: 'Spine02', position: [0, 0.2, -0.13], rotation: [-55, 0, 8] },
      // A smaller one on the left shoulder, tilted outward.
      { asset: 'part.crystal_cluster_small', bone: 'LeftShoulder', position: [0.15, 0.06, -0.02], rotation: [-12, 0, -50] },
      // Shards crowning the skull, swept back.
      { asset: 'part.crystal_shard', bone: 'Head', position: [0.05, 0.17, -0.06], rotation: [-35, 0, -16], scale: 0.95 },
      { asset: 'part.crystal_shard', bone: 'Head', position: [-0.06, 0.16, -0.05], rotation: [-25, 0, 24], scale: 0.7 },
      { asset: 'part.crystal_shard', bone: 'Head', position: [0, 0.19, -0.1], rotation: [-55, 0, 4], scale: 0.55 },
      // One splintering up out of the right forearm (T-pose: the arm runs along -x).
      { asset: 'part.crystal_shard', bone: 'RightForeArm', position: [-0.09, 0.04, 0], rotation: [-8, 0, 12], scale: 1.1 },
    ],
  },
];

export const VARIANTS: ReadonlyMap<string, VariantDef> = new Map(DEFS.map((d) => [d.id, d]));

export function isVariantId(id: string): boolean {
  return VARIANTS.has(id);
}

/**
 * Manifest ids a model id stands for: a variant's base and distinct parts, any other id itself. Every list of
 * "what must be loaded / counted" goes through this (asset sets, byte budgets, validation).
 */
export function assetIdsOf(id: string, variants: ReadonlyMap<string, VariantDef> = VARIANTS): string[] {
  const def = variants.get(id);
  return def ? [...new Set([def.base, ...def.parts.map((p) => p.asset)])] : [id];
}

/** `assetIdsOf` for many ids, without duplicates. */
export function expandAssetIds(ids: Iterable<string>, variants: ReadonlyMap<string, VariantDef> = VARIANTS): string[] {
  const out = new Set<string>();
  for (const id of ids) for (const piece of assetIdsOf(id, variants)) out.add(piece);
  return [...out];
}
