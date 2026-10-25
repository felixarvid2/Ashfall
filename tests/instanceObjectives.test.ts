import { describe, expect, it } from 'vitest';
import { Dead, EnemyAI, Health, Interactable, MoveTarget, Renderable, Targetable, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { World, type Entity } from '../src/core/ecs';
import { INSTANCES } from '../src/data/instances';
import { kill } from '../src/systems/combat';
import { createQuestRuntime } from '../src/systems/quests';
import { buildInstance, instanceInteract, instanceSystem, roomCenter } from '../src/world/instance';
import { objectiveCount, objectiveDetail } from '../src/world/instanceObjectives';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

function setup(defId: string, seed = 'obj1') {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 2600, quests: createQuestRuntime(), account: emptyAccount() });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const rt = buildInstance(world, ctx, defId, `dungeon.${defId}`, seed, 3, { x: 10, z: 10 });
  ctx.instance = rt;
  moveTo(world, player, rt.start.x, rt.start.z);
  return { world, ctx, player, rt };
}
type Setup = ReturnType<typeof setup>;

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}
const objects = (world: World, kind: string) => world.query(Interactable).filter((e) => world.req(e, Interactable).kind === kind);
const use = ({ world, ctx }: Setup, e: Entity): boolean => instanceInteract(world, ctx, e, world.req(e, Interactable));
const tick = ({ world, ctx }: Setup, seconds: number): void => run(world, ctx, [instanceSystem], Math.round(seconds * 60));
const enemies = (world: World) => world.query(EnemyAI).filter((e) => !world.has(e, Dead)).length;
const banners = (ctx: Setup['ctx']) => ctx.events.peek().filter((e) => e.type === 'banner').map((e) => (e as { key: string }).key);

describe('objective counts', () => {
  it('count-based objectives report their count, the rest count to one', () => {
    expect(objectiveCount({ kind: 'valves', count: 3, wave: 5 })).toBe(3);
    expect(objectiveCount({ kind: 'follow', life: 1, speed: 1, stopRadius: 1 })).toBe(1);
    expect(objectiveCount({ kind: 'clear' })).toBe(1);
  });
});

describe('valves (Smelter 3)', () => {
  it('shutting the pumps in the panel order completes the objective and opens the gate', () => {
    const s = setup('smelter_3');
    const { world, rt } = s;
    expect(rt.extra.valves).toHaveLength(3);
    expect(rt.gate.length).toBeGreaterThan(0);
    for (const i of rt.extra.order!) expect(use(s, rt.extra.valves![i]!.entity)).toBe(true);
    expect(rt.objective.progress).toBe(3);
    tick(s, 0.1);
    expect(rt.objective.done).toBe(true);
    expect(rt.gate).toHaveLength(0);
    // A valve that was already shut does nothing a second time.
    expect(use(s, rt.extra.valves![rt.extra.order![0]!]!.entity)).toBe(false);
    expect(world.req(rt.extra.valves![0]!.entity, Interactable).used).toBe(true);
  });

  it('a wrong pump reopens everything, flares the heat and calls a wave', () => {
    const s = setup('smelter_3');
    const { world, rt } = s;
    const order = rt.extra.order!;
    use(s, rt.extra.valves![order[0]!]!.entity);
    expect(rt.objective.progress).toBe(1);
    const heat = rt.extra.heat!;
    const before = enemies(world);
    use(s, rt.extra.valves![order[2]!]!.entity);
    expect(rt.objective.progress).toBe(0);
    expect(rt.extra.heat!).toBeGreaterThan(heat);
    expect(enemies(world)).toBeGreaterThan(before);
    for (const v of rt.extra.valves!) expect(world.req(v.entity, Interactable).used).toBe(false);
    expect(banners(s.ctx)).toContain('instances.wrongValve');
  });

  it('the furnace heat rises over time and cooling a pump lowers it', () => {
    const s = setup('smelter_3');
    const { rt } = s;
    tick(s, 20);
    const hot = rt.extra.heat!;
    expect(hot).toBeGreaterThan(0);
    use(s, rt.extra.valves![rt.extra.order![0]!]!.entity);
    expect(rt.extra.heat!).toBeLessThan(hot);
    expect(objectiveDetail(s.world, rt, (k) => k)).toContain('instances.objective.valves');
  });
});

describe('rescue (Cathedral Crypt)', () => {
  it('freeing every prisoner completes the objective', () => {
    const s = setup('cathedral_crypt');
    const { rt } = s;
    expect(rt.extra.cages).toHaveLength(4);
    for (const c of rt.extra.cages!) expect(use(s, c.entity)).toBe(true);
    expect(rt.extra.cages!.every((c) => c.state === 'freed')).toBe(true);
    tick(s, 0.1);
    expect(rt.objective.progress).toBe(4);
    expect(rt.objective.done).toBe(true);
    expect(s.ctx.rewards).toHaveLength(4);
  });

  it('the pyre lights when the player enters the room, and a prisoner not freed in time is lost', () => {
    const s = setup('cathedral_crypt');
    const { world, player, rt } = s;
    const cage = rt.extra.cages![0]!;
    expect(cage.remaining).toBeNull();
    const c = roomCenter(cage.room);
    moveTo(world, player, c.x, c.z);
    tick(s, 0.1);
    expect(cage.remaining).not.toBeNull();
    tick(s, 71);
    expect(cage.state).toBe('lost');
    expect(use(s, cage.entity)).toBe(false);
    expect(world.req(cage.entity, Interactable).used).toBe(true);
    expect(objectiveDetail(world, rt, (k) => k)).toContain('instances.objective.rescue');
  });
});

describe('defend (Cold Hall compressor, Shaft 13 elevator)', () => {
  it('restarting the machine and holding it for the time completes the objective', () => {
    const s = setup('cold_hall');
    const { world, rt } = s;
    const machine = objects(world, 'compressor')[0]!;
    expect(use(s, machine)).toBe(true);
    expect(rt.extra.defend!.state).toBe('running');
    expect(world.has(machine, Health)).toBe(true);
    // Running machines cannot be started again; waves of enemies come while it runs.
    expect(use(s, machine)).toBe(false);
    tick(s, 12);
    expect(enemies(world)).toBeGreaterThan(0);
    // Keep the machine alive through the time.
    world.req(machine, Health).current = world.req(machine, Health).max;
    for (let i = 0; i < 6; i++) {
      tick(s, 10);
      world.req(machine, Health).current = world.req(machine, Health).max;
    }
    expect(rt.objective.done).toBe(true);
    expect(world.req(machine, Renderable).glow).toBe('#7dffb0');
  });

  it('a destroyed machine resets, and can be started again after a pause', () => {
    const s = setup('cold_hall');
    const { world, ctx, rt } = s;
    const machine = objects(world, 'compressor')[0]!;
    use(s, machine);
    kill(world, ctx, machine, 0);
    tick(s, 0.1);
    expect(rt.extra.defend!.state).toBe('idle');
    expect(rt.extra.defend!.entity).toBeNull();
    expect(rt.objective.done).toBe(false);
    tick(s, 6);
    const again = objects(world, 'compressor').find((e) => !world.has(e, Dead));
    expect(again).toBeDefined();
    expect(use(s, again!)).toBe(true);
  });

  it('the elevator variant uses its own banners', () => {
    const s = setup('shaft_13');
    const machine = objects(s.world, 'compressor')[0]!;
    use(s, machine);
    expect(banners(s.ctx)).toContain('instances.elevatorStart');
  });
});

describe('follow (Pipe Alleys)', () => {
  it('the robot waits while enemies are near and walks on once the way is clear', () => {
    const s = setup('pipe_alleys');
    const { world, player, rt } = s;
    const robot = rt.extra.robot!;
    for (const e of world.query(EnemyAI)) world.destroyDeferred(e);
    world.flushDestroyed();
    const rtr = world.req(robot.entity!, Transform);
    moveTo(world, player, rtr.x + 2, rtr.z);
    tick(s, 0.1);
    const goal = robot.path[robot.next]!;
    expect(world.get(robot.entity!, MoveTarget)).toMatchObject({ x: goal.x, z: goal.z });
    // An enemy beside it holds it back.
    const guard = spawnEnemy(world, 'infected_colonist', rtr.x + 3, rtr.z);
    tick(s, 0.1);
    expect(world.get(robot.entity!, MoveTarget)).toBeUndefined();
    // So does a player who has fallen far behind.
    kill(world, s.ctx, guard, 0);
    moveTo(world, player, rtr.x + 40, rtr.z);
    tick(s, 0.1);
    expect(world.get(robot.entity!, MoveTarget)).toBeUndefined();
  });

  it('reaching the end of the path completes the objective', () => {
    const s = setup('pipe_alleys');
    const { world, player, rt } = s;
    const robot = rt.extra.robot!;
    for (const e of world.query(EnemyAI)) world.destroyDeferred(e);
    world.flushDestroyed();
    for (let i = robot.next; i < robot.path.length; i++) {
      const p = robot.path[i]!;
      moveTo(world, robot.entity!, p.x, p.z);
      moveTo(world, player, p.x, p.z);
      tick(s, 0.05);
    }
    expect(rt.objective.progress).toBe(1);
    expect(rt.objective.done).toBe(true);
  });

  it('a destroyed robot comes back after a few seconds', () => {
    const s = setup('pipe_alleys');
    const { world, ctx, rt } = s;
    const robot = rt.extra.robot!;
    const first = robot.entity!;
    kill(world, ctx, first, 0);
    tick(s, 0.1);
    expect(robot.entity).toBeNull();
    expect(banners(ctx)).toContain('instances.robotDown');
    tick(s, 5);
    expect(robot.entity).not.toBeNull();
    expect(robot.entity).not.toBe(first);
  });
});

describe('drain (Irrigation System)', () => {
  it('each lever drains its stretch of water and calls a wave; all levers complete it', () => {
    const s = setup('irrigation_system');
    const { world, rt } = s;
    const levers = rt.extra.levers!;
    expect(levers).toHaveLength(3);
    const allWater = new Set(levers.flatMap((l) => l.water));
    expect(allWater.size).toBe(rt.extra.env!.filter((f) => f.kind === 'water').length);
    const before = enemies(world);
    expect(use(s, levers[0]!.entity)).toBe(true);
    expect(rt.objective.progress).toBe(1);
    expect(enemies(world)).toBeGreaterThan(before);
    for (const id of levers[0]!.water) expect(rt.extra.drained!.has(id)).toBe(true);
    expect(rt.extra.drained!.size).toBe(levers[0]!.water.length);
    // A pulled lever is spent.
    expect(use(s, levers[0]!.entity)).toBe(false);
    use(s, levers[1]!.entity);
    use(s, levers[2]!.entity);
    tick(s, 0.1);
    expect(rt.objective.done).toBe(true);
    expect(rt.extra.drained!.size).toBe(allWater.size);
  });
});

describe('mirrors (Crystal Labyrinth)', () => {
  it('turning a mirror to its position lights it; every mirror lit completes the objective', () => {
    const s = setup('crystal_labyrinth');
    const { world, rt } = s;
    const mirrors = rt.extra.mirrors!;
    expect(mirrors).toHaveLength(3);
    expect(mirrors.every((m) => m.turn !== m.aligned)).toBe(true);
    for (const m of mirrors) {
      let turns = 0;
      while (m.turn !== m.aligned) {
        expect(use(s, m.entity)).toBe(true);
        turns++;
        expect(turns).toBeLessThanOrEqual(3);
      }
      // Lit mirrors stay put.
      expect(use(s, m.entity)).toBe(false);
    }
    expect(rt.objective.progress).toBe(3);
    expect(world.req(mirrors[0]!.entity, Renderable).glow).toBe('#e8ffff');
    tick(s, 0.1);
    expect(rt.objective.done).toBe(true);
  });
});

describe('cocoons (Cocoon Chamber)', () => {
  it('hatch when the player comes close, once', () => {
    const s = setup('cocoon_chamber');
    const { world, player, rt } = s;
    const cocoons = rt.extra.cocoons!;
    expect(cocoons.length).toBeGreaterThan(0);
    const total = cocoons.length;
    const target = cocoons[0]!;
    const before = enemies(world);
    moveTo(world, player, target.x, target.z);
    tick(s, 0.05);
    expect(rt.extra.cocoons!.length).toBeLessThan(total);
    expect(rt.extra.cocoons!.some((c) => c === target)).toBe(false);
    expect(enemies(world)).toBeGreaterThanOrEqual(before + 3);
    const after = enemies(world);
    tick(s, 0.05);
    expect(enemies(world)).toBe(after);
  });
});

describe('portals (Chamber of Creation)', () => {
  it('closing every portal completes the objective', () => {
    const s = setup('core_chamber_of_creation');
    const { world, ctx, rt } = s;
    const portals = rt.extra.portals!;
    const def = INSTANCES.find((d) => d.id === 'core_chamber_of_creation')!.objective;
    expect(portals).toHaveLength(def.kind === 'portals' ? def.count : -1);
    expect(portals.length).toBeGreaterThan(0);
    for (const p of portals) expect(world.has(p, Targetable)).toBe(true);
    kill(world, ctx, portals[0]!, 0);
    tick(s, 0.1);
    expect(rt.objective.progress).toBe(1);
    expect(rt.objective.done).toBe(false);
    for (const p of portals.slice(1)) kill(world, ctx, p, 0);
    tick(s, 0.1);
    expect(rt.objective.done).toBe(true);
    expect(objectiveDetail(world, rt, (k) => k)).toContain('instances.objective.portals');
  });
});
