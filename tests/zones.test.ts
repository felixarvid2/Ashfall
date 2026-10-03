import { describe, expect, it } from 'vitest';
import { Dead, EnemyAI, Health, Npc, StatusEffects, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import type { GameContext } from '../src/core/context';
import { ZONES, zoneDef, zoneOfTeleporter } from '../src/data/zones';
import { CINDER_FLATS, CINDER_GATE } from '../src/data/zones/cinderFlats';
import { DISTRICT_ENV, DISTRICT_GATE, REFINERY_DISTRICT } from '../src/data/zones/refineryDistrict';
import type { EnvFeature } from '../src/data/zones/zoneTypes';
import { NPCS } from '../src/data/quests/db';
import { questMarkers, questSystem, createQuestRuntime, rebuildQuestWorld, setQuestState } from '../src/systems/quests';
import { environmentSystem, ENV_TUNING, inMolten, resetEnvironment } from '../src/world/environment';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime, suspendZone, zoneSystem } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function place(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

describe('zones', () => {
  it('lists the regions in order with unique ids', () => {
    expect(ZONES.map((z) => z.id)).toEqual(['zone.cinder_flats', 'zone.refinery_district', 'zone.hydroponic_vaults']);
    expect(ZONES.map((z) => z.region)).toEqual([1, 2, 3]);
    expect(zoneOfTeleporter('tp.coolant')?.id).toBe('zone.refinery_district');
    expect(zoneOfTeleporter('tp.ember')?.id).toBe('zone.cinder_flats');
    expect(REFINERY_DISTRICT.levels).toEqual([10, 20]);
  });

  it('connects Cinder Flats and the district through paired gates at the end of a road', () => {
    expect(CINDER_GATE.to).toEqual({ zone: REFINERY_DISTRICT.id, gate: DISTRICT_GATE.id });
    expect(DISTRICT_GATE.to).toEqual({ zone: CINDER_FLATS.id, gate: CINDER_GATE.id });
    for (const [zone, gate] of [[CINDER_FLATS, CINDER_GATE], [REFINERY_DISTRICT, DISTRICT_GATE]] as const) {
      // Some road reaches the gate.
      const ends = zone.roads.flatMap((r) => [r.points[0]!, r.points[r.points.length - 1]!]);
      expect(Math.min(...ends.map(([x, z]) => Math.hypot(x - gate.x, z - gate.z)))).toBeLessThan(gate.radius);
      expect(zoneDef(gate.to.zone).id).not.toBe(zone.id);
    }
  });

  it('fires a gate event once, and not again until the player has stepped away', () => {
    // The zone system ticks every 0.25 s, so each step runs 20 frames.
    const world = new World();
    const zone = createZoneRuntime(CINDER_FLATS);
    const ctx = makeCtx({ zone, worldHalfSize: zone.def.halfSize });
    const player = spawnPlayer(world, 'bastion', CINDER_GATE.arrive.x, CINDER_GATE.arrive.z);
    run(world, ctx, [zoneSystem], 20);
    place(world, player, CINDER_GATE.x, CINDER_GATE.z);
    run(world, ctx, [zoneSystem], 20);
    let gates = ctx.events.drain().filter((e) => e.type === 'zoneGate');
    expect(gates).toEqual([{ type: 'zoneGate', gate: CINDER_GATE.id }]);
    // Standing in it does not fire again…
    run(world, ctx, [zoneSystem], 40);
    expect(ctx.events.drain().filter((e) => e.type === 'zoneGate')).toHaveLength(0);
    // …arriving back (gateReady false after suspend) does not either, until you leave and return.
    suspendZone(zone);
    run(world, ctx, [zoneSystem], 20);
    expect(ctx.events.drain().filter((e) => e.type === 'zoneGate')).toHaveLength(0);
    place(world, player, CINDER_GATE.arrive.x, CINDER_GATE.arrive.z);
    run(world, ctx, [zoneSystem], 20);
    place(world, player, CINDER_GATE.x, CINDER_GATE.z);
    run(world, ctx, [zoneSystem], 20);
    gates = ctx.events.drain().filter((e) => e.type === 'zoneGate');
    expect(gates).toHaveLength(1);
  });
});

describe('Refinery District layout', () => {
  const env = DISTRICT_ENV;
  const belts = env.filter((f) => f.kind === 'conveyor');
  const molten = env.filter((f) => f.kind === 'molten');
  const vents = env.filter((f) => f.kind === 'vent');

  it('has belts, molten metal and vents', () => {
    expect(belts.length).toBeGreaterThan(10);
    expect(molten.length).toBeGreaterThan(40);
    expect(vents.length).toBeGreaterThan(20);
  });

  it('keeps roads, teleporters, the hub and points of interest out of molten metal', () => {
    for (const road of REFINERY_DISTRICT.roads) {
      for (const [x, z] of road.points) expect(inMolten(env, x, z), `${road.id} at ${x},${z}`).toBeNull();
    }
    for (const tp of REFINERY_DISTRICT.teleporters) expect(inMolten(env, tp.x, tp.z, 2)).toBeNull();
    for (const poi of REFINERY_DISTRICT.pois) expect(inMolten(env, poi.x, poi.z, 1), poi.id).toBeNull();
    for (const h of REFINERY_DISTRICT.hubs) expect(inMolten(env, h.x, h.z, h.radius)).toBeNull();
  });

  it('has the planned points of interest', () => {
    const count = (kind: string) => REFINERY_DISTRICT.pois.filter((p) => p.kind === kind).length;
    expect(count('relic')).toBe(10);
    expect(count('lore')).toBe(12);
    expect(count('signalTower')).toBe(3);
    expect(count('pylon')).toBe(6);
    expect(count('bunker')).toBe(6);
    expect(count('lockedChest')).toBe(6);
    expect(count('dungeon')).toBe(4);
    expect(count('event')).toBe(6);
    expect(count('stronghold')).toBe(1);
    expect(count('boss')).toBe(1);
    // The Crane and three coolant valves.
    expect(count('feature')).toBe(4);
    expect(REFINERY_DISTRICT.teleporters).toHaveLength(7);
    expect(REFINERY_DISTRICT.pois.every((p) => p.id.startsWith('rd.'))).toBe(true);
  });
});

describe('environment', () => {
  function setup(features: EnvFeature[]) {
    resetEnvironment();
    const world = new World();
    const zone = createZoneRuntime({ ...REFINERY_DISTRICT, env: features });
    const ctx = makeCtx({ zone, worldHalfSize: zone.def.halfSize });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    return { world, ctx, player };
  }

  it('carries whoever stands on a belt along it', () => {
    const { world, ctx, player } = setup([{ kind: 'conveyor', id: 'b', x: 0, z: 0, length: 40, width: 4, dir: Math.PI / 2, speed: 3 }]);
    run(world, ctx, [environmentSystem], 30);
    const tr = world.req(player, Transform);
    expect(tr.x).toBeGreaterThan(1.2);
    expect(Math.abs(tr.z)).toBeLessThan(0.01);
    // Off the belt nothing moves.
    place(world, player, 0, 5);
    run(world, ctx, [environmentSystem], 30);
    expect(world.req(player, Transform).x).toBe(0);
  });

  it('burns everyone in molten metal and pushes enemies back out', () => {
    const { world, ctx, player } = setup([{ kind: 'molten', id: 'm', x: 0, z: 0, radius: 5 }]);
    const enemy = spawnEnemy(world, 'infected_colonist', 2, 0, { level: 10 });
    const life = world.req(player, Health).current;
    const enemyLife = world.req(enemy, Health).current;
    run(world, ctx, [environmentSystem], 60);
    expect(world.req(player, Health).current).toBeLessThan(life);
    expect(world.req(player, Health).current).toBeGreaterThan(life * (1 - ENV_TUNING.moltenPct * 1.2));
    expect(world.req(enemy, Health).current).toBeLessThan(enemyLife);
    // The enemy walked out to the shore; the player did not move.
    expect(Math.hypot(world.req(enemy, Transform).x, world.req(enemy, Transform).z)).toBeGreaterThanOrEqual(5);
    expect(world.req(player, Transform).x).toBe(0);
  });

  it('warns before a vent blasts, then hits player and enemies alike', () => {
    const { world, ctx, player } = setup([{ kind: 'vent', id: 'v', x: 0, z: 0, radius: 3, period: 4, offset: 0, element: 'fire' }]);
    const enemy = spawnEnemy(world, 'infected_colonist', 1, 1, { level: 10 });
    world.req(enemy, EnemyAI).aggro = false;
    const life = world.req(player, Health).current;
    const telegraphs: number[] = [];
    let blastAt = -1;
    const c = ctx as GameContext;
    for (let i = 0; i < 60 * 9; i++) {
      run(world, c, [environmentSystem], 1);
      for (const e of c.events.drain()) {
        if (e.type === 'telegraph') telegraphs.push(c.time);
        if (e.type === 'vfx' && blastAt < 0) blastAt = c.time;
      }
    }
    expect(telegraphs.length).toBeGreaterThan(0);
    expect(blastAt).toBeGreaterThan(telegraphs[0]!);
    expect(blastAt - telegraphs[0]!).toBeGreaterThan(ENV_TUNING.ventWarning - 0.1);
    expect(world.req(player, Health).current).toBeLessThan(life);
    expect(world.req(enemy, StatusEffects).list.some((s) => s.id === 'burning') || world.has(enemy, Dead)).toBe(true);
  });
});

describe('quests across zones', () => {
  function setup(inDistrict: boolean) {
    const world = new World();
    const flats = createZoneRuntime(CINDER_FLATS);
    const district = createZoneRuntime(REFINERY_DISTRICT);
    const zones = new Map([[flats.def.id, flats], [district.def.id, district]]);
    const zone = inDistrict ? district : flats;
    const ctx = makeCtx({ zone, zones, quests: createQuestRuntime(), worldHalfSize: zone.def.halfSize });
    const spawn = inDistrict ? DISTRICT_GATE.arrive : CINDER_FLATS.playerSpawn;
    const player = spawnPlayer(world, 'bastion', spawn.x, spawn.z);
    return { world, ctx, player, flats };
  }

  it("spawns each region's NPCs only in that region", () => {
    for (const inDistrict of [false, true]) {
      const { world, ctx } = setup(inDistrict);
      rebuildQuestWorld(world, ctx);
      const ids = world.query(Npc).map((e) => world.req(e, Npc).id);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(NPCS.get(id)!.zone, id).toBe(inDistrict ? 'zone.refinery_district' : 'zone.cinder_flats');
      // Osei only arrives once Pump Station Delta is reclaimed.
      expect(ids.includes('osei')).toBe(false);
    }
  });

  it('does not progress a step from another zone, and points at the border gate instead', () => {
    const { world, ctx, player } = setup(true);
    setQuestState(ctx.quests!, { active: { 'mq.wake_up': { step: 0, progress: 0 } }, done: {}, tracked: 'mq.wake_up' });
    rebuildQuestWorld(world, ctx);
    // Standing on the reach step's coordinates, but in the wrong zone.
    place(world, player, -275 * 2.2, -160 * 2.2);
    run(world, ctx, [questSystem], 2);
    expect(ctx.quests!.active.get('mq.wake_up')!.step).toBe(0);
    expect(questMarkers(world, ctx)).toEqual([{ quest: 'mq.wake_up', x: DISTRICT_GATE.x, z: DISTRICT_GATE.z, main: true }]);
  });

  it('checks discover steps against the zone the teleporter is in', () => {
    const { world, ctx, flats } = setup(true);
    setQuestState(ctx.quests!, { active: { 'mq.wake_up': { step: 2, progress: 0 } }, done: {}, tracked: 'mq.wake_up' });
    run(world, ctx, [questSystem], 1);
    expect(ctx.quests!.active.has('mq.wake_up')).toBe(true);
    flats.discovered.add('tp.impact');
    run(world, ctx, [questSystem], 1);
    expect(ctx.quests!.done.has('mq.wake_up')).toBe(true);
  });
});
