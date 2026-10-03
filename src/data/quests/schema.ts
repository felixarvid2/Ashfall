/**
 * Quest data (docs/world-and-gameplay.md §11). A quest is a list of steps; the last step is
 * usually "talk to someone". Text lives in the language file under quests.<id>:
 * title, summary, offer (giver's pitch), steps.<n> (tracker line), talk<n> (lines spoken when a
 * talk step completes), choice<n>.{prompt,<option>} and done (closing line).
 */
import { z } from 'zod';
import { RaritySchema } from '../loot/schemas';

const Point = z.tuple([z.number(), z.number()]);

/** A world object spawned while a step is active (relays, canisters, a locket…). */
export const QuestObjectSchema = z.object({
  id: z.string(),
  x: z.number(),
  z: z.number(),
  asset: z.string(),
  scale: z.number().positive().default(1),
});

const StepBase = {
  /** Show this step on the map and minimap (mysteries hide their trail). */
  marker: z.boolean().default(true),
  /** The zone this step happens in, when it differs from the quest's. */
  zone: z.string().optional(),
};

export const QuestStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reach'), x: z.number(), z: z.number(), radius: z.number().positive().default(10), ...StepBase }),
  z.object({ kind: z.literal('talk'), npc: z.string(), ...StepBase }),
  z.object({
    kind: z.literal('kill'),
    count: z.number().int().positive(),
    /** Only this enemy type counts. */
    enemy: z.string().optional(),
    /** Only kills inside this circle count. */
    near: z.object({ x: z.number(), z: z.number(), radius: z.number().positive() }).optional(),
    /** Spawn named targets for this step; only they count. */
    spawn: z
      .object({
        enemy: z.string(),
        x: z.number(),
        z: z.number(),
        /** Language key of the display name. */
        name: z.string(),
        elite: z.enum(['champion', 'rare']).optional(),
        /** Ordinary escorts spawned with it. */
        escorts: z.number().int().nonnegative().default(0),
      })
      .optional(),
    ...StepBase,
  }),
  z.object({
    kind: z.literal('interact'),
    count: z.number().int().positive(),
    /** Specific points of interest (progress counts ones already used, e.g. logs read earlier). */
    ids: z.array(z.string()).optional(),
    /** Any point of interest of this kind. */
    poiKind: z.string().optional(),
    /** Objects spawned for this step. */
    objects: z.array(QuestObjectSchema).default([]),
    ...StepBase,
  }),
  z.object({ kind: z.literal('discover'), teleporter: z.string(), ...StepBase }),
  /** Completed by another system: a dungeon, stronghold, boss or world event (`objective` signal). */
  z.object({ kind: z.literal('objective'), id: z.string(), x: z.number(), z: z.number(), ...StepBase }),
  /** Walk beside a vehicle until it reaches the end of its path; it fails if destroyed. */
  z.object({
    kind: z.literal('escort'),
    path: z.array(Point).min(2),
    asset: z.string(),
    life: z.number().positive(),
    speed: z.number().positive(),
    /** It only moves while the player is this close. */
    leash: z.number().positive().default(14),
    ...StepBase,
  }),
  /** A decision made in conversation; each option has its own reward. */
  z.object({
    kind: z.literal('choice'),
    npc: z.string(),
    options: z.array(z.object({ id: z.string(), gold: z.number().int().default(0), xp: z.number().int().default(0), item: RaritySchema.optional() })).min(2),
    ...StepBase,
  }),
]);
export type QuestStep = z.infer<typeof QuestStepSchema>;

export const QuestDefSchema = z.object({
  id: z.string(),
  kind: z.enum(['main', 'side', 'mystery']),
  /** The region it belongs to (its Restoration points go there; steps happen there unless they say otherwise). */
  zone: z.string().default('zone.cinder_flats'),
  /** NPC who offers it; null = starts automatically (first quest, triggers). */
  giver: z.string().nullable(),
  /** Quests that must be finished first. */
  after: z.array(z.string()).default([]),
  /** Start when the player uses this object (a body, a log, a whistle in the ash). */
  trigger: z.union([z.object({ poi: z.string() }), z.object({ object: QuestObjectSchema })]).optional(),
  /** Recommended level (shown in the log). */
  level: z.number().int().positive(),
  steps: z.array(QuestStepSchema).min(1),
  rewards: z.object({
    xp: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    item: RaritySchema.optional(),
    /** Region Restoration points (§3.2). */
    restoration: z.number().int().nonnegative().default(0),
  }),
});
export type QuestDef = z.infer<typeof QuestDefSchema>;

export const NpcDefSchema = z.object({
  id: z.string(),
  zone: z.string().default('zone.cinder_flats'),
  asset: z.string(),
  x: z.number(),
  z: z.number(),
  facing: z.number().default(0),
  scale: z.number().positive().default(1),
  /** Hub service opened from the conversation. */
  service: z.enum(['vendor', 'blacksmith', 'technician']).optional(),
  /** Spawned only while a quest step needs it (otherwise always present). */
  questOnly: z.boolean().default(false),
});
export type NpcDef = z.infer<typeof NpcDefSchema>;
