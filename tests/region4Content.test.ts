import { describe, expect, it } from 'vitest';
import { Boss, Dead, EnemyAI, Health, Interactable, Mover, Npc, Targetable, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import en from '../src/data/lang/en.json';
import { QUESTS } from '../src/data/quests/db';
import { caveGrid, walkableAt } from '../src/data/zones/caves';
import { AURUM, DEEP_MINES, DRILL_CONTROL } from '../src/data/zones/deepMines';
import { bossSystem } from '../src/systems/boss';
import { applyDamage, kill } from '../src/systems/combat';
import { spatialSystem } from '../src/systems/collision';
import { createQuestRuntime, setQuestState, spawnQuestWorld } from '../src/systems/quests';
import { buildInstance, instanceInteract, instanceSystem } from '../src/world/instance';
import { AURUM_TUNING, drillControlMouths } from '../src/world/mineSetPieces';
import { setPieceSystem, setPiecesOnDeath, syncSetPieces } from '../src/world/setPieces';
import { spawnPlayer } from '../src/world/spawn';
import { eventInteract, worldEventSystem } from '../src/world/worldEvents';
import { createZoneRuntime, hubAt } from '../src/world/zone';
import { makeCtx, run } from './helpers';

const grid = caveGrid(DEEP_MINES)!;

function setup(x = 0, z = 0) {
  const world = new World();
  const zone = createZoneRuntime(DEEP_MINES);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize, zoneLevels: [30, 40] });
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

describe('Mining Station Aurum', () => {
  it('shield generators make defenders near them invulnerable; then Holm; reclaimed it is a hub', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, AURUM.x + 4, AURUM.z);
    run(world, ctx, [spatialSystem, setPieceSystem], 2);
    const st = zone.setPieces.mines!.aurum;
    expect(st.state).toBe('assault');
    expect(st.generators).toHaveLength(AURUM_TUNING.generators);
    // A defender standing by a generator shrugs off damage.
    const g = world.req(st.generators[0]!, Transform);
    const guard = st.enemies[0]!;
    moveTo(world, guard, g.x + 2, g.z);
    run(world, ctx, [spatialSystem, setPieceSystem], 40);
    expect(applyDamage(world, ctx, guard, 50, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'player' })).toBeNull();
    for (const gen of st.generators) kill(world, ctx, gen, 0);
    killAll(world, ctx);
    run(world, ctx, [spatialSystem, setPieceSystem], 2);
    expect(st.state).toBe('boss');
    expect(world.req(st.boss!, EnemyAI).defId).toBe('security_chief_holm');
    kill(world, ctx, st.boss!, 0);
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('reclaimed');
    expect(zone.discovered.has('tp.aurum')).toBe(true);
    expect(hubAt(zone, AURUM.x, AURUM.z)?.id).toBe('hub.aurum');
    expect(ctx.quests!.signals).toContainEqual({ type: 'objective', id: AURUM.id });
  });
});

describe('Governor Kade', () => {
  it('bars the tunnels; frontal shield, conduits that hold him while the drill sweeps, then he blinks around', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, DRILL_CONTROL.x, DRILL_CONTROL.z - 10);
    run(world, ctx, [setPieceSystem]);
    const st = zone.setPieces.mines!.kade;
    expect(st.state).toBe('fight');
    expect(st.gates.length).toBe(drillControlMouths().length);
    expect(st.gates.length).toBeGreaterThanOrEqual(2);
    const boss = st.boss!;
    run(world, ctx, [spatialSystem, bossSystem], 2);
    const b = world.req(boss, Boss);
    const h = world.req(boss, Health);
    // Phase 2: immune and rooted while the drill head sweeps; four conduits to cut.
    h.current = h.max * 0.55;
    run(world, ctx, [spatialSystem, bossSystem], 2);
    expect(b.phase).toBe(1);
    expect(b.nodes).toHaveLength(4);
    expect(b.damageTaken).toBe(0);
    expect(world.req(boss, Mover).speed).toBe(0);
    // The sweep hurts whoever it crosses.
    const ph = world.req(player, Health);
    ph.max = ph.current = 1e6;
    for (let i = 0; i < 60 * 16 && ph.current === 1e6; i++) {
      moveTo(world, player, DRILL_CONTROL.x + Math.sin(b.timers.sweep ?? 0) * 10, DRILL_CONTROL.z + Math.cos(b.timers.sweep ?? 0) * 10);
      run(world, ctx, [spatialSystem, bossSystem]);
    }
    expect(ph.current).toBeLessThan(1e6);
    for (const n of b.nodes!) kill(world, ctx, n, 0);
    run(world, ctx, [spatialSystem, bossSystem]);
    expect(b.damageTaken).toBe(1);
    // Phase 3: Lumen takes him; he blinks next to you.
    h.current = h.max * 0.2;
    const bt = world.req(boss, Transform);
    let blinked = false;
    for (let i = 0; i < 60 * 8 && !blinked; i++) {
      const before = { x: bt.x, z: bt.z };
      run(world, ctx, [spatialSystem, bossSystem]);
      if (Math.hypot(bt.x - before.x, bt.z - before.z) > 3) blinked = true;
    }
    expect(b.phase).toBe(2);
    expect(blinked).toBe(true);
    setPiecesOnDeath(world, zone);
    world.flushDestroyed();
    expect(st.state).toBe('idle');
    expect(st.gates).toHaveLength(0);
  });

  it('drops a legendary and counts for the quest when he dies', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, DRILL_CONTROL.x, DRILL_CONTROL.z - 10);
    run(world, ctx, [setPieceSystem]);
    kill(world, ctx, zone.setPieces.mines!.kade.boss!, 0);
    run(world, ctx, [setPieceSystem]);
    expect(zone.found.has(DRILL_CONTROL.id)).toBe(true);
    expect(ctx.rewards.some((r) => r.rarity === 'legendary')).toBe(true);
  });
});

describe('Deep Mines world events', () => {
  it('each new event starts and can be finished', () => {
    for (const type of ['caveRescue', 'burrowerSwarm', 'lightsOut', 'securityPatrol']) {
      const { world, ctx, zone, player } = setup();
      const ev = zone.events.get(`dm.event.${type}`)!;
      moveTo(world, player, ev.x, ev.z);
      run(world, ctx, [spatialSystem, worldEventSystem]);
      expect(ev.state, type).toBe('active');
      for (let i = 0; i < 60 * 100 && ev.state === 'active'; i += 30) {
        run(world, ctx, [spatialSystem, worldEventSystem], 30);
        for (const e of world.query(Health)) {
          if (world.has(e, Dead) || e === player) continue;
          if (world.has(e, EnemyAI)) kill(world, ctx, e, 0);
        }
        // Dig out the trapped miners.
        if (type === 'caveRescue') {
          for (const o of [...ev.objects]) {
            const it = world.get(o, Interactable);
            if (it) eventInteract(world, ctx, o, it);
          }
        }
      }
      expect(ev.state, type).toBe('cooldown');
      expect(ev.result, type).not.toBe('failed');
    }
  });
});

describe('Deep Mines dungeons', () => {
  function inside(defId: string) {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 2600, quests: createQuestRuntime(), account: emptyAccount() });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    world.req(player, Health).max = world.req(player, Health).current = 1e7;
    const rt = buildInstance(world, ctx, defId, `dungeon.${defId}`, 's1', 34, { x: 10, z: 10 });
    ctx.instance = rt;
    moveTo(world, player, rt.start.x, rt.start.z);
    return { world, ctx, player, rt };
  }
  const objects = (world: World, kind: string) => world.query(Interactable).filter((e) => world.req(e, Interactable).kind === kind);

  it('Shaft 13: start the elevator and hold it on the way down', () => {
    const { world, ctx, rt } = inside('shaft_13');
    const lift = rt.extra.defend!.entity!;
    instanceInteract(world, ctx, lift, world.req(lift, Interactable));
    expect(rt.extra.defend!.state).toBe('running');
    for (let i = 0; i < 75; i++) {
      run(world, ctx, [instanceSystem], 60);
      killAll(world, ctx);
    }
    expect(rt.objective.done).toBe(true);
  });

  it('The Crystal Labyrinth: each mirror catches the light after a few turns', () => {
    const { world, ctx, rt } = inside('crystal_labyrinth');
    const mirrors = rt.extra.mirrors!;
    expect(mirrors).toHaveLength(3);
    for (const m of mirrors) {
      for (let k = 0; k < 4 && m.turn !== m.aligned; k++) instanceInteract(world, ctx, m.entity, world.req(m.entity, Interactable));
      expect(m.turn).toBe(m.aligned);
    }
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
  });

  it('The Sunken Drill: three power cores', () => {
    const { world, ctx, rt } = inside('sunken_drill');
    const cores = world.query(Targetable).filter((e) => !world.has(e, EnemyAI));
    expect(cores).toHaveLength(3);
    for (const c of cores) kill(world, ctx, c, 0);
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
  });

  it('The Archive: four memory crystals, each a fragment of the revelation', () => {
    const { world, ctx, rt } = inside('archive');
    const crystals = objects(world, 'instanceKey');
    expect(crystals).toHaveLength(4);
    for (const e of crystals) instanceInteract(world, ctx, e, world.req(e, Interactable));
    const logs = ctx.events.drain().filter((e) => e.type === 'interact' && e.kind === 'lore').map((e) => (e as { detail?: string }).detail);
    expect(logs).toEqual(['dmarc.0', 'dmarc.1', 'dmarc.2', 'dmarc.3']);
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
  });
});

describe('Deep Mines quests', () => {
  it('the mines story starts after the Mother Tree and ends with the governor', () => {
    expect(QUESTS.get('mq.going_down')!.after).toEqual(['mq.mother_tree']);
    expect(QUESTS.get('mq.going_down')!.steps[0]!.zone).toBe('zone.hydroponic_vaults');
    const mains = [...QUESTS.values()].filter((q) => q.zone === DEEP_MINES.id && q.kind === 'main');
    const sides = [...QUESTS.values()].filter((q) => q.zone === DEEP_MINES.id && q.kind === 'side');
    expect(mains).toHaveLength(6);
    expect(sides.length).toBeGreaterThanOrEqual(10);
  });

  it('the follower from the Vaults is whoever the Mother Tree choice sent', () => {
    for (const [option, npc, other] of [['spare', 'okafor_mines', 'ruiz_mines'], ['burn', 'ruiz_mines', 'okafor_mines']] as const) {
      const { world, ctx } = setup();
      setQuestState(ctx.quests!, { active: {}, done: { 'mq.mother_tree': option }, tracked: null });
      spawnQuestWorld(world, ctx);
      const ids = world.query(Npc).map((e) => world.req(e, Npc).id);
      expect(ids).toContain(npc);
      expect(ids).not.toContain(other);
    }
  });

  it('puts every step on open ground and the hub people in the hub', () => {
    for (const q of QUESTS.values()) {
      if (q.zone !== DEEP_MINES.id) continue;
      for (const step of q.steps) {
        if ((step.zone ?? q.zone) !== DEEP_MINES.id) continue;
        if ('x' in step) expect(walkableAt(grid, step.x, step.z), q.id).toBe(true);
        if (step.kind === 'interact') for (const o of step.objects) expect(walkableAt(grid, o.x, o.z), `${q.id} ${o.id}`).toBe(true);
      }
    }
    const { world, ctx } = setup();
    spawnQuestWorld(world, ctx);
    for (const e of world.query(Npc)) {
      const t = world.req(e, Transform);
      expect(hubAt(ctx.zone, t.x, t.z)?.id, world.req(e, Npc).id).toBe('hub.zero');
    }
  });

  it('every interactable kind has a prompt label', () => {
    const actions = (en as unknown as { interact: { actions: Record<string, string> } }).interact.actions;
    for (const k of ['chest', 'lockedChest', 'keycard', 'pylon', 'relic', 'lore', 'signalTower', 'teleporter', 'npc', 'questObject', 'stash', 'dungeon', 'bunker', 'portal', 'generator', 'instanceKey', 'cache', 'crystal', 'valve', 'cage', 'compressor', 'lever', 'mirror', 'eventObject', 'feature']) {
      expect(actions[k], k).toBeTruthy();
    }
  });
});
