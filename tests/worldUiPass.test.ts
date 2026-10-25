import { describe, expect, it } from 'vitest';
import {
  AFFIX_CHIPS,
  BAR_FADE,
  BAR_HOLD,
  BAR_MAX,
  BAR_MAX_TOUCH,
  ELITE_RANGE,
  PLATE_BOTTOM_MARGIN,
  affixGlyph,
  barAlpha,
  clampPlateY,
  selectBars,
  type EnemyBarInfo,
} from '../src/ui/enemyBars';
import { ELITE_AFFIXES } from '../src/data/elites';
import { edgeInsets, placeEdgeArrow } from '../src/ui/edgeArrows';
import { BLIP_CAP, BLIP_RANGE, LEGEND, MAP_MAX_ZOOM, selectBlips, legendFor, wheelFactor, zoomAround, type MapBlip } from '../src/ui/minimap';
import { telegraphOutlineOpacity } from '../src/render/vfx';
import en from '../src/data/lang/en.json';

const enemy = (id: number, o: Partial<EnemyBarInfo> = {}): EnemyBarInfo => ({ id, x: 0, y: 2, z: 0, dist: 5, frac: 0.5, tier: 'normal', ...o });
const hitNow = () => 0;
const desktop = { touch: false, portrait: false };

describe('enemy life bars (A020)', () => {
  it('shows bars only on hurt enemies', () => {
    const shown = selectBars([enemy(1, { frac: 1 }), enemy(2, { frac: 0.4 })], hitNow, desktop);
    expect(shown.map((s) => s.info.id)).toEqual([2]);
  });

  it('needs a recent hit, range and life left; bosses have their own frame', () => {
    const since = (id: number) => (id === 1 ? BAR_HOLD + 1 : id === 5 ? undefined : 0.5);
    const shown = selectBars([enemy(1), enemy(2, { dist: 17 }), enemy(3, { frac: 0 }), enemy(4, { tier: 'boss' }), enemy(5), enemy(6)], since, desktop);
    expect(shown.map((s) => s.info.id)).toEqual([6]);
  });

  it('keeps the targeted enemy visible after the hold time', () => {
    const shown = selectBars([enemy(1, { targeted: true })], () => 99, desktop);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.alpha).toBe(1);
  });

  it('fades out over the last part of the hold', () => {
    expect(barAlpha(0)).toBe(1);
    expect(barAlpha(BAR_HOLD - BAR_FADE)).toBe(1);
    expect(barAlpha(BAR_HOLD - BAR_FADE / 2)).toBeCloseTo(0.5);
    expect(barAlpha(BAR_HOLD)).toBe(0);
  });

  it('caps the crowd, nearest first (24 on desktop, 12 on touch)', () => {
    const crowd = Array.from({ length: 40 }, (_, i) => enemy(i, { dist: 1 + (i % 15) * 0.5 + i * 0.001 }));
    const d = selectBars(crowd, hitNow, desktop);
    expect(d).toHaveLength(BAR_MAX);
    const maxShown = Math.max(...d.map((s) => s.info.dist));
    expect(crowd.filter((c) => c.dist < maxShown).length).toBeLessThanOrEqual(BAR_MAX);
    expect(selectBars(crowd, hitNow, { touch: true, portrait: false })).toHaveLength(BAR_MAX_TOUCH);
  });

  it('hides the plain bars on an upright phone when the crowd exceeds the cap, but not a small one', () => {
    const portrait = { touch: true, portrait: true };
    const crowd = Array.from({ length: BAR_MAX_TOUCH + 1 }, (_, i) => enemy(i));
    expect(selectBars(crowd, hitNow, portrait)).toHaveLength(0);
    expect(selectBars(crowd.slice(1), hitNow, portrait)).toHaveLength(BAR_MAX_TOUCH);
  });
});

describe('elite plates (A021, A025)', () => {
  it('always shows champions and rares within 28 m, at full life too', () => {
    const shown = selectBars(
      [enemy(1, { tier: 'champion', frac: 1, dist: ELITE_RANGE }), enemy(2, { tier: 'rare', frac: 1, dist: ELITE_RANGE + 1 }), enemy(3, { tier: 'named', frac: 1, dist: 3 })],
      () => undefined,
      desktop,
    );
    expect(shown.map((s) => s.info.id)).toEqual([1, 3]);
    expect(shown.every((s) => s.plate)).toBe(true);
  });

  it('keeps plates above the HUD band and the top edge', () => {
    expect(clampPlateY(700, 720)).toBe(720 - PLATE_BOTTOM_MARGIN);
    expect(clampPlateY(700, 720)).toBe(590);
    expect(clampPlateY(300, 720)).toBe(300);
    expect(clampPlateY(-20, 720)).toBe(40);
  });

  it('has a chip for every affix, with a two-letter glyph', () => {
    for (const a of ELITE_AFFIXES) {
      expect(AFFIX_CHIPS[a], a).toBeDefined();
      expect(affixGlyph(a)).toMatch(/^[A-Z]{2}$/);
      expect((en as { elites: { affixes: Record<string, string> } }).elites.affixes[a]).toBeTruthy();
    }
  });
});

describe('minimap blips (A016)', () => {
  const blip = (x: number, z: number, kind: MapBlip['kind'] = 'normal'): MapBlip => ({ x, z, kind });

  it('keeps enemies within 40 m only', () => {
    const out = selectBlips([blip(10, 0), blip(BLIP_RANGE, 0), blip(BLIP_RANGE + 1, 0)], 0, 0);
    expect(out).toHaveLength(2);
  });

  it('caps at 60 and keeps the elites and the nearest', () => {
    const pack = Array.from({ length: 80 }, (_, i) => blip(1 + i * 0.4, 0));
    pack.push(blip(39, 0, 'boss'), blip(38, 0, 'rare'));
    const out = selectBlips(pack, 0, 0);
    expect(out).toHaveLength(BLIP_CAP);
    expect(out.some((b) => b.kind === 'boss')).toBe(true);
    expect(out.some((b) => b.kind === 'rare')).toBe(true);
    expect(out.at(-1)!.kind).toBe('boss'); // drawn last, on top
  });

  it('is empty without enemies', () => {
    expect(selectBlips([], 0, 0)).toEqual([]);
  });
});

describe('edge arrow on desktop (A017)', () => {
  it('uses the desktop bounds without touch and the 0.42 h band with it', () => {
    expect(edgeInsets(720, false)).toEqual({ left: 24, right: 24, top: 160, bottom: 180 });
    expect(edgeInsets(844, true)).toMatchObject({ top: 354, bottom: 354 });
  });

  it('clamps a boss behind the action bar into the free band', () => {
    const p = placeEdgeArrow({ x: 640, y: 360 }, { x: 640, y: 900 }, { w: 1280, h: 720 }, edgeInsets(720, false));
    expect(p.visible).toBe(true);
    expect(p.y).toBe(540);
    expect(p.angle).toBeCloseTo(180);
  });
});

describe('telegraph (A024)', () => {
  it('brightens the outline only in the last 0.3 s', () => {
    const life = 1.5;
    const before = telegraphOutlineOpacity(1 - 0.31 / life, life, false);
    const end = telegraphOutlineOpacity(1, life, false);
    expect(before).toBeLessThan(0.25);
    expect(end).toBeCloseTo(0.5);
    expect(telegraphOutlineOpacity(0.5, life, false)).toBeCloseTo(0.18);
  });

  it('handles a wind-up shorter than the warning', () => {
    expect(telegraphOutlineOpacity(0, 0.2, false)).toBeCloseTo(0.12);
    expect(telegraphOutlineOpacity(1, 0.2, false)).toBeCloseTo(0.5);
  });
});

describe('full map (B037-B039)', () => {
  it('lists a legend entry for every glyph colour the map draws', () => {
    const colours = new Set(LEGEND.map((e) => e.color));
    for (const c of ['#5ad2ff', '#ffd23a', '#e8e0d0', '#ff2a2a', '#ff8a3a', '#ffd27a', '#c8a060', '#ff4a3a', '#9fb8ff', '#8ad2ff']) expect(colours.has(c), c).toBe(true);
    const keys = LEGEND.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    const legend = (en as { map: { legend: Record<string, string> } }).map.legend;
    for (const k of keys) expect(legend[k], k).toBeTruthy();
  });

  it('lists only the glyphs present', () => {
    const none = { poiKinds: new Set<string>(), teleporters: false, gates: false, caches: false, mainQuest: false, sideQuest: false, you: false };
    expect(legendFor(none)).toEqual([]);
    const some = legendFor({ ...none, poiKinds: new Set(['dungeon', 'boss']), teleporters: true, you: true }).map((e) => e.key);
    expect(some).toEqual(['teleporter', 'boss', 'dungeon', 'you']);
  });

  it('wheel up doubles the scale, wheel down halves it, within 1x-4x', () => {
    expect(wheelFactor(-100)).toBe(2);
    expect(wheelFactor(100)).toBe(0.5);
    expect(wheelFactor(-4)).toBeGreaterThan(1);
    expect(wheelFactor(-4)).toBeLessThan(1.05);
    const z1 = zoomAround({ z: 1, tx: 0, ty: 0 }, 1 * wheelFactor(-100), 300, 300, 600);
    expect(z1.z).toBe(2);
    expect(zoomAround(z1, z1.z * wheelFactor(-100) * 4, 300, 300, 600).z).toBe(MAP_MAX_ZOOM);
    expect(zoomAround(z1, z1.z * wheelFactor(100) * 0.1, 300, 300, 600).z).toBe(1);
  });
});
