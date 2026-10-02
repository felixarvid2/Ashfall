import { describe, expect, it } from 'vitest';
import { Boss, Collider, Dead, EnemyAI, Health, Targetable, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { hasStatus, kill } from '../src/systems/combat';
import { bossSystem, resetBoss } from '../src/systems/boss';
import { createQuestRuntime } from '../src/systems/quests';
import { MAW, SIERRA, setPieceSystem, setPiecesOnDeath, syncSetPieces } from '../src/world/setPieces';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime, hubAt } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function setup() {
  const world = new World();
  const zone = createZoneRuntime(CINDER_FLATS);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, ctx, zone, player };
}

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

describe('Checkpoint Sierra', () => {
  it('feeders empower defenders, then Hale; reclaimed it becomes a hub', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, SIERRA.x + 20, SIERRA.z);
    run(world, ctx, [setPieceSystem]);
    const st = zone.setPieces.sierra;
    expect(st.state).toBe('feeders');
    expect(st.feeders).toHaveLength(3);
    const ft = world.req(st.feeders[0]!, Transform);
    const guard = spawnEnemy(world, 'infected_colonist', ft.x + 2, ft.z);
    run(world, ctx, [setPieceSystem], 62);
    expect(hasStatus(world, guard, 'overcharge')).toBe(true);
    for (const f of st.feeders) kill(world, ctx, f, 0);
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('boss');
    expect(world.has(st.boss!, Boss)).toBe(true);
    expect(hubAt(zone, SIERRA.x, SIERRA.z)).toBeNull();
    kill(world, ctx, st.boss!, 0);
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('reclaimed');
    expect(zone.found.has(SIERRA.id)).toBe(true);
    expect(hubAt(zone, SIERRA.x, SIERRA.z)?.id).toBe('hub.sierra');
    expect(ctx.quests!.signals).toContainEqual({ type: 'objective', id: SIERRA.id });
    // Loading the save keeps it reclaimed.
    syncSetPieces(world, zone);
    expect(zone.setPieces.sierra.state).toBe('reclaimed');
  });
});

describe('The First', () => {
  it('closes the gates for the fight, changes phase, resets on death and drops a legendary', () => {
    const { world, ctx, zone, player } = setup();
    moveTo(world, player, MAW.x, MAW.z - 15);
    run(world, ctx, [setPieceSystem]);
    const st = zone.setPieces.maw;
    expect(st.state).toBe('fight');
    expect(st.gates).toHaveLength(3);
    expect(st.gates.every((g) => world.has(g, Collider))).toBe(true);
    const boss = st.boss!;
    // Phase 2 at 60% life: plates get thrown at the player.
    const h = world.req(boss, Health);
    h.current = h.max * 0.55;
    run(world, ctx, [bossSystem], 60 * 3);
    expect(world.req(boss, Boss).phase).toBe(1);
    run(world, ctx, [bossSystem], 60 * 8);
    expect(world.req(boss, Boss).plates.length).toBeGreaterThan(0);
    // Dying resets the fight.
    setPiecesOnDeath(world, zone);
    world.flushDestroyed();
    expect(st.state).toBe('idle');
    expect(world.req(boss, Health).current).toBe(world.req(boss, Health).max);
    expect(world.req(boss, Boss).phase).toBe(0);
    // Second attempt: kill it.
    run(world, ctx, [setPieceSystem]);
    expect(st.state).toBe('fight');
    ctx.rewards = [];
    kill(world, ctx, boss, 0);
    run(world, ctx, [setPieceSystem]);
    world.flushDestroyed();
    expect(st.state).toBe('defeated');
    expect(st.gates).toHaveLength(0);
    expect(ctx.rewards).toContainEqual(expect.objectContaining({ table: 'dt.boss', rarity: 'legendary' }));
    void Dead;
    void EnemyAI;
    void Targetable;
    void resetBoss;
  });
});
