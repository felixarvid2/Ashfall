import { describe, expect, it } from 'vitest';
import { BANNER_GAP, BANNER_QUEUE_MAX, BannerQueue } from '../src/ui/bannerQueue';
import { capStatuses, isExpiring, MAX_STATUS_TILES, statusSlots } from '../src/ui/statusTiles';
import { MAX_TOASTS, pushToast, type ToastRecord } from '../src/ui/toast';
import { activeRow, ROTATE_SECONDS } from '../src/ui/endgameStack';
import { COLLAPSE_AFTER_COMBAT, formatDistance, initialExpanded, TrackerFold } from '../src/ui/questUi';
import { glyphChancePercent, riftTimeCue } from '../src/ui/riftPanel';
import { bossPhaseTicks } from '../src/ui/hud';
import { GLYPH_MAX_LEVEL } from '../src/data/endgame/matrix';

describe('banner queue (H062)', () => {
  it('shows the first banner at once and the second after the first, with a gap', () => {
    const q = new BannerQueue();
    q.push({ text: 'Level 12', seconds: 2 });
    q.push({ text: 'Quest complete', seconds: 2 });
    expect(q.tick(0)).toBe(true);
    expect(q.current?.text).toBe('Level 12');
    expect(q.tick(1.9)).toBe(false);
    expect(q.tick(0.2)).toBe(true);
    expect(q.current).toBeNull();
    expect(q.tick(BANNER_GAP / 2)).toBe(false);
    expect(q.tick(BANNER_GAP)).toBe(true);
    expect(q.current?.text).toBe('Quest complete');
  });

  it('drops a banner that is already showing or waiting, and keeps only the newest few', () => {
    const q = new BannerQueue();
    expect(q.push({ text: 'A', seconds: 1 })).toBe(true);
    q.tick(0);
    expect(q.push({ text: 'A', seconds: 1 })).toBe(false);
    for (let i = 0; i < BANNER_QUEUE_MAX + 3; i++) q.push({ text: `B${i}`, seconds: 1 });
    expect(q.length).toBe(BANNER_QUEUE_MAX);
    expect(q.push({ text: `B${BANNER_QUEUE_MAX + 2}`, seconds: 1 })).toBe(false);
  });
});

describe('toasts (H058)', () => {
  it('merges the same message into a counter and caps the stack', () => {
    const list: ToastRecord[] = [];
    pushToast(list, 'Game saved', 'info');
    const again = pushToast(list, 'Game saved', 'info');
    expect(again.merged).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0]!.count).toBe(2);
    // Same words as an error are a different toast.
    expect(pushToast(list, 'Game saved', 'error').merged).toBe(false);
    pushToast(list, 'two', 'info');
    const r = pushToast(list, 'three', 'info');
    expect(list).toHaveLength(MAX_TOASTS);
    expect(r.dropped.map((d) => d.message)).toEqual(['Game saved']);
    expect(list.map((d) => d.message)).not.toContain('Game saved x');
  });
});

describe('status tiles (H043, H046)', () => {
  it('shows eight tiles and counts the rest', () => {
    const list = Array.from({ length: 11 }, (_, i) => i);
    expect(capStatuses(list)).toEqual({ shown: list.slice(0, MAX_STATUS_TILES), more: 3 });
    expect(capStatuses(list.slice(0, 5))).toEqual({ shown: list.slice(0, 5), more: 0 });
    // Nine fit without a "+N" tile; the "+N" tile counts as a slot.
    expect(capStatuses(list.slice(0, 9)).more).toBe(0);
    expect(capStatuses(list, 4)).toEqual({ shown: list.slice(0, 3), more: 8 });
    expect(capStatuses(list, Infinity).more).toBe(0);
  });

  it('gives a short narrow phone one row of tiles and a tall one two', () => {
    expect(statusSlots(390, 844)).toBe(MAX_STATUS_TILES + 1);
    expect(statusSlots(320, 640)).toBe(4);
    expect(statusSlots(360, 780)).toBe(MAX_STATUS_TILES + 1);
    expect(statusSlots(360, 640)).toBe(5);
  });

  it('marks timed statuses with three seconds or less left', () => {
    expect(isExpiring({ timed: true, remaining: 2.5 })).toBe(true);
    expect(isExpiring({ timed: true, remaining: 3.5 })).toBe(false);
    expect(isExpiring({ timed: false, remaining: 1 })).toBe(false);
    expect(isExpiring({ timed: true, remaining: 0 })).toBe(false);
  });
});

describe('endgame chip (H073)', () => {
  it('pins the rift row and rotates the others every few seconds', () => {
    expect(activeRow(0, -1, 5)).toBe(-1);
    expect(activeRow(3, 0, 100)).toBe(0);
    expect(activeRow(2, -1, 0)).toBe(0);
    expect(activeRow(2, -1, ROTATE_SECONDS)).toBe(1);
    expect(activeRow(2, -1, ROTATE_SECONDS * 2)).toBe(0);
  });
});

describe('quest tracker (H054, H056)', () => {
  it('folds after six seconds of combat and unfolds when it ends', () => {
    const fold = new TrackerFold();
    fold.tick(COLLAPSE_AFTER_COMBAT - 1, true);
    expect(fold.collapsed).toBe(false);
    fold.tick(1.5, true);
    expect(fold.collapsed).toBe(true);
    fold.tick(0.1, false);
    expect(fold.collapsed).toBe(false);
  });

  it('keeps the player\'s choice until a step changes', () => {
    const fold = new TrackerFold();
    fold.toggle();
    expect(fold.collapsed).toBe(true);
    fold.tick(1, false);
    expect(fold.collapsed).toBe(true);
    fold.reveal();
    expect(fold.collapsed).toBe(false);
    fold.toggle();
    fold.toggle();
    fold.tick(COLLAPSE_AFTER_COMBAT + 1, true);
    expect(fold.collapsed).toBe(false);
  });

  it('writes distances in steps of five metres', () => {
    expect(formatDistance(142)).toBe('140 m');
    expect(formatDistance(3)).toBe('5 m');
    expect(formatDistance(-1)).toBe('0 m');
  });
});

describe('quest log (P072)', () => {
  it('opens the tracked quest, else the first', () => {
    expect([...initialExpanded([{ id: 'a', tracked: false }, { id: 'b', tracked: true }])]).toEqual(['b']);
    expect([...initialExpanded([{ id: 'a', tracked: false }, { id: 'b', tracked: false }])]).toEqual(['a']);
    expect(initialExpanded([]).size).toBe(0);
  });
});

describe('deep rift HUD and result (H076, P099)', () => {
  it('fires each low-time cue once and re-arms for a new rift', () => {
    const fired = new Set<number>();
    expect(riftTimeCue(300, fired)).toBeNull();
    expect(riftTimeCue(60, fired)).toBe(60);
    expect(riftTimeCue(59, fired)).toBeNull();
    expect(riftTimeCue(30, fired)).toBe(30);
    expect(riftTimeCue(10, fired)).toBe(10);
    expect(riftTimeCue(5, fired)).toBeNull();
    expect(riftTimeCue(590, fired)).toBeNull();
    expect(riftTimeCue(55, fired)).toBe(60);
  });

  it('gives every glyph a chance between 0 and 100, falling with the glyph level', () => {
    for (let level = 1; level <= GLYPH_MAX_LEVEL; level++) {
      const p = glyphChancePercent(level, 25);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
    expect(glyphChancePercent(1, 25)).toBe(100);
    expect(glyphChancePercent(GLYPH_MAX_LEVEL, 25)).toBe(0);
    expect(glyphChancePercent(15, 25)).toBeLessThan(glyphChancePercent(8, 25));
  });
});

describe('boss frame (H069)', () => {
  it('lists the life fractions where a boss changes phase', () => {
    expect(bossPhaseTicks('brood_mother')).toEqual({ phases: [0.5] });
    expect(bossPhaseTicks(undefined)).toEqual({});
    expect(bossPhaseTicks('no_such_script')).toEqual({});
  });
});
