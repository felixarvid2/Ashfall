/** B05, B06: the level 10 to 50 stages and the dummies that hit back (the full tables are `npm run balance:report`). */
import { describe, expect, it } from 'vitest';
import { BUILDS } from '../scripts/sim/builds';
import { PLANS } from '../scripts/sim/plans';
import { playthrough } from '../scripts/sim/playthrough';
import { simulate } from '../scripts/sim/sim';
import { STAGES } from '../scripts/sim/stages';
import { ENEMY_DEFS } from '../src/data/db';
import { EncounterSchema } from '../src/data/schemas';
import { ZONES } from '../src/data/zones';

describe('stages (round 4 B05)', () => {
  it('cover the four later regions, from level 10 to 50, with valid waves of that region\'s own enemies', () => {
    expect(STAGES.map((s) => s.levels)).toEqual([[10, 20], [20, 30], [30, 40], [40, 50]]);
    for (const stage of STAGES) {
      expect(stage.roster.length, stage.id).toBeGreaterThanOrEqual(3);
      for (const id of stage.roster) expect(ENEMY_DEFS.has(id), `${stage.id}: ${id}`).toBe(true);
      expect(() => EncounterSchema.parse(stage.encounter)).not.toThrow();
      const zone = ZONES.find((z) => z.id === `zone.${stage.id}`)!;
      expect(stage.levels).toEqual(zone.levels);
    }
  });

  it('a class plays the Refinery District from level 10 and levels up there, without touching the level 1 to 10 arena', () => {
    const stage = STAGES[0]!;
    const plan = PLANS.find((p) => p.classId === 'bastion')!;
    const r = playthrough(plan, { stage, startLevel: 10, targetLevel: 12, maxMinutes: 8, seed: 'a' });
    expect(r.stage).toBe('refinery_district');
    expect(r.startLevel).toBe(10);
    expect(r.reached).toBeGreaterThanOrEqual(12);
    // Times start after the start level (nothing is recorded for levels it began on).
    expect(r.levelTimes[10]).toBeUndefined();
    expect(r.levelTimes[11]).toBeGreaterThan(5);
    expect(r.levelTimes[12]).toBeGreaterThan(r.levelTimes[11]!);
    // A plain run is unchanged: no stage, level 1.
    const plain = playthrough(plan, { targetLevel: 2, maxMinutes: 2, seed: 'a' });
    expect(plain.stage).toBeUndefined();
    expect(plain.startLevel).toBe(1);
  }, 120_000);
});

describe('dummies that hit back (round 4 B06)', () => {
  const build = BUILDS.find((b) => b.name.includes('L1 starter'))!;

  it('report deaths, time below 30 % life, lowest life and damage taken, and are repeatable', () => {
    const a = simulate(build, 30, 'sim', { fightBack: true });
    const b = simulate(build, 30, 'sim', { fightBack: true });
    expect(a.survival).toBeDefined();
    expect(a.survival).toEqual(b.survival);
    const s = a.survival!;
    expect(s.takenPerSecond).toBeGreaterThan(1);
    expect(s.minLife).toBeGreaterThanOrEqual(0);
    expect(s.minLife).toBeLessThan(1);
    expect(s.below30).toBeGreaterThanOrEqual(0);
    expect(s.below30).toBeLessThanOrEqual(1);
    expect(Number.isInteger(s.deaths)).toBe(true);
    // The dummies still absorb the damage that is measured.
    expect(a.dps).toBeGreaterThan(5);
  });

  it('leave the DPS runs as they were: no survival block and a character that cannot die', () => {
    const r = simulate(build, 20);
    expect(r.survival).toBeUndefined();
    expect(simulate(build, 20).dps).toBe(r.dps);
  });

  it('a tougher pack hurts more than a single attacker', () => {
    const one = simulate(build, 20, 'sim', { fightBack: { count: 1 } }).survival!;
    const five = simulate(build, 20, 'sim', { fightBack: { count: 5 } }).survival!;
    expect(five.takenPerSecond).toBeGreaterThan(one.takenPerSecond);
  });
});
