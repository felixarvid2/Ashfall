import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/core/events';
import { FEEL, critHitstop, frameFeel, hitTakenFeel } from '../src/systems/impact';
import { RECOIL_SECONDS, RECOIL_SECONDS_CRIT, recoilCurve } from '../src/render/hitRecoil';
import { LEVEL_BURST_LIFE, MOVE_MARKER_LIFE, SHIMMER, moveMarkerRing, nearestWithin } from '../src/render/vfx';
import { CameraRig, CROWD_ZOOM, LOOK_AHEAD_MAX, crowdZoom, lookAheadOffset, pulseZoomCurve } from '../src/render/camera';
import { GUIDE_FULL, GUIDE_NEAR, guideDots, guideOpacity } from '../src/render/navOverlay';
import { DESKTOP_ORDER, HintScript, signalsFrom, type HintObservation } from '../src/ui/onboarding';
import { TIP_COUNT, blackHoldMs, guideGoal, tipIndex } from '../src/ui/feelUi';
import { DECAL_OPACITY } from '../src/render/decals';
import en from '../src/data/lang/en.json';

const dmg = (over: Partial<Extract<GameEvent, { type: 'damage' }>> = {}): GameEvent => ({
  type: 'damage', target: 2, x: 0, y: 0, z: 0, amount: 10, absorbed: 0, crit: false, damageType: 'physical', toPlayer: false, dot: false, ...over,
});
type DeathEvent = Extract<GameEvent, { type: 'death' }>;
type DeathOver = Partial<Omit<DeathEvent, 'family'>> & { family?: DeathEvent['family'] | undefined };
/** A death event; passing `family: undefined` leaves the family off (summons and props). */
const death = (target = 2, over: DeathOver = {}): GameEvent => {
  const { family, ...rest } = over;
  const fam = 'family' in over ? family : 'infected';
  return { type: 'death', target, x: 0, z: 0, isPlayer: false, ...rest, ...(fam && { family: fam }) };
};

describe('hit feel (F001, F009)', () => {
  it('maps the share of life lost to shake trauma and a short freeze', () => {
    expect(hitTakenFeel(1, 100)).toEqual({ trauma: 0, hitstopMs: 0 });
    expect(hitTakenFeel(10, 100).trauma).toBeCloseTo(0.08, 6);
    expect(hitTakenFeel(10, 100).hitstopMs).toBe(0);
    // Capped at 0.35, and a hit above 15 % of max life freezes for 40 ms.
    expect(hitTakenFeel(60, 100)).toEqual({ trauma: FEEL.hitTakenMaxTrauma, hitstopMs: 40 });
    expect(hitTakenFeel(0, 100)).toEqual({ trauma: 0, hitstopMs: 0 });
    expect(hitTakenFeel(10, 0)).toEqual({ trauma: 0, hitstopMs: 0 });
  });

  it('a crit freezes longer than a normal hit and shakes a little', () => {
    const stop: GameEvent = { type: 'hitstop', ms: 15 };
    const normal = frameFeel([stop, dmg()], 100);
    const crit = frameFeel([stop, dmg({ crit: true })], 100);
    expect(normal.hitstopMs).toBe(15);
    expect(crit.hitstopMs).toBeGreaterThan(normal.hitstopMs);
    expect(crit.hitstopMs).toBeCloseTo(32, 6);
    expect(crit.trauma).toBeCloseTo(FEEL.critShake, 6);
    expect(normal.trauma).toBe(0);
  });

  it('caps the crit freeze at 120 ms', () => {
    expect(critHitstop(100)).toBe(120);
    expect(critHitstop(0)).toBeCloseTo(32, 6);
  });

  it('the killing blow adds 20 ms; DoT ticks and absorbed-only hits do nothing', () => {
    expect(frameFeel([{ type: 'hitstop', ms: 15 }, dmg(), death()], 100).hitstopMs).toBe(35);
    expect(frameFeel([dmg({ dot: true, crit: true })], 100).hitstopMs).toBe(0);
    expect(frameFeel([dmg({ crit: true, amount: 0 })], 100).trauma).toBe(0);
  });

  it('an elite or boss kill shakes at least 0.35 and starts a slow-motion beat; a plain kill does not', () => {
    const weight = (e: number) => (e === 7 ? ('boss' as const) : e === 8 ? ('elite' as const) : null);
    expect(frameFeel([death(7)], 100, weight).trauma).toBeGreaterThanOrEqual(0.35);
    expect(frameFeel([death(7)], 100, weight).slowmoS).toBeCloseTo(0.25, 6);
    expect(frameFeel([death(8)], 100, weight).slowmoS).toBeGreaterThan(0);
    expect(frameFeel([death(2)], 100, weight)).toMatchObject({ trauma: 0, slowmoS: 0 });
    // The hero's own death and non-enemy deaths are not kills.
    expect(frameFeel([death(7, { isPlayer: true })], 100, weight).slowmoS).toBe(0);
    expect(frameFeel([death(7, { family: undefined })], 100, weight).slowmoS).toBe(0);
  });

  it('a hit taken adds trauma in the frame, order-independent of the crit', () => {
    const a = frameFeel([dmg({ toPlayer: true, amount: 30 }), dmg({ crit: true })], 100);
    const b = frameFeel([dmg({ crit: true }), dmg({ toPlayer: true, amount: 30 })], 100);
    expect(a).toEqual(b);
    expect(a.trauma).toBeCloseTo(0.24 + FEEL.critShake, 6);
    expect(a.hitstopMs).toBe(40);
  });
});

describe('hit recoil (F008)', () => {
  it('squashes to 0.94 and back, and ends', () => {
    expect(recoilCurve(0, false)).toMatchObject({ y: 1, push: 0 });
    const mid = recoilCurve(RECOIL_SECONDS / 2, false)!;
    expect(mid.y).toBeCloseTo(0.94, 6);
    expect(mid.xz).toBeGreaterThan(1);
    expect(mid.push).toBeCloseTo(0.15, 6);
    expect(recoilCurve(RECOIL_SECONDS, false)).toBeNull();
    expect(recoilCurve(-0.1, false)).toBeNull();
  });

  it('a crit squashes and pushes harder, for a little longer', () => {
    const n = recoilCurve(RECOIL_SECONDS / 2, false)!;
    const c = recoilCurve(RECOIL_SECONDS_CRIT / 2, true)!;
    expect(c.y).toBeLessThan(n.y);
    expect(c.push).toBeGreaterThan(n.push);
    expect(recoilCurve(RECOIL_SECONDS + 0.01, true)).not.toBeNull();
  });
});

describe('ground-click marker (F005)', () => {
  it('two rings, the second a tenth of a second behind; both gone by the marker life', () => {
    expect(moveMarkerRing(0, 0)).not.toBeNull();
    expect(moveMarkerRing(0.05, 1)).toBeNull();
    expect(moveMarkerRing(0.12, 1)).not.toBeNull();
    expect(moveMarkerRing(0.4, 0)).toBeNull();
    expect(moveMarkerRing(MOVE_MARKER_LIFE, 1)).toBeNull();
    const early = moveMarkerRing(0.05, 0)!;
    const late = moveMarkerRing(0.35, 0)!;
    expect(late.radius).toBeGreaterThan(early.radius);
    expect(late.opacity).toBeLessThan(early.opacity);
  });
});

describe('level-up and shimmer (F017, F019)', () => {
  it('the burst lasts 0.8 s', () => expect(LEVEL_BURST_LIFE).toBe(0.8));

  it('shimmers the nearest six within 25 m, nearest first', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 4, z: 0 }));
    expect(nearestWithin(pts, 0, 0, 25, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(nearestWithin(pts, 0, 0, 10, 6)).toEqual([0, 1, 2]);
    expect(nearestWithin(pts, 36, 0, 25, 2)).toEqual([9, 8]);
    expect(SHIMMER.chest).toBeDefined();
    expect(SHIMMER.teleporter).toBeDefined();
  });
});

describe('camera framing (F018, F021)', () => {
  it('look-ahead is zero without a cursor offset and never exceeds the maximum', () => {
    expect(lookAheadOffset(0, 0)).toEqual({ x: 0, z: 0 });
    for (const d of [1, 6, 12, 40, 400]) {
      const o = lookAheadOffset(d, 0);
      expect(Math.hypot(o.x, o.z)).toBeLessThanOrEqual(LOOK_AHEAD_MAX + 1e-9);
    }
    expect(lookAheadOffset(100, 0).x).toBeCloseTo(LOOK_AHEAD_MAX, 6);
    const o = lookAheadOffset(3, 4);
    expect(o.x / o.z).toBeCloseTo(3 / 4, 6);
  });

  it('pulls back 10 % from five hostiles', () => {
    expect(crowdZoom(4)).toBe(1);
    expect(crowdZoom(5)).toBe(CROWD_ZOOM);
  });

  it('the push-in eases to the factor, holds, and is exactly 1 again at the end', () => {
    expect(pulseZoomCurve(0, 1.2, 0.8)).toBe(1);
    expect(pulseZoomCurve(0.6, 1.2, 0.8)).toBeCloseTo(0.8, 6);
    expect(pulseZoomCurve(1.2, 1.2, 0.8)).toBe(1);
    expect(pulseZoomCurve(2, 1.2, 0.8)).toBe(1);
    expect(pulseZoomCurve(0.15, 1.2, 0.8)).toBeLessThan(1);
    expect(pulseZoomCurve(0.15, 1.2, 0.8)).toBeGreaterThan(0.8);
  });

  it('a boss push-in makes the camera sit closer for 1.2 s and then restores it', () => {
    const rig = new CameraRig(16 / 9);
    rig.snapTo(0, 0, 0);
    const base = rig.effectiveDistance;
    rig.pulseZoom(1.2, 0.8);
    for (let i = 0; i < 36; i++) rig.update(0, 0, 0, 1 / 60);
    expect(rig.effectiveDistance).toBeLessThan(base * 0.9);
    for (let i = 0; i < 60; i++) rig.update(0, 0, 0, 1 / 60);
    expect(rig.effectiveDistance).toBeCloseTo(base, 6);
  });

  it('look-ahead moves the focus toward the aim and settles back', () => {
    const rig = new CameraRig(16 / 9);
    rig.snapTo(0, 0, 0);
    rig.setLookAhead(1.5, 0);
    for (let i = 0; i < 240; i++) rig.update(0, 0, 0, 1 / 60);
    expect(rig.focusPoint.x).toBeCloseTo(1.5, 1);
    rig.setLookAhead(0, 0);
    for (let i = 0; i < 400; i++) rig.update(0, 0, 0, 1 / 60);
    expect(rig.focusPoint.x).toBeCloseTo(0, 2);
  });

  it('a crowd pulls the camera back and releases it', () => {
    const rig = new CameraRig(16 / 9);
    rig.snapTo(0, 0, 0);
    const base = rig.effectiveDistance;
    rig.setCrowd(6);
    for (let i = 0; i < 600; i++) rig.update(0, 0, 0, 1 / 60);
    expect(rig.effectiveDistance).toBeCloseTo(base * CROWD_ZOOM, 2);
    rig.setCrowd(0);
    for (let i = 0; i < 900; i++) rig.update(0, 0, 0, 1 / 60);
    expect(rig.effectiveDistance).toBeCloseTo(base, 2);
  });
});

describe('guide to the first objective (F007)', () => {
  it('fades inside 15 m and is full from 25 m', () => {
    expect(guideOpacity(GUIDE_NEAR)).toBe(0);
    expect(guideOpacity(5)).toBe(0);
    expect(guideOpacity(20)).toBeCloseTo(0.5, 6);
    expect(guideOpacity(GUIDE_FULL)).toBe(1);
    expect(guideOpacity(500)).toBe(1);
  });

  it('dots run from the hero toward the goal and none lies past it', () => {
    const dots = guideDots(0, 0, 0, 30, 0);
    expect(dots.length).toBeGreaterThan(5);
    expect(dots.every((d) => Math.abs(d.x) < 1e-9 && d.z > 0 && d.z < 30)).toBe(true);
    expect(guideDots(0, 0, 0, 1.5, 0)).toEqual([]);
    expect(guideDots(0, 0, 0, 0, 0)).toEqual([]);
    // They march: a later time shifts every dot forward.
    expect(guideDots(0, 0, 0, 100, 0.4)[0]!.z).toBeGreaterThan(guideDots(0, 0, 0, 100, 0)[0]!.z);
  });

  it('only the tracked first quest has a goal, and it is the nearest marker', () => {
    const markers = [{ quest: 'mq.wake_up', x: 100, z: 0 }, { quest: 'mq.wake_up', x: 30, z: 0 }, { quest: 'sq.other', x: 5, z: 0 }];
    expect(guideGoal('mq.wake_up', markers, 0, 0)).toEqual({ x: 30, z: 0 });
    expect(guideGoal('sq.other', markers, 0, 0)).toBeNull();
    expect(guideGoal(null, markers, 0, 0)).toBeNull();
    expect(guideGoal('mq.wake_up', [], 0, 0)).toBeNull();
  });
});

describe('zone card (F013)', () => {
  it('cycles through the tips and wraps', () => {
    expect(tipIndex(0, 3)).toBe(3);
    expect(tipIndex(TIP_COUNT, 3)).toBe(3);
    expect(tipIndex(-1, 0)).toBe(TIP_COUNT - 1);
  });

  it('has exactly TIP_COUNT tip strings', () => {
    expect(Array.isArray(en.feel.tips)).toBe(true);
    expect(en.feel.tips).toHaveLength(TIP_COUNT);
    expect(en.feel.tips.every((s) => typeof s === 'string' && s.length > 10)).toBe(true);
  });

  it('keeps the screen black for the minimum, then stops waiting', () => {
    expect(blackHoldMs(100, 900)).toBe(800);
    expect(blackHoldMs(900, 900)).toBe(0);
    expect(blackHoldMs(5000, 900)).toBe(0);
  });
});

describe('ambient decals (F022)', () => {
  it('are a little see-through so telegraphs stay louder', () => {
    expect(DECAL_OPACITY).toBeLessThan(1);
    expect(DECAL_OPACITY).toBeGreaterThan(0.5);
  });
});

describe('desktop coach marks (F006, F025, F004)', () => {
  const obs = (over: Partial<HintObservation> = {}): HintObservation => ({
    life: { current: 100, max: 100 }, slots: [{ cooldown: 0 }], dodge: { cooldown: 0 }, potion: { charges: 3 }, xp: { skillPoints: 0 }, dead: false, ...over,
  });

  it('starts with the click tip, then the attack tip, and each is done once', () => {
    const s = new HintScript();
    expect(s.next()).toBe('click');
    expect(s.signal('clicked')).toBe(true);
    expect(s.next()).toBe('strike');
    expect(s.signal('attacked')).toBe(true);
    expect(s.next()).toBeNull();
    expect(s.signal('attacked')).toBe(false);
  });

  it('event tips win over the basics, in the documented order', () => {
    const s = new HintScript();
    s.signal('telegraph');
    s.signal('lootDropped');
    s.signal('lowLife');
    s.signal('skillPoint');
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const n = s.next();
      if (!n) break;
      seen.push(n);
      s.signal(({ skill: 'skillSpent', potion: 'potionUsed', dodge: 'dodged', loot: 'pickedUp', bag: 'bagOpened', click: 'clicked', strike: 'attacked' } as const)[n]);
    }
    expect(seen).toEqual(['skill', 'potion', 'dodge', 'loot', 'bag', 'click', 'strike']);
    expect(DESKTOP_ORDER.indexOf('skill')).toBeLessThan(DESKTOP_ORDER.indexOf('click'));
  });

  it('picking up the first item starts the bag tip, and opening a panel only ends a bag tip that is waiting', () => {
    const s = new HintScript(['click', 'strike']);
    s.signal('bagOpened');
    expect(s.done.has('bag')).toBe(false);
    s.signal('lootDropped');
    s.signal('pickedUp');
    expect(s.next()).toBe('bag');
    s.signal('bagOpened');
    expect(s.next()).toBeNull();
  });

  it('remembers finished tips', () => {
    const s = new HintScript(['click', 'strike', 'potion']);
    expect(s.next()).toBeNull();
    s.signal('lowLife');
    expect(s.next()).toBeNull();
  });

  it('turns HUD changes into signals', () => {
    expect(signalsFrom(null, obs())).toEqual([]);
    expect(signalsFrom(null, obs({ slots: [{ cooldown: 0.4 }] }))).toContain('attacked');
    expect(signalsFrom(null, obs({ dodge: { cooldown: 1 } }))).toContain('dodged');
    expect(signalsFrom(null, obs({ life: { current: 40, max: 100 } }))).toContain('lowLife');
    expect(signalsFrom(null, obs({ life: { current: 40, max: 100 }, potion: { charges: 0 } }))).not.toContain('lowLife');
    expect(signalsFrom(obs(), obs({ potion: { charges: 2 } }))).toContain('potionUsed');
    expect(signalsFrom(null, obs({ xp: { skillPoints: 1 } }))).toContain('skillPoint');
    expect(signalsFrom(obs({ xp: { skillPoints: 1 } }), obs())).toContain('skillSpent');
    expect(signalsFrom(null, obs({ dead: true, slots: [{ cooldown: 1 }] }))).toEqual([]);
  });
});
