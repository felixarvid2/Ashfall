import { describe, expect, it } from 'vitest';
import { Collider, Health, Transform, makeTransform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { DEEP_MINES, dm } from '../src/data/zones/deepMines';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { buildField, clearLine, freeLine, navigationSystem, nextWaypoint } from '../src/systems/navigation';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { rockSystem } from '../src/world/underground';
import { createZoneRuntime } from '../src/world/zone';
import { buildInstance, roomCenter } from '../src/world/instance';
import { createQuestRuntime } from '../src/systems/quests';
import { makeCtx, run, type SystemFn } from './helpers';

const WITH_NAV: SystemFn[] = [spatialSystem, navigationSystem, enemyAISystem, movementSystem, collisionSystem, rockSystem];
const WITHOUT_NAV: SystemFn[] = [spatialSystem, enemyAISystem, movementSystem, collisionSystem, rockSystem];

/** A wall of static posts across x ∈ [−half, half] at z. */
function wall(world: World, z: number, half: number) {
  for (let x = -half; x <= half; x += 0.8) {
    const e = world.create();
    world.add(e, Transform, makeTransform(x, 0, z));
    world.add(e, Collider, { radius: 0.5, mass: Infinity, layer: 'ground', isStatic: true });
  }
}

function closest(systems: SystemFn[], setup: () => { world: World; ctx: ReturnType<typeof makeCtx>; px: number; pz: number; enemy: number }, seconds: number) {
  const { world, ctx, px, pz, enemy } = setup();
  let best = Infinity;
  for (let i = 0; i < seconds * 60; i++) {
    run(world, ctx, systems);
    const t = world.req(enemy, Transform);
    best = Math.min(best, Math.hypot(t.x - px, t.z - pz));
  }
  return best;
}

describe('enemy pathfinding', () => {
  function behindWall() {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 200 });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    world.req(player, Health).max = world.req(player, Health).current = 1e7;
    wall(world, 5, 8);
    const enemy = spawnEnemy(world, 'crystal_walker', 0, 10, { level: 30, aggro: true });
    return { world, ctx, px: 0, pz: 0, enemy };
  }

  it('walks round a wall instead of pressing against it', () => {
    const stuck = closest(WITHOUT_NAV, behindWall, 12);
    const found = closest(WITH_NAV, behindWall, 12);
    expect(stuck).toBeGreaterThan(4);
    expect(found).toBeLessThan(2.5);
  });

  it('heads straight for the player when the way is clear', () => {
    const world = new World();
    const ctx = makeCtx({ worldHalfSize: 200 });
    spawnPlayer(world, 'bastion', 0, 0);
    run(world, ctx, [spatialSystem]);
    expect(nextWaypoint(buildField(world, ctx, 0, 0), 10, 10)).toBeNull();
    // No one chasing: the system builds no field.
    run(world, ctx, [navigationSystem]);
    expect(ctx.nav).toBeUndefined();
    wall(world, 5, 8);
    run(world, ctx, [spatialSystem]);
    const f = buildField(world, ctx, 0, 0);
    expect(freeLine(f, 0, 10, 0, 0)).toBe(false);
    // Thin posts block walking but not sight.
    expect(clearLine(f, 0, 10, 0, 0)).toBe(true);
    const wp = nextWaypoint(f, 0, 10)!;
    expect(wp).not.toBeNull();
    // It steps sideways toward an end of the wall, not into it.
    expect(Math.abs(wp.x)).toBeGreaterThan(0.5);
  });

  it('follows a winding tunnel in the Deep Mines round the rock', () => {
    const [px, pz] = dm(-40, -175);
    const base = () => {
      const world = new World();
      const zone = createZoneRuntime(DEEP_MINES);
      const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: DEEP_MINES.halfSize });
      const player = spawnPlayer(world, 'bastion', px, pz);
      world.req(player, Health).max = world.req(player, Health).current = 1e7;
      return { world, ctx };
    };
    // Find a spot 25–60 m away that is reachable through the tunnels but hidden behind rock.
    const probe = base();
    run(probe.world, probe.ctx, [spatialSystem]);
    const f = buildField(probe.world, probe.ctx, px, pz);
    let spot: { x: number; z: number } | null = null;
    for (let k = 0; k < f.n * f.n && !spot; k++) {
      const x = f.x0 + ((k % f.n) + 0.5) * f.cell;
      const z = f.z0 + (Math.floor(k / f.n) + 0.5) * f.cell;
      const d = Math.hypot(x - px, z - pz);
      if (f.blocked[k] || d < 25 || d > 60 || !Number.isFinite(f.dist[k]!)) continue;
      if (f.dist[k]! / 10 < (d / f.cell) * 1.25) continue;
      if (!clearLine(f, x, z, px, pz)) spot = { x, z };
    }
    expect(spot).not.toBeNull();
    const setup = () => {
      const { world, ctx } = base();
      const enemy = spawnEnemy(world, 'crystal_walker', spot!.x, spot!.z, { level: 34, aggro: true });
      return { world, ctx, px, pz, enemy };
    };
    expect(closest(WITH_NAV, setup, 40)).toBeLessThan(3);
  });

  it('finds the doorway between dungeon rooms', () => {
    const setup = () => {
      const world = new World();
      const ctx = makeCtx({ worldHalfSize: 2600, quests: createQuestRuntime(), account: emptyAccount() });
      const player = spawnPlayer(world, 'bastion', 0, 0);
      world.req(player, Health).max = world.req(player, Health).current = 1e7;
      const rt = buildInstance(world, ctx, 'shaft_13', 'dungeon.shaft_13', 's2', 34, { x: 10, z: 10 });
      ctx.instance = rt;
      const rooms = [...rt.layout.rooms].sort((a, b) => a.depth - b.depth);
      const far = rooms.find((r) => r.depth >= 2)!;
      const c = roomCenter(far);
      const t = world.req(player, Transform);
      t.x = t.prevX = rt.start.x;
      t.z = t.prevZ = rt.start.z;
      const enemy = spawnEnemy(world, 'crystal_walker', c.x, c.z, { level: 34, aggro: true });
      return { world, ctx, px: rt.start.x, pz: rt.start.z, enemy };
    };
    expect(closest(WITH_NAV, setup, 40)).toBeLessThan(4);
  });
});
