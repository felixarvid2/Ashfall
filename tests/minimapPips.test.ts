import { describe, expect, it } from 'vitest';
import { PIP_CAP, PIP_FADE, livePips, pipAlpha, type MapPip } from '../src/ui/minimap';
import en from '../src/data/lang/en.json';

const pip = (until: number, from = 0): MapPip => ({ x: 0, z: 0, from, until, color: '#ffd23a' });

describe('minimap drop pips (A039)', () => {
  it('is fully opaque until its last PIP_FADE seconds, then fades to nothing at expiry', () => {
    expect(pipAlpha(pip(5), 0)).toBe(1);
    expect(pipAlpha(pip(5), 5 - PIP_FADE)).toBe(1);
    expect(pipAlpha(pip(5), 5 - PIP_FADE / 2)).toBeCloseTo(0.5);
    expect(pipAlpha(pip(5), 5)).toBe(0);
    expect(pipAlpha(pip(5), 6)).toBe(0);
  });

  it('stays steady with reduce flashing, and still vanishes on time', () => {
    expect(pipAlpha(pip(5), 4.9, true)).toBe(1);
    expect(pipAlpha(pip(5), 5, true)).toBe(0);
  });

  it('drops expired pips and keeps the same array when nothing expired', () => {
    const pips = [pip(2), pip(6), pip(9)];
    expect(livePips(pips, 1)).toBe(pips);
    expect(livePips(pips, 3).map((p) => p.until)).toEqual([6, 9]);
    expect(livePips(pips, 10)).toEqual([]);
  });

  it('caps the pips, keeping the newest', () => {
    const many = Array.from({ length: PIP_CAP + 3 }, (_, i) => pip(100 + i));
    const kept = livePips(many, 0);
    expect(kept).toHaveLength(PIP_CAP);
    expect(kept[kept.length - 1]!.until).toBe(100 + PIP_CAP + 2);
    expect(kept[0]!.until).toBe(103);
  });
});

describe('Skills dot label (B036)', () => {
  it('has a language string with the count', () => {
    expect(en.hud.unassignedSkills).toContain('{n}');
  });
});
