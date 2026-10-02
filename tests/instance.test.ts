import { describe, expect, it } from 'vitest';
import { Boss, Dead, EnemyAI, Interactable, Targetable, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { emptyAccount } from '../src/core/account';
import { INSTANCES } from '../src/data/instances';
import { kill } from '../src/systems/combat';
import { createQuestRuntime } from '../src/systems/quests';
import { buildInstance, clearInstance, connected, generateLayout, instanceInteract, instanceSystem, roomCenter } from '../src/world/instance';
import { spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

function setup(defId: string, seed = 's1') {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 2600, quests: createQuestRuntime(), account: emptyAccount() });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const rt = buildInstance(world, ctx, defId, defId === 'bunker' ? 'bunker.0' : `dungeon.${defId}`, seed, 3, { x: 10, z: 10 });
  ctx.instance = rt;
  moveTo(world, player, rt.start.x, rt.start.z);
  return { world, ctx, player, rt };
}

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

const objects = (world: World, kind: string) => world.query(Interactable).filter((e) => world.req(e, Interactable).kind === kind);

function killEverything(world: World, ctx: ReturnType<typeof makeCtx>) {
  for (const e of world.query(EnemyAI)) if (!world.has(e, Dead)) kill(world, ctx, e, 0);
}

describe('dungeon layouts', () => {
  it('are connected, sized by their definition, with one start and one boss room', () => {
    for (const def of INSTANCES) {
      for (let i = 0; i < 40; i++) {
        const layout = generateLayout(new Rng(`${def.id}-${i}`), def);
        expect(connected(layout)).toBe(true);
        const kinds = layout.rooms.map((r) => r.kind);
        expect(kinds.filter((k) => k === 'start')).toHaveLength(1);
        expect(kinds.filter((k) => k === 'boss')).toHaveLength(1);
        const main = kinds.filter((k) => k !== 'side').length;
        expect(main).toBeGreaterThanOrEqual(def.main[0]);
        expect(main).toBeLessThanOrEqual(def.main[1]);
        const cells = new Set(layout.rooms.map((r) => `${r.gx},${r.gz}`));
        expect(cells.size).toBe(layout.rooms.length);
      }
    }
  });

  it('differ between seeds', () => {
    const def = INSTANCES[0]!;
    const a = generateLayout(new Rng('a'), def).rooms.map((r) => `${r.gx},${r.gz}`).join('|');
    const b = generateLayout(new Rng('b'), def).rooms.map((r) => `${r.gx},${r.gz}`).join('|');
    expect(a).not.toBe(b);
  });
});

describe('instances', () => {
  it("Meridian's Hold: three generators charge under attack, then the boss gate opens", () => {
    const { world, ctx, player, rt } = setup('meridians_hold');
    expect(rt.gate.length).toBeGreaterThan(0);
    const gens = objects(world, 'generator');
    expect(gens).toHaveLength(3);
    for (const g of gens) {
      const tr = world.req(g, Transform);
      moveTo(world, player, tr.x + 2, tr.z);
      const before = world.query(EnemyAI).length;
      expect(instanceInteract(world, ctx, g, world.req(g, Interactable))).toBe(true);
      expect(world.query(EnemyAI).length).toBeGreaterThan(before);
      run(world, ctx, [instanceSystem], 60 * 7);
    }
    expect(rt.objective.progress).toBe(3);
    expect(rt.objective.done).toBe(true);
    expect(rt.gate).toHaveLength(0);
    // Walk into the boss room: the boss appears; killing it completes the dungeon.
    const bossRoom = rt.layout.rooms.find((r) => r.kind === 'boss')!;
    const c = roomCenter(bossRoom);
    moveTo(world, player, c.x, c.z);
    run(world, ctx, [instanceSystem]);
    expect(rt.boss).not.toBeNull();
    expect(world.has(rt.boss!, Boss)).toBe(true);
    kill(world, ctx, rt.boss!, 0);
    run(world, ctx, [instanceSystem]);
    expect(rt.completed).toBe(true);
    expect(objects(world, 'cache')).toHaveLength(1);
    expect(objects(world, 'portal').length).toBeGreaterThanOrEqual(2);
    expect(ctx.quests!.signals).toContainEqual({ type: 'objective', id: 'dungeon.meridians_hold' });
    expect(ctx.account!.restoration['zone']!.points).toContain('instance:dungeon.meridians_hold');
  });

  it('Bunker Sierra-4 needs two keycards; the Drainage Tunnels need their nests destroyed', () => {
    const a = setup('bunker_sierra4');
    for (const k of objects(a.world, 'instanceKey')) instanceInteract(a.world, a.ctx, k, a.world.req(k, Interactable));
    run(a.world, a.ctx, [instanceSystem]);
    expect(a.rt.objective.done).toBe(true);

    const b = setup('drainage_tunnels');
    const nests = b.world.query(Targetable);
    expect(nests).toHaveLength(4);
    for (const n of nests) kill(b.world, b.ctx, n, 0);
    run(b.world, b.ctx, [instanceSystem]);
    expect(b.rt.objective.progress).toBe(4);
    expect(b.rt.objective.done).toBe(true);
  });

  it('bunkers are cleared by killing everything, with no boss', () => {
    const { world, ctx, player, rt } = setup('bunker');
    for (const room of rt.layout.rooms) {
      const c = roomCenter(room);
      moveTo(world, player, c.x, c.z);
      run(world, ctx, [instanceSystem]);
    }
    killEverything(world, ctx);
    run(world, ctx, [instanceSystem], 2);
    expect(rt.completed).toBe(true);
    expect(rt.boss).toBeNull();
    expect(ctx.quests!.signals).toContainEqual({ type: 'objective', id: 'bunker.0' });
  });

  it('leaving removes everything built in instance space', () => {
    const { world, player } = setup('meridians_hold');
    clearInstance(world);
    expect(world.query(Transform).every((e) => e === player)).toBe(true);
  });
});
