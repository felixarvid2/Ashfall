import { describe, expect, it } from 'vitest';
import { Collider, EnemyAI, Faction, Hazard, Health, Taunt, Transform, makeTransform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { DEEP_MINES, dm } from '../src/data/zones/deepMines';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { applyStatus } from '../src/systems/combat';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { buildGrid, buildNav, clearLine, findPath, freeLine, lineOfSight, navigationSystem } from '../src/systems/navigation';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { rockSystem } from '../src/world/underground';
import { createZoneRuntime } from '../src/world/zone';
import { caveGrid, walkableAt } from '../src/data/zones/caves';
import { makeCtx, run, type SystemFn } from './helpers';

const SYSTEMS: SystemFn[] = [spatialSystem, navigationSystem, enemyAISystem, movementSystem, collisionSystem, rockSystem];
const NO_NAV: SystemFn[] = [spatialSystem, enemyAISystem, movementSystem, collisionSystem, rockSystem];

type Ctx = ReturnType<typeof makeCtx>;

/** Static posts in a line from (ax, az) to (bx, bz). */
function wall(world: World, ax: number, az: number, bx: number, bz: number, radius = 0.5) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / (radius * 1.6)));
  for (let i = 0; i <= n; i++) {
    const e = world.create();
    world.add(e, Transform, makeTransform(ax + ((bx - ax) * i) / n, 0, az + ((bz - az) * i) / n));
    world.add(e, Collider, { radius, mass: Infinity, layer: 'ground', isStatic: true });
  }
}

function tough(world: World, e: Entity) {
  const h = world.req(e, Health);
  h.max = h.current = 1e8;
}

function arena() {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 200 });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  tough(world, player);
  return { world, ctx, player };
}

function step(world: World, ctx: Ctx, systems: SystemFn[], seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 60; i++) {
    run(world, ctx, systems);
    each?.();
  }
}

describe('wayfinding: melee attackers surround their target', () => {
  it('a pack arriving from one side spreads round the player instead of queueing', () => {
    const { world, ctx, player } = arena();
    const enemies = Array.from({ length: 7 }, (_, i) => spawnEnemy(world, 'crystal_walker', -3 + i, 9 + (i % 2), { level: 30, aggro: true }));
    const largestGap = (near: number) => {
      const pt = world.req(player, Transform);
      const angles = enemies
        .map((e) => world.req(e, Transform))
        .filter((t) => Math.hypot(t.x - pt.x, t.z - pt.z) < near)
        .map((t) => Math.atan2(t.x - pt.x, t.z - pt.z))
        .sort((a, b) => a - b);
      if (angles.length < 2) return Math.PI * 2;
      let gap = angles[0]! + Math.PI * 2 - angles[angles.length - 1]!;
      for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i]! - angles[i - 1]!);
      return gap;
    };
    // They come from one side...
    expect(largestGap(20)).toBeGreaterThan(Math.PI * 1.4);
    step(world, ctx, SYSTEMS, 6);
    // ...and end up round the player: nobody leaves an opening wider than about 110°.
    expect(largestGap(5)).toBeLessThan(Math.PI * 0.6);
    // The ones that didn't fit the inner ring wait just outside it rather than pushing in.
    const slotted = enemies.filter((e) => world.req(e, EnemyAI).intent?.mode === 'slot' || world.req(e, EnemyAI).state !== 'chase');
    expect(slotted.length).toBeGreaterThanOrEqual(5);
  });
});

describe('wayfinding: gunners', () => {
  it('never shoot into a wall: a gunner behind one moves to a firing spot first', () => {
    const { world, ctx, player } = arena();
    // A solid wall (big posts block sight) between the gunner and the player.
    wall(world, -7, 5, 7, 5, 1);
    const gunner = spawnEnemy(world, 'security_trooper', 0, 9, { level: 30, aggro: true });
    const ai = world.req(gunner, EnemyAI);
    const pt = world.req(player, Transform);
    const gt = world.req(gunner, Transform);
    let firstShot: boolean | null = null;
    let sniped = false;
    step(world, ctx, SYSTEMS, 12, () => {
      if (ai.intent?.mode === 'snipe') sniped = true;
      if (firstShot === null && ai.state === 'windup') firstShot = clearLine(ctx.nav!.grid, gt.x, gt.z, pt.x, pt.z);
    });
    expect(sniped).toBe(true);
    // It did shoot, and only once it had a clear line.
    expect(firstShot).toBe(true);
  });

  it('back away toward open ground instead of into the wall behind them', () => {
    const distAfter = (systems: SystemFn[]) => {
      const { world, ctx, player } = arena();
      // Wall right behind the gunner, which starts too close (inside its 6 m minimum).
      wall(world, -9, 4.5, 9, 4.5, 0.6);
      const gunner = spawnEnemy(world, 'security_trooper', 0, 3, { level: 30, aggro: true });
      // Keep it from shooting so it only repositions.
      const ai = world.req(gunner, EnemyAI);
      step(world, ctx, systems, 5, () => (ai.cooldown = 99));
      const g = world.req(gunner, Transform);
      const p = world.req(player, Transform);
      return Math.hypot(g.x - p.x, g.z - p.z);
    };
    expect(distAfter(NO_NAV)).toBeLessThan(4.5);
    expect(distAfter(SYSTEMS)).toBeGreaterThan(6);
  });
});

describe('wayfinding: danger', () => {
  it("walks round the player's burning ground instead of through it", () => {
    const closest = (systems: SystemFn[]) => {
      const { world, ctx } = arena();
      const fire = world.create();
      world.add(fire, Transform, makeTransform(0, 0, 6));
      world.add(fire, Hazard, { team: 'player', radius: 2.5, remaining: 99, duration: 99, tickTimer: 0, applies: [], attackerLevel: 1 });
      const enemy = spawnEnemy(world, 'crystal_walker', 0, 12, { level: 30, aggro: true });
      let best = Infinity;
      step(world, ctx, systems, 6, () => {
        const t = world.req(enemy, Transform);
        best = Math.min(best, Math.hypot(t.x, t.z - 6));
      });
      return best;
    };
    expect(closest(NO_NAV)).toBeLessThan(1);
    expect(closest(SYSTEMS)).toBeGreaterThan(2.5);
  });
});

describe('wayfinding: decoys and minions get their own fields', () => {
  it('an enemy taunted by a decoy behind a wall finds the way round to it', () => {
    const closest = (systems: SystemFn[]) => {
      const world = new World();
      const ctx = makeCtx({ worldHalfSize: 200 });
      const player = spawnPlayer(world, 'bastion', 30, 0);
      tough(world, player);
      const decoy = world.create();
      world.add(decoy, Transform, makeTransform(0, 0, 0));
      world.add(decoy, Faction, { team: 'player' });
      world.add(decoy, Health, { current: 1e8, max: 1e8 });
      world.add(decoy, Taunt, { radius: 20 });
      wall(world, -8, 5, 8, 5);
      const enemy = spawnEnemy(world, 'crystal_walker', 0, 10, { level: 30, aggro: true });
      let best = Infinity;
      step(world, ctx, systems, 12, () => {
        const t = world.req(enemy, Transform);
        best = Math.min(best, Math.hypot(t.x, t.z));
      });
      if (systems === SYSTEMS) expect(ctx.nav?.fields.has(decoy)).toBe(true);
      return best;
    };
    expect(closest(NO_NAV)).toBeGreaterThan(4);
    expect(closest(SYSTEMS)).toBeLessThan(2.5);
  });
});

describe('wayfinding: senses', () => {
  function mines() {
    const world = new World();
    const zone = createZoneRuntime(DEEP_MINES);
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: DEEP_MINES.halfSize });
    return { world, ctx };
  }

  it('enemies notice you by sight: rock hides you, open ground does not (and they shout "!")', () => {
    const [px, pz] = dm(-40, -175);
    const cave = caveGrid(DEEP_MINES)!;
    // A walkable spot 7–12 m away behind rock, and one in plain sight.
    let hidden: [number, number] | null = null;
    let seen: [number, number] | null = null;
    for (let a = 0; a < Math.PI * 2 && !(hidden && seen); a += 0.05) {
      for (let d = 7; d <= 12; d += 0.5) {
        const x = px + Math.sin(a) * d;
        const z = pz + Math.cos(a) * d;
        if (!walkableAt(cave, x, z)) continue;
        const ctx = mines().ctx;
        const sees = lineOfSight(ctx, x, z, px, pz);
        if (!sees && !hidden) hidden = [x, z];
        if (sees && !seen) seen = [x, z];
      }
    }
    expect(hidden).not.toBeNull();
    expect(seen).not.toBeNull();
    const aggroAfter = (at: [number, number]) => {
      const { world, ctx } = mines();
      tough(world, spawnPlayer(world, 'bastion', px, pz));
      const e = spawnEnemy(world, 'crystal_walker', at[0], at[1], { level: 34 });
      // Hold it in place: only noticing is tested.
      world.req(e, Transform);
      step(world, ctx, [spatialSystem, navigationSystem, enemyAISystem], 0.5);
      return world.req(e, EnemyAI);
    };
    expect(aggroAfter(hidden!).aggro).toBe(false);
    const ai = aggroAfter(seen!);
    expect(ai.aggro).toBe(true);
    expect(ai.spottedAt).toBeDefined();
  });

  it('losing the player (stealth) sends it to the last place it saw them, then it gives up', () => {
    const { world, ctx, player } = arena();
    const enemy = spawnEnemy(world, 'crystal_walker', 0, 7, { level: 30, aggro: true });
    step(world, ctx, SYSTEMS, 0.3);
    const ai = world.req(enemy, EnemyAI);
    expect(ai.lastSeen).toBeDefined();
    // Vanish and slip away.
    const pt = world.req(player, Transform);
    pt.x = pt.prevX = 14;
    applyStatus(world, ctx, player, { status: 'stealth', duration: 60 }, { team: 'player', level: 30 });
    let searched = false;
    let nearLastSeen = Infinity;
    step(world, ctx, SYSTEMS, 14, () => {
      if (ai.intent?.mode === 'search') searched = true;
      const t = world.req(enemy, Transform);
      nearLastSeen = Math.min(nearLastSeen, Math.hypot(t.x, t.z));
    });
    expect(searched).toBe(true);
    expect(nearLastSeen).toBeLessThan(2.5);
    // It never found the stealthed player and went back to idling.
    expect(ai.aggro).toBe(false);
    expect(ai.search).toBeUndefined();
  });
});

describe('wayfinding: A* and the grid', () => {
  it('plans a walkable route round a wall in a few string-pulled waypoints', () => {
    const { world, ctx } = arena();
    wall(world, -8, 5, 8, 5);
    run(world, ctx, [spatialSystem]);
    const g = buildGrid(world, ctx, 0, 0);
    expect(freeLine(g, 0, 10, 0, 0)).toBe(false);
    const path = findPath(g, 0, 10, 0, 0)!;
    expect(path).not.toBeNull();
    expect(path.length).toBeLessThanOrEqual(4);
    let x = 0;
    let z = 10;
    for (const p of path) {
      expect(freeLine(g, x, z, p.x, p.z)).toBe(true);
      x = p.x;
      z = p.z;
    }
    expect(Math.hypot(x, z)).toBeLessThan(0.01);
  });

  it('builds the mines grid and a player field quickly', () => {
    const [px, pz] = dm(0, -150);
    const world = new World();
    const zone = createZoneRuntime(DEEP_MINES);
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: DEEP_MINES.halfSize });
    const player = spawnPlayer(world, 'bastion', px, pz);
    run(world, ctx, [spatialSystem]);
    let worst = 0;
    for (let i = 0; i < 5; i++) worst = Math.max(worst, buildNav(world, ctx, player).buildMs);
    // Generous bound: a few milliseconds on a desktop.
    expect(worst).toBeLessThan(40);
  });
});
