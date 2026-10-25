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

describe('minimap interactable pips (F019)', () => {
  it('use the idle-glow colour of each kind', async () => {
    const { SHIMMER } = await import('../src/render/vfx');
    const { FEATURE_PIP_COLOR } = await import('../src/ui/minimap');
    for (const [kind, look] of Object.entries(SHIMMER)) expect(FEATURE_PIP_COLOR[kind], kind).toBe(look.color);
    expect(Object.keys(FEATURE_PIP_COLOR).sort()).toEqual(Object.keys(SHIMMER).sort());
  });

  it('draws only coloured kinds within range, nearest first and capped', async () => {
    const { selectFeaturePips } = await import('../src/ui/minimap');
    const f = (x: number, kind = 'chest') => ({ x, z: 0, kind });
    const picked = selectFeaturePips([f(30), f(10), f(20, 'questObject'), f(200), f(5, 'lore')], 0, 0);
    expect(picked.map((p) => p.x)).toEqual([5, 10, 30]);
    expect(selectFeaturePips([f(1), f(2), f(3)], 0, 0, 85, 2).map((p) => p.x)).toEqual([1, 2]);
  });
});
