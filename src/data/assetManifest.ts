/**
 * Schema for assets/manifest.json — the single list of every 3D asset.
 *
 * The Meshy pipeline (scripts/meshy, Phase 2) reads and updates it; the game
 * reads it to know which model to load for an asset id, falling back to the
 * placeholder shape until the asset reaches status "optimized".
 */
import { z } from 'zod';

export const AssetStatusSchema = z.enum(['planned', 'preview', 'refined', 'approved', 'optimized']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

export const PlaceholderSchema = z.object({
  shape: z.enum(['capsule', 'box', 'cylinder', 'sphere']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Width, height, depth in metres. Capsule/cylinder use x as diameter. */
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  /** Optional emissive colour (lights, glowing growth). */
  emissive: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  emissiveIntensity: z.number().nonnegative().optional(),
  /** Adds a small visor so facing direction is visible. */
  showFacing: z.boolean().optional(),
  facingColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const AssetEntrySchema = z.object({
  id: z.string().regex(/^[a-z]+(\.[a-z0-9_]+)+$/),
  category: z.enum(['character', 'enemy', 'prop', 'environment', 'icon']),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  targetPolycount: z.number().int().positive(),
  status: AssetStatusSchema,
  /** Meshy task ids, recorded so nothing is lost if the pipeline crashes. */
  meshy: z
    .object({
      previewTaskId: z.string().optional(),
      refineTaskId: z.string().optional(),
      rigTaskId: z.string().optional(),
    })
    .default({}),
  /** Path under public/assets once optimized, e.g. "characters/bastion.glb". */
  file: z.string().optional(),
  placeholder: PlaceholderSchema,
});

export const AssetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.array(AssetEntrySchema),
});

export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
