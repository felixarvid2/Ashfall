/** Round 3 feel and UI leftovers (docs/improvements/round3.md B01-B12): the pure parts. */
import { describe, expect, it } from 'vitest';
import { Dead, Health, Transform, StatusEffects, Knockback, makeTransform, type HitRecord } from '../src/core/components';
import { World } from '../src/core/ecs';
import { CameraRig } from '../src/render/camera';
import { guideDots, guideDotsAlong } from '../src/render/navOverlay';
import { defaultSettings, SettingsSchema, tabDefaults } from '../src/data/settings';
import { INTRO_SECONDS, introActive } from '../src/ui/enemyBars';
import { LEVEL_SHOVE, levelUpShove } from '../src/systems/loot/rewards';
import { RECAP_HITS, RECAP_WINDOW, recordHit } from '../src/systems/combat';
import { deathRecap } from '../src/ui/deathCause';
import { defaultTargetSlot, otherSlot } from '../src/ui/inventoryLogic';
import { compareSummary } from '../src/ui/itemTooltip';
import { LEGEND, MAP_BACKING_MAX, QUEST_MARKER_STYLE, legendFor, mapBackingScale, markerQuestKind, questMarker } from '../src/ui/minimap';
import { guideBannerText, guideDestinationName, routeAhead } from '../src/ui/feelUi';
import { spatialSystem } from '../src/systems/collision';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { questDef } from '../src/data/quests/db';
import en from '../src/data/lang/en.json';
import { makeCtx, run } from './helpers';
import type { Item } from '../src/data/loot/schemas';
import type { Slot } from '../src/data/loot/schemas';

const tr = (key: string, params?: Record<string, string | number>): string => (params ? `${key}:${JSON.stringify(params)}` : key);

describe('B01 reduce motion', () => {
  it('is its own setting, off by default, and not reset by the screen-shake switch', () => {
    const s = defaultSettings();
    expect(s.reduceMotion).toBe(false);
    expect(s.screenShake).toBe(true);
    expect(SettingsSchema.parse({ reduceMotion: true, screenShake: true }).reduceMotion).toBe(true);
    expect(tabDefaults('display').reduceMotion).toBe(false);
  });

  it('stops the camera push-in, look-ahead and crowd pull-back', () => {
    const rig = new CameraRig(16 / 9);
    rig.setReduceMotion(true);
    rig.pulseZoom(1.2, 0.5);
    rig.setLookAhead(5, 5);
    rig.setCrowd(20);
    const base = rig.effectiveDistance;
    for (let i = 0; i < 30; i++) rig.update(0, 0, 0, 1 / 30);
    expect(rig.effectiveDistance).toBeCloseTo(base, 6);
    expect(rig.focusPoint.x).toBeCloseTo(0, 6);
    // Turned back on, the same calls move the camera again.
    rig.setReduceMotion(false);
    rig.setLookAhead(5, 0);
    for (let i = 0; i < 60; i++) rig.update(0, 0, 0, 1 / 30);
    expect(rig.focusPoint.x).toBeGreaterThan(0.5);
  });
});

describe('B02 elite intro', () => {
  it('lasts 0.4 s from the first plate', () => {
    expect(INTRO_SECONDS).toBe(0.4);
    expect(introActive(10, 10)).toBe(true);
    expect(introActive(10, 10.39)).toBe(true);
    expect(introActive(10, 10.4)).toBe(false);
  });
});

describe('B03 level-up stagger', () => {
  it('knocks back and staggers enemies within 6 m, not further ones', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const near = spawnEnemy(world, 'infected_colonist', 4, 0);
    const far = spawnEnemy(world, 'infected_colonist', LEVEL_SHOVE.radius + 3, 0);
    run(world, ctx, [spatialSystem], 1);
    expect(levelUpShove(world, ctx, player)).toBe(1);
    expect(world.get(near, Knockback)).toBeDefined();
    expect(world.req(near, StatusEffects).list.some((s) => s.id === 'stunned')).toBe(true);
    expect(world.get(far, Knockback)).toBeUndefined();
  });
});

describe('B04 death recap', () => {
  const hit = (at: number, amount: number, dot = false, defId = 'infected_colonist'): HitRecord => ({
    ...(dot ? {} : { src: { defId, at } }),
    amount,
    damageType: dot ? 'toxic' : 'physical',
    dot,
    at,
  });

  it('keeps the last three direct hits and five seconds of everything', () => {
    const h: Health = { current: 0, max: 100 };
    for (const [at, amt] of [[1, 5], [2, 6], [3, 7], [4, 8]] as const) recordHit(h, hit(at, amt));
    recordHit(h, hit(30, 9));
    const direct = h.recentHits!.filter((r) => !r.dot);
    expect(direct).toHaveLength(RECAP_HITS);
    expect(direct.map((r) => r.amount)).toEqual([7, 8, 9]);
    expect(RECAP_WINDOW).toBe(5);
  });

  it('lists the hits oldest first and totals the last five seconds, damage over time included', () => {
    const records = [hit(9, 40), hit(11, 15, true), hit(12, 30), hit(13, 25), hit(14, 100, false, 'ash_walker')];
    const recap = deathRecap(records, 15, tr);
    expect(recap.lines).toHaveLength(3);
    expect(recap.lines[2]).toContain('"amount":100');
    expect(recap.lines[0]).toContain('"amount":30');
    // 5 s window from t = 15: 10 is outside, the rest counts (15 + 30 + 25 + 100).
    expect(recap.total).toBe(170);
    expect(recap.summary).toContain('"seconds":5');
  });

  it('is empty without records', () => {
    expect(deathRecap(undefined, 5, tr)).toEqual({ lines: [], total: 0, summary: '' });
  });

  it('is a plain Health record the dead check can read', () => {
    const w = new World();
    const e = w.create();
    w.add(e, Health, { current: 0, max: 10 });
    w.add(e, Dead, {} as never);
    expect(w.has(e, Dead)).toBe(true);
  });
});

describe('B05 guide route', () => {
  it('dots follow a bent route, not the straight line', () => {
    const route = [{ x: 0, z: 0 }, { x: 0, z: 20 }, { x: 20, z: 20 }];
    const dots = guideDotsAlong(route, 0);
    expect(dots.length).toBeGreaterThan(8);
    expect(dots.some((d) => d.x < 1 && d.z > 10)).toBe(true);
    expect(dots.some((d) => d.z > 19 && d.x > 5)).toBe(true);
    // No dot cuts the corner.
    expect(dots.every((d) => d.x < 0.01 || d.z > 19.99)).toBe(true);
  });

  it('a two-point route equals the straight line', () => {
    expect(guideDotsAlong([{ x: 0, z: 0 }, { x: 0, z: 30 }], 0)).toEqual(guideDots(0, 0, 0, 30, 0));
  });

  it('drops waypoints the hero has passed, but keeps the last', () => {
    const route = [{ x: 1, z: 0 }, { x: 10, z: 0 }, { x: 30, z: 0 }];
    expect(routeAhead(route, 0, 0)).toEqual(route.slice(1));
    expect(routeAhead(route, 29.5, 0)).toEqual([{ x: 30, z: 0 }]);
  });

  it('names the person or teleporter the step leads to', () => {
    expect(guideDestinationName({ kind: 'talk', npc: 'benny' }, tr)).toBe('npcs.benny.name');
    expect(guideDestinationName({ kind: 'discover', teleporter: 'tp.impact' }, tr)).toBe('zones.teleporters.tp.impact');
    expect(guideDestinationName({ kind: 'reach' }, tr)).toBeNull();
    expect(guideBannerText('Benny', 'x', tr)).toContain('guideBannerPlace');
    expect(guideBannerText(null, 'Climb out', tr)).toContain('guideBannerStep');
    expect(guideBannerText(null, '', tr)).toBe('feel.guideBanner');
  });
});

describe('B06 tips setting', () => {
  it('is on by default and part of the display tab defaults', () => {
    expect(defaultSettings().showTips).toBe(true);
    expect(tabDefaults('display').showTips).toBe(true);
  });
});

describe('B07 ring arrows', () => {
  const ring = (itemPower: number, uid: string): Item => ({ uid, itemPower, base: 'ring', sockets: [] }) as unknown as Item;
  const slots: Slot[] = ['ring1', 'ring2'];
  // A comparison per slot: replacing ring2 is the better outcome (it holds the weaker ring).
  const cmp = (slot: Slot) => (slot === 'ring2' ? { damagePct: 0.04, life: 0, stats: [] } : { damagePct: -0.02, life: 0, stats: [] });

  it('targets the slot where the item fares best, i.e. the weaker ring', () => {
    const worn = { ring1: ring(90, 'a'), ring2: ring(60, 'b') };
    expect(defaultTargetSlot(slots, worn, cmp)).toBe('ring2');
    expect(otherSlot(slots, worn, cmp)).toBe('ring1');
    // The mirror image: ring1 is the weaker one.
    expect(defaultTargetSlot(slots, worn, (s) => cmp(s === 'ring1' ? 'ring2' : 'ring1'))).toBe('ring1');
  });

  it('an empty slot still comes first, and without a comparison item power decides', () => {
    expect(defaultTargetSlot(slots, { ring1: ring(90, 'a') }, cmp)).toBe('ring2');
    expect(defaultTargetSlot(slots, { ring1: ring(50, 'a'), ring2: ring(60, 'b') })).toBe('ring1');
  });
});

describe('B08 sharp map', () => {
  it('grows the pixel buffer with the pixel ratio and the zoom, in half steps, within the cap', () => {
    expect(mapBackingScale(640, 1, 1)).toBe(1);
    expect(mapBackingScale(640, 2, 1)).toBe(2);
    expect(mapBackingScale(640, 1, 4)).toBe(4);
    expect(mapBackingScale(500, 1, 1)).toBe(1);
    expect(mapBackingScale(500, 1.5, 1.2)).toBe(1.5);
    expect(mapBackingScale(640, 3, 4)).toBe(MAP_BACKING_MAX / 640);
  });

  it('covers the display: buffer pixels per zoomed CSS pixel are at least the pixel ratio (below the cap)', () => {
    for (const [css, dpr, zoom] of [[640, 2, 1.7], [420, 3, 2.2], [720, 1.25, 3.1]] as const) {
      const px = 640 * mapBackingScale(css, dpr, zoom);
      expect(px / (css * zoom)).toBeGreaterThanOrEqual(Math.min(dpr, MAP_BACKING_MAX / (css * zoom)) - 1e-9);
    }
  });
});

describe('B09 map legend from quest data', () => {
  it('colours markers and legend chips from the quest kind', () => {
    for (const kind of ['main', 'side', 'mystery'] as const) {
      const m = questMarker(1, 2, kind);
      expect(m.color).toBe(QUEST_MARKER_STYLE[kind].color);
      expect(markerQuestKind(m)).toBe(kind);
      const entry = LEGEND.find((e) => e.key === QUEST_MARKER_STYLE[kind].legend);
      expect(entry?.color, kind).toBe(m.color);
      expect((en as { map: { legend: Record<string, string> } }).map.legend[QUEST_MARKER_STYLE[kind].legend], kind).toBeTruthy();
    }
    expect(markerQuestKind({ x: 0, z: 0, color: '#ffd23a', shape: 'diamond' })).toBeNull();
  });

  it('lists a mystery quest entry only when one is on the map', () => {
    const base = { poiKinds: new Set<string>(), teleporters: false, gates: false, caches: false, mainQuest: false, sideQuest: false, you: false };
    expect(legendFor({ ...base, mysteryQuest: true }).map((e) => e.key)).toEqual(['mysteryQuest']);
    expect(legendFor(base)).toEqual([]);
  });

  it('every quest kind in the data has a marker style', () => {
    const kinds = new Set(['mq.wake_up', 'sq.daughter'].map((id) => questDef(id).kind));
    for (const k of kinds) expect(QUEST_MARKER_STYLE[k]).toBeDefined();
  });
});

describe('B11 comparison summary', () => {
  it('opens with damage and life as signed percentages', () => {
    const s = compareSummary({ stats: [], damagePct: 0.12, life: -30, lifePct: -0.03 });
    expect(s.text).toContain('+12% damage');
    expect(s.text).toContain('−3% life');
    expect(s.tone).toBe('up');
  });

  it('falls back to the flat life change, and says so when nothing moves', () => {
    expect(compareSummary({ stats: [], damagePct: 0, life: 40 }).text).toBe('+40 life');
    expect(compareSummary({ stats: [], damagePct: -0.005, life: 0, lifePct: 0 })).toEqual({ text: '−0.5% damage', tone: 'down' });
    expect(compareSummary({ stats: [], damagePct: 0, life: 0, lifePct: 0 })).toEqual({ text: 'No change in damage or life', tone: 'flat' });
  });
});

describe('B10 ellipsis style', () => {
  it('uses three dots everywhere in en.json', () => {
    expect(JSON.stringify(en)).not.toContain('…');
  });
});

describe('B12 magnet feedback', () => {
  it('marks magnet deliveries so the game plays the soft cue', async () => {
    const { Inventory, GroundGold } = await import('../src/core/components');
    const { pickupSystem } = await import('../src/systems/loot/rewards');
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const gold = world.create();
    world.add(gold, Transform, makeTransform(1.5, 0, 0));
    world.add(gold, GroundGold, { amount: 10, age: 1 });
    run(world, ctx, [pickupSystem], 90);
    const ev = ctx.events.peek().filter((e) => e.type === 'pickup');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: 'gold', amount: 10, magnet: true });
    expect(world.req(player, Inventory).gold).toBe(10);
  });
});
