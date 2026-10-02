/**
 * Quest log (docs/world-and-gameplay.md §11): starting quests, tracking each step from signals
 * that other systems send (kills, interactions, objectives), spawning what a step needs (named
 * targets, objects, the escorted tanker, quest-only NPCs) and paying rewards.
 */
import {
  Collider,
  Dead,
  DisplayName,
  Escort,
  Faction,
  Health,
  Interactable,
  Inventory,
  MoveTarget,
  Mover,
  Npc,
  PlayerControlled,
  QuestTag,
  Renderable,
  Transform,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { Rng } from '../core/rng';
import { INTERACT_RADIUS } from '../data/interactables';
import { NPCS, QUESTS, questDef } from '../data/quests/db';
import type { QuestDef, QuestStep } from '../data/quests/schema';
import { monsterLevel } from './encounter';
import { grantXp } from './loot/rewards';
import { makeElite } from '../world/zone';
import { spawnEnemy } from '../world/spawn';

export type QuestSignal =
  | { type: 'kill'; defId: string; x: number; z: number; quest?: string }
  | { type: 'interact'; kind: string; id: string }
  | { type: 'objective'; id: string };

export interface QuestState {
  step: number;
  /** Count for kill/interact steps. */
  progress: number;
  /** Decision made in a choice step. */
  choice?: string;
}

export interface QuestRuntime {
  active: Map<string, QuestState>;
  /** Finished quests → the choice made ('' if none). */
  done: Map<string, string>;
  /** Quest shown in the HUD tracker. */
  tracked: string | null;
  signals: QuestSignal[];
  /** Entities spawned for each quest's current step. */
  spawned: Map<string, Entity[]>;
  /** Trigger objects waiting to be found (quest id → entity). */
  triggers: Map<string, Entity>;
  /** Interact-step objects already used this step. */
  usedObjects: Set<string>;
}

export function createQuestRuntime(): QuestRuntime {
  return { active: new Map(), done: new Map(), tracked: null, signals: [], spawned: new Map(), triggers: new Map(), usedObjects: new Set() };
}

export function signal(ctx: GameContext, s: QuestSignal): void {
  ctx.quests?.signals.push(s);
}

export function currentStep(id: string, state: QuestState): QuestStep | undefined {
  return questDef(id).steps[state.step];
}

function prerequisitesMet(rt: QuestRuntime, def: QuestDef): boolean {
  return def.after.every((q) => rt.done.has(q));
}

/** Quests this NPC can offer right now. */
export function offeredBy(rt: QuestRuntime, npc: string): QuestDef[] {
  return [...QUESTS.values()].filter((q) => q.giver === npc && !rt.active.has(q.id) && !rt.done.has(q.id) && prerequisitesMet(rt, q));
}

/** Active quests waiting to talk to (or decide with) this NPC. */
export function waitingOn(rt: QuestRuntime, npc: string): { id: string; step: QuestStep }[] {
  const out: { id: string; step: QuestStep }[] = [];
  for (const [id, st] of rt.active) {
    const step = currentStep(id, st);
    if (step && (step.kind === 'talk' || step.kind === 'choice') && step.npc === npc) out.push({ id, step });
  }
  return out;
}

export function startQuest(world: World, ctx: GameContext, id: string): boolean {
  const rt = ctx.quests;
  if (!rt || rt.active.has(id) || rt.done.has(id)) return false;
  const def = questDef(id);
  rt.active.set(id, { step: 0, progress: 0 });
  if (rt.tracked === null || def.kind === 'main') rt.tracked = id;
  const trigger = rt.triggers.get(id);
  if (trigger !== undefined) {
    world.destroyDeferred(trigger);
    rt.triggers.delete(id);
  }
  ctx.events.push({ type: 'quest', id, state: 'started' });
  enterStep(world, ctx, id);
  return true;
}

/** Finish the current talk step with this NPC (the UI shows its lines). */
export function completeTalk(world: World, ctx: GameContext, id: string): boolean {
  const st = ctx.quests?.active.get(id);
  const step = st && currentStep(id, st);
  if (!st || step?.kind !== 'talk') return false;
  advance(world, ctx, id);
  return true;
}

/** Make the decision of a choice step; its option reward is paid at once. */
export function choose(world: World, ctx: GameContext, id: string, option: string): boolean {
  const rt = ctx.quests;
  const st = rt?.active.get(id);
  const step = st && currentStep(id, st);
  if (!rt || !st || step?.kind !== 'choice') return false;
  const opt = step.options.find((o) => o.id === option);
  if (!opt) return false;
  payReward(world, ctx, { xp: opt.xp, gold: opt.gold, item: opt.item });
  st.choice = option;
  advance(world, ctx, id);
  return true;
}

function advance(world: World, ctx: GameContext, id: string): void {
  const rt = ctx.quests!;
  const st = rt.active.get(id)!;
  leaveStep(world, rt, id);
  st.step++;
  st.progress = 0;
  rt.usedObjects.clear();
  const def = questDef(id);
  if (st.step >= def.steps.length) {
    rt.active.delete(id);
    rt.done.set(id, st.choice ?? '');
    payReward(world, ctx, def.rewards);
    if (ctx.account && def.rewards.restoration > 0) {
      const zoneId = ctx.zone?.def.id ?? 'zone';
      const entry = (ctx.account.restoration[zoneId] ??= { points: [], tiers: 0 });
      for (let i = 0; i < def.rewards.restoration; i++) {
        const key = `quest:${id}#${i}`;
        if (!entry.points.includes(key)) entry.points.push(key);
      }
    }
    if (rt.tracked === id) rt.tracked = [...rt.active.keys()].find((q) => questDef(q).kind === 'main') ?? rt.active.keys().next().value ?? null;
    ctx.events.push({ type: 'quest', id, state: 'completed' });
    return;
  }
  ctx.events.push({ type: 'quest', id, state: 'step' });
  enterStep(world, ctx, id);
}

function payReward(world: World, ctx: GameContext, r: { xp: number; gold: number; item?: string | undefined }): void {
  const player = world.first(PlayerControlled, Inventory);
  if (player === undefined) return;
  if (r.xp > 0) grantXp(world, ctx, player, r.xp);
  if (r.gold > 0) world.req(player, Inventory).gold += r.gold;
  if (r.item) {
    const tr = world.req(player, Transform);
    ctx.rewards.push({ table: 'dt.quest_reward', level: monsterLevel(world, ctx), x: tr.x, z: tr.z, xp: false, rarity: r.item as never });
  }
}

// ---- Step setup ------------------------------------------------------------------------

function tag(world: World, e: Entity, id: string, step: number): Entity {
  world.add(e, QuestTag, { quest: id, step });
  return e;
}

/** Spawn what the current step needs. */
function enterStep(world: World, ctx: GameContext, id: string): void {
  const rt = ctx.quests!;
  const st = rt.active.get(id)!;
  const step = currentStep(id, st);
  if (!step) return;
  const spawned: Entity[] = [];
  if (step.kind === 'kill' && step.spawn) {
    const s = step.spawn;
    const level = monsterLevel(world, ctx);
    const rng = new Rng(`${id}-${st.step}`);
    const boss = tag(world, spawnEnemy(world, s.enemy, s.x, s.z, { level }), id, st.step);
    world.add(boss, DisplayName, { key: s.name });
    if (s.elite) makeElite(world, boss, s.elite, rng);
    spawned.push(boss);
    for (let i = 0; i < s.escorts; i++) {
      const a = (i / Math.max(1, s.escorts)) * Math.PI * 2;
      spawned.push(spawnEnemy(world, s.enemy, s.x + Math.sin(a) * 3, s.z + Math.cos(a) * 3, { level }));
    }
  } else if (step.kind === 'interact') {
    for (const o of step.objects) {
      if (rt.usedObjects.has(o.id)) continue;
      spawned.push(tag(world, questObject(world, o.id, o.x, o.z, o.asset, o.scale), id, st.step));
    }
    // Specific points of interest already used count at once (logs read before the quest).
    if (step.ids && ctx.zone) {
      st.progress = step.ids.filter((p) => ctx.zone!.found.has(p)).length;
      if (st.progress >= step.count) {
        advance(world, ctx, id);
        return;
      }
    }
  } else if (step.kind === 'escort') {
    const [x, z] = step.path[0]!;
    const e = world.create();
    world.add(e, Transform, makeTransform(x, 0, z, 0));
    world.add(e, Renderable, { assetId: step.asset });
    world.add(e, Mover, { speed: step.speed, speedMul: 1, turnRate: 2, vx: 0, vz: 0 });
    world.add(e, Faction, { team: 'player' });
    world.add(e, Health, { current: step.life, max: step.life });
    world.add(e, Collider, { radius: 1.6, mass: 40, layer: 'ground', isStatic: false });
    world.add(e, Escort, { path: step.path, next: 1, leash: step.leash });
    world.add(e, DisplayName, { key: `quests.${id}.escortName` });
    spawned.push(tag(world, e, id, st.step));
  } else if (step.kind === 'choice' || step.kind === 'talk') {
    const npc = NPCS.get(step.npc);
    if (npc?.questOnly) spawned.push(tag(world, spawnNpc(world, npc.id), id, st.step));
  }
  rt.spawned.set(id, spawned);
}

function leaveStep(world: World, rt: QuestRuntime, id: string): void {
  for (const e of rt.spawned.get(id) ?? []) {
    if (!world.isAlive(e)) continue;
    // Named enemies that are still fighting stay; objects, NPCs and vehicles go.
    if (world.has(e, Health) && world.get(e, Faction)?.team === 'enemy') {
      world.remove(e, QuestTag);
      continue;
    }
    world.destroyDeferred(e);
  }
  rt.spawned.delete(id);
}

export function questObject(world: World, id: string, x: number, z: number, asset: string, scale: number): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: asset, scale, glow: '#ffd23a' });
  world.add(e, Interactable, { poi: id, kind: 'questObject', radius: INTERACT_RADIUS, used: false, readyAt: 0 });
  return e;
}

/** Spawn a hub (or quest-only) NPC entity. */
export function spawnNpc(world: World, id: string): Entity {
  const def = NPCS.get(id)!;
  const e = world.create();
  world.add(e, Transform, makeTransform(def.x, 0, def.z, def.facing));
  world.add(e, Renderable, { assetId: def.asset, scale: def.scale });
  world.add(e, Npc, { id });
  world.add(e, Interactable, { poi: id, kind: 'npc', radius: INTERACT_RADIUS + 0.6, used: false, readyAt: 0 });
  world.add(e, Collider, { radius: 0.5, mass: Infinity, layer: 'ground', isStatic: true });
  world.add(e, DisplayName, { key: `npcs.${id}.name` });
  return e;
}

/** Hub NPCs that are always present, and trigger objects for quests not yet found. */
export function spawnQuestWorld(world: World, ctx: GameContext): void {
  for (const npc of NPCS.values()) if (!npc.questOnly) spawnNpc(world, npc.id);
  refreshTriggers(world, ctx);
}

function refreshTriggers(world: World, ctx: GameContext): void {
  const rt = ctx.quests;
  if (!rt) return;
  for (const def of QUESTS.values()) {
    const has = rt.triggers.get(def.id);
    const wanted = def.trigger && 'object' in def.trigger && !rt.active.has(def.id) && !rt.done.has(def.id);
    if (wanted && has === undefined) {
      const o = (def.trigger as { object: { id: string; x: number; z: number; asset: string; scale: number } }).object;
      rt.triggers.set(def.id, questObject(world, o.id, o.x, o.z, o.asset, o.scale));
    } else if (!wanted && has !== undefined) {
      world.destroyDeferred(has);
      rt.triggers.delete(def.id);
    }
  }
}

/** Replace the quest log with saved state (or a fresh one), respawning step entities. */
export function restoreQuests(
  world: World,
  ctx: GameContext,
  saved: { active: Record<string, QuestState>; done: Record<string, string>; tracked: string | null },
): void {
  const rt = ctx.quests;
  if (!rt) return;
  for (const id of [...rt.spawned.keys()]) leaveStep(world, rt, id);
  rt.active.clear();
  rt.done.clear();
  rt.signals = [];
  rt.usedObjects.clear();
  for (const [id, choice] of Object.entries(saved.done)) if (QUESTS.has(id)) rt.done.set(id, choice);
  for (const [id, st] of Object.entries(saved.active)) {
    const def = QUESTS.get(id);
    if (!def || rt.done.has(id)) continue;
    rt.active.set(id, { step: Math.min(st.step, def.steps.length - 1), progress: st.progress, ...(st.choice ? { choice: st.choice } : {}) });
  }
  rt.tracked = saved.tracked && rt.active.has(saved.tracked) ? saved.tracked : (rt.active.keys().next().value ?? null);
  for (const id of rt.active.keys()) enterStep(world, ctx, id);
  refreshTriggers(world, ctx);
}

export function saveQuests(rt: QuestRuntime): { active: Record<string, QuestState>; done: Record<string, string>; tracked: string | null } {
  return {
    active: Object.fromEntries([...rt.active].map(([id, st]) => [id, { step: st.step, progress: st.progress, ...(st.choice ? { choice: st.choice } : {}) }])),
    done: Object.fromEntries(rt.done),
    tracked: rt.tracked,
  };
}

// ---- The system --------------------------------------------------------------------------

export function questSystem(world: World, _dt: number, ctx: GameContext): void {
  const rt = ctx.quests;
  if (!rt) return;
  const player = world.first(PlayerControlled, Transform);
  const signals = rt.signals;
  rt.signals = [];
  if (player === undefined) return;
  const ptr = world.req(player, Transform);

  // Quests that start on their own (the opening quest, follow-ups) or from a found object.
  for (const def of QUESTS.values()) {
    if (rt.active.has(def.id) || rt.done.has(def.id) || !prerequisitesMet(rt, def)) continue;
    if (def.giver === null && !def.trigger) startQuest(world, ctx, def.id);
  }
  // Quests started by this tick's signals already counted what was found when they began.
  const fresh = new Set<string>();
  for (const s of signals) {
    if (s.type !== 'interact') continue;
    for (const def of QUESTS.values()) {
      if (!def.trigger || rt.active.has(def.id) || rt.done.has(def.id)) continue;
      const hit = 'poi' in def.trigger ? def.trigger.poi === s.id : def.trigger.object.id === s.id;
      if (hit && startQuest(world, ctx, def.id)) fresh.add(def.id);
    }
  }

  for (const [id, st] of [...rt.active]) {
    if (fresh.has(id)) continue;
    const step = currentStep(id, st);
    if (!step) continue;
    switch (step.kind) {
      case 'reach':
        if (Math.hypot(ptr.x - step.x, ptr.z - step.z) <= step.radius) advance(world, ctx, id);
        break;
      case 'discover':
        if (ctx.zone?.discovered.has(step.teleporter)) advance(world, ctx, id);
        break;
      case 'kill':
        for (const s of signals) {
          if (s.type !== 'kill') continue;
          if (step.spawn ? s.quest !== id : s.quest !== undefined && s.quest !== id) continue;
          if (step.enemy && s.defId !== step.enemy) continue;
          if (step.near && Math.hypot(s.x - step.near.x, s.z - step.near.z) > step.near.radius) continue;
          st.progress++;
          ctx.events.push({ type: 'quest', id, state: 'progress' });
        }
        if (st.progress >= step.count) advance(world, ctx, id);
        break;
      case 'interact':
        for (const s of signals) {
          if (s.type !== 'interact') continue;
          const own = step.objects.some((o) => o.id === s.id) && !rt.usedObjects.has(s.id);
          const listed = step.ids?.includes(s.id) ?? false;
          const kind = step.poiKind !== undefined && s.kind === step.poiKind;
          if (!own && !listed && !kind) continue;
          if (own) rt.usedObjects.add(s.id);
          st.progress++;
          ctx.events.push({ type: 'quest', id, state: 'progress' });
        }
        if (st.progress >= step.count) advance(world, ctx, id);
        break;
      case 'objective':
        if (signals.some((s) => s.type === 'objective' && s.id === step.id)) advance(world, ctx, id);
        break;
      case 'escort':
        escortStep(world, ctx, id, st, ptr);
        break;
      default:
        break;
    }
  }
}

function escortStep(world: World, ctx: GameContext, id: string, st: QuestState, ptr: Transform): void {
  const rt = ctx.quests!;
  const vehicle = (rt.spawned.get(id) ?? []).find((e) => world.has(e, Escort));
  if (vehicle === undefined || !world.isAlive(vehicle) || world.has(vehicle, Dead)) {
    // Destroyed: start the escort over.
    leaveStep(world, rt, id);
    st.progress = 0;
    ctx.events.push({ type: 'quest', id, state: 'failed' });
    enterStep(world, ctx, id);
    return;
  }
  const esc = world.req(vehicle, Escort);
  const tr = world.req(vehicle, Transform);
  const [nx, nz] = esc.path[esc.next]!;
  if (Math.hypot(tr.x - nx, tr.z - nz) < 1.5) {
    esc.next++;
    if (esc.next >= esc.path.length) {
      advance(world, ctx, id);
      return;
    }
  }
  const near = Math.hypot(ptr.x - tr.x, ptr.z - tr.z) <= esc.leash;
  const [tx, tz] = esc.path[Math.min(esc.next, esc.path.length - 1)]!;
  if (near) world.add(vehicle, MoveTarget, { x: tx, z: tz });
  else world.remove(vehicle, MoveTarget);
  st.progress = esc.next;
}

// ---- Markers for the map ----------------------------------------------------------------

export interface QuestMarker {
  quest: string;
  x: number;
  z: number;
  main: boolean;
}

/** Where each active quest's current step points (hidden for mystery trails). */
export function questMarkers(world: World, ctx: GameContext): QuestMarker[] {
  const rt = ctx.quests;
  if (!rt) return [];
  const out: QuestMarker[] = [];
  for (const [id, st] of rt.active) {
    const step = currentStep(id, st);
    if (!step || !step.marker) continue;
    const main = questDef(id).kind === 'main';
    const push = (x: number, z: number) => out.push({ quest: id, x, z, main });
    switch (step.kind) {
      case 'reach':
      case 'objective':
        push(step.x, step.z);
        break;
      case 'talk':
      case 'choice': {
        const npc = NPCS.get(step.npc);
        if (npc) push(npc.x, npc.z);
        break;
      }
      case 'discover': {
        const tp = ctx.zone?.def.teleporters.find((t) => t.id === step.teleporter);
        if (tp) push(tp.x, tp.z);
        break;
      }
      case 'kill':
        if (step.spawn) push(step.spawn.x, step.spawn.z);
        else if (step.near) push(step.near.x, step.near.z);
        break;
      case 'interact':
        for (const o of step.objects) if (!rt.usedObjects.has(o.id)) push(o.x, o.z);
        for (const p of step.ids ?? []) {
          if (ctx.zone?.found.has(p)) continue;
          const poi = ctx.zone?.def.pois.find((q) => q.id === p);
          if (poi) push(poi.x, poi.z);
        }
        break;
      case 'escort': {
        const v = (rt.spawned.get(id) ?? []).find((e) => world.has(e, Escort));
        const tr = v !== undefined ? world.get(v, Transform) : undefined;
        if (tr) push(tr.x, tr.z);
        break;
      }
      default:
        break;
    }
  }
  return out;
}
