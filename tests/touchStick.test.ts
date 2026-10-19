import { describe, expect, it } from 'vitest';
import { STICK_DEAD_ZONE, STICK_RADIUS, followStick, stickReading } from '../src/ui/touchControls';

describe('touch stick reading', () => {
  it('ignores finger jitter inside the dead zone', () => {
    expect(stickReading(0, 0)).toBeNull();
    expect(stickReading(STICK_DEAD_ZONE, 0)).toBeNull();
    expect(stickReading(3, -4)).toBeNull();
  });

  it('ramps from zero at the dead zone to full at the ring, +y up', () => {
    const half = stickReading(0, -(STICK_DEAD_ZONE + (STICK_RADIUS - STICK_DEAD_ZONE) / 2))!;
    expect(half.x).toBeCloseTo(0);
    expect(half.y).toBeCloseTo(0.5);
    const full = stickReading(STICK_RADIUS, 0)!;
    expect(full.x).toBeCloseTo(1);
    expect(full.y).toBeCloseTo(0);
    // Further out than the ring never exceeds 1.
    const far = stickReading(300, 400)!;
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1);
  });
});

describe('stick drag-follow', () => {
  it('leaves the base alone inside the ring', () => {
    const origin = { x: 100, y: 500 };
    const r = followStick(origin, 30, -20);
    expect(r.origin).toBe(origin);
    expect(r.dx).toBe(30);
    expect(r.dy).toBe(-20);
  });

  it('pulls the base along so the finger stays one radius away', () => {
    const r = followStick({ x: 100, y: 500 }, 3 * STICK_RADIUS, 0);
    expect(r.origin.x).toBeCloseTo(100 + 2 * STICK_RADIUS);
    expect(r.origin.y).toBeCloseTo(500);
    expect(r.dx).toBeCloseTo(STICK_RADIUS);
    // Reversing now only takes a swing of one radius back to the middle, not two.
    const back = followStick(r.origin, -STICK_RADIUS, 0);
    expect(back.dx).toBeCloseTo(-STICK_RADIUS);
  });

  it('works along a diagonal', () => {
    const r = followStick({ x: 0, y: 0 }, 2 * STICK_RADIUS, 2 * STICK_RADIUS);
    expect(Math.hypot(r.dx, r.dy)).toBeCloseTo(STICK_RADIUS);
    expect(Math.hypot(r.origin.x, r.origin.y)).toBeCloseTo(Math.hypot(2 * STICK_RADIUS, 2 * STICK_RADIUS) - STICK_RADIUS);
  });
});
