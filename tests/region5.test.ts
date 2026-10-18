import { afterEach, describe, expect, it } from 'vitest';
import { Collider, Health, Mover, Projectile, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { World, type Entity } from '../src/core/ecs';
import { pickAmbience, pickMusic, MENU_SCENE, type AudioScene } from '../src/data/audio';
import { CLASSES, ENEMY_DEFS } from '../src/data/db';
import { hasInstance } from '../src/world/instance';
import { PACK_TEMPLATES, packTemplate } from '../src/data/packs';
import { QUESTS } from '../src/data/quests/db';
import { ZONES, zoneDef } from '../src/data/zones';
import { bridgeState, caveGrid, setBridges, walkableAt, airAt } from '../src/data/zones/caves';
import { DEEP_MINES, DRILL_BORE, MAIN_DRILL, MINES_ENV } from '../src/data/zones/deepMines';
import { BRIDGES, CORE_ENV, CORE_GATE, ELEVATOR_BASE, ISLANDS, LAST_CAMP, LUMEN_HEART, SHAFT, THE_CORE, island } from '../src/data/zones/theCore';
import type { EnvFeature } from '../src/data/zones/zoneTypes';
import { createQuestRuntime } from '../src/systems/quests';
import { rockSystem } from '../src/world/underground';
import { CORE_TUNING, bridgeSystem, gravityFields, gravityPhase, gravityPull, gravitySystem, inGravityField, type Gravity } from '../src/world/theCore';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime, zoneSystem } from '../src/world/zone';
import { makeCtx, run } from './helpers';

const grid = caveGrid(THE_CORE)!;
const speed = CLASSES.get('bastion')!.moveSpeed;

afterEach(() => {
  // The grid is shared and cached: leave its bridges as the cycle has them at time 0.
  setBridges(grid, 0);
});

function inCore(x: number, z: number) {
  const world = new World();
  const zone = createZoneRuntime(THE_CORE);
  const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: THE_CORE.halfSize, zoneLevels: [40, 50] });
  const player = spawnPlayer(world, 'bastion', x, z);
  world.req(player, Health).max = world.req(player, Health).current = 1e7;
  return { world, ctx, zone, player };
}

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

const bridgeById = (id: string) => BRIDGES.find((b) => b.id === id)!;
const mid = (id: string) => {
  const b = bridgeById(id);
  return { x: (b.a[0] + b.b[0]) / 2, z: (b.a[1] + b.b[1]) / 2 };
};
const gravity = (id: string) => CORE_ENV.find((f) => f.id === id) as Gravity;

describe('The Core zone', () => {
  it('is region 5, levels 40–50, not dark, with the planned subzones and hub', () => {
    expect(THE_CORE.region).toBe(5);
    expect(THE_CORE.levels).toEqual([40, 50]);
    expect(THE_CORE.halfSize).toBe(Math.round(340 * 2.2));
    expect(ZONES[4]).toBe(THE_CORE);
    expect(zoneDef('zone.the_core')).toBe(THE_CORE);
    expect(THE_CORE.dark).toBeFalsy();
    expect(THE_CORE.subzones.map((s) => s.id)).toEqual(['greatCavern', 'borderland', 'hangingGardens', 'memoryHalls', 'heart']);
    // Borderland south, Gardens west, Halls east, Heart north.
    const c = (id: string) => THE_CORE.subzones.find((s) => s.id === id)!.center;
    expect(c('borderland')[1]).toBeLessThan(0);
    expect(c('hangingGardens')[0]).toBeLessThan(0);
    expect(c('memoryHalls')[0]).toBeGreaterThan(0);
    expect(c('heart')[1]).toBeGreaterThan(0);
    // The Last Camp: south-centre; the shaft: the centre landmark.
    expect(THE_CORE.hubs).toEqual([LAST_CAMP]);
    expect([LAST_CAMP.x, LAST_CAMP.z]).toEqual([0, -110 * 2.2]);
    expect([SHAFT.x, SHAFT.z]).toEqual([0, 60 * 2.2]);
    expect(THE_CORE.props.some((p) => p.asset === 'prop.core_column' && p.landmark && p.x === SHAFT.x && p.z === SHAFT.z)).toBe(true);
    expect(THE_CORE.stash).toBeDefined();
  });

  it('prefixes ids and has the planned markers, dungeons only as markers', () => {
    for (const p of THE_CORE.pois) expect(p.id.startsWith('core.'), p.id).toBe(true);
    for (const p of THE_CORE.packs) expect(p.id.startsWith('core.'), p.id).toBe(true);
    const count = (kind: string) => THE_CORE.pois.filter((p) => p.kind === kind).length;
    expect(count('dungeon')).toBe(4);
    expect(count('bunker')).toBe(3);
    expect(count('stronghold')).toBe(1);
    expect(count('boss')).toBe(1);
    expect(count('relic')).toBe(10);
    expect(count('lore')).toBe(12);
    expect(count('signalTower')).toBe(3);
    expect(count('pylon')).toBe(6);
    expect(count('lockedChest')).toBe(6);
    expect(count('chest')).toBeGreaterThan(60);
    // The Base marker sits at the shaft's foot (pushed a few metres out of the column's collision).
    const base = THE_CORE.pois.find((p) => p.kind === 'stronghold')!;
    expect(base.id).toBe(ELEVATOR_BASE.id);
    expect(Math.hypot(base.x - SHAFT.x, base.z - SHAFT.z)).toBeLessThan(14);
    expect(THE_CORE.pois.find((p) => p.kind === 'boss')).toMatchObject({ id: LUMEN_HEART.id });
    // The instances are built in R5-C: the game says so instead of crashing.
    for (const p of THE_CORE.pois.filter((q) => q.kind === 'dungeon' || q.kind === 'bunker')) expect(hasInstance(String(p.data?.dungeon ?? p.data?.instance)), p.id).toBe(false);
    // Packs of the density the earlier regions have (213–309).
    expect(THE_CORE.packs.length).toBeGreaterThan(180);
    expect(THE_CORE.packs.length).toBeLessThan(320);
  });

  it('has five teleporters: hub, Gardens, Halls, Base and Heart, each in its own subzone', () => {
    expect(THE_CORE.teleporters.map((t) => t.id)).toEqual(['tp.camp', 'tp.gardens', 'tp.halls', 'tp.base', 'tp.heart']);
    expect(THE_CORE.teleporters.filter((t) => t.hub).map((t) => t.id)).toEqual(['tp.camp']);
    const t = (id: string) => THE_CORE.teleporters.find((x) => x.id === id)!;
    expect(t('tp.camp').z).toBeLessThan(-150);
    expect(t('tp.gardens').x).toBeLessThan(-150);
    expect(t('tp.halls').x).toBeGreaterThan(150);
    expect(t('tp.heart').z).toBeGreaterThan(400);
    expect(Math.hypot(t('tp.base').x - ELEVATOR_BASE.x, t('tp.base').z - ELEVATOR_BASE.z)).toBeLessThan(ELEVATOR_BASE.radius);
  });

  it('uses the earlier regions’ enemies in its packs until the Core roster arrives', () => {
    const used = new Set(THE_CORE.packs.map((p) => p.template));
    expect([...used].sort()).toEqual(PACK_TEMPLATES.filter((t) => t.id.startsWith('core_')).map((t) => t.id).sort());
    for (const id of used) {
      for (const m of packTemplate(id).members) expect(ENEMY_DEFS.has(m.enemy), `${id}: ${m.enemy}`).toBe(true);
    }
  });

  it('plays the Mines music with the hum, until a fitting track exists', () => {
    const play = (over: Partial<AudioScene>): AudioScene => ({ ...MENU_SCENE, phase: 'play', zoneId: 'zone.the_core', ...over });
    expect(pickMusic(play({}))).toBe('music.deep_mines');
    expect(pickMusic(play({ inHub: true }))).toBe('music.hub');
    expect(pickAmbience(play({}))).toBe('amb.hum');
  });
});

describe('The gate from the Deep Mines', () => {
  it('pairs the drill bore with the Borderland’s south edge', () => {
    expect(DRILL_BORE.to).toEqual({ zone: THE_CORE.id, gate: CORE_GATE.id });
    expect(CORE_GATE.to).toEqual({ zone: DEEP_MINES.id, gate: DRILL_BORE.id });
    expect(DEEP_MINES.gates).toContain(DRILL_BORE);
    expect(THE_CORE.gates).toEqual([CORE_GATE]);
    // The bore lies on the drill's shore, out of the lake; the Core’s gate on the south edge, at the end of a road.
    expect(Math.hypot(DRILL_BORE.x - MAIN_DRILL.x, DRILL_BORE.z - MAIN_DRILL.z)).toBeLessThan(95);
    for (const f of MINES_ENV.filter((e) => e.kind === 'water')) {
      expect(Math.hypot(DRILL_BORE.x - f.x, DRILL_BORE.z - f.z)).toBeGreaterThan(f.radius + 8);
      expect(Math.hypot(DRILL_BORE.arrive.x - f.x, DRILL_BORE.arrive.z - f.z)).toBeGreaterThan(f.radius + 8);
    }
    expect(CORE_GATE.z).toBeLessThan(-THE_CORE.halfSize + 20);
    const ends = THE_CORE.roads.flatMap((r) => [r.points[0]!, r.points[r.points.length - 1]!]);
    expect(Math.min(...ends.map(([x, z]) => Math.hypot(x - CORE_GATE.x, z - CORE_GATE.z)))).toBeLessThan(CORE_GATE.radius);
    // Both arrival points are on open ground and outside the trigger.
    const mines = caveGrid(DEEP_MINES)!;
    expect(walkableAt(mines, DRILL_BORE.x, DRILL_BORE.z)).toBe(true);
    expect(walkableAt(mines, DRILL_BORE.arrive.x, DRILL_BORE.arrive.z)).toBe(true);
    expect(walkableAt(grid, CORE_GATE.arrive.x, CORE_GATE.arrive.z)).toBe(true);
    expect(THE_CORE.playerSpawn).toEqual(CORE_GATE.arrive);
    for (const g of [DRILL_BORE, CORE_GATE]) expect(Math.hypot(g.arrive.x - g.x, g.arrive.z - g.z)).toBeGreaterThan(g.radius + 4);
  });

  it('is locked by the Mines’ last main quest, and the Core side is open', () => {
    const mainQuests = [...QUESTS.values()].filter((q) => q.zone === DEEP_MINES.id && q.kind === 'main');
    const last = mainQuests.filter((q) => !mainQuests.some((o) => o.after.includes(q.id)));
    expect(last.map((q) => q.id)).toEqual(['mq.governor']);
    expect(DRILL_BORE.requires?.quest).toBe('mq.governor');
    expect(CORE_GATE).not.toHaveProperty('requires');
  });

  it('says why while locked, and crosses once the quest is done', () => {
    const world = new World();
    const zone = createZoneRuntime(DEEP_MINES);
    const quests = createQuestRuntime();
    const ctx = makeCtx({ zone, quests, worldHalfSize: DEEP_MINES.halfSize });
    const player = spawnPlayer(world, 'bastion', DRILL_BORE.arrive.x, DRILL_BORE.arrive.z);
    run(world, ctx, [zoneSystem], 20);
    moveTo(world, player, DRILL_BORE.x, DRILL_BORE.z);
    run(world, ctx, [zoneSystem], 20);
    let events = ctx.events.drain();
    expect(events.filter((e) => e.type === 'zoneGate')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', key: 'zones.gateLocked.bore' }]);
    // Standing in it does not repeat the notice; stepping away and back does.
    run(world, ctx, [zoneSystem], 40);
    expect(ctx.events.drain().filter((e) => e.type === 'notice')).toHaveLength(0);
    moveTo(world, player, DRILL_BORE.arrive.x, DRILL_BORE.arrive.z);
    run(world, ctx, [zoneSystem], 20);
    moveTo(world, player, DRILL_BORE.x, DRILL_BORE.z);
    run(world, ctx, [zoneSystem], 20);
    expect(ctx.events.drain().filter((e) => e.type === 'notice')).toHaveLength(1);
    // Done: it opens.
    quests.done.set('mq.governor', '');
    moveTo(world, player, DRILL_BORE.arrive.x, DRILL_BORE.arrive.z);
    run(world, ctx, [zoneSystem], 20);
    moveTo(world, player, DRILL_BORE.x, DRILL_BORE.z);
    run(world, ctx, [zoneSystem], 20);
    events = ctx.events.drain();
    expect(events.filter((e) => e.type === 'zoneGate')).toEqual([{ type: 'zoneGate', gate: DRILL_BORE.id }]);
    expect(events.filter((e) => e.type === 'notice')).toHaveLength(0);
  });

  it('lets the Core’s own gate through without a quest', () => {
    const world = new World();
    const zone = createZoneRuntime(THE_CORE);
    const ctx = makeCtx({ zone, worldHalfSize: THE_CORE.halfSize });
    const player = spawnPlayer(world, 'bastion', CORE_GATE.arrive.x, CORE_GATE.arrive.z);
    run(world, ctx, [zoneSystem], 20);
    moveTo(world, player, CORE_GATE.x, CORE_GATE.z);
    run(world, ctx, [zoneSystem], 20);
    expect(ctx.events.drain().filter((e) => e.type === 'zoneGate')).toEqual([{ type: 'zoneGate', gate: CORE_GATE.id }]);
  });
});

describe('Core ground', () => {
  it('has rock walls round the bore that open into the Borderland’s cavern', () => {
    const z = CORE_GATE.arrive.z;
    expect(walkableAt(grid, 0, z)).toBe(true);
    expect(walkableAt(grid, 14, z)).toBe(false);
    expect(walkableAt(grid, -14, z)).toBe(false);
    expect(airAt(grid, 14, z)).toBe(false);
    // …and further on the walls fall away into the cavern.
    expect(walkableAt(grid, 40, -268 * 2.2)).toBe(true);
    expect(walkableAt(grid, -40, -268 * 2.2)).toBe(true);
  });

  it('keeps melt pools unwalkable but open to bolts, lit like molten metal', () => {
    const pools = CORE_ENV.filter((f) => f.kind === 'molten');
    expect(pools).toHaveLength(6);
    for (const f of pools) {
      expect(walkableAt(grid, f.x, f.z), f.id).toBe(false);
      expect(airAt(grid, f.x, f.z), f.id).toBe(true);
    }
    // Nobody can stand on the glowing rim: the molten disc lies inside the hole.
    for (const f of pools as Extract<EnvFeature, { kind: 'molten' }>[]) expect(walkableAt(grid, f.x + f.radius * 0.9, f.z)).toBe(false);
  });

  it('puts every point of interest, teleporter, pack and the stash on open ground', () => {
    for (const p of THE_CORE.pois) expect(walkableAt(grid, p.x, p.z), p.id).toBe(true);
    for (const t of THE_CORE.teleporters) expect(walkableAt(grid, t.x, t.z), t.id).toBe(true);
    for (const p of THE_CORE.packs) expect(walkableAt(grid, p.x, p.z), p.id).toBe(true);
    expect(walkableAt(grid, THE_CORE.stash!.x, THE_CORE.stash!.z)).toBe(true);
  });

  function reachable(allBridges: boolean): (x: number, z: number) => boolean {
    if (allBridges) setBridges(grid, 0.5);
    const { n, cell, half, data } = grid;
    // Cycling bridges forced off for the "static" walk.
    const off = new Set<number>();
    if (!allBridges) for (const b of grid.bridges!) if (b.def.cycle) for (const k of b.cells) off.add(k);
    const open = (k: number) => data[k] === 1 && !off.has(k);
    const seen = new Uint8Array(n * n);
    const start = Math.floor((CORE_GATE.arrive.z + half) / cell) * n + Math.floor((CORE_GATE.arrive.x + half) / cell);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % n;
      const j = (k - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di!;
        const nj = j + dj!;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (!open(nk) || seen[nk]) continue;
        seen[nk] = 1;
        stack.push(nk);
      }
    }
    return (x, z) => seen[Math.floor((z + half) / cell) * n + Math.floor((x + half) / cell)] === 1;
  }

  it('can reach everything from the bore while the bridges are on', () => {
    const reach = reachable(true);
    for (const p of [...THE_CORE.pois, ...THE_CORE.teleporters, ...THE_CORE.packs]) expect(reach(p.x, p.z), p.id).toBe(true);
  });

  it('needs no switching bridge for anything but the two outer islands', () => {
    const reach = reachable(false);
    const lost = [...THE_CORE.pois, ...THE_CORE.teleporters, ...THE_CORE.packs].filter((p) => !reach(p.x, p.z));
    const outer = ISLANDS.filter((i) => i.cycleOnly);
    expect(outer.map((i) => i.id)).toEqual(['g2', 'g10']);
    for (const p of lost) expect(outer.some((i) => Math.hypot(p.x - i.x, p.z - i.z) < i.radius), p.id).toBe(true);
    // The main path, the Gardens’ teleporter and its dungeon marker never depend on a bridge cycle.
    for (const id of ['tp.gardens', 'tp.halls', 'tp.base', 'tp.heart']) {
      const t = THE_CORE.teleporters.find((x) => x.id === id)!;
      expect(reach(t.x, t.z), id).toBe(true);
    }
    expect(reach(...(Object.values(THE_CORE.pois.find((p) => p.id === 'core.dungeon.halls')!).slice(2, 4) as [number, number]))).toBe(true);
  });
});

describe('Hanging Gardens: islands and energy bridges', () => {
  it('walks only on islands and bridges; the rest is a drop that bolts can cross', () => {
    setBridges(grid, 0.5);
    for (const i of ISLANDS) expect(walkableAt(grid, i.x, i.z), i.id).toBe(true);
    const a = island('g5');
    const b = island('g6');
    // Between two islands off any bridge: air, not rock.
    const gx = (a.x + b.x) / 2 + 40;
    const gz = (a.z + b.z) / 2 - 20;
    expect(walkableAt(grid, gx, gz)).toBe(false);
    expect(airAt(grid, gx, gz)).toBe(true);
    // A bridge is walkable along its length.
    const m = mid('core.bridge.g4g5');
    expect(walkableAt(grid, m.x, m.z)).toBe(true);
  });

  it('cycles the planned way: 8 s on (the last second flickering), 3 s off', () => {
    const cycle = bridgeById('core.bridge.g1g2').cycle!;
    expect(cycle).toMatchObject({ on: 8, off: 3, flicker: 1 });
    const at = (t: number) => bridgeState({ ...cycle, offset: 0 }, t);
    expect(at(0)).toEqual({ on: true, flicker: false });
    expect(at(6.9)).toEqual({ on: true, flicker: false });
    expect(at(7.5)).toEqual({ on: true, flicker: true });
    expect(at(8.1)).toEqual({ on: false, flicker: false });
    expect(at(10.9).on).toBe(false);
    expect(at(11.1).on).toBe(true);
    // The offset shifts the phase; always-on bridges never change.
    expect(bridgeState({ ...cycle, offset: 5 }, 4).on).toBe(false);
    expect(bridgeState(undefined, 123.4)).toEqual({ on: true, flicker: false });
    expect(BRIDGES.filter((b) => b.cycle).length).toBeGreaterThanOrEqual(2);
    expect(BRIDGES.filter((b) => !b.cycle).length).toBeGreaterThan(BRIDGES.filter((b) => b.cycle).length);
  });

  it('removes a switched-off bridge from the walkable ground, and brings it back', () => {
    const m = mid('core.bridge.g1g2');
    setBridges(grid, 1);
    expect(walkableAt(grid, m.x, m.z)).toBe(true);
    const off = setBridges(grid, 9);
    expect(off?.map((b) => b.def.id)).toContain('core.bridge.g1g2');
    expect(walkableAt(grid, m.x, m.z)).toBe(false);
    expect(airAt(grid, m.x, m.z)).toBe(true);
    setBridges(grid, 12);
    expect(walkableAt(grid, m.x, m.z)).toBe(true);
  });

  it('puts whoever stands on a bridge when it goes off on the nearest island edge, unharmed', () => {
    const m = mid('core.bridge.g1g2');
    const { world, ctx, player } = inCore(m.x, m.z);
    const enemy = spawnEnemy(world, 'infected_colonist', m.x + 2, m.z, { level: 40 });
    const hp = world.req(player, Health).current;
    ctx.time = 1;
    run(world, ctx, [bridgeSystem, rockSystem], 2);
    expect(walkableAt(grid, m.x, m.z)).toBe(true);
    expect(world.req(player, Transform).x).toBeCloseTo(m.x, 0);
    ctx.time = 8.9;
    run(world, ctx, [bridgeSystem, rockSystem], 30);
    expect(walkableAt(grid, m.x, m.z)).toBe(false);
    for (const e of [player, enemy]) {
      const tr = world.req(e, Transform);
      expect(walkableAt(grid, tr.x, tr.z)).toBe(true);
      // Within a couple of cells of an island’s rim.
      const near = ISLANDS.some((i) => Math.hypot(tr.x - i.x, tr.z - i.z) < i.radius + 3);
      expect(near).toBe(true);
    }
    expect(world.req(player, Health).current).toBe(hp);
    expect(world.req(enemy, Health).current).toBe(world.req(enemy, Health).max);
    // It stays off for its 3 s and nobody can walk back on.
    expect(walkableAt(grid, m.x, m.z)).toBe(false);
  });
});

describe('Unstable Gravity', () => {
  const G = CORE_TUNING.gravity;
  const garden = gravity('core.gravity.garden.0');
  const heart = gravity('core.gravity.heart.0');

  it('is data on the zone: circles and rects in the Gardens and the Heart', () => {
    const fields = gravityFields(THE_CORE);
    expect(fields.length).toBeGreaterThanOrEqual(8);
    expect(fields.filter((f) => f.mode === 'abyss').every((f) => f.x < 0)).toBe(true);
    expect(fields.filter((f) => f.mode === 'rotate').every((f) => f.z > 400)).toBe(true);
    expect(fields.some((f) => f.rect)).toBe(true);
    expect(fields.some((f) => !f.rect)).toBe(true);
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
  });

  it('shimmers for 1.5 s, then pulls for 4 s, at the end of every period', () => {
    expect([G.shimmer, G.pull]).toEqual([1.5, 4]);
    const p = garden.period;
    const idleEnd = p - G.shimmer - G.pull;
    const at = (t: number) => gravityPhase(garden, t - garden.offset).phase;
    expect(at(0.5)).toBe('idle');
    expect(at(idleEnd - 0.01)).toBe('idle');
    expect(at(idleEnd + 0.01)).toBe('shimmer');
    expect(at(idleEnd + G.shimmer - 0.01)).toBe('shimmer');
    expect(at(idleEnd + G.shimmer + 0.01)).toBe('pull');
    expect(at(p - 0.01)).toBe('pull');
    expect(at(p + 0.5)).toBe('idle');
    expect(gravityPhase(garden, 3 * p - garden.offset + 1).cycle).toBe(3);
  });

  it('pulls Gardens fields towards the nearest drop and Heart fields along a heading that turns each cycle', () => {
    const t = garden.period - 1 - garden.offset;
    const isl = island('g3');
    expect(inGravityField(garden, isl.x, isl.z)).toBe(true);
    const p = gravityPull(garden, t, isl.x + 8, isl.z, grid);
    expect(p.phase).toBe('pull');
    expect(Math.hypot(p.dx, p.dz)).toBeCloseTo(1, 5);
    // Following the pull from the island's middle ends at the drop.
    let px = isl.x + 8;
    let pz = isl.z;
    for (let i = 0; i < 80 && walkableAt(grid, px, pz); i++) {
      const q = gravityPull({ ...garden, radius: 1e6 }, t, px, pz, grid);
      px += q.dx * 2;
      pz += q.dz * 2;
    }
    expect(airAt(grid, px, pz) || !walkableAt(grid, px, pz)).toBe(true);
    // Heart fields rotate a quarter turn per cycle.
    const t0 = heart.period - 1;
    const a0 = gravityPull(heart, t0, heart.x, heart.z);
    const a1 = gravityPull(heart, t0 + heart.period, heart.x, heart.z);
    expect([a0.dx, a0.dz].map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 1]);
    expect(a1.dx).toBeCloseTo(1, 5);
    expect(a1.dz).toBeCloseTo(0, 5);
    // No pull outside the field, while idle or while it only shimmers.
    expect(gravityPull(heart, t0, heart.x + 500, heart.z)).toMatchObject({ dx: 0, dz: 0 });
    expect(gravityPull(heart, 1, heart.x, heart.z)).toMatchObject({ phase: 'idle', dx: 0, dz: 0 });
    expect(gravityPull(heart, heart.period - G.pull - 0.5, heart.x, heart.z)).toMatchObject({ phase: 'shimmer', dx: 0, dz: 0 });
    // Rect fields are rectangles.
    const rect = gravity('core.gravity.heart.1');
    expect(inGravityField(rect, rect.x + 27, rect.z + 17)).toBe(true);
    expect(inGravityField(rect, rect.x + 29, rect.z)).toBe(false);
    expect(inGravityField(rect, rect.x, rect.z + 19)).toBe(false);
    // Deterministic.
    expect(gravityPull(rect, 123.4, rect.x, rect.z)).toEqual(gravityPull(rect, 123.4, rect.x, rect.z));
  });

  it('shows one shimmer per cycle, then drifts player and enemies at a third of their walking speed', () => {
    const { world, ctx, player } = inCore(heart.x, heart.z);
    world.req(player, Mover).speed = speed;
    const enemy = spawnEnemy(world, 'infected_colonist', heart.x + 6, heart.z + 6, { level: 45 });
    const enemySpeed = world.req(enemy, Mover).speed;
    const idleEnd = heart.period - G.shimmer - G.pull;
    // Idle: nothing happens.
    ctx.time = 1;
    run(world, ctx, [gravitySystem], 30);
    expect(ctx.events.drain().filter((e) => e.type === 'telegraph')).toHaveLength(0);
    expect(world.req(player, Transform).z).toBe(heart.z);
    // Shimmer: telegraph once (not every frame), no movement yet.
    ctx.time = idleEnd + 0.01;
    run(world, ctx, [gravitySystem], 60);
    const shown = ctx.events.drain().filter((e) => e.type === 'telegraph');
    const mine = shown.filter((e) => e.type === 'telegraph' && e.x === heart.x && e.z === heart.z);
    expect(mine).toHaveLength(1);
    expect(world.req(player, Transform).z).toBe(heart.z);
    // Pull (first cycle heads +z): about speed / 3 for the time spent in it.
    const z0 = world.req(player, Transform).z;
    const ez0 = world.req(enemy, Transform).z;
    ctx.time = idleEnd + G.shimmer + 0.001;
    run(world, ctx, [gravitySystem], 60);
    expect(world.req(player, Transform).z - z0).toBeCloseTo(speed / 3, 1);
    expect(world.req(enemy, Transform).z - ez0).toBeCloseTo(enemySpeed / 3, 1);
    // One cycle on, the pull heads east.
    const x1 = world.req(player, Transform).x;
    ctx.time = heart.period + idleEnd + G.shimmer + 0.001;
    run(world, ctx, [gravitySystem], 60);
    expect(world.req(player, Transform).x - x1).toBeCloseTo(speed / 3, 1);
  });

  it('does not push anyone through a wall or off an island (the edge still blocks)', () => {
    const isl = island('g3');
    const field = { ...garden };
    // Stand just inside the rim at the point nearest the drop and let the pull run its full 4 s, several times.
    let x = isl.x + isl.radius - 4;
    const z = isl.z;
    while (!walkableAt(grid, x, z)) x -= 1;
    const { world, ctx, player } = inCore(x, z);
    world.req(player, Mover).speed = speed;
    for (let cycle = 0; cycle < 3; cycle++) {
      ctx.time = field.period * cycle + field.period - G.pull - G.shimmer - field.offset + G.shimmer + 0.01;
      run(world, ctx, [gravitySystem, rockSystem], 60 * G.pull);
      const tr = world.req(player, Transform);
      expect(walkableAt(grid, tr.x, tr.z), `cycle ${cycle}`).toBe(true);
    }
  });

  it('curves bolts inside a pulling field', () => {
    const { world, ctx } = inCore(heart.x, heart.z - 30);
    const bolt = world.create();
    world.add(bolt, Transform, { x: heart.x, y: 1, z: heart.z, facing: 0, prevX: heart.x, prevY: 1, prevZ: heart.z, prevFacing: 0 });
    world.add(bolt, Projectile, { team: 'enemy', vx: 0, vz: 10, radius: 0.2, remaining: 5, damage: 1, damageType: 'physical', attackerLevel: 1, owner: bolt });
    ctx.time = heart.period - 1;
    run(world, ctx, [gravitySystem], 30);
    const p = world.req(bolt, Projectile);
    // First cycle heads +z: the bolt speeds up along its path; one cycle later it bends sideways.
    expect(p.vz).toBeGreaterThan(10);
    ctx.time = heart.period * 2 - 1;
    const q = world.req(bolt, Projectile);
    q.vx = 0;
    q.vz = 10;
    run(world, ctx, [gravitySystem], 30);
    expect(q.vx).toBeGreaterThan(0.5);
    expect(Math.abs(q.vx)).toBeLessThan(G.boltAccel);
  });

  it('leaves flyers and the dead alone, and fields far from the player quiet', () => {
    const { world, ctx, player } = inCore(heart.x, heart.z);
    const flyer = spawnEnemy(world, 'security_drone', heart.x + 3, heart.z + 3, { level: 45 });
    const col = world.get(flyer, Collider);
    if (col) col.layer = 'air';
    ctx.time = heart.period - 1;
    const z0 = world.req(flyer, Transform).z;
    run(world, ctx, [gravitySystem], 30);
    expect(world.req(flyer, Transform).z).toBe(z0);
    expect(world.req(player, Transform).z).toBeGreaterThan(heart.z);
    // Far away from the Heart nothing is evaluated.
    moveTo(world, player, 0, -400);
    const z1 = world.req(player, Transform).z;
    run(world, ctx, [gravitySystem], 30);
    expect(world.req(player, Transform).z).toBe(z1);
  });
});
