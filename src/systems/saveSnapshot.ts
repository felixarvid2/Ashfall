/**
 * The game's save snapshot, as a function of the world: `Game.snapshot()` (the autosave, quick save and
 * "Export save" all go through it) calls this, and so does the headless fixture builder
 * (scripts/sim/fixtures.ts), so a fixture is written by the same code path as a real save (C09).
 */
import { Inventory, Progression, SkillUser } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { SAVE_VERSION, SaveDataSchema, type SaveData } from '../core/save';
import { encodeRevealed, type ZoneRuntime } from '../world/zone';
import { saveQuests } from './quests';

export interface SnapshotInfo {
  zoneId: string;
  name: string;
  position: { x: number; z: number };
  facing: number;
  /** ISO time; the clock when omitted. */
  savedAt?: string;
}

export function buildSaveData(world: World, player: Entity, ctx: GameContext, info: SnapshotInfo): SaveData {
  const prog = world.req(player, Progression);
  const inv = world.req(player, Inventory);
  const user = world.req(player, SkillUser);
  return {
    version: SAVE_VERSION,
    savedAt: info.savedAt ?? new Date().toISOString(),
    seed: ctx.rng.seed,
    rngState: [...ctx.rng.getState()],
    tick: ctx.tick,
    character: { name: info.name, classId: user.classId },
    player: { position: { x: info.position.x, y: 0, z: info.position.z }, facing: info.facing },
    progression: { ...prog, restorationGranted: prog.restorationGranted ?? 0 },
    inventory: structuredClone({ gold: inv.gold, grid: inv.grid, equipped: inv.equipped, aspects: inv.aspects ?? [] }),
    loot: { seq: ctx.loot.seq, rngState: [...ctx.loot.rng.getState()] },
    skills: { ranks: { ...user.tree.ranks }, slots: [...user.slots] },
    world: {
      zone: info.zoneId,
      zones: Object.fromEntries(
        [...(ctx.zones ?? new Map<string, ZoneRuntime>()).values()].map((z) => [
          z.def.id,
          { discovered: [...z.discovered], revealed: encodeRevealed(z), found: [...z.found], keycards: [...z.keycards] },
        ]),
      ),
    },
    quests: saveQuests(ctx.quests!),
    endgame: structuredClone(ctx.endgame ?? SaveDataSchema.shape.endgame.parse(undefined)),
  };
}
