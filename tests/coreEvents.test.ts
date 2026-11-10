import { describe, expect, it } from 'vitest';
import { Dead, EnemyAI, Health, Interactable, Mover, Projectile, Targetable, Transform, makeTransform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { caveGrid, bridgeLook, setBridges } from '../src/data/zones/caves';
import { THE_CORE } from '../src/data/zones/theCore';
import { kill } from '../src/systems/combat';
import { createQuestRuntime } from '../src/systems/quests';
import { CORE_EVENT_TUNING, CORE_EVENT_TYPES, stormFields } from '../src/world/coreEvents';
import { eventInteract, worldEventSystem, activeEvent } from '../src/world/worldEvents';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { bridgeSystem } from '../src/world/theCore';
import { makeCtx, run } from './helpers';
import en from '../src/data/lang/en.json';

function setup() {
  const world = new World();
  const zone = createZoneRuntime(THE_CORE);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize, zoneLevels: [40, 50] });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, ctx, zone, player };
}
function start(key: string) {
  const s = setup();
  const ev = s.zone.events.get(`core.event.${key}`)!;
  expect(ev, key).toBeDefined();
  const tr = s.world.req(s.player, Transform);
  tr.x = tr.prevX = ev.x + 3;
  tr.z = tr.prevZ = ev.z;
  run(s.world, s.ctx, [worldEventSystem], 1);
  expect(ev.state).toBe('active');
  return { ...s, ev, tr };
}

describe('Core events exist', () => {
  it('the Core has the four new events with titles and objectives', () => {
    const zone = createZoneRuntime(THE_CORE);
    for (const type of CORE_EVENT_TYPES) {
      expect([...zone.events.values()].some((e) => e.type === type), type).toBe(true);
      const strings = (en.worldEvents as unknown as Record<string, Record<string, string>>)[type]!;
      expect(strings.title).toBeTruthy();
      expect(strings.objective).toBeTruthy();
    }
    expect(zone.events.size).toBe(9);
  });
});

describe('A01 Collapsing Bridge', () => {
  const T = CORE_EVENT_TUNING.bridgeCollapse;
  const bridgeOnGrid = () => caveGrid(THE_CORE)!.bridges!.find((b) => b.def.id === T.id)!;
  function onTheBridge() {
    const s = setup();
    const ev = s.zone.events.get('core.event.bridgeCollapse')!;
    const b = bridgeOnGrid();
    delete b.collapse;
    setBridges(caveGrid(THE_CORE)!, 0);
    // A point on the strip a little towards `a` from the middle.
    const k = b.cells[Math.floor(b.cells.length / 2)]!;
    const grid = caveGrid(THE_CORE)!;
    const x = ((k % grid.n) + 0.5) * grid.cell - grid.half;
    const z = (Math.floor(k / grid.n) + 0.5) * grid.cell - grid.half;
    const tr = s.world.req(s.player, Transform);
    Object.assign(tr, makeTransform(x, 0, z, 0));
    run(s.world, s.ctx, [worldEventSystem], 1);
    expect(ev.state).toBe('active');
    return { ...s, ev, b, tr, near: ev.banked === 0 ? b.def.a : b.def.b, far: ev.banked === 0 ? b.def.b : b.def.a };
  }

  it('does not start from the island, only out on the bridge', () => {
    const s = setup();
    const ev = s.zone.events.get('core.event.bridgeCollapse')!;
    const tr = s.world.req(s.player, Transform);
    tr.x = tr.prevX = bridgeOnGrid().def.a[0];
    tr.z = tr.prevZ = bridgeOnGrid().def.a[1];
    run(s.world, s.ctx, [worldEventSystem], 1);
    expect(ev.state).toBe('idle');
  });

  it('gives way after the crackle: fall damage, back at the near end, rebuilt after 30 s', () => {
    const { world, ctx, player, ev, b, tr, near } = onTheBridge();
    expect(bridgeLook(b, ctx.time).flicker).toBe(true);
    const hp = world.req(player, Health);
    const before = hp.current;
    ctx.time = 100;
    b.collapse!.warnUntil = ctx.time + T.warn;
    run(world, ctx, [worldEventSystem, bridgeSystem], Math.ceil(60 * T.warn) + 2);
    expect(ev.result).toBe('failed');
    expect(hp.current).toBeLessThan(before);
    expect(Math.hypot(tr.x - near[0], tr.z - near[1])).toBeLessThan(2);
    expect(bridgeLook(b, ctx.time).on).toBe(false);
    expect(b.on).toBe(false);
    // Down for 30 s, then back.
    ctx.time += T.down - 5;
    setBridges(caveGrid(THE_CORE)!, ctx.time);
    expect(b.on).toBe(false);
    ctx.time += 6;
    setBridges(caveGrid(THE_CORE)!, ctx.time);
    expect(b.on).toBe(true);
  });

  it('reaching the far island before it gives way earns a reward and no fall', () => {
    const { world, ctx, player, ev, b, tr, far } = onTheBridge();
    const hp = world.req(player, Health);
    const before = hp.current;
    Object.assign(tr, makeTransform(far[0], 0, far[1], 0));
    run(world, ctx, [worldEventSystem], 2);
    expect(ev.result).toBe('gold');
    expect(hp.current).toBeGreaterThanOrEqual(before);
    expect(b.collapse).toBeUndefined();
    expect(ctx.rewards.some((r) => r.table === 'dt.event_gold')).toBe(true);
  });
});

describe('A02 Choir Awakening', () => {
  const T = CORE_EVENT_TUNING.choirAwakening;
  it('singers wake in waves round the stone; breaking it ends the event by time', () => {
    const { world, ctx, ev } = start('choirAwakening');
    const stoneE = ev.objects[0]!;
    expect(world.has(stoneE, Targetable)).toBe(true);
    run(world, ctx, [worldEventSystem], 60 * (T.every * 2 + 4));
    const singers = world.query(EnemyAI).filter((e) => world.req(e, EnemyAI).defId === 'choir_singer');
    expect(singers.length).toBeGreaterThanOrEqual(T.singers * 2);
    kill(world, ctx, stoneE, 0);
    run(world, ctx, [worldEventSystem], 1);
    expect(ev.result).toBe('gold');
  });
  it('a stone left standing silences the event', () => {
    const { world, ctx, ev } = start('choirAwakening');
    run(world, ctx, [worldEventSystem], 60 * (T.time + 1));
    expect(ev.result).toBe('failed');
    expect(world.query(EnemyAI).length).toBeGreaterThan(0);
  });
  it('a slow win is only Bronze', () => {
    const { world, ctx, ev } = start('choirAwakening');
    run(world, ctx, [worldEventSystem], 60 * (T.silver + 2));
    kill(world, ctx, ev.objects[0]!, 0);
    run(world, ctx, [worldEventSystem], 1);
    expect(ev.result).toBe('bronze');
  });
});

describe('A03 Memory Surge', () => {
  const T = CORE_EVENT_TUNING.memorySurge;
  it('shades pour out, and three interactions close the rift', () => {
    const { world, ctx, ev, zone } = start('memorySurge');
    const rift = ev.objects[0]!;
    run(world, ctx, [worldEventSystem], 60 * 12);
    expect(world.query(EnemyAI).length).toBeGreaterThanOrEqual(T.shades * 2);
    for (const e of world.query(EnemyAI)) expect(T.roster).toContain(world.req(e, EnemyAI).defId);
    const it = () => world.req(rift, Interactable);
    expect(eventInteract(world, ctx, rift, it())).toBe(true);
    expect(ev.progress).toBe(1);
    expect(it().readyAt).toBeGreaterThan(ctx.time);
    expect(eventInteract(world, ctx, rift, it())).toBe(true);
    expect(activeEvent(zone, ev.x, ev.z)?.text).toBe('worldEvents.memorySurge.objective');
    expect(eventInteract(world, ctx, rift, it())).toBe(true);
    run(world, ctx, [worldEventSystem], 1);
    expect(ev.result).toBe('gold');
  });
  it('it stops pouring after 60 seconds, closed or not', () => {
    const { world, ctx, ev } = start('memorySurge');
    run(world, ctx, [worldEventSystem], 60 * (T.time + 1));
    expect(ev.result).toBe('failed');
    const count = world.query(EnemyAI).length;
    run(world, ctx, [worldEventSystem], 60 * 20);
    expect(world.query(EnemyAI).length).toBe(count);
  });
});

describe('A04 Gravity Storm', () => {
  const T = CORE_EVENT_TUNING.gravityStorm;
  it('two fields drift round the centre', () => {
    const f0 = stormFields({ x: 0, z: 0 }, 0);
    const f1 = stormFields({ x: 0, z: 0 }, 10);
    expect(f0).toHaveLength(2);
    expect(Math.hypot(f0[0]!.x - f1[0]!.x, f0[0]!.z - f1[0]!.z)).toBeGreaterThan(3);
  });
  it('pulls the player and bolts that are inside a field, and ends when both anchors are broken', () => {
    const { world, ctx, ev, player, tr } = start('gravityStorm');
    expect(ev.objects).toHaveLength(T.anchors);
    const f = stormFields(ev, ev.elapsed)[0]!;
    // Stand in the field, off its centre.
    Object.assign(tr, makeTransform(f.x + 5, 0, f.z, 0));
    const d0 = Math.hypot(tr.x - f.x, tr.z - f.z);
    world.req(player, Mover).speed = 6;
    const bolt = world.create();
    world.add(bolt, Transform, makeTransform(f.x + 4, 0, f.z, 0));
    world.add(bolt, Projectile, { team: 'enemy', vx: 0, vz: 5, radius: 0.2, remaining: 5, damage: 1, damageType: 'physical', attackerLevel: 1, owner: player });
    run(world, ctx, [worldEventSystem], 12);
    const f2 = stormFields(ev, ev.elapsed)[0]!;
    expect(Math.hypot(tr.x - f2.x, tr.z - f2.z)).toBeLessThan(d0);
    expect(world.req(bolt, Projectile).vx).toBeLessThan(0);
    // Break both anchors: done.
    for (const a of ev.objects.slice(0, T.anchors)) kill(world, ctx, a, 0);
    run(world, ctx, [worldEventSystem], 1);
    expect(ev.result).toBe('gold');
    expect(world.has(player, Dead)).toBe(false);
  });
  it('one anchor is not enough', () => {
    const { world, ctx, ev } = start('gravityStorm');
    kill(world, ctx, ev.objects[0]!, 0);
    run(world, ctx, [worldEventSystem], 60);
    expect(ev.state).toBe('active');
    expect(ev.progress).toBe(1);
    run(world, ctx, [worldEventSystem], 60 * T.time);
    expect(ev.result).toBe('failed');
  });
});

void spawnEnemy;
