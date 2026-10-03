import { describe, expect, it } from 'vitest';
import { Boss, Dead, Destructible, EnemyAI, Hazard, Health, Interactable, Mover, Npc, PlayerControlled, Targetable, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { QUESTS } from '../src/data/quests/db';
import { GAMMA, GREAT_DOME, HYDROPONIC_VAULTS, VAULTS_ENV } from '../src/data/zones/hydroponicVaults';
import { bossSystem, spawnBoss } from '../src/systems/boss';
import { applyDamage, kill } from '../src/systems/combat';
import { spatialSystem } from '../src/systems/collision';
import { choose, createQuestRuntime, questSystem, spawnQuestWorld, startQuest, setQuestState } from '../src/systems/quests';
import { hitDestructibles, spawnInteractables } from '../src/world/interactables';
import { buildInstance, instanceInteract, instanceSystem } from '../src/world/instance';
import { setPieceSystem, setPiecesOnDeath, syncSetPieces } from '../src/world/setPieces';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { GAMMA_TUNING } from '../src/world/vaultSetPieces';
import { worldEventSystem } from '../src/world/worldEvents';
import { createZoneRuntime, hubAt } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function setup(x = 0, z = 0) {
  const world = new World();
  const zone = createZoneRuntime(HYDROPONIC_VAULTS);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize, zoneLevels: [20, 30] });
  const player = spawnPlayer(world, 'bastion', x, z);
  world.req(player, Health).max = world.req(player, Health).current = 1e7;
  syncSetPieces(world, zone);
  return { world, ctx, zone, player };
}

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

const killAll = (world: World, ctx: ReturnType<typeof makeCtx>) => {
  for (const e of world.query(EnemyAI)) if (!world.has(e, Dead)) kill(world, ctx, e, 0);
};

describe('Dome Gamma', () => {
  it('five Root Nodes, a bigger wave per node, then the Gamma Bloom; reclaimed it is a hub', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, GAMMA.x + 10, GAMMA.z);
    run(world, ctx, [setPieceSystem]);
    const st = zone.setPieces.vaults!.gamma;
    expect(st.state).toBe('nodes');
    expect(st.nodes).toHaveLength(GAMMA_TUNING.nodes);
    const sizes: number[] = [];
    for (const n of st.nodes) {
      killAll(world, ctx);
      kill(world, ctx, n, 0);
      run(world, ctx, [setPieceSystem]);
      sizes.push(st.enemies.length);
    }
    // The waves escalate.
    expect(sizes[sizes.length - 1]!).toBeGreaterThan(sizes[0]!);
    expect(st.state).toBe('nodes');
    killAll(world, ctx);
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('boss');
    expect(world.req(st.boss!, EnemyAI).defId).toBe('gamma_bloom');
    kill(world, ctx, st.boss!, 0);
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('reclaimed');
    expect(zone.discovered.has('tp.gamma')).toBe(true);
    expect(hubAt(zone, GAMMA.x, GAMMA.z)?.id).toBe('hub.gamma');
    expect(ctx.quests!.signals).toContainEqual({ type: 'objective', id: GAMMA.id });
    expect(ctx.rewards.some((r) => r.rarity === 'legendary')).toBe(true);
    syncSetPieces(world, zone);
    expect(zone.setPieces.vaults!.gamma.state).toBe('reclaimed');
  });

  it('grows back if you walk away mid-fight', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, GAMMA.x + 10, GAMMA.z);
    run(world, ctx, [setPieceSystem]);
    moveTo(world, player, GAMMA.x + 200, GAMMA.z);
    run(world, ctx, [setPieceSystem]);
    expect(zone.setPieces.vaults!.gamma.state).toBe('idle');
  });
});

describe('The Warden of the Mother Tree', () => {
  it('armour plates, a rooted phase freed by Root Nodes, then roots and beams; death resets', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, GREAT_DOME.x, GREAT_DOME.z - 10);
    run(world, ctx, [setPieceSystem]);
    const st = zone.setPieces.vaults!.warden;
    expect(st.state).toBe('fight');
    expect(st.gates).toHaveLength(2);
    const boss = st.boss!;
    run(world, ctx, [spatialSystem, bossSystem], 2);
    const b = world.req(boss, Boss);
    // Phase 1: three plates, and it takes a fifth of the damage until they break.
    expect(b.parts).toHaveLength(3);
    expect(b.damageTaken).toBeCloseTo(0.2);
    const h = world.req(boss, Health);
    const before = h.current;
    applyDamage(world, ctx, boss, 1000, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'player' });
    expect(before - h.current).toBeCloseTo(200);
    // Spore beams are telegraphed as lines.
    run(world, ctx, [spatialSystem, bossSystem], 60 * 6);
    for (const p of b.parts!) kill(world, ctx, p, 0);
    run(world, ctx, [spatialSystem, bossSystem]);
    expect(b.damageTaken).toBe(1);
    // Phase 2: rooted and immune until the nodes fall.
    h.current = h.max * 0.55;
    run(world, ctx, [spatialSystem, bossSystem], 2);
    expect(b.phase).toBe(1);
    expect(b.nodes).toHaveLength(4);
    expect(b.vines!.length).toBe(5);
    expect(b.damageTaken).toBe(0);
    expect(world.req(boss, Mover).speed).toBe(0);
    for (const n of b.nodes!) expect(world.has(n, Targetable)).toBe(true);
    for (const n of b.nodes!) kill(world, ctx, n, 0);
    run(world, ctx, [spatialSystem, bossSystem]);
    world.flushDestroyed();
    expect(b.damageTaken).toBe(1);
    expect(world.req(boss, Mover).speed).toBeGreaterThan(0);
    expect(b.vines).toHaveLength(0);
    // Phase 3: the Mother Tree's roots rise.
    h.current = h.max * 0.2;
    run(world, ctx, [spatialSystem, bossSystem], 60 * 15);
    expect(b.phase).toBe(2);
    expect(b.adds.some((a) => world.req(a, EnemyAI).defId === 'mother_root')).toBe(true);
    // The player dies: everything resets and the gates open.
    setPiecesOnDeath(world, zone);
    world.flushDestroyed();
    expect(st.state).toBe('idle');
    expect(world.req(boss, Health).current).toBe(h.max);
    expect(b.parts ?? []).toHaveLength(0);
    expect(b.nodes ?? []).toHaveLength(0);
  });

  it('a spore beam hits along its line and nothing beside it', () => {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 400 });
    const player = spawnPlayer(world, 'bastion', 0, 10);
    const boss = spawnBoss(world, 0, 0, { enemy: 'warden', name: 'enemies.named.warden', level: 25, lifeMul: 1, damageMul: 1, affixes: [], script: 'warden', arena: { x: 0, z: 0, radius: 30 } });
    const h = world.req(player, Health);
    h.max = h.current = 1e6;
    world.req(boss, EnemyAI).aggro = true;
    run(world, ctx, [spatialSystem, bossSystem], 60 * 5);
    expect(h.current).toBeLessThan(1e6);
    // Standing well off to the side, the next beams miss.
    const b = world.req(boss, Boss);
    b.pending = [];
    b.timers.beams = 0.01;
    run(world, ctx, [spatialSystem, bossSystem], 2);
    const beam = b.pending.find((p) => p.kind === 'beam')!;
    expect(beam).toBeDefined();
    moveTo(world, player, 12, 0);
    world.req(player, Transform).facing = 0;
    const hp = h.current;
    b.timers.beams = 99;
    b.timers.fireballs = 99;
    run(world, ctx, [spatialSystem, bossSystem], 90);
    expect(h.current).toBe(hp);
  });

  it('drops a legendary and counts for the quest when it dies', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, GREAT_DOME.x, GREAT_DOME.z - 10);
    run(world, ctx, [setPieceSystem]);
    kill(world, ctx, zone.setPieces.vaults!.warden.boss!, 0);
    run(world, ctx, [setPieceSystem]);
    world.flushDestroyed();
    expect(zone.found.has(GREAT_DOME.id)).toBe(true);
    expect(ctx.quests!.signals).toContainEqual({ type: 'objective', id: GREAT_DOME.id });
    expect(ctx.rewards.some((r) => r.rarity === 'legendary')).toBe(true);
    expect(world.query(Hazard)).toHaveLength(0);
  });
});

describe('Vaults world events', () => {
  it('each new event starts and can be finished', () => {
    for (const type of ['sporeBloom', 'swarmMigration', 'rootEruption']) {
      const { world, ctx, zone, player } = setup();
      const ev = zone.events.get(`hv.event.${type}`)!;
      moveTo(world, player, ev.x, ev.z);
      run(world, ctx, [spatialSystem, worldEventSystem]);
      expect(ev.state, type).toBe('active');
      for (let i = 0; i < 60 * 100 && ev.state === 'active'; i += 30) {
        run(world, ctx, [spatialSystem, worldEventSystem], 30);
        for (const e of world.query(Health)) {
          if (world.has(e, Dead) || e === player) continue;
          if (world.has(e, EnemyAI) || ev.objects.includes(e)) kill(world, ctx, e, 0);
        }
      }
      expect(ev.state, type).toBe('cooldown');
      expect(ev.result, type).not.toBe('failed');
    }
  });

  it('the hunted elite in the Vaults is a Vine Weaver', () => {
    const { world, ctx, zone, player } = setup();
    const ev = zone.events.get('hv.event.eliteHunt')!;
    moveTo(world, player, ev.x, ev.z);
    run(world, ctx, [spatialSystem, worldEventSystem]);
    expect(world.req(ev.objects[0]!, EnemyAI).defId).toBe('vine_weaver');
  });
});

describe('Region 3 dungeons', () => {
  function inside(defId: string) {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 2600, quests: createQuestRuntime(), account: emptyAccount() });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    world.req(player, Health).max = world.req(player, Health).current = 1e7;
    const rt = buildInstance(world, ctx, defId, `dungeon.${defId}`, 's1', 24, { x: 10, z: 10 });
    ctx.instance = rt;
    moveTo(world, player, rt.start.x, rt.start.z);
    return { world, ctx, player, rt };
  }
  const keys = (world: World) => world.query(Interactable).filter((e) => world.req(e, Interactable).kind === 'instanceKey');

  it('The Seed Bank Depths: three seed cases open the boss room', () => {
    const { world, ctx, rt } = inside('seed_bank_depths');
    const cases = keys(world);
    expect(cases).toHaveLength(3);
    for (const e of cases) instanceInteract(world, ctx, e, world.req(e, Interactable));
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
  });

  it('The Sleeping Lab: four terminals, each one a log', () => {
    const { world, ctx, rt } = inside('sleeping_lab');
    const terms = keys(world);
    expect(terms).toHaveLength(4);
    for (const e of terms) instanceInteract(world, ctx, e, world.req(e, Interactable));
    const logs = ctx.events.drain().filter((e) => e.type === 'interact' && e.kind === 'lore').map((e) => (e as { detail?: string }).detail);
    expect(logs).toEqual(['hvlab.0', 'hvlab.1', 'hvlab.2', 'hvlab.3']);
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
  });

  it('The Irrigation System: each lever drains its water', () => {
    const { world, ctx, rt } = inside('irrigation_system');
    const levers = rt.extra.levers!;
    expect(levers).toHaveLength(3);
    for (const l of levers) instanceInteract(world, ctx, l.entity, world.req(l.entity, Interactable));
    expect(rt.extra.drained!.size).toBe(levers.reduce((n, l) => n + l.water.length, 0));
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
  });

  it('The Cocoon Chamber: cocoons hatch close by; the Mother Cocoon opens the boss room', () => {
    const { world, ctx, player, rt } = inside('cocoon_chamber');
    const cocoon = rt.extra.cocoons![0]!;
    moveTo(world, player, cocoon.x + 1, cocoon.z);
    const before = world.query(EnemyAI).length;
    run(world, ctx, [instanceSystem]);
    expect(world.query(EnemyAI).length).toBeGreaterThan(before);
    const mother = world.query(Targetable).find((e) => !world.has(e, EnemyAI) && !world.has(e, PlayerControlled))!;
    kill(world, ctx, mother, 0);
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
  });
});

describe('Vaults quests', () => {
  it('the Vaults story starts once Vire is dead and ends in the burn-or-spare choice', () => {
    expect(QUESTS.get('mq.green_door')!.after).toEqual(['mq.vire']);
    expect(QUESTS.get('mq.green_door')!.steps[0]!.zone).toBe('zone.refinery_district');
    const mains = [...QUESTS.values()].filter((q) => q.zone === HYDROPONIC_VAULTS.id && q.kind === 'main');
    const sides = [...QUESTS.values()].filter((q) => q.zone === HYDROPONIC_VAULTS.id && q.kind === 'side');
    expect(mains).toHaveLength(6);
    expect(sides).toHaveLength(10);
    const last = QUESTS.get('mq.mother_tree')!.steps.at(-1)!;
    expect(last.kind).toBe('choice');
    expect(last.kind === 'choice' && last.options.map((o) => o.unique)).toEqual(['ashen_heartwood', 'seed_of_accord']);
  });

  it('the choice pays its unique and is remembered in the finished quests', () => {
    const { world, ctx } = setup();
    setQuestState(ctx.quests!, { active: { 'mq.mother_tree': { step: 2, progress: 0 } }, done: {}, tracked: null });
    choose(world, ctx, 'mq.mother_tree', 'spare');
    expect(ctx.rewards.some((r) => r.unique === 'seed_of_accord')).toBe(true);
    expect(ctx.quests!.done.get('mq.mother_tree')).toBe('spare');
  });

  it('keeps steps out of water, and Lab 9 NPCs stand in the hub', () => {
    const water = VAULTS_ENV.filter((f) => f.kind === 'water');
    const wet = (x: number, z: number) => water.some((f) => Math.hypot(f.x - x, f.z - z) < f.radius + 1);
    for (const q of QUESTS.values()) {
      if (q.zone !== HYDROPONIC_VAULTS.id) continue;
      for (const step of q.steps) {
        if ((step.zone ?? q.zone) !== HYDROPONIC_VAULTS.id) continue;
        if ('x' in step) expect(wet(step.x, step.z), q.id).toBe(false);
        if (step.kind === 'interact') for (const o of step.objects) expect(wet(o.x, o.z), `${q.id} ${o.id}`).toBe(false);
      }
    }
    const { world, ctx } = setup();
    spawnQuestWorld(world, ctx);
    const npcs = world.query(Npc);
    expect(npcs.length).toBe(4);
    for (const e of npcs) {
      const t = world.req(e, Transform);
      expect(hubAt(ctx.zone, t.x, t.z)?.id, world.req(e, Npc).id).toBe('hub.lab9');
    }
  });

  it('Crystal Light counts enemies blinded by a crystal', () => {
    const { world, ctx, zone } = setup();
    startQuest(world, ctx, 'sq.crystal_light');
    spawnInteractables(world, zone);
    const crystal = world.query(Destructible).find((e) => world.req(e, Destructible).blind)!;
    const ct = world.req(crystal, Transform);
    for (let i = 0; i < 3; i++) spawnEnemy(world, 'overgrown_walker', ct.x + 2 + i, ct.z, { level: 22 });
    run(world, ctx, [spatialSystem], 1);
    hitDestructibles(world, ct.x, ct.z, 1, ctx);
    run(world, ctx, [questSystem], 1);
    expect(ctx.quests!.active.get('sq.crystal_light')!.progress).toBe(3);
  });
});
