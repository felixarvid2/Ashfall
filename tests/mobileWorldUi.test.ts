import { describe, expect, it } from 'vitest';
import { DOT_MIN_SHARE, TOUCH_MAX, dotWorthShowing } from '../src/ui/damageNumbers';
import { TOUCH_MAX_LABELS, chooseLabels, clampLabelX, labelSlots, stackLabels } from '../src/ui/lootLabels';
import { MAP_MAX_ZOOM, PICK_RADIUS_PX, centerOn, clampZoom, pickNearest, zoomAround } from '../src/ui/minimap';

describe('loot labels on a phone', () => {
  const pile = (n: number) => Array.from({ length: n }, (_, i) => ({ key: i, dist: i + 1, always: false }));

  it('shows the nearest few and folds the rest into the chip', () => {
    const { shown, hidden } = chooseLabels(pile(13), TOUCH_MAX_LABELS);
    expect(shown.size).toBe(TOUCH_MAX_LABELS);
    expect([...shown].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(hidden).toHaveLength(7);
    expect(hidden[0]!.key).toBe(6); // the chip points at the nearest folded item
  });

  it('never folds legendary and better, even far away', () => {
    const cands = [...pile(10), { key: 99, dist: 40, always: true }];
    const { shown, hidden } = chooseLabels(cands, TOUCH_MAX_LABELS);
    expect(shown.has(99)).toBe(true);
    expect(shown.size).toBe(TOUCH_MAX_LABELS);
    expect(hidden.some((c) => c.key === 99)).toBe(false);
  });

  it('fits fewer labels in the short band of a small phone and keeps a slot for the chip', () => {
    expect(labelSlots(384)).toBe(TOUCH_MAX_LABELS); // 390x844
    expect(labelSlots(180)).toBe(2); // 320x640: 4 rows of 46 px, one is the chip
    expect(labelSlots(0)).toBe(2);
  });

  it('keeps a label inside the screen', () => {
    expect(clampLabelX(2, 160, 390)).toBe(84); // 4 px margin + half the width
    expect(clampLabelX(388, 160, 390)).toBe(306);
    expect(clampLabelX(195, 160, 390)).toBe(195);
    expect(clampLabelX(10, 500, 390)).toBe(195); // wider than the screen: centred
  });

  it('stacks overlapping labels by their height and leaves apart ones alone', () => {
    const ys = stackLabels(
      [
        { x: 100, y: 300, w: 120 },
        { x: 110, y: 300, w: 120 },
        { x: 100, y: 298, w: 120 },
        { x: 300, y: 300, w: 60 },
      ],
      44,
    );
    expect(ys[3]).toBe(300);
    const stacked = [ys[0]!, ys[1]!, ys[2]!].sort((a, b) => b - a);
    expect(stacked[0]! - stacked[1]!).toBeGreaterThanOrEqual(44);
    expect(stacked[1]! - stacked[2]!).toBeGreaterThanOrEqual(44);
  });
});

describe('damage numbers on a phone', () => {
  it('drops DoT ticks under 3% of the target life', () => {
    expect(DOT_MIN_SHARE).toBe(0.03);
    expect(dotWorthShowing(2, 100)).toBe(false);
    expect(dotWorthShowing(3, 100)).toBe(true);
    expect(dotWorthShowing(1, 0)).toBe(true); // unknown life: show it
    expect(TOUCH_MAX).toBe(24);
  });
});

describe('full map picking and zoom', () => {
  const points = [
    { id: 'tp.a', x: 100, y: 100 },
    { id: 'tp.b', x: 300, y: 300 },
  ];

  it('a tap 20 px from a marker selects it (28 px snap radius, canvas px = CSS px at 1:1)', () => {
    expect(PICK_RADIUS_PX).toBe(28);
    expect(pickNearest(points, 120, 100, PICK_RADIUS_PX)).toBe('tp.a');
    expect(pickNearest(points, 100, 129, PICK_RADIUS_PX)).toBeNull();
  });

  it('picks the nearest when two are in range', () => {
    const close = [...points, { id: 'tp.c', x: 110, y: 100 }];
    expect(pickNearest(close, 112, 100, PICK_RADIUS_PX)).toBe('tp.c');
  });

  it('zooms to 2x around the finger and keeps the point under it', () => {
    const size = 366;
    const s = zoomAround({ z: 1, tx: 0, ty: 0 }, 2, 200, 150, size);
    expect(s.z).toBe(2);
    // The canvas point that was under (200, 150) is still there.
    expect((200 - s.tx) / s.z).toBeCloseTo(200);
    expect((150 - s.ty) / s.z).toBeCloseTo(150);
  });

  it('never leaves the canvas edge inside the viewport and caps the zoom', () => {
    const size = 366;
    const s = clampZoom({ z: 9, tx: 50, ty: -9999 }, size);
    expect(s.z).toBe(MAP_MAX_ZOOM);
    expect(s.tx).toBe(0);
    expect(s.ty).toBe(size - size * MAP_MAX_ZOOM);
    expect(clampZoom({ z: 0.3, tx: -40, ty: -40 }, size)).toEqual({ z: 1, tx: 0, ty: 0 });
  });

  it('locate centres a point', () => {
    const size = 400;
    const s = centerOn({ z: 2, tx: 0, ty: 0 }, 220, 180, size);
    expect(s.tx + 220 * 2).toBeCloseTo(200);
    expect(s.ty + 180 * 2).toBeCloseTo(200);
  });
});
