import { describe, expect, it } from 'vitest';
import { PLANS } from '../scripts/sim/plans';
import { playthrough } from '../scripts/sim/playthrough';

describe('playthrough bot', () => {
  it('every class can level up against real waves', () => {
    for (const classId of ['bastion', 'spectre', 'xenomant']) {
      const plan = PLANS.find((p) => p.classId === classId)!;
      const r = playthrough(plan, { maxMinutes: 4, targetLevel: 3, seed: 'test' });
      expect(r.reached, plan.name).toBeGreaterThanOrEqual(3);
      expect(r.kills).toBeGreaterThan(5);
    }
  }, 60000);
});
