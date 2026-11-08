/**
 * The game's save snapshot, as a function of the world: `Game.snapshot()` (the autosave, quick save and
 * "Export save" all go through it) calls this, and so does the headless fixture builder
 * (scripts/sim/fixtures.ts), so a fixture is written by the same code path as a real save (C09).
 */
import { EncounterState, Health, Inventory, Progression, Resource, SkillUser, StatusEffects, type StatusInstance } from '../core/components';
import { STATUS_DEFS } from '../data/db';
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
    state: captureVitals(world, player),
  };
}

/** Beneficial statuses worth keeping across a save: buffs, wards and barriers (damage over time and crowd control are not). */
const KEPT_KINDS = new Set(['buff', 'ward', 'barrier']);

/** A17: life, resource, remaining buff time and the wave encounter, as the save stores them. */
export function captureVitals(world: World, player: Entity): NonNullable<SaveData['state']> {
  const health = world.get(player, Health);
  const resource = world.get(player, Resource);
  const effects = world.get(player, StatusEffects);
  const enc = world.first(EncounterState);
  const encounter = enc !== undefined ? world.req(enc, EncounterState) : undefined;
  return {
    health: Math.max(0, health?.current ?? 0),
    resource: Math.max(0, resource?.current ?? 0),
    buffs: (effects?.list ?? [])
      .filter((s) => s.remaining > 0 && KEPT_KINDS.has(STATUS_DEFS[s.id].kind))
      .map((s) => ({ id: s.id, remaining: s.remaining, duration: s.duration, amount: s.amount })),
    wave: encounter && encounter.wave > 0 ? { encounterId: encounter.encounterId, wave: encounter.wave, phase: encounter.phase, timer: encounter.timer } : null,
  };
}

/**
 * A17: put a save's vitals back after the character was rebuilt (stats recomputed, so `max` is right). Life is clamped to
 * 1..max (a save never brings someone back dead); buffs come back with their remaining time; the encounter resumes its
 * wave number and phase. Saves without the block keep the full life the loader gave.
 */
export function restoreVitals(world: World, player: Entity, state: SaveData['state']): void {
  if (!state) return;
  const health = world.get(player, Health);
  if (health) health.current = Math.min(health.max, Math.max(1, state.health));
  const resource = world.get(player, Resource);
  if (resource) resource.current = Math.min(resource.max, state.resource);
  const effects = world.get(player, StatusEffects);
  if (effects) {
    effects.list = effects.list.filter((s) => !KEPT_KINDS.has(STATUS_DEFS[s.id].kind));
    for (const b of state.buffs) {
      const id = b.id as StatusInstance['id'];
      if (!(id in STATUS_DEFS)) continue;
      effects.list.push({ id, remaining: b.remaining, duration: b.duration, dps: 0, amount: b.amount, pending: 0, sourceTeam: 'player', attackerLevel: 1 });
    }
  }
  const enc = world.first(EncounterState);
  if (state.wave && enc !== undefined) {
    const e = world.req(enc, EncounterState);
    if (e.encounterId === state.wave.encounterId) Object.assign(e, { wave: state.wave.wave, phase: state.wave.phase, timer: state.wave.timer });
  }
}
