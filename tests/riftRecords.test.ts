/** D08 (local rift records per class) and D11 (the daily rift) on the rift rules. */
import { describe, expect, it } from 'vitest';
import { Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { RIFT_ID } from '../src/data/endgame/rifts';
import { ensureEndgame } from '../src/systems/endgame/matrix';
import {
  DAILY_KEEP,
  DAILY_LEVELS,
  completeRift,
  createRift,
  dailyKey,
  dailyRecord,
  dailyRiftLevel,
  dailyRiftSeed,
  recordDailyTime,
  recordRiftTime,
  riftOpenLevel,
  riftRecord,
} from '../src/systems/endgame/rifts';
import { buildInstance, riftHost } from '../src/world/instance';
import { spawnPlayer } from '../src/world/spawn';
import { makeCtx } from './helpers';

function inRift(level: number, classId = 'bastion', daily: string | null = null) {
  const world = new World();
  const account = emptyAccount();
  account.endgame.tierUnlocked = 2;
  const ctx = makeCtx({ worldHalfSize: 2600, account, zoneLevels: [1, 10] });
  ensureEndgame(ctx);
  const player = spawnPlayer(world, classId, 0, 0);
  const rt = buildInstance(world, ctx, RIFT_ID, 'riftObelisk', daily ? dailyRiftSeed(daily) : 's1', 50, { x: 10, z: 10 }, level);
  rt.rift!.daily = daily;
  ctx.instance = rt;
  const tr = world.req(player, Transform);
  tr.x = rt.start.x;
  tr.z = rt.start.z;
  return { world, ctx, rt, rift: rt.rift!, account };
}
const clear = (g: ReturnType<typeof inRift>, seconds: number) => {
  g.rift.elapsed = seconds;
  return completeRift(g.world, g.ctx, riftHost(g.rt), g.rift, { x: g.rt.start.x, z: g.rt.start.z });
};

describe('D08 rift records per class', () => {
  it('keeps the best time per class and level, and only a faster one replaces it', () => {
    const a = emptyAccount();
    expect(riftRecord(a, 'bastion', 5)).toBe(0);
    expect(recordRiftTime(a, 'bastion', 5, 300)).toEqual({ previous: 0, improved: true });
    expect(recordRiftTime(a, 'bastion', 5, 320)).toEqual({ previous: 300, improved: false });
    expect(recordRiftTime(a, 'bastion', 5, 280.04)).toEqual({ previous: 300, improved: true });
    expect(riftRecord(a, 'bastion', 5)).toBe(280);
    expect(riftRecord(a, 'spectre', 5)).toBe(0);
    expect(riftRecord(a, 'bastion', 6)).toBe(0);
  });

  it('a clear stores the time for the character class and reports it in the result', () => {
    const g = inRift(7, 'spectre');
    const res = clear(g, 245.3);
    expect(res.record).toEqual({ previous: 0, improved: true });
    expect(riftRecord(g.account, 'spectre', 7)).toBe(245.3);
    expect(riftRecord(g.account, 'bastion', 7)).toBe(0);
    expect(res.daily).toBe(false);
  });
});

describe('D11 daily rift', () => {
  it('the date gives the same level and seed all day, within the band and never above the open level', () => {
    expect(dailyKey(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(dailyRiftSeed('2026-10-05')).toBe(dailyRiftSeed('2026-10-05'));
    expect(dailyRiftSeed('2026-10-05')).not.toBe(dailyRiftSeed('2026-10-06'));
    const levels = new Set<number>();
    for (let d = 1; d <= 28; d++) {
      const lv = dailyRiftLevel(`2026-11-${String(d).padStart(2, '0')}`, 100);
      expect(lv).toBeGreaterThanOrEqual(DAILY_LEVELS.min);
      expect(lv).toBeLessThanOrEqual(DAILY_LEVELS.max);
      levels.add(lv);
    }
    expect(levels.size).toBeGreaterThan(5);
    expect(dailyRiftLevel('2026-11-03', 3)).toBeLessThanOrEqual(3);
    expect(dailyRiftLevel('2026-11-03', 1)).toBe(1);
  });

  it('has its own record and keeps only the last days', () => {
    const a = emptyAccount();
    expect(recordDailyTime(a, '2026-10-01', 400)).toEqual({ previous: 0, improved: true });
    expect(recordDailyTime(a, '2026-10-01', 450).improved).toBe(false);
    expect(recordDailyTime(a, '2026-10-01', 380).improved).toBe(true);
    expect(dailyRecord(a, '2026-10-01')).toEqual({ today: 380, best: 380 });
    expect(dailyRecord(a, '2026-10-02')).toEqual({ today: 0, best: 380 });
    for (let d = 0; d < DAILY_KEEP + 5; d++) recordDailyTime(a, `2027-01-${String(d + 1).padStart(2, '0')}`, 500);
    expect(Object.keys(a.dailyRifts)).toHaveLength(DAILY_KEEP);
    expect(a.dailyRifts['2026-10-01']).toBeUndefined();
  });

  it('a daily clear pays like a clear but leaves the open levels, the best level and the class records alone', () => {
    const g = inRift(12, 'bastion', '2026-10-05');
    expect(createRift(3, '2026-10-05').daily).toBe('2026-10-05');
    const openBefore = riftOpenLevel(g.ctx);
    const res = clear(g, 100);
    expect(res.daily).toBe(true);
    expect(res.fast).toBe(false);
    expect(g.rift.attempts).toBeGreaterThan(0);
    expect(g.account.endgame.riftBest).toBe(0);
    expect(g.account.endgame.riftTime).toBe(0);
    expect(riftOpenLevel(g.ctx)).toBe(openBefore);
    expect(g.account.riftRecords).toEqual({});
    expect(g.account.dailyRifts['2026-10-05']).toBe(100);
    expect(g.ctx.events.peek().some((e) => e.type === 'interact' && e.kind === 'riftCleared' && e.detail === 'daily')).toBe(true);
  });
});
