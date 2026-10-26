/** D07: the world boss's map label carries the boss and its timer. */
import { describe, expect, it } from 'vitest';
import { emptyAccount } from '../src/core/account';
import { SaveDataSchema } from '../src/core/save';
import { WORLD_BOSS } from '../src/data/endgame/worldBosses';
import { t } from '../src/data/i18n';
import { zoneDef } from '../src/data/zones';
import { worldBossEvent, worldBossMarker } from '../src/world/worldBoss';
import { createZoneRuntime } from '../src/world/zone';
import { worldBossMapLabel } from '../src/ui/worldBossHud';
import { makeCtx } from './helpers';

describe('world boss on the map (D07)', () => {
  it('labels the marker with the boss name and the time left, and has no label when nothing is announced', () => {
    const event = worldBossEvent(1);
    const zone = createZoneRuntime(zoneDef(event.spot.zone));
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: zone.def.halfSize });
    ctx.endgame = SaveDataSchema.shape.endgame.parse(undefined);
    ctx.account!.endgame.tierUnlocked = 2;
    ctx.account!.endgame.playtime = WORLD_BOSS.interval - 252;
    expect(worldBossMarker(ctx)).not.toBeNull();
    expect(worldBossMapLabel(ctx)).toBe(`${t(`worldBoss.${event.def.id}.name`)} 4:12`);
    ctx.account!.endgame.playtime = 10;
    expect(worldBossMapLabel(ctx)).toBe('');
  });
});
