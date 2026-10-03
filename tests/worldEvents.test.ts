import { describe, expect, it } from 'vitest';
import { AccountBonuses, Dead, EnemyAI, Health, Interactable, Progression, Targetable, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { kill } from '../src/systems/combat';
import { movementSystem } from '../src/systems/movement';
import { createQuestRuntime } from '../src/systems/quests';
import { RESTORATION, grantRestorationPoints, restorationBonuses, restorationSystem, tierFor } from '../src/systems/restoration';
import { stormSystem } from '../src/world/storm';
import { EVENT_TUNING, eventInteract, worldEventSystem } from '../src/world/worldEvents';
import { spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function setup() {
  const world = new World();
  const zone = createZoneRuntime(CINDER_FLATS);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, ctx, zone, player };
}

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

function startEvent(id: string) {
  const s = setup();
  const ev = s.zone.events.get(id)!;
  moveTo(s.world, s.player, ev.x + 5, ev.z);
  run(s.world, s.ctx, [worldEventSystem]);
  expect(ev.state).toBe('active');
  return { ...s, ev };
}

const killAll = (world: World, ctx: ReturnType<typeof makeCtx>) => {
  for (const e of world.query(EnemyAI)) if (!world.has(e, Dead)) kill(world, ctx, e, 0);
};

describe('world events', () => {
  it('Cinder Flats has six events', () => {
    expect(setup().zone.events.size).toBe(6);
  });

  it('Purge the Spore Nest: a fast kill is Gold; a hatched nest fails', () => {
    const a = startEvent('event.sporeNest');
    const nest = a.world.query(Targetable)[0]!;
    run(a.world, a.ctx, [worldEventSystem], 60 * 10);
    kill(a.world, a.ctx, nest, 0);
    run(a.world, a.ctx, [worldEventSystem]);
    expect(a.ev.result).toBe('gold');
    expect(a.ctx.rewards).toContainEqual(expect.objectContaining({ table: 'dt.event_gold' }));
    expect(a.ctx.account!.restoration['zone.cinder_flats']!.points).toContain('event:event.sporeNest');

    const b = startEvent('event.sporeNest');
    run(b.world, b.ctx, [worldEventSystem], 60 * (EVENT_TUNING.sporeNest.hatch + 1));
    expect(b.ev.result).toBe('failed');
  });

  it('Rescue Operation: two of three survivors in time is Silver', () => {
    const { world, ctx, ev } = startEvent('event.rescue');
    const survivors = world.query(Interactable).filter((e) => world.req(e, Interactable).kind === 'eventObject');
    expect(survivors).toHaveLength(3);
    for (const s of survivors.slice(0, 2)) eventInteract(world, ctx, s, world.req(s, Interactable));
    run(world, ctx, [worldEventSystem], 60 * (EVENT_TUNING.rescue.time + 1));
    expect(ev.result).toBe('silver');
  });

  it('Supply Drop: contested while scavengers are close, then claimed', () => {
    const { world, ctx, ev, player } = startEvent('event.supplyDrop');
    run(world, ctx, [worldEventSystem], 60 * (EVENT_TUNING.supplyDrop.land + 0.5));
    const crate = world.query(Interactable).find((e) => world.req(e, Interactable).kind === 'eventObject')!;
    // Pull a scavenger onto the crate.
    const guard = world.query(EnemyAI)[0]!;
    moveTo(world, guard, ev.x + 1, ev.z);
    expect(eventInteract(world, ctx, crate, world.req(crate, Interactable))).toBe(false);
    killAll(world, ctx);
    moveTo(world, player, ev.x + 1, ev.z);
    expect(eventInteract(world, ctx, crate, world.req(crate, Interactable))).toBe(true);
    expect(ev.result).toBe('gold');
  });

  it('Elite Hunt: the elite escapes if you are too slow', () => {
    const { world, ctx, ev } = startEvent('event.eliteHunt');
    run(world, ctx, [worldEventSystem], 60 * (EVENT_TUNING.eliteHunt.time + 1));
    expect(ev.result).toBe('failed');
  });

  it('Defend the Convoy: escorting an unhurt truck to the end is Gold', () => {
    const { world, ctx, ev, player } = startEvent('event.convoy');
    const truck = ev.objects[0]!;
    for (let i = 0; i < 60 * 80 && ev.state === 'active'; i++) {
      const tr = world.req(truck, Transform);
      moveTo(world, player, tr.x + 3, tr.z);
      killAll(world, ctx);
      run(world, ctx, [worldEventSystem, movementSystem]);
    }
    expect(ev.result).toBe('gold');
  });

  it('Signal Jam: the transmitter has to survive the timer', () => {
    const { world, ctx, ev } = startEvent('event.signalJam');
    const tower = ev.objects[0]!;
    world.req(tower, Health).current *= 0.5;
    run(world, ctx, [worldEventSystem], 60 * (EVENT_TUNING.signalJam.time + 1));
    expect(ev.result).toBe('silver');
  });
});

describe('Ash Storm', () => {
  it('warns, rolls over a subzone and thickens around a player inside it', () => {
    const { world, ctx, zone, player } = setup();
    ctx.rng.chance = () => true; // always Ash Valley
    zone.storm.timer = 0;
    run(world, ctx, [stormSystem]);
    expect(zone.storm.state).toBe('warning');
    expect(zone.storm.subzone).toBe('ashValley');
    run(world, ctx, [stormSystem], 60 * 6);
    expect(zone.storm.state).toBe('active');
    const valley = zone.def.subzones.find((z) => z.id === 'ashValley')!;
    moveTo(world, player, valley.center[0], valley.center[1]);
    run(world, ctx, [stormSystem], 60 * 3);
    expect(zone.storm.exposure).toBe(1);
  });
});

describe('Region Restoration', () => {
  it('fills tiers from points and pays account-wide rewards once per character', () => {
    const { world, ctx, zone, player } = setup();
    expect(tierFor(4)).toBe(0);
    expect(tierFor(RESTORATION.tiers[1]!)).toBe(2);
    for (const tp of zone.def.teleporters) zone.discovered.add(tp.id);
    ctx.account!.restoration['zone.cinder_flats'] = { points: ['quest:a#0', 'quest:b#0', 'quest:c#0', 'quest:d#0', 'quest:e#0', 'quest:f#0', 'quest:g#0'], tiers: 0 };
    world.add(player, AccountBonuses, { effects: [] });
    const sp = world.req(player, Progression).skillPoints;
    run(world, ctx, [restorationSystem]);
    const entry = ctx.account!.restoration['zone.cinder_flats']!;
    expect(entry.points.filter((p) => p.startsWith('tp:'))).toHaveLength(5);
    expect(entry.tiers).toBe(2);
    expect(restorationBonuses(ctx.account!)).toMatchObject({ skillPoints: 1, potionCharges: 1 });
    expect(world.req(player, AccountBonuses).potionCharges).toBe(1);
    expect(world.req(player, Progression).skillPoints).toBe(sp + 1);
    grantRestorationPoints(world, ctx.account!);
    expect(world.req(player, Progression).skillPoints).toBe(sp + 1);
  });
});
