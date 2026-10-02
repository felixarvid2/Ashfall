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

/** Character animation: which Meshy library action plays for which game state. */
export const AnimStateSchema = z.enum(['idle', 'walk', 'run', 'attack', 'attack2', 'cast', 'hit', 'death']);
export type AnimState = z.infer<typeof AnimStateSchema>;

export const RigSpecSchema = z.object({
  type: z.enum(['biped', 'quadruped']).default('biped'),
  heightMeters: z.number().positive(),
  /** Meshy animation library action ids (GET /v1/animations/library), one clip each. */
  actions: z.array(z.object({ state: AnimStateSchema, actionId: z.number().int().nonnegative() })).max(10),
});

export const MeshyStateSchema = z
  .object({
    /** Text-to-3D preview task, or the concept-image task for `source: "image"` assets. */
    previewTaskId: z.string().optional(),
    refineTaskId: z.string().optional(),
    rigTaskId: z.string().optional(),
    animationTaskId: z.string().optional(),
    /** Set when the owner approves the untextured preview; only then is it refined. */
    previewApproved: z.boolean().optional(),
    /** Model actually used (e.g. "meshy-7.1"), recorded from the task. */
    aiModel: z.string().optional(),
    creditsSpent: z.number().nonnegative().optional(),
    lastError: z.string().optional(),
    /** Animation clip name in the final GLB for each game state. */
    clips: z.record(z.string(), z.string()).optional(),
  })
  .default({});

export const AssetEntrySchema = z.object({
  id: z.string().regex(/^[a-z]+(\.[a-z0-9_]+)+$/),
  category: z.enum(['character', 'enemy', 'prop', 'environment', 'icon']),
  prompt: z.string(),
  /**
   * "text": text-to-3D preview → refine. "image": a concept image (text-to-image) is the cheap
   * preview; image-to-3D with textures is the refine step. Use "image" for creatures that
   * text-to-3D keeps turning into plain humans.
   */
  source: z.enum(['text', 'image']).default('text'),
  /** Prompt for the concept image when source is "image". */
  conceptPrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  /** Overrides the shared texture style for the refine step. */
  texturePrompt: z.string().optional(),
  targetPolycount: z.number().int().positive(),
  /** Real-world height after normalisation (metres). Characters: standing height. */
  heightMeters: z.number().positive().optional(),
  /** Apply the T-pose prompt/parameter (characters that will be rigged). */
  pose: z.enum(['t-pose', 'a-pose']).optional(),
  rig: RigSpecSchema.optional(),
  /** Make the loaded model self-illuminated (Lumen crystals): emissive colour × its own texture. */
  glow: z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), intensity: z.number().nonnegative() }).optional(),
  status: AssetStatusSchema,
  meshy: MeshyStateSchema,
  /** Path under public/assets once optimized, e.g. "characters/bastion.glb". */
  file: z.string().optional(),
  /** Lower-detail versions (same folder), highest detail first. */
  lods: z.array(z.string()).optional(),
  /** Filled by the optimizer, shown in the asset viewer. */
  stats: z
    .object({ triangles: z.number().int(), bytes: z.number().int(), textures: z.number().int().optional() })
    .optional(),
  /** Shape shown until the model exists. Required for 3D assets, absent for icons. */
  placeholder: PlaceholderSchema.optional(),
});

export const AssetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.array(AssetEntrySchema),
});

export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
