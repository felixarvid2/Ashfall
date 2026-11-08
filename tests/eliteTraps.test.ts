import { describe, expect, it } from 'vitest';
import { Elite, EnemyAI, Health, Projectile, Transform, makeTransform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { AFFIX_TUNING } from '../src/data/elites';
import { spatialSystem } from '../src/systems/collision';
import { Barrier, LaserGridState, PendingWall, beamAngles, distanceToBeam } from '../src/systems/eliteTraps';
import { eliteSystem } from '../src/systems/elites';
import { buildGrid } from '../src/systems/navigation';
import { projectileSystem } from '../src/systems/projectiles';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

function arena(affix: 'forceWall' | 'laserGrid', ex = 14) {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 200 });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  world.req(player, Health).max = world.req(player, Health).current = 1e7;
  const e = spawnEnemy(world, 'infected_colonist', ex, 0, { level: 30 });
  world.add(e, Elite, { kind: 'rare', affixes: [affix], timers: {}, shieldUsed: false, mirrored: false, copy: false });
  world.req(e, EnemyAI).aggro = true;
  return { world, ctx, player, elite: e };
}
const wallsOf = (world: World) => world.query(Barrier, Transform);

describe('A05 Force Wall', () => {
  it('telegraphs, then raises a short wall between the elite and the player that expires', () => {
    const { world, ctx } = arena('forceWall');
    run(world, ctx, [eliteSystem], 60 * 14);
    expect(ctx.events.drain().some((ev) => ev.type === 'telegraph' && ev.shape.kind === 'line')).toBe(true);
    expect(world.query(PendingWall).length + wallsOf(world).length).toBeGreaterThan(0);
    // Let the warning pass: pieces stand between x = 0 and 14, across the line of sight.
    run(world, ctx, [eliteSystem], Math.ceil(60 * AFFIX_TUNING.forceWall.warning) + 2);
    const pieces = wallsOf(world);
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    for (const p of pieces) {
      const t = world.req(p, Transform);
      expect(t.x).toBeGreaterThan(1);
      expect(t.x).toBeLessThan(13);
    }
    const zs = pieces.map((p) => world.req(p, Transform).z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(AFFIX_TUNING.forceWall.length * 0.6);
    // Short: it fades.
    run(world, ctx, [eliteSystem], Math.ceil(60 * AFFIX_TUNING.forceWall.duration) + 2);
    world.flushDestroyed();
    expect(wallsOf(world).filter((p) => world.req(p, Barrier).remaining > 0).length).toBeLessThan(pieces.length + 1);
  });

  it('blocks the navigation grid and stops projectiles from either side', () => {
    const { world, ctx, player } = arena('forceWall');
    // Run until the wall stands (the cooldown is random), checking nothing yet.
    let guard = 0;
    while (wallsOf(world).length === 0 && guard++ < 60 * 40) run(world, ctx, [spatialSystem, eliteSystem], 1);
    expect(wallsOf(world).length).toBeGreaterThan(0);
    run(world, ctx, [spatialSystem], 2);
    const piece = world.req(wallsOf(world)[0]!, Transform);
    const grid = buildGrid(world, ctx, 0, 0);
    const cell = (x: number, z: number) => grid.blocked[Math.floor((z - grid.z0) / grid.cell) * grid.n + Math.floor((x - grid.x0) / grid.cell)]!;
    expect(cell(piece.x, piece.z) & 1).toBe(1);
    // A bolt flying through the wall is spent; the same bolt where there is no wall is not.
    const bolt = (x: number, z: number, vx: number) => {
      const b = world.create();
      world.add(b, Transform, makeTransform(x, 0, z));
      world.add(b, Projectile, { team: 'player', vx, vz: 0, radius: 0.2, remaining: 5, damage: 1, damageType: 'physical', attackerLevel: 1, owner: player });
      return b;
    };
    const through = bolt(piece.x - 1.5, piece.z, 20);
    const free = bolt(piece.x - 1.5, piece.z + 40, 20);
    run(world, ctx, [projectileSystem], 12);
    world.flushDestroyed();
    expect(world.isAlive(through)).toBe(false);
    expect(world.isAlive(free)).toBe(true);
  });
});

describe('A06 Laser Grid', () => {
  it('telegraphs its beams, then turns them; touching one hurts, standing between them does not', () => {
    const { world, ctx, player, elite } = arena('laserGrid', 0.5);
    world.req(player, Transform).x = 6;
    let guard = 0;
    while (!world.has(elite, LaserGridState) && guard++ < 60 * 40) run(world, ctx, [eliteSystem], 1);
    expect(world.has(elite, LaserGridState)).toBe(true);
    const lines = ctx.events.drain().filter((ev) => ev.type === 'telegraph' && ev.shape.kind === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(AFFIX_TUNING.laserGrid.beams);
    const st = world.req(elite, LaserGridState);
    expect(st.phase).toBe('warn');
    // No damage while it is only a warning.
    const hp = world.req(player, Health);
    const full = hp.current;
    run(world, ctx, [eliteSystem], Math.floor(60 * AFFIX_TUNING.laserGrid.warning) - 4);
    expect(hp.current).toBe(full);
    // Fire: the angle turns, and the player on a beam is hurt.
    run(world, ctx, [eliteSystem], 10);
    expect(st.phase).toBe('fire');
    const a0 = st.angle;
    run(world, ctx, [eliteSystem], 30);
    expect(Math.abs(st.angle - a0)).toBeGreaterThan(0.1);
    const et = world.req(elite, Transform);
    const pt = world.req(player, Transform);
    const onBeam = beamAngles(st.angle).some((a) => distanceToBeam(et.x, et.z, a, AFFIX_TUNING.laserGrid.length, pt.x, pt.z) < 0.6);
    // Put the player exactly on the first beam and one more tick: hurt.
    const [b0] = beamAngles(st.angle);
    pt.x = et.x + Math.sin(b0!) * 6;
    pt.z = et.z + Math.cos(b0!) * 6;
    st.hit = 0;
    const before = hp.current;
    run(world, ctx, [eliteSystem], 1);
    expect(hp.current).toBeLessThan(before);
    void onBeam;
    // Between two beams (60 degrees away of three): safe.
    const safe = b0! + Math.PI / 3;
    pt.x = et.x + Math.sin(safe) * 10;
    pt.z = et.z + Math.cos(safe) * 10;
    st.hit = 0;
    const calm = hp.current;
    run(world, ctx, [eliteSystem], 1);
    expect(hp.current).toBe(calm);
    // It ends.
    run(world, ctx, [eliteSystem], Math.ceil(60 * AFFIX_TUNING.laserGrid.duration));
    expect(world.has(elite, LaserGridState)).toBe(false);
  });

  it('beam geometry', () => {
    expect(beamAngles(0)).toHaveLength(AFFIX_TUNING.laserGrid.beams);
    expect(distanceToBeam(0, 0, 0, 10, 0, 5)).toBeCloseTo(0);
    expect(distanceToBeam(0, 0, 0, 10, 3, 5)).toBeCloseTo(3);
    expect(distanceToBeam(0, 0, 0, 10, 0, 14)).toBeCloseTo(4);
  });
});
