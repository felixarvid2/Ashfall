/**
 * Skill tree rules (brief §4.1): branch unlocks by points spent, skill ranks, one
 * enhancement per skill, one modifier per group, ranked passives, a single key passive,
 * and full respec for gold.
 */
import { SKILL_TREES } from '../data/db';
import type { Effect } from '../data/effects';
import { resolveEffects } from '../data/effects';
import type { SkillTree, TreeNode } from '../data/skillTree/schema';

export interface TreeState {
  /** Rank per node id (skills/passives 1..max, enhancements/modifiers/key passives 1). */
  ranks: Record<string, number>;
}

export function tree(classId: string): SkillTree {
  const t = SKILL_TREES.get(classId);
  if (!t) throw new Error(`No skill tree for class ${classId}`);
  return t;
}

export function node(t: SkillTree, id: string): TreeNode {
  const n = t.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown tree node ${id}`);
  return n;
}

export function newTreeState(t: SkillTree): TreeState {
  return { ranks: { [t.startingNode]: 1 } };
}

/** All points in the tree, including the free starting rank (used for branch unlocks). */
export function pointsInTree(state: TreeState): number {
  return Object.values(state.ranks).reduce((s, r) => s + r, 0);
}

/** Points the player actually paid for (the starting rank is free). */
export function pointsSpent(t: SkillTree, state: TreeState): number {
  return pointsInTree(state) - (state.ranks[t.startingNode] ? 1 : 0);
}

export function maxRank(n: TreeNode): number {
  return n.type === 'skill' || n.type === 'passive' ? n.maxRank : 1;
}

export function branchUnlocked(t: SkillTree, state: TreeState, branch: TreeNode['branch']): boolean {
  return pointsInTree(state) >= (t.unlockAt[branch] ?? 0);
}

export type LearnCheck = { ok: true } | { ok: false; reason: 'noPoints' | 'locked' | 'maxed' | 'requires' | 'exclusive' };

export function canLearn(t: SkillTree, state: TreeState, id: string, unspent: number): LearnCheck {
  const n = node(t, id);
  if (unspent <= 0) return { ok: false, reason: 'noPoints' };
  if (!branchUnlocked(t, state, n.branch)) return { ok: false, reason: 'locked' };
  if ((state.ranks[id] ?? 0) >= maxRank(n)) return { ok: false, reason: 'maxed' };
  if (n.type === 'enhancement' && !state.ranks[n.parent]) return { ok: false, reason: 'requires' };
  if (n.type === 'modifier') {
    if (!state.ranks[n.parent]) return { ok: false, reason: 'requires' };
    const rival = t.nodes.find((x) => x.type === 'modifier' && x.group === n.group && x.id !== id && state.ranks[x.id]);
    if (rival) return { ok: false, reason: 'exclusive' };
  }
  if (n.type === 'keyPassive' && t.nodes.some((x) => x.type === 'keyPassive' && x.id !== id && state.ranks[x.id])) {
    return { ok: false, reason: 'exclusive' };
  }
  return { ok: true };
}

/** Spend one point. Returns the check result; mutates state on success. */
export function learn(t: SkillTree, state: TreeState, id: string, unspent: number): LearnCheck {
  const check = canLearn(t, state, id, unspent);
  if (check.ok) state.ranks[id] = (state.ranks[id] ?? 0) + 1;
  return check;
}

/** Refund everything except the free starting skill. Returns points refunded. */
export function resetTree(t: SkillTree, state: TreeState): number {
  const refunded = pointsSpent(t, state);
  state.ranks = { [t.startingNode]: 1 };
  return refunded;
}

export function respecCost(t: SkillTree, level: number): number {
  return Math.round(t.respecGoldPerLevel * level);
}

/** Learned active skills with their ranks. */
export function learnedSkills(t: SkillTree, state: TreeState): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of t.nodes) if (n.type === 'skill' && state.ranks[n.id]) out.set(n.skill, state.ranks[n.id]!);
  return out;
}

/** Effects granted by enhancements, modifiers, passives (× rank) and the key passive. */
export function treeEffects(t: SkillTree, state: TreeState): Effect[] {
  const out: Effect[] = [];
  for (const n of t.nodes) {
    const rank = state.ranks[n.id] ?? 0;
    if (!rank || n.type === 'skill') continue;
    out.push(...resolveEffects(n.effects, 0, n.type === 'passive' ? rank : 1));
  }
  return out;
}

// ---- Refund one rank (B032) ---------------------------------------------------------------------

/** Share of the full respec price that taking back a single rank costs. */
export const REFUND_COST_SHARE = 0.2;

export type RefundCheck = { ok: true } | { ok: false; reason: 'none' | 'start' | 'dependent' | 'branch' };

/** Gold for one refunded rank at this level. */
export function refundCost(t: SkillTree, level: number): number {
  return Math.max(1, Math.round(respecCost(t, level) * REFUND_COST_SHARE));
}

/**
 * Can one rank of a node be taken back? Not the free first rank of the starting skill, not the last rank of a node
 * that an enhancement or modifier hangs on, and not when a learned node would fall below its branch's unlock total.
 */
export function canRefund(t: SkillTree, state: TreeState, id: string): RefundCheck {
  const rank = state.ranks[id] ?? 0;
  if (rank <= 0) return { ok: false, reason: 'none' };
  if (id === t.startingNode && rank <= 1) return { ok: false, reason: 'start' };
  if (rank === 1 && t.nodes.some((x) => (x.type === 'enhancement' || x.type === 'modifier') && x.parent === id && (state.ranks[x.id] ?? 0) > 0)) {
    return { ok: false, reason: 'dependent' };
  }
  const total = pointsInTree(state) - 1;
  const stranded = t.nodes.some((x) => {
    const r = x.id === id ? rank - 1 : (state.ranks[x.id] ?? 0);
    return r > 0 && total < (t.unlockAt[x.branch] ?? 0);
  });
  if (stranded) return { ok: false, reason: 'branch' };
  return { ok: true };
}

/** Take one rank back (the caller returns the point and charges the gold). Mutates state on success. */
export function refundRank(t: SkillTree, state: TreeState, id: string): RefundCheck {
  const check = canRefund(t, state, id);
  if (!check.ok) return check;
  const rank = state.ranks[id]! - 1;
  if (rank > 0) state.ranks[id] = rank;
  else delete state.ranks[id];
  return check;
}
