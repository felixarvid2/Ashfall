import { describe, expect, it } from 'vitest';
import { Dead, Destructible, EnemyAI, Health, Interactable, Projectile, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { World, type Entity } from '../src/core/ecs';
import { ENEMY_DEFS } from '../src/data/db';
import { PACK_TEMPLATES } from '../src/data/packs';
import { ZONES, zoneDef } from '../src/data/zones';
import { caveGrid, walkableAt } from '../src/data/zones/caves';
import { DEEP_MINES, FLOODLIGHTS, MINES_GATE, ZERO } from '../src/data/zones/deepMines';
import { HYDROPONIC_VAULTS, LIFT_GATE } from '../src/data/zones/hydroponicVaults';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { applyDamage, dealHit, hasStatus, kill } from '../src/systems/combat';
import { deathSystem } from '../src/systems/death';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem, projectileSystem } from '../src/systems/projectiles';
import { statusSystem } from '../src/systems/status';
import { blastSystem, interact, spawnInteractables } from '../src/world/interactables';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { UNDERGROUND, isLit, litFloodlights, rockSystem, undergroundState, undergroundSystem } from '../src/world/underground';
import { createZoneRuntime } from '../src/world/zone';
import { fakeInput, makeCtx, run, type SystemFn } from './helpers';

const grid = caveGrid(DEEP_MINES)!;

function inMines(x = ZERO.x, z = ZERO.z + 30) {
  const world = new World();
  const zone = createZoneRuntime(DEEP_MINES);
  const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: DEEP_MINES.halfSize, zoneLevels: [30, 40] });
  const player = spawnPlayer(world, 'bastion', x, z);
  const h = world.req(player, Health);
  h.max = h.current = 1e7;
  return { world, ctx, zone, player };
}

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

const SYSTEMS: SystemFn[] = [spatialSystem, enemyAISystem, statusSystem, movementSystem, collisionSystem, rockSystem, projectileSystem, hazardSystem, blastSystem, deathSystem];

function fight(enemy: string, x = 0, z = 4, level = 34) {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 400 });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const h = world.req(player, Health);
  h.max = h.current = 1e7;
  const e = spawnEnemy(world, enemy, x, z, { level, aggro: true });
  return { world, ctx, player, e };
}

describe('The Deep Mines zone', () => {
  it('is region 4, levels 30–40, reached by a freight lift from the Vaults', () => {
    expect(DEEP_MINES.region).toBe(4);
    expect(DEEP_MINES.levels).toEqual([30, 40]);
    expect(ZONES.at(-1)).toBe(DEEP_MINES);
    expect(MINES_GATE.to).toEqual({ zone: HYDROPONIC_VAULTS.id, gate: LIFT_GATE.id });
    expect(LIFT_GATE.to).toEqual({ zone: DEEP_MINES.id, gate: MINES_GATE.id });
    expect(zoneDef(LIFT_GATE.to.zone)).toBe(DEEP_MINES);
    for (const [zone, gate] of [[HYDROPONIC_VAULTS, LIFT_GATE], [DEEP_MINES, MINES_GATE]] as const) {
      const ends = zone.roads.flatMap((r) => [r.points[0]!, r.points[r.points.length - 1]!]);
      expect(Math.min(...ends.map(([x, z]) => Math.hypot(x - gate.x, z - gate.z)))).toBeLessThan(gate.radius);
    }
  });

  it('is mostly solid rock: tunnels and caverns are the only open ground', () => {
    let open = 0;
    for (const v of grid.data) open += v;
    const share = open / grid.data.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.4);
    expect(walkableAt(grid, MINES_GATE.arrive.x, MINES_GATE.arrive.z)).toBe(true);
    expect(walkableAt(grid, ZERO.x, ZERO.z)).toBe(true);
  });

  it('puts every point of interest, teleporter, pack and the stash on open ground', () => {
    for (const p of DEEP_MINES.pois) expect(walkableAt(grid, p.x, p.z), p.id).toBe(true);
    for (const t of DEEP_MINES.teleporters) expect(walkableAt(grid, t.x, t.z), t.id).toBe(true);
    for (const p of DEEP_MINES.packs) expect(walkableAt(grid, p.x, p.z), p.id).toBe(true);
    expect(walkableAt(grid, DEEP_MINES.stash!.x, DEEP_MINES.stash!.z)).toBe(true);
  });

  it('can reach everything from the arrival point', () => {
    // Flood fill the walkable grid from the lift.
    const { n, cell, half, data } = grid;
    const seen = new Uint8Array(n * n);
    const start = Math.floor((MINES_GATE.arrive.z + half) / cell) * n + Math.floor((MINES_GATE.arrive.x + half) / cell);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % n;
      const j = (k - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di!;
        const nj = j + dj!;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (!data[nk] || seen[nk]) continue;
        seen[nk] = 1;
        stack.push(nk);
      }
    }
    const reach = (x: number, z: number) => seen[Math.floor((z + half) / cell) * n + Math.floor((x + half) / cell)] === 1;
    for (const p of DEEP_MINES.pois) expect(reach(p.x, p.z), p.id).toBe(true);
    for (const t of DEEP_MINES.teleporters) expect(reach(t.x, t.z), t.id).toBe(true);
  });

  it('prefixes ids and has the point-of-interest counts from the plan', () => {
    for (const p of DEEP_MINES.pois) expect(p.id.startsWith('dm.'), p.id).toBe(true);
    for (const p of DEEP_MINES.packs) expect(p.id.startsWith('dm.'), p.id).toBe(true);
    const count = (kind: string) => DEEP_MINES.pois.filter((p) => p.kind === kind).length;
    expect(count('dungeon')).toBe(5);
    expect(count('bunker')).toBe(6);
    expect(count('event')).toBe(6);
    expect(count('relic')).toBe(10);
    expect(count('lore')).toBe(12);
    expect(count('signalTower')).toBe(3);
    expect(count('pylon')).toBe(6);
    expect(count('lockedChest')).toBe(6);
    expect(count('stronghold')).toBe(1);
    expect(count('boss')).toBe(1);
    expect(DEEP_MINES.pois.filter((p) => p.data?.feature === 'floodlight')).toHaveLength(FLOODLIGHTS.length);
    expect(count('crystal')).toBeGreaterThanOrEqual(12);
    expect(DEEP_MINES.teleporters.filter((t) => t.id !== 'tp.aurum')).toHaveLength(6);
  });
});

describe('rock, darkness and cave-ins', () => {
  it('slides anything that walks into rock back along the wall, and spends bolts that hit it', () => {
    const { world, ctx, player } = inMines();
    // Find a rock cell next to open ground.
    const tr = world.req(player, Transform);
    let rx = tr.x;
    while (walkableAt(grid, rx, tr.z)) rx += 1;
    moveTo(world, player, rx - 1.5, tr.z);
    tr.x = rx + 1;
    run(world, ctx, [rockSystem]);
    expect(walkableAt(grid, tr.x, tr.z)).toBe(true);
    const bolt = world.create();
    world.add(bolt, Transform, { ...tr, x: rx + 2, prevX: rx + 2 });
    world.add(bolt, Projectile, { team: 'player', vx: 0, vz: 0, radius: 0.2, remaining: 5, damage: 1, damageType: 'physical', attackerLevel: 1, owner: player });
    run(world, ctx, [rockSystem]);
    expect(world.isAlive(bolt)).toBe(false);
  });

  it('only the lamp, switched-on floodlights and flares are lit', () => {
    const { world, ctx, zone, player } = inMines();
    const tr = world.req(player, Transform);
    expect(isLit(world, ctx, tr.x + 2, tr.z)).toBe(true);
    const f = DEEP_MINES.pois.find((p) => p.data?.feature === 'floodlight')!;
    expect(isLit(world, ctx, f.x, f.z)).toBe(false);
    spawnInteractables(world, zone);
    const fe = world.query(Interactable).find((e) => world.req(e, Interactable).poi === f.id)!;
    moveTo(world, player, f.x + 1, f.z);
    interact(world, ctx, player, fe);
    expect(litFloodlights(zone).map((l) => l.id)).toContain(f.id);
    moveTo(world, player, ZERO.x, ZERO.z);
    expect(isLit(world, ctx, f.x, f.z)).toBe(true);
    expect(ctx.account!.restoration[DEEP_MINES.id]!.points).toContain(`light:${f.id}`);
  });

  it('throws flares (F) that light a spot and recharge', () => {
    const { world, ctx, zone, player } = inMines();
    const tr = world.req(player, Transform);
    ctx.input = fakeInput(['flare']);
    run(world, ctx, [undergroundSystem]);
    ctx.input = fakeInput();
    const st = undergroundState(zone);
    expect(st.flareCharges).toBe(UNDERGROUND.flare.charges - 1);
    const f = st.flares[0]!;
    moveTo(world, player, tr.x + 200, tr.z);
    expect(isLit(world, ctx, f.x, f.z)).toBe(true);
    run(world, ctx, [undergroundSystem], 60 * (UNDERGROUND.flare.recharge + 1));
    expect(st.flareCharges).toBe(UNDERGROUND.flare.charges);
    expect(st.flares).toHaveLength(0);
  });

  it('cave-ins creak first, then fall, hurt and block the tunnel for a while', () => {
    const { world, ctx, zone, player } = inMines();
    world.req(player, Health).max = world.req(player, Health).current = 1000;
    const c = DEEP_MINES.env!.find((f) => f.kind === 'caveIn')!;
    moveTo(world, player, c.x, c.z);
    run(world, ctx, [undergroundSystem]);
    const events = ctx.events.drain();
    expect(events.some((e) => e.type === 'telegraph')).toBe(true);
    expect(world.req(player, Health).current).toBe(1000);
    run(world, ctx, [spatialSystem, undergroundSystem, blastSystem], 60 * (UNDERGROUND.caveIn.warning + 0.2));
    expect(world.req(player, Health).current).toBeLessThan(1000);
    expect(undergroundState(zone).rubble).toHaveLength(1);
    run(world, ctx, [undergroundSystem], 60 * (UNDERGROUND.caveIn.rubble + 1));
    expect(undergroundState(zone).rubble).toHaveLength(0);
  });
});

describe('Deep Mines roster', () => {
  const regular = ['crystal_walker', 'blind_hound', 'governor_drone', 'ore_crusher', 'shard_bloater', 'burrower', 'crystal_sentinel', 'infected_miner', 'echo', 'security_trooper', 'shield_officer'];

  it('uses only existing models, half returning variants, every type in a pack', () => {
    const used = new Set(PACK_TEMPLATES.filter((t) => t.id.startsWith('dm_')).flatMap((t) => t.members.map((m) => m.enemy)));
    for (const id of [...regular, 'drill_colossus']) {
      expect(ENEMY_DEFS.has(id), id).toBe(true);
      expect(used.has(id), id).toBe(true);
    }
    const returning = ['crystal_walker', 'blind_hound', 'governor_drone', 'ore_crusher', 'shard_bloater'];
    expect(returning.length / (regular.length - 1)).toBeGreaterThanOrEqual(0.4);
  });

  it('Crystal-Bound Walkers throw some shots back', () => {
    const { world, ctx, player, e } = fight('crystal_walker');
    let reflected = 0;
    const before = world.req(player, Health).current;
    for (let i = 0; i < 40; i++) {
      if (dealHit(world, ctx, player, e, { coefficient: 0.01, damageType: 'physical', knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'ranged' }) === null) reflected++;
    }
    expect(reflected).toBeGreaterThan(4);
    expect(world.req(player, Health).current).toBeLessThan(before);
  });

  it('Blind Hounds ignore you at range but run to a flare', () => {
    const { world, ctx, zone, player } = inMines();
    const tr = world.req(player, Transform);
    const hound = spawnEnemy(world, 'blind_hound', tr.x + 12, tr.z, { level: 32 });
    run(world, ctx, SYSTEMS, 30);
    expect(world.req(hound, EnemyAI).aggro).toBe(false);
    undergroundState(zone).noises.push({ x: tr.x + 18, z: tr.z, until: ctx.time + 5 });
    const ht = world.req(hound, Transform);
    const x0 = ht.x;
    run(world, ctx, SYSTEMS, 30);
    expect(ht.x).toBeGreaterThan(x0);
  });

  it("Governor's Drones harden the nearest ally", () => {
    const { world, ctx, e } = fight('governor_drone', 0, 9);
    const ally = spawnEnemy(world, 'security_trooper', 1, 10, { level: 34, aggro: true });
    let hardened = false;
    for (let i = 0; i < 60 * 9 && !hardened; i++) {
      run(world, ctx, SYSTEMS);
      hardened = hasStatus(world, ally, 'chitin');
    }
    expect(hardened).toBe(true);
    expect(world.req(e, EnemyAI).shieldAllyTimer).toBeDefined();
  });

  it('Shard Bloaters burst into a ring of shards', () => {
    const { world, ctx, e } = fight('shard_bloater', 0, 12);
    kill(world, ctx, e, 0);
    expect(world.query(Projectile).length).toBe(8);
  });

  it('Burrowers vanish underground, warn, and surface under you', () => {
    const { world, ctx, player, e } = fight('burrower', 0, 10);
    world.req(player, Health).max = world.req(player, Health).current = 5000;
    let burrowed = false;
    for (let i = 0; i < 60 * 12 && !burrowed; i++) {
      run(world, ctx, SYSTEMS);
      burrowed = world.req(e, EnemyAI).burrowed === true;
    }
    expect(burrowed).toBe(true);
    // Untouchable while down.
    expect(applyDamage(world, ctx, e, 100, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'player' })).toBeNull();
    run(world, ctx, SYSTEMS, 60 * 6);
    expect(world.req(player, Health).current).toBeLessThan(5000);
  });

  it('Crystal Sentinels ignore elemental damage until the shell breaks', () => {
    const { world, ctx, e } = fight('crystal_sentinel');
    run(world, ctx, SYSTEMS);
    const h = world.req(e, Health);
    const ai = world.req(e, EnemyAI);
    expect(ai.shell).toBeCloseTo(h.max * 0.6);
    expect(applyDamage(world, ctx, e, 50, { crit: false, damageType: 'heat', dot: false, sourceTeam: 'player' })).toBeNull();
    applyDamage(world, ctx, e, h.max * 0.7, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'player' });
    expect(ai.shell).toBe(0);
    expect(h.current).toBeCloseTo(h.max * 0.9, 0);
    expect(applyDamage(world, ctx, e, 50, { crit: false, damageType: 'heat', dot: false, sourceTeam: 'player' })).not.toBeNull();
  });

  it('Infected Miners lob telegraphed dynamite', () => {
    const { world, ctx, player } = fight('infected_miner', 0, 10);
    world.req(player, Health).max = world.req(player, Health).current = 5000;
    let warned = false;
    for (let i = 0; i < 60 * 6; i++) {
      run(world, ctx, SYSTEMS);
      if (ctx.events.drain().some((ev) => ev.type === 'telegraph' && ev.color === '#ffb23a')) warned = true;
    }
    expect(warned).toBe(true);
    expect(world.req(player, Health).current).toBeLessThan(5000);
  });

  it('Echoes blink beside you and take double damage in the light', () => {
    const { world, ctx, zone, player } = inMines();
    const tr = world.req(player, Transform);
    const echo = spawnEnemy(world, 'echo', tr.x + 10, tr.z, { level: 34, aggro: true });
    let close = false;
    for (let i = 0; i < 60 * 7 && !close; i++) {
      run(world, ctx, SYSTEMS);
      const et = world.req(echo, Transform);
      close = Math.hypot(et.x - tr.x, et.z - tr.z) < 3.5;
    }
    expect(close).toBe(true);
    void zone;
    const h = world.req(echo, Health);
    h.max = h.current = 10000;
    const lit = applyDamage(world, ctx, echo, 100, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'player' });
    moveTo(world, echo, tr.x + 40, tr.z);
    const dark = applyDamage(world, ctx, echo, 100, { crit: false, damageType: 'physical', dot: false, sourceTeam: 'player' });
    expect(lit!).toBeCloseTo(dark! * 2);
  });

  it("Shield Officers' domes cut ranged damage to everyone inside", () => {
    const { world, ctx, player, e } = fight('shield_officer', 0, 8);
    const ally = spawnEnemy(world, 'security_trooper', 2, 8, { level: 34, aggro: true });
    const h = world.req(ally, Health);
    h.max = h.current = 1e6;
    const hit = () => {
      const before = h.current;
      dealHit(world, ctx, player, ally, { coefficient: 1, damageType: 'physical', knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'ranged' });
      return before - h.current;
    };
    const open = hit();
    run(world, ctx, SYSTEMS, 60 * 4);
    expect(world.req(e, EnemyAI).domeUntil ?? 0).toBeGreaterThan(ctx.time);
    const domed = hit();
    expect(domed).toBeLessThan(open * 0.6);
  });

  it('Ore Crushers and Drill Colossi slam everything around them', () => {
    for (const id of ['ore_crusher', 'drill_colossus']) {
      const { world, ctx, player } = fight(id, 0, 3);
      run(world, ctx, SYSTEMS, 60 * 3);
      expect(world.req(player, Health).current, id).toBeLessThan(1e7);
    }
  });

  it('dead enemies stay dead (sanity)', () => {
    const { world, ctx, e } = fight('crystal_walker');
    kill(world, ctx, e, 0);
    expect(world.has(e, Dead)).toBe(true);
    void Destructible;
  });
});
