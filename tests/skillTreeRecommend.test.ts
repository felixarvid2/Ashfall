import { describe, expect, it } from 'vitest';
import { RECOMMENDED_FIRST, recommendedNode } from '../src/ui/skillTreePanel';
import { SKILL_TREES } from '../src/data/db';
import { learn, newTreeState } from '../src/systems/skillTree';

describe('recommended skill-tree node (F004)', () => {
  for (const [classId, nodeId] of Object.entries(RECOMMENDED_FIRST)) {
    it(`${classId}: rings an active skill that is learnable at once, until the first point is spent`, () => {
      const tree = SKILL_TREES.get(classId)!;
      const node = tree.nodes.find((n) => n.id === nodeId);
      expect(node?.type).toBe('skill');
      const state = newTreeState(tree);
      expect(recommendedNode(tree, state, 1)).toBe(nodeId);
      // No point to spend: nothing to recommend yet.
      expect(recommendedNode(tree, state, 0)).toBeNull();
      learn(tree, state, nodeId, 1);
      expect(recommendedNode(tree, state, 1)).toBeNull();
    });
  }
});
