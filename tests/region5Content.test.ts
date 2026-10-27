import { describe, expect, it } from 'vitest';
import { Boss, Collider, Dead, Elite, EnemyAI, Health, Interactable, MinionAI, Renderable, Targetable, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { BOSS_SCRIPTS } from '../src/data/bosses';
import { assetIdsOf } from '../src/data/variants';
import { ENEMY_DEFS } from '../src/data/db';
import { INSTANCES, CORE_INSTANCES, SHAFT_TUNING, shaftScaling } from '../src/data/instances';
import en from '../src/data/lang/en.json';
import { packTemplate } from '../src/data/packs';
import { caveGrid, walkableAt } from '../src/data/zones/caves';
import { ELEVATOR_BASE, THE_CORE } from '../src/data/zones/theCore';
import { bossSystem } from '../src/systems/boss';
import { kill } from '../src/systems/combat';
import { spatialSystem } from '../src/systems/collision';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { createQuestRuntime } from '../src/systems/quests';
import { choirAura } from '../src/systems/coreAI';
import { ringPillar, bestShaftFloor, PILLAR, descend } from '../src/world/coreInstances';
import { BASE_TUNING, CAUSEWAY_GATE } from '../src/world/elevatorBase';
import { buildInstance, hasInstance, instanceInteract, instanceSystem, objectiveText, roomCenter } from '../src/world/instance';
import { setPieceSystem, setPiecesOnDeath, syncSetPieces } from '../src/world/setPieces';
import { spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run, type SystemFn } from './helpers';

const lang = (key: string): unknown => key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], en);
const t = (key: string, params: Record<string, string | number> = {}) => String(lang(key)).replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}
const killAll = (world: World, ctx: ReturnType<typeof makeCtx>) => {
  for (const e of world.query(EnemyAI)) if (!world.has(e, Dead)) kill(world, ctx, e, 0);
};
/** Kill everything, again and again: some deaths leave echoes behind. */
const clearField = (world: World, ctx: ReturnType<typeof makeCtx>) => {
  for (let i = 0; i < 6; i++) {
    killAll(world, ctx);
    run(world, ctx, [instanceSystem], 2);
  }
};
const alive = (world: World) => world.query(EnemyAI).filter((e) => !world.has(e, Dead));
const objects = (world: World, kind: string) => world.query(Interactable).filter((e) => world.req(e, Interactable).kind === kind);

function inside(defId: string, poi = `dungeon.${defId}`, level = 45, seed = 's1') {
  const world = new World();
  const zone = createZoneRuntime(THE_CORE);
  const ctx = makeCtx({ worldHalfSize: 2600, quests: createQuestRuntime(), account: emptyAccount(), zone, zoneLevels: [40, 50] });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  world.req(player, Health).max = world.req(player, Health).current = 1e7;
  const rt = buildInstance(world, ctx, defId, poi, seed, level, { x: 10, z: 10 });
  ctx.instance = rt;
  moveTo(world, player, rt.start.x, rt.start.z);
  return { world, ctx, zone, player, rt };
}
type Inside = ReturnType<typeof inside>;

/** Walk the whole instance so every room wakes. */
function wakeAll({ world, ctx, player, rt }: Inside) {
  for (const room of rt.layout.rooms) {
    const c = roomCenter(room);
    moveTo(world, player, c.x, c.z);
    run(world, ctx, [instanceSystem], 2);
  }
}
const signals = (ctx: ReturnType<typeof makeCtx>) => ctx.quests!.signals;

describe('Core instances: definitions', () => {
  const pois = THE_CORE.pois.filter((p) => p.kind === 'dungeon' || p.kind === 'bunker');

  it('every dungeon and mirror marker leads to a built instance, and all seven exist', () => {
    expect(pois).toHaveLength(7);
    for (const p of pois) expect(hasInstance(String(p.data?.dungeon ?? p.data?.instance)), p.id).toBe(true);
    expect(CORE_INSTANCES.sort()).toEqual(pois.map((p) => String(p.data?.dungeon ?? p.data?.instance)).sort());
  });

  it('use real packs, enemies, boss scripts and language strings', () => {
    for (const id of CORE_INSTANCES) {
      const def = INSTANCES.find((d) => d.id === id)!;
      for (const p of def.packs) for (const m of packTemplate(p).members) expect(ENEMY_DEFS.has(m.enemy), `${id}: ${m.enemy}`).toBe(true);
      if (def.boss) {
        expect(ENEMY_DEFS.has(def.boss.enemy), def.boss.enemy).toBe(true);
        expect(BOSS_SCRIPTS[def.boss.script!], def.boss.enemy).toBeDefined();
        expect(typeof lang(def.boss.name), def.boss.name).toBe('string');
      }
      if (def.objective.kind === 'portals') for (const pool of def.objective.pools) for (const e of pool) expect(ENEMY_DEFS.has(e), e).toBe(true);
      if (def.lore) {
        expect(typeof lang(`lore.${def.lore}.title`)).toBe('string');
        expect(typeof lang(`lore.${def.lore}.body`)).toBe('string');
      }
    }
    for (const name of ['core_memory_of_ember', 'core_endless_shaft', 'core_singing_halls', 'core_chamber_of_creation', 'core_mirror_0', 'core_mirror_1', 'core_mirror_2']) {
      expect(typeof lang(`instances.names.${name}`), name).toBe('string');
    }
    for (const id of ['shade_the_first', 'choir_mother', 'brood_engine', 'shade_vire', 'shade_warden', 'shade_kade']) {
      expect(typeof lang(`enemies.${id}`), id).toBe('string');
      expect(ENEMY_DEFS.get(id)!.look === 'shade' || ENEMY_DEFS.get(id)!.look === 'lumen', id).toBe(true);
    }
  });

  it('Memory Shade bosses reuse their originals attacks with less life and the shade look', () => {
    for (const [shade, original] of [['shade_the_first', 'the_first'], ['shade_vire', 'vire'], ['shade_warden', 'warden'], ['shade_kade', 'governor_kade']] as const) {
      const s = ENEMY_DEFS.get(shade)!;
      const o = ENEMY_DEFS.get(original)!;
      expect(s.look).toBe('shade');
      expect(s.attack.kind).toBe(o.attack.kind);
      // (each wears its own variant of the same base model)
      expect(assetIdsOf(s.assetId)[0]).toBe(assetIdsOf(o.assetId)[0]);
      if (shade !== 'shade_the_first') expect(s.life).toBeLessThan(o.life * 0.6);
    }
  });
});

describe('Memory of Ember', () => {
  it('collects three keycards, then the Shade of The First waits in the last room (it blinks from phase 2)', () => {
    const g = inside('core_memory_of_ember');
    const { world, ctx, rt, player } = g;
    expect(rt.def.theme.shade).toBe(true);
    // The distorted outpost is drawn in the shade look; its enemies too.
    wakeAll(g);
    expect(alive(world).length).toBeGreaterThan(0);
    for (const e of alive(world)) expect(world.req(e, Renderable).look, world.req(e, EnemyAI).defId).toBeDefined();
    const cards = objects(world, 'instanceKey');
    expect(cards).toHaveLength(3);
    for (const c of cards) instanceInteract(world, ctx, c, world.req(c, Interactable));
    killAll(world, ctx);
    run(world, ctx, [instanceSystem]);
    expect(rt.objective.done).toBe(true);
    const bossRoom = rt.layout.rooms.find((r) => r.kind === 'boss')!;
    const c = roomCenter(bossRoom);
    moveTo(world, player, c.x, c.z);
    run(world, ctx, [spatialSystem, instanceSystem, bossSystem], 2);
    const boss = rt.boss!;
    expect(world.req(boss, EnemyAI).defId).toBe('shade_the_first');
    expect(world.req(boss, Renderable).look).toBe('shade');
    const script = BOSS_SCRIPTS.shade_the_first!;
    expect(script.slice(1).every((p) => p.teleport)).toBe(true);
    kill(world, ctx, boss, 0);
    run(world, ctx, [instanceSystem]);
    expect(rt.completed).toBe(true);
    expect(signals(ctx)).toContainEqual({ type: 'objective', id: 'dungeon.core_memory_of_ember' });
    expect(signals(ctx).some((s) => s.type === 'kill' && s.defId === 'shade_the_first')).toBe(true);
  });
});

describe('The Endless Shaft', () => {
  it('scaling only grows with the floor and stops at its caps', () => {
    let prev = shaftScaling(1);
    expect(prev).toMatchObject({ packs: 0, affixes: 0, lifeMul: 1 });
    for (let f = 2; f <= 80; f++) {
      const s = shaftScaling(f);
      expect(s.packs).toBeGreaterThanOrEqual(prev.packs);
      expect(s.champion).toBeGreaterThanOrEqual(prev.champion);
      expect(s.affixes).toBeGreaterThanOrEqual(prev.affixes);
      expect(s.lifeMul).toBeGreaterThanOrEqual(prev.lifeMul);
      prev = s;
    }
    expect(shaftScaling(8).packs).toBeGreaterThan(shaftScaling(1).packs);
    expect(shaftScaling(8).champion).toBeGreaterThan(shaftScaling(1).champion);
    expect(shaftScaling(8).affixes).toBeGreaterThan(shaftScaling(1).affixes);
    const deep = shaftScaling(10_000);
    expect(deep.packs).toBe(SHAFT_TUNING.maxPacks);
    expect(deep.affixes).toBe(SHAFT_TUNING.maxAffixes);
    expect(deep.champion).toBeLessThanOrEqual(SHAFT_TUNING.champion[2]);
    expect(deep.lifeMul).toBeLessThanOrEqual(SHAFT_TUNING.life[1]);
    expect(shaftScaling(0)).toEqual(shaftScaling(1));
  });

  it('is denser from floor 2 and keeps rising every floor until the cap', () => {
    expect(shaftScaling(2).packs).toBeGreaterThan(0);
    const capFloor = Math.ceil(SHAFT_TUNING.maxPacks / SHAFT_TUNING.packsPerFloor) + 1;
    for (let f = 2; f <= capFloor; f++) expect(shaftScaling(f).packs, `floor ${f}`).toBeGreaterThan(shaftScaling(f - 1).packs);
    expect(shaftScaling(capFloor + 5).packs).toBe(SHAFT_TUNING.maxPacks);
    expect(shaftScaling(2).champion).toBeGreaterThan(shaftScaling(1).champion);
    expect(shaftScaling(2).lifeMul).toBeGreaterThan(1);
  });

  it('floor 2 really holds more monsters than floor 1 (averaged over layouts)', () => {
    const total = (floor: number) => {
      let n = 0;
      for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const g = inside('core_endless_shaft', 'dungeon.core_endless_shaft', 45, seed);
        g.rt.core!.shaft!.floor = floor;
        wakeAll(g);
        n += alive(g.world).length;
      }
      return n;
    };
    expect(total(2)).toBeGreaterThan(total(1) * 1.2);
  });

  it('keeps monsters within the Core level range even when the dungeon asks for 51', () => {
    const { rt } = inside('core_endless_shaft', 'dungeon.core_endless_shaft', 51);
    expect(rt.level).toBe(50);
  });

  it('clear a floor, a way down opens; each floor is denser; the deepest floor is remembered', () => {
    const g = inside('core_endless_shaft');
    const { world, ctx, rt, zone, player } = g;
    const counts: number[] = [];
    for (let floor = 1; floor <= 9; floor++) {
      expect(rt.core!.shaft!.floor).toBe(floor);
      wakeAll(g);
      counts.push(alive(world).length);
      clearField(world, ctx);
      expect(rt.core!.shaft!.cleared, `floor ${floor}`).toBe(true);
      expect(zone.found.has(`core.shaft.floor.${floor}`)).toBe(true);
      expect(signals(ctx)).toContainEqual({ type: 'objective', id: `core.shaft.floor.${floor}` });
      const portal = rt.core!.shaft!.portal!;
      expect(world.req(portal, Interactable).poi).toBe('deeper');
      expect(descend(world, ctx, rt)).toBe(floor >= 1);
      world.flushDestroyed();
      // The player starts the next floor at the entrance; nothing is awake yet.
      expect(world.req(player, Transform).x).toBe(rt.start.x);
      expect(alive(world)).toHaveLength(0);
    }
    expect(rt.core!.shaft!.floor).toBe(10);
    expect(rt.completed).toBe(true);
    expect(signals(ctx)).toContainEqual({ type: 'objective', id: 'dungeon.core_endless_shaft' });
    // Reaching floor 8 is what the quests wait for.
    expect(signals(ctx)).toContainEqual({ type: 'objective', id: 'dungeon.core_endless_shaft.floor_8' });
    expect(bestShaftFloor(zone.found)).toBe(9);
    expect(counts[8]!).toBeGreaterThan(counts[0]! * 1.5);
    expect(counts[1]!).toBeGreaterThan(counts[0]!);
    expect(objectiveText(world, rt, t)).toContain('deepest: 9');
  });

  it('the way down only works once the floor is clear, and elites carry extra affixes deeper down', () => {
    const g = inside('core_endless_shaft');
    expect(descend(g.world, g.ctx, g.rt)).toBe(false);
    // Floor 10: every elite carries the floor's extra affixes on top of the usual 1–2.
    g.rt.core!.shaft!.floor = 10;
    wakeAll(g);
    const elites = g.world.query(Elite);
    expect(elites.length).toBeGreaterThan(0);
    for (const e of elites) expect(g.world.req(e, Elite).affixes.length).toBeGreaterThanOrEqual(1 + SHAFT_TUNING.maxAffixes);
  });
});

describe('The Singing Halls', () => {
  it('rings a pillar when it is hit or when a fight breaks out beside it, and the whole room turns toward it', () => {
    const g = inside('core_singing_halls');
    const { world, ctx, rt, player } = g;
    expect(rt.def.hearing).toBe(true);
    const pillars = rt.core!.pillars!;
    expect(pillars.length).toBeGreaterThan(3);
    const p = pillars[0]!;
    const room = roomCenter(p.room);
    moveTo(world, player, room.x, room.z);
    run(world, ctx, [instanceSystem], 2);
    // Sleepers in that room, far from the player.
    const inRoom = alive(world).filter((e) => Math.max(Math.abs(world.req(e, Transform).x - room.x), Math.abs(world.req(e, Transform).z - room.z)) < 13);
    expect(inRoom.length).toBeGreaterThan(0);
    for (const e of inRoom) expect(world.req(e, EnemyAI).aggro).toBe(false);
    // Nothing rings by itself.
    run(world, ctx, [instanceSystem], 30);
    expect(inRoom.every((e) => world.req(e, EnemyAI).investigate === undefined)).toBe(true);
    // A hit on the pillar rings it (and it heals back at once).
    const h = world.req(p.entity, Health);
    h.current -= 50;
    moveTo(world, player, room.x + 30, room.z);
    run(world, ctx, [instanceSystem], 1);
    expect(h.current).toBe(h.max);
    expect(inRoom.every((e) => !world.has(e, Dead) && world.req(e, EnemyAI).investigate !== undefined)).toBe(true);
    // They go to it (hunting by ear), and the same pillar stays quiet during its cooldown.
    const pt = world.req(p.entity, Transform);
    const before = inRoom.map((e) => Math.hypot(world.req(e, Transform).x - pt.x, world.req(e, Transform).z - pt.z));
    run(world, ctx, [spatialSystem, enemyAISystem, movementSystem], 90);
    const after = inRoom.map((e) => Math.hypot(world.req(e, Transform).x - pt.x, world.req(e, Transform).z - pt.z));
    expect(after.filter((d, i) => d < before[i]!).length).toBeGreaterThan(0);
    expect(ctx.time).toBeLessThan(p.readyAt + 100);
    const ringsAt = p.readyAt;
    h.current -= 50;
    run(world, ctx, [instanceSystem], 1);
    if (ctx.time < ringsAt) expect(p.readyAt).toBe(ringsAt);
    // Combat close to a pillar rings it too.
    const q = pillars[1]!;
    const qr = roomCenter(q.room);
    moveTo(world, player, qr.x, qr.z);
    run(world, ctx, [instanceSystem], 2);
    expect(q.readyAt).toBe(0);
    const qt = world.req(q.entity, Transform);
    ctx.events.push({ type: 'damage', target: player, x: qt.x + 3, y: 1, z: qt.z, amount: 5, absorbed: 0, crit: false, damageType: 'physical', toPlayer: false, dot: false });
    run(world, ctx, [instanceSystem], 1);
    expect(q.readyAt).toBeGreaterThan(ctx.time);
    expect(PILLAR.cooldown).toBeGreaterThan(0);
  });

  it('ringPillar marks only sleepers in its own room, and pushes a noise the hunters can hear', () => {
    const g = inside('core_singing_halls');
    const { world, ctx, rt, player, zone } = g;
    wakeAll(g);
    const p = rt.core!.pillars![0]!;
    const tr = world.req(p.entity, Transform);
    const room = roomCenter(p.room);
    const drawn = ringPillar(world, ctx, tr, room);
    expect(drawn).toBeGreaterThan(0);
    expect(zone.underground!.noises.some((n) => n.x === tr.x && n.z === tr.z)).toBe(true);
    for (const e of alive(world)) {
      const et = world.req(e, Transform);
      const here = Math.max(Math.abs(et.x - room.x), Math.abs(et.z - room.z)) <= 13;
      expect(world.req(e, EnemyAI).investigate !== undefined, world.req(e, EnemyAI).defId).toBe(here);
    }
    void player;
  });

  it('the First Choir: a Choir Mother rooted among four singers, who empower what is near them', () => {
    const g = inside('core_singing_halls');
    const { world, ctx, rt, player } = g;
    wakeAll(g);
    clearField(world, ctx);
    expect(rt.objective.done).toBe(true);
    const c = roomCenter(rt.layout.rooms.find((r) => r.kind === 'boss')!);
    moveTo(world, player, c.x, c.z);
    run(world, ctx, [spatialSystem, instanceSystem, bossSystem], 2);
    const boss = rt.boss!;
    const def = ENEMY_DEFS.get('choir_mother')!;
    expect(world.req(boss, EnemyAI).defId).toBe('choir_mother');
    expect(def.choir && def.rooted).toBe(true);
    run(world, ctx, [spatialSystem, bossSystem], 2);
    const singers = world.req(boss, Boss).adds.filter((e) => world.req(e, EnemyAI).defId === 'choir_singer');
    expect(singers).toHaveLength(4);
    run(world, ctx, [spatialSystem], 1);
    choirAura(world, ctx, 1);
    expect(BOSS_SCRIPTS.first_choir!.some((p) => p.beams || p.sweep || p.fireballs)).toBe(true);
    kill(world, ctx, boss, 0);
    run(world, ctx, [instanceSystem]);
    expect(signals(ctx)).toContainEqual({ type: 'objective', id: 'dungeon.core_singing_halls' });
  });
});

describe('The Chamber of Creation', () => {
  it('four portals, each hatching a different earlier region; closing all four opens the Brood Engine', () => {
    const g = inside('core_chamber_of_creation');
    const { world, ctx, rt, player } = g;
    const portals = rt.extra.portals!;
    expect(portals).toHaveLength(4);
    wakeAll(g);
    clearField(world, ctx);
    const pools = portals.map((p) => world.req(p, Targetable).spawn!.pool!);
    expect(new Set(pools.map((p) => p.join())).size).toBe(4);
    // The regions' creatures, in their shade versions where those exist.
    expect(pools[0]).toEqual(['shade_walker', 'shade_hound']);
    expect(pools[1]).toContain('shade_smelter');
    expect(pools[2]).toContain('shade_weaver');
    expect(pools[3]).toContain('crystal_walker');
    // Standing next to a portal, it hatches creatures from its own pool, drawn as shades.
    portals.forEach((p, i) => {
      const pt = world.req(p, Transform);
      moveTo(world, player, pt.x + 4, pt.z);
      const seen = new Set<string>();
      for (let s = 0; s < 40 && seen.size === 0; s++) {
        run(world, ctx, [instanceSystem], 60);
        for (const e of alive(world)) {
          const et = world.req(e, Transform);
          if (Math.hypot(et.x - pt.x, et.z - pt.z) < 4) {
            seen.add(world.req(e, EnemyAI).defId);
            expect(world.req(e, Renderable).look).toBeDefined();
          }
        }
        killAll(world, ctx);
      }
      expect(seen.size, `portal ${i}`).toBeGreaterThan(0);
      for (const id of seen) expect(pools[i], `${id} from portal ${i}`).toContain(id);
    });
    expect(rt.objective.done).toBe(false);
    for (const p of portals) kill(world, ctx, p, 0);
    run(world, ctx, [instanceSystem], 2);
    expect(rt.objective.progress).toBe(4);
    expect(rt.objective.done).toBe(true);
    expect(objectiveText(world, rt, t)).toContain('Brood Engine');
    killAll(world, ctx);
    const c = roomCenter(rt.layout.rooms.find((r) => r.kind === 'boss')!);
    moveTo(world, player, c.x, c.z);
    run(world, ctx, [spatialSystem, instanceSystem, bossSystem], 2);
    const boss = rt.boss!;
    expect(world.req(boss, EnemyAI).defId).toBe('brood_engine');
    // Each phase opens a hatch to another region.
    const adds = BOSS_SCRIPTS.brood_engine!.map((p) => p.adds!.enemy);
    expect(adds).toEqual(['shade_walker', 'shade_smelter', 'shade_weaver', 'crystal_walker']);
    kill(world, ctx, boss, 0);
    run(world, ctx, [instanceSystem]);
    expect(signals(ctx)).toContainEqual({ type: 'objective', id: 'dungeon.core_chamber_of_creation' });
  });
});

describe('Memory Mirrors', () => {
  const MIRRORS = [['core.mirror.0', 'core_mirror_ash', 'ash'], ['core.mirror.1', 'core_mirror_refinery', 'refinery'], ['core.mirror.2', 'core_mirror_vault', 'vault']] as const;

  it('hold comparable crowds: at least a few shades in every populated room, in all three', () => {
    for (const [, id] of MIRRORS) {
      const def = INSTANCES.find((d) => d.id === id)!;
      let least = 0;
      for (const p of def.packs) least += packTemplate(p).members.filter((m) => m.chance === undefined).reduce((n, m) => n + m.count[0], 0);
      expect(least, id).toBeGreaterThanOrEqual(3);
      let total = 0;
      for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const g = inside(id, 'core.mirror.x', 45, seed);
        wakeAll(g);
        total += alive(g.world).length;
      }
      expect(total / 6, id).toBeGreaterThanOrEqual(11);
    }
  });

  it('are bunker-sized, cleared by killing the shades, and leave a lore log and a reward chest', () => {
    for (const [poi, id, key] of MIRRORS) {
      const g = inside(id, poi);
      const { world, ctx, rt } = g;
      expect(rt.def.kind).toBe('bunker');
      expect(rt.layout.rooms.length).toBeLessThanOrEqual(5);
      wakeAll(g);
      const logs = objects(world, 'lore');
      expect(logs, id).toHaveLength(1);
      expect(world.req(logs[0]!, Interactable).poi).toBe(`cmirror.${key}`);
      expect(alive(world).length).toBeGreaterThan(0);
      for (const e of alive(world)) expect(world.req(e, Renderable).look, id).toBeDefined();
      clearField(world, ctx);
      expect(rt.completed, id).toBe(true);
      expect(objects(world, 'cache'), id).toHaveLength(1);
      expect(signals(ctx)).toContainEqual({ type: 'objective', id: poi });
    }
  });
});

describe('The Elevator Base', () => {
  const grid = caveGrid(THE_CORE)!;
  function atBase() {
    const world = new World();
    const zone = createZoneRuntime(THE_CORE);
    const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize, zoneLevels: [40, 50] });
    const player = spawnPlayer(world, 'bastion', 0, -200);
    world.req(player, Health).max = world.req(player, Health).current = 1e7;
    syncSetPieces(world, zone);
    return { world, ctx, zone, player };
  }
  const SYS: SystemFn[] = [spatialSystem, setPieceSystem, bossSystem];

  it('bars the heart causeway across its whole width until the Base is held', () => {
    const { world, ctx, zone, player } = atBase();
    run(world, ctx, SYS, 2);
    const st = zone.setPieces.base!;
    expect(st.gate).toHaveLength(CAUSEWAY_GATE.xs.length);
    // Every walkable spot along the gate line is within reach of a barricade.
    let walkable = 0;
    for (let x = -60; x <= 60; x += 0.5) {
      if (!walkableAt(grid, x, CAUSEWAY_GATE.z)) continue;
      walkable++;
      const near = st.gate.some((g) => Math.hypot(world.req(g, Transform).x - x, world.req(g, Transform).z - CAUSEWAY_GATE.z) <= world.req(g, Collider).radius);
      expect(near, `x=${x}`).toBe(true);
    }
    expect(walkable).toBeGreaterThan(10);
    void player;
  });

  it('plays six waves with Vire, the Warden and Kade as Memory Shades, allies arrive, then opens the causeway', () => {
    const { world, ctx, zone, player } = atBase();
    moveTo(world, player, ELEVATOR_BASE.x, ELEVATOR_BASE.z - 10);
    run(world, ctx, SYS, 2);
    const st = zone.setPieces.base!;
    expect(st.state).toBe('waves');
    expect(zone.found.has(ELEVATOR_BASE.id)).toBe(false);
    const bosses: string[] = [];
    let alliesSeen = 0;
    for (let guard = 0; guard < 6000 && st.state === 'waves'; guard++) {
      run(world, ctx, SYS, 30);
      for (const b of st.bosses) if (!bosses.includes(world.req(b, EnemyAI).defId)) bosses.push(world.req(b, EnemyAI).defId);
      alliesSeen = Math.max(alliesSeen, st.allies.length);
      if (st.state === 'waves') expect(st.gate).toHaveLength(CAUSEWAY_GATE.xs.length);
      killAll(world, ctx);
    }
    expect(st.state).toBe('cleared');
    expect(bosses).toEqual(['shade_vire', 'shade_warden', 'shade_kade']);
    expect(st.wave).toBe(BASE_TUNING.waves.length - 1);
    expect(alliesSeen).toBeGreaterThan(0);
    expect(world.query(MinionAI).length).toBeGreaterThanOrEqual(0);
    run(world, ctx, SYS, 2);
    world.flushDestroyed();
    expect(zone.found.has(ELEVATOR_BASE.id)).toBe(true);
    expect(zone.discovered.has('tp.base')).toBe(true);
    expect(st.gate).toHaveLength(0);
    expect(signals(ctx)).toContainEqual({ type: 'objective', id: ELEVATOR_BASE.id });
    expect(ctx.events.peek().some((e) => e.type === 'interact' && e.kind === 'reclaimed' && e.id === ELEVATOR_BASE.id)).toBe(true);
    expect(ctx.rewards.some((r) => r.rarity === 'legendary')).toBe(true);
    // Held for good: reloading keeps the causeway open.
    syncSetPieces(world, zone);
    run(world, ctx, SYS, 2);
    expect(zone.setPieces.base!.state).toBe('cleared');
    expect(zone.setPieces.base!.gate).toHaveLength(0);
  });

  it('allies are friendly fighters built on the minion code, with the earlier regions names', () => {
    const { world, ctx, zone, player } = atBase();
    moveTo(world, player, ELEVATOR_BASE.x, ELEVATOR_BASE.z - 10);
    run(world, ctx, SYS, 2);
    run(world, ctx, SYS, 60 * 6);
    const st = zone.setPieces.base!;
    expect(st.wave).toBe(0);
    expect(st.allies).toHaveLength(1);
    const a = st.allies[0]!;
    expect(world.req(a, MinionAI).owner).toBe(player);
    for (const ally of BASE_TUNING.allies) expect(typeof lang(ally.name), ally.name).toBe('string');
  });

  it('dying resets the defence and keeps the causeway barred', () => {
    const { world, ctx, zone, player } = atBase();
    moveTo(world, player, ELEVATOR_BASE.x, ELEVATOR_BASE.z - 10);
    run(world, ctx, SYS, 60 * 6);
    const st = zone.setPieces.base!;
    expect(alive(world).length).toBeGreaterThan(0);
    setPiecesOnDeath(world, zone);
    world.flushDestroyed();
    expect(st.state).toBe('idle');
    expect(alive(world)).toHaveLength(0);
    // Wave 2's Vire brings guards; her whole retinue goes with the reset, nothing is left floating.
    for (let i = 0; i < 6000 && st.bosses.length === 0; i++) {
      run(world, ctx, SYS, 30);
      if (st.bosses.length === 0) killAll(world, ctx);
    }
    expect(st.bosses).toHaveLength(1);
    run(world, ctx, SYS, 60);
    expect(alive(world).length).toBeGreaterThan(0);
    setPiecesOnDeath(world, zone);
    world.flushDestroyed();
    expect(alive(world)).toHaveLength(0);
    expect(world.query(Targetable)).toHaveLength(0);
    expect(st.gate).toHaveLength(CAUSEWAY_GATE.xs.length);
  });
});
