import { describe, expect, it } from 'vitest';
import { loadAccount, saveAccount } from '../src/core/account';
import { World } from '../src/core/ecs';
import { SaveDataSchema } from '../src/core/save';
import { WORLD_BOSS } from '../src/data/endgame/worldBosses';
import { zoneDef } from '../src/data/zones';
import { kill } from '../src/systems/combat';
import { spawnPlayer } from '../src/world/spawn';
import { activeWorldBoss, worldBossEvent, worldBossRuntime, worldBossSystem } from '../src/world/worldBoss';
import { createZoneRuntime } from '../src/world/zone';
import { emptyAccount } from '../src/core/account';
import { MemoryStorage } from './fixtures/memoryStorage';
import { makeCtx, run } from './helpers';

describe('A08 world boss kill saved', () => {
  it('stays dead after a reload inside its window', () => {
    const event = worldBossEvent(1);
    const world = new World();
    const zone = createZoneRuntime(zoneDef(event.spot.zone));
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: zone.def.halfSize });
    ctx.endgame = SaveDataSchema.shape.endgame.parse(undefined);
    ctx.account!.endgame.tierUnlocked = 2;
    ctx.account!.endgame.playtime = WORLD_BOSS.interval + 10;
    spawnPlayer(world, 'bastion', event.spot.x - 60, event.spot.z);
    run(world, ctx, [worldBossSystem], 1);
    kill(world, ctx, worldBossRuntime(ctx).entity!, 0);
    run(world, ctx, [worldBossSystem], 3);
    expect(ctx.account!.endgame.worldBossKilled).toBe(1);

    // Save the account, start a fresh game context (a reload), load it again.
    const storage = new MemoryStorage();
    saveAccount(storage, ctx.account!);
    const loaded = loadAccount(storage).account;
    const ctx2 = makeCtx({ zone: createZoneRuntime(zoneDef(event.spot.zone)), account: loaded });
    expect(worldBossRuntime(ctx2).killed).toBe(0);
    expect(activeWorldBoss(ctx2)).toBeNull();
    const world2 = new World();
    spawnPlayer(world2, 'bastion', event.spot.x - 60, event.spot.z);
    run(world2, ctx2, [worldBossSystem], 5);
    expect(worldBossRuntime(ctx2).entity).toBeNull();
  });

  it('old accounts without the field load as 0', () => {
    expect(emptyAccount().endgame.worldBossKilled).toBe(0);
  });
});
