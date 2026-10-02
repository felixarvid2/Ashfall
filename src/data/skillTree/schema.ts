/** Skill tree schema (brief §4.1). */
import { z } from 'zod';
import { EffectSchema } from '../effects';

export const BRANCHES = ['basic', 'core', 'defensive', 'tactical', 'mastery', 'ultimate', 'key'] as const;
export const BranchSchema = z.enum(BRANCHES);
export type Branch = z.infer<typeof BranchSchema>;

const Base = { id: z.string(), branch: BranchSchema };

export const TreeNodeSchema = z.discriminatedUnion('type', [
  /** Learning an active skill; ranks raise its damage. */
  z.object({ ...Base, type: z.literal('skill'), skill: z.string(), maxRank: z.number().int().positive().default(5) }),
  /** One-point upgrade; requires the parent skill. */
  z.object({ ...Base, type: z.literal('enhancement'), parent: z.string(), effects: z.array(EffectSchema) }),
  /** Choose one per group; requires the parent enhancement. */
  z.object({ ...Base, type: z.literal('modifier'), parent: z.string(), group: z.string(), effects: z.array(EffectSchema) }),
  /** Passive with ranks; effects are multiplied by the rank. */
  z.object({ ...Base, type: z.literal('passive'), maxRank: z.number().int().positive().default(3), effects: z.array(EffectSchema) }),
  /** Build-defining passive — only one per character. */
  z.object({ ...Base, type: z.literal('keyPassive'), effects: z.array(EffectSchema) }),
]);
export type TreeNode = z.infer<typeof TreeNodeSchema>;

export const SkillTreeSchema = z.object({
  classId: z.string(),
  /** Skill node every new character starts with at rank 1 (free). */
  startingNode: z.string(),
  /** Points that must be spent in the tree before a branch opens. */
  unlockAt: z.record(BranchSchema, z.number().int().nonnegative()),
  /** Gold per character level for a full respec. */
  respecGoldPerLevel: z.number().nonnegative(),
  nodes: z.array(TreeNodeSchema),
});
export type SkillTree = z.infer<typeof SkillTreeSchema>;
