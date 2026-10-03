import { describe, expect, it } from 'vitest';
import { Boss, Dead, EnemyAI, Hazard, Health, Interactable, Mounted, Npc, Renderable, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { QUESTS } from '../src/data/quests/db';
import { CATHEDRAL, DELTA, REFINERY_DISTRICT, DISTRICT_ENV } from '../src/data/zones/refineryDistrict';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { bossSystem, resetBoss } from '../src/systems/boss';
import { kill } from '../src/systems/combat';
import { blastSystem, interact, spawnInteractables } from '../src/world/interactables';
import { createQuestRuntime, spawnQuestWorld } from '../src/systems/quests';
import { vehicleSystem } from '../src/systems/vehicle';
import { DELTA_TUNING } from '../src/world/districtSetPieces';
import { environmentSystem, inMolten, resetEnvironment } from '../src/world/environment';
import { buildInstance, instanceInteract, instanceSystem, roomCenter } from '../src/world/instance';
import { setPieceSystem, setPiecesOnDeath, syncSetPieces } from '../src/world/setPieces';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { worldEventSystem } from '../src/world/worldEvents';
import { createZoneRuntime, hubAt } from '../src/world/zone';
import { fakeInput, makeCtx, run } from './helpers';
import { spatialSystem } from '../src/systems/collision';

function setup(x = 0, z = 0) {
  const world = new World();
  const zone = createZoneRuntime(REFINERY_DISTRICT);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize, zoneLevels: [10, 20] });
  const player = spawnPlayer(world, 'bastion', x, z);
  syncSetPieces(world, zone);
  return { world, ctx, zone, player };
}

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

const killAll = (world: World, ctx: ReturnType<typeof makeCtx>, except: Entity[] = []) => {
  for (const e of world.query(EnemyAI)) if (!world.has(e, Dead) && !except.includes(e)) kill(world, ctx, e, 0);
};

describe('Pump Station Delta', () => {
  it('four waves around the technicians, then Brother Ash; reclaimed it is a hub with a teleporter', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, DELTA.x + 15, DELTA.z);
    run(world, ctx, [setPieceSystem]);
    const st = zone.setPieces.district!.delta;
    expect(st.state).toBe('defend');
    expect(st.technicians).toHaveLength(3);
    for (let w = 0; w < DELTA_TUNING.waves.length; w++) {
      run(world, ctx, [setPieceSystem], 60 * 5);
      expect(st.wave).toBe(w + 1);
      killAll(world, ctx);
      run(world, ctx, [setPieceSystem], 2);
    }
    expect(st.state).toBe('boss');
    expect(world.has(st.boss!, Boss)).toBe(true);
    kill(world, ctx, st.boss!, 0);
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('reclaimed');
    expect(zone.found.has(DELTA.id)).toBe(true);
    expect(zone.discovered.has('tp.delta')).toBe(true);
    expect(hubAt(zone, DELTA.x, DELTA.z)?.id).toBe('hub.delta');
    expect(ctx.quests!.signals).toContainEqual({ type: 'objective', id: DELTA.id });
    syncSetPieces(world, zone);
    expect(zone.setPieces.district!.delta.state).toBe('reclaimed');
  });

  it('fails if every technician falls, and can be tried again', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, DELTA.x + 15, DELTA.z);
    run(world, ctx, [setPieceSystem]);
    const st = zone.setPieces.district!.delta;
    for (const t of st.technicians) kill(world, ctx, t, 0);
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('idle');
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('defend');
  });
});

describe('High Priestess Vire', () => {
  it('gates close; guards, a collapsing floor and her infected form come in phases; death resets', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, CATHEDRAL.x, CATHEDRAL.z - 10);
    run(world, ctx, [setPieceSystem]);
    const st = zone.setPieces.district!.vire;
    expect(st.state).toBe('fight');
    expect(st.gates.length).toBe(2);
    const boss = st.boss!;
    run(world, ctx, [spatialSystem, bossSystem], 2);
    const b = world.req(boss, Boss);
    expect(b.adds.length).toBe(3);
    // Phase 2: the floor collapses in steps.
    const h = world.req(boss, Health);
    h.current = h.max * 0.55;
    run(world, ctx, [spatialSystem, bossSystem], 60 * 5);
    expect(b.phase).toBe(1);
    const ring = world.query(Hazard).find((e) => world.req(e, Hazard).inner !== undefined);
    expect(ring).toBeDefined();
    expect(world.req(ring!, Hazard).inner!).toBeLessThan(CATHEDRAL.radius);
    // Phase 3: bigger, glowing, tentacles.
    h.current = h.max * 0.2;
    run(world, ctx, [spatialSystem, bossSystem], 60 * 3);
    expect(b.phase).toBe(2);
    expect(world.req(boss, Renderable).glow).toBe('#7dff5a');
    expect(b.adds.some((a) => world.req(a, EnemyAI).defId === 'lumen_tentacle')).toBe(true);
    // The player dies: everything resets and the gates open.
    setPiecesOnDeath(world, zone);
    world.flushDestroyed();
    expect(st.state).toBe('idle');
    expect(world.req(boss, Health).current).toBe(h.max);
    expect(world.query(Hazard).some((e) => world.req(e, Hazard).inner !== undefined)).toBe(false);
    expect(world.req(boss, Renderable).glow).not.toBe('#7dff5a');
    resetBoss(world, boss);
  });

  it('drops a legendary and counts for the quest when she dies', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, CATHEDRAL.x, CATHEDRAL.z - 10);
    run(world, ctx, [setPieceSystem]);
    kill(world, ctx, zone.setPieces.district!.vire.boss!, 0);
    run(world, ctx, [setPieceSystem]);
    expect(zone.found.has(CATHEDRAL.id)).toBe(true);
    expect(ctx.rewards.some((r) => r.rarity === 'legendary')).toBe(true);
  });
});

describe('unique features', () => {
  const feature = (world: World, id: string) => world.query(Interactable).find((e) => world.req(e, Interactable).poi === id)!;

  it('the Crane needs its operator first, then drops on the busiest drop zone', () => {
    const { world, ctx, zone, player } = setup();
    spawnInteractables(world, zone);
    const crane = feature(world, 'rd.feature.crane');
    expect(interact(world, ctx, player, crane)).toBe(false);
    ctx.quests!.done.set('sq.crane_operator', '');
    // Nobody to drop it on.
    expect(interact(world, ctx, player, crane)).toBe(false);
    const drops = String(REFINERY_DISTRICT.pois.find((p) => p.id === 'rd.feature.crane')!.data!.drops).split(';').map((s) => s.split(',').map(Number));
    const [x, z] = drops[1]!;
    const victims = [0, 1, 2].map((i) => spawnEnemy(world, 'smelter', x! + i, z!, { level: 12 }));
    expect(interact(world, ctx, player, crane)).toBe(true);
    run(world, ctx, [spatialSystem, blastSystem], 120);
    for (const v of victims) expect(world.req(v, Health).current).toBeLessThan(world.req(v, Health).max);
  });

  it('a coolant valve makes nearby molten metal safe for a few seconds', () => {
    const { world, ctx, zone, player } = setup();
    spawnInteractables(world, zone);
    const valve = feature(world, 'rd.feature.valve.0');
    const vt = world.req(valve, Transform);
    const pool = DISTRICT_ENV.filter((f) => f.kind === 'molten').sort((a, b) => Math.hypot(a.x - vt.x, a.z - vt.z) - Math.hypot(b.x - vt.x, b.z - vt.z))[0]!;
    expect(interact(world, ctx, player, valve)).toBe(true);
    expect(zone.cooled.has(pool.id)).toBe(true);
    resetEnvironment();
    moveTo(world, player, pool.x, pool.z);
    const life = world.req(player, Health).current;
    run(world, ctx, [environmentSystem], 60);
    expect(world.req(player, Health).current).toBe(life);
    run(world, ctx, [environmentSystem], 60 * 9);
    expect(world.req(player, Health).current).toBeLessThan(life);
  });

  it("Cinder Flats' autocannon and fuel depot work too", () => {
    const world = new World();
    const zone = createZoneRuntime(CINDER_FLATS);
    const ctx = makeCtx({ zone, quests: createQuestRuntime(), worldHalfSize: zone.def.halfSize });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    spawnInteractables(world, zone);
    for (const id of ['feature.autocannon', 'feature.depot']) {
      const f = world.query(Interactable).find((e) => world.req(e, Interactable).poi === id)!;
      const t = world.req(f, Transform);
      const victim = spawnEnemy(world, 'infected_colonist', t.x + 3, t.z, { level: 5 });
      expect(interact(world, ctx, player, f), id).toBe(true);
      run(world, ctx, [spatialSystem, blastSystem], 60 * 5);
      expect(world.has(victim, Dead) || world.req(victim, Health).current < world.req(victim, Health).max, id).toBe(true);
    }
  });
});

describe('district world events', () => {
  it('each new event starts and can be finished', () => {
    for (const type of ['runawayBelt', 'slagTide', 'purgeFurnace', 'smelterRaid']) {
      const { world, ctx, zone, player } = setup();
      const ev = zone.events.get(`rd.event.${type}`)!;
      moveTo(world, player, ev.x, ev.z);
      world.req(player, Health).max = world.req(player, Health).current = 1e7;
      run(world, ctx, [spatialSystem, worldEventSystem]);
      expect(ev.state, type).toBe('active');
      // Play it out: kill whatever shows up (enemies and the event's targets).
      for (let i = 0; i < 60 * 100 && ev.state === 'active'; i += 30) {
        run(world, ctx, [spatialSystem, worldEventSystem], 30);
        for (const e of world.query(Health)) {
          if (world.has(e, Dead) || e === player) continue;
          if (world.has(e, EnemyAI) || (type !== 'smelterRaid' && ev.objects.includes(e))) kill(world, ctx, e, 0);
        }
      }
      expect(ev.state, type).toBe('cooldown');
      expect(ev.result, type).not.toBe('failed');
    }
  });
});

describe('Region 2 dungeons', () => {
  function inside(defId: string) {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 2600, quests: createQuestRuntime(), account: emptyAccount() });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    world.req(player, Health).max = world.req(player, Health).current = 1e7;
    const rt = buildInstance(world, ctx, defId, `dungeon.${defId}`, 's1', 14, { x: 10, z: 10 });
    ctx.instance = rt;
    moveTo(world, player, rt.start.x, rt.start.z);
    return { world, ctx, player, rt };
  }

  it('Smelter 3: pumps in the panel order cool the furnace; a wrong one resets them', () => {
    const { world, ctx, player, rt } = inside('smelter_3');
    run(world, ctx, [instanceSystem], 60 * 10);
    expect(rt.extra.heat!).toBeGreaterThan(0);
    const valves = rt.extra.valves!.map((v) => v.entity);
    const order = rt.extra.order!;
    const use = (e: Entity) => instanceInteract(world, ctx, e, world.req(e, Interactable));
    // Wrong first pump.
    use(valves[order[1]!]!);
    expect(rt.objective.progress).toBe(0);
    for (const i of order) use(valves[i]!);
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
    expect(world.req(player, Health).current).toBeGreaterThan(0);
  });

  it('The Pipe Alleys: the robot walks to the boss room while nothing threatens it', () => {
    const { world, ctx, player, rt } = inside('pipe_alleys');
    const robot = rt.extra.robot!;
    for (let i = 0; i < 60 * 240 && !rt.objective.done; i += 10) {
      run(world, ctx, [spatialSystem, instanceSystem], 10);
      killAll(world, ctx);
      if (robot.entity !== null && world.isAlive(robot.entity)) {
        const t = world.req(robot.entity, Transform);
        moveTo(world, player, t.x - 2, t.z - 2);
        // Movement: walk the robot towards its target ourselves (no movement system in this test).
        const target = robot.path[robot.next];
        if (target) {
          const dx = target.x - t.x;
          const dz = target.z - t.z;
          const d = Math.hypot(dx, dz) || 1;
          const step = Math.min(d, 2.6 * (10 / 60));
          t.x += (dx / d) * step;
          t.z += (dz / d) * step;
        }
      }
    }
    expect(rt.objective.done).toBe(true);
  });

  it('The Cathedral Crypt: each pyre starts when you enter its room; freed and lost both count', () => {
    const { world, ctx, player, rt } = inside('cathedral_crypt');
    const cages = rt.extra.cages!;
    // Free the first, let the second burn.
    const first = roomCenter(cages[0]!.room);
    moveTo(world, player, first.x, first.z);
    run(world, ctx, [instanceSystem]);
    expect(cages[0]!.remaining).not.toBeNull();
    instanceInteract(world, ctx, cages[0]!.entity, world.req(cages[0]!.entity, Interactable));
    expect(cages[0]!.state).toBe('freed');
    for (const c of cages.slice(1)) {
      const rc = roomCenter(c.room);
      moveTo(world, player, rc.x, rc.z);
      run(world, ctx, [instanceSystem]);
    }
    run(world, ctx, [instanceSystem], 60 * 75);
    expect(cages.slice(1).every((c) => c.state !== 'locked')).toBe(true);
    expect(rt.objective.done).toBe(true);
  });

  it('The Cold Hall: defend the compressor for its time; frost vents freeze', () => {
    const { world, ctx, rt } = inside('cold_hall');
    const d = rt.extra.defend!;
    const comp = d.entity!;
    instanceInteract(world, ctx, comp, world.req(comp, Interactable));
    expect(d.state).toBe('running');
    for (let i = 0; i < 65; i++) {
      run(world, ctx, [instanceSystem], 60);
      killAll(world, ctx);
    }
    expect(rt.objective.done).toBe(true);
    expect(rt.extra.env!.length).toBeGreaterThan(5);
    expect(rt.extra.env!.every((f) => f.kind === 'vent' && f.element === 'frost')).toBe(true);
  });
});

describe('the motorbike', () => {
  it('is locked until Spare Parts, then mounts in the open world and throws you off on a big hit', () => {
    const { world, ctx, player } = setup(0, 0);
    const press = () => {
      ctx.input = fakeInput(['mount']);
      run(world, ctx, [vehicleSystem]);
      ctx.input = fakeInput();
    };
    press();
    expect(world.has(player, Mounted)).toBe(false);
    ctx.quests!.done.set('sq.spare_parts', '');
    press();
    expect(world.has(player, Mounted)).toBe(true);
    const h = world.req(player, Health);
    h.current -= h.max * 0.2;
    run(world, ctx, [vehicleSystem]);
    expect(world.has(player, Mounted)).toBe(false);
    // Not in a hub.
    moveTo(world, player, REFINERY_DISTRICT.hubs[0]!.x, REFINERY_DISTRICT.hubs[0]!.z);
    press();
    expect(world.has(player, Mounted)).toBe(false);
  });
});

describe('Region 2 quests', () => {
  it('keep every step position out of molten metal, and NPCs in the hub stand clear', () => {
    for (const q of QUESTS.values()) {
      if (q.zone !== REFINERY_DISTRICT.id) continue;
      for (const step of q.steps) {
        if ((step.zone ?? q.zone) !== REFINERY_DISTRICT.id) continue;
        if ('x' in step) expect(inMolten(DISTRICT_ENV, step.x, step.z), `${q.id}`).toBeNull();
        if (step.kind === 'interact') for (const o of step.objects) expect(inMolten(DISTRICT_ENV, o.x, o.z, 1), `${q.id} ${o.id}`).toBeNull();
      }
    }
    const { world, ctx } = setup();
    spawnQuestWorld(world, ctx);
    const npcs = world.query(Npc);
    expect(npcs.length).toBe(4);
    for (const e of npcs) {
      const t = world.req(e, Transform);
      expect(hubAt(ctx.zone, t.x, t.z)?.id, world.req(e, Npc).id).toBe('hub.coolant');
    }
  });

  it('the district story starts once The First is dead', () => {
    expect(QUESTS.get('mq.burning_road')!.after).toEqual(['mq.the_first']);
    expect(QUESTS.get('mq.burning_road')!.steps[0]!.zone).toBe('zone.cinder_flats');
  });
});
