/**
 * Open-world interactables (docs/world-and-gameplay.md §3, §10): supply crates, locked chests and
 * their keycards, Stim Pylons, Echo Relics, lore logs, signal towers, teleporters and explosive
 * barrels. Spawned once per zone from its points of interest; used with the interact key.
 */
import {
  AccountBonuses,
  Blast,
  Collider,
  Dead,
  Destructible,
  Health,
  Interactable,
  PlayerControlled,
  Progression,
  Renderable,
  Transform,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { relicEffects } from '../core/account';
import {
  BARREL,
  CRATE_REFILL,
  INTERACT_RADIUS,
  LORE_XP_PER_LEVEL,
  PYLONS,
  PYLON_RECHARGE,
  SIGNAL_TOWER_RADIUS,
  type PylonType,
} from '../data/interactables';
import type { Impact } from '../data/schemas';
import type { PoiDef } from '../data/zones/zoneTypes';
import { applyDamage, applyStatus, isAlive, targetState } from '../systems/combat';
import { computeTaken } from '../systems/damage';
import { monsterLevel } from '../systems/encounter';
import { hitOne } from '../systems/impact';
import { PICKUP_KEY_RADIUS, grantXp, nearestGroundItem } from '../systems/loot/rewards';
import { recomputePlayer } from '../systems/stats';
import { livingInCircle } from '../systems/targeting';
import { revealAround, type ZoneRuntime } from './zone';
import { signal } from '../systems/quests';

const VISUAL: Partial<Record<Interactable['kind'], { asset: string; scale?: number; glow?: string; collider?: number }>> = {
  chest: { asset: 'prop.supply_chest', collider: 0.7 },
  lockedChest: { asset: 'prop.supply_chest', scale: 1.25, glow: '#ffb43a', collider: 0.85 },
  keycard: { asset: 'prop.cargo_crate', scale: 0.3, glow: '#3ad2ff' },
  pylon: { asset: 'prop.stim_pylon', collider: 0.6 },
  relic: { asset: 'prop.echo_relic', glow: '#9fb8ff', collider: 0.5 },
  lore: { asset: 'prop.control_terminal', scale: 0.8, glow: '#2a6a8a', collider: 0.45 },
  signalTower: { asset: 'prop.signal_tower', scale: 1.1, collider: 1 },
  teleporter: { asset: 'prop.teleporter', scale: 0.38, glow: '#2a8aff' },
  stash: { asset: 'prop.supply_chest', scale: 1.1, glow: '#7dd8a0', collider: 0.8 },
};

/** Spawn the zone's interactable objects (once, when the zone loads). */
export function spawnInteractables(world: World, zone: ZoneRuntime, extras: { poi: string; kind: Interactable['kind']; x: number; z: number }[] = []): void {
  const add = (poi: string, kind: Interactable['kind'], x: number, z: number, glow?: string) => {
    const v = VISUAL[kind];
    if (!v) return;
    const e = world.create();
    world.add(e, Transform, makeTransform(x, 0, z, ((x * 7 + z * 13) % 628) / 100));
    world.add(e, Renderable, { assetId: v.asset, scale: v.scale ?? 1, ...(glow ?? v.glow ? { glow: glow ?? v.glow } : {}) });
    world.add(e, Interactable, { poi, kind, radius: INTERACT_RADIUS, used: false, readyAt: 0 });
    if (v.collider) world.add(e, Collider, { radius: v.collider, mass: Infinity, layer: 'ground', isStatic: true });
  };
  for (const poi of zone.def.pois) {
    if (poi.kind === 'barrel') {
      const e = world.create();
      world.add(e, Transform, makeTransform(poi.x, 0, poi.z));
      world.add(e, Renderable, { assetId: 'prop.explosive_barrel' });
      world.add(e, Destructible, { radius: 0.7, blast: { radius: BARREL.radius, flat: BARREL.base } });
      continue;
    }
    const glow = poi.kind === 'pylon' ? PYLONS[poi.data?.type as PylonType]?.color : undefined;
    add(poi.id, poi.kind, poi.x, poi.z, glow);
  }
  for (const tp of zone.def.teleporters) add(tp.id, 'teleporter', tp.x, tp.z);
  for (const x of extras) add(x.poi, x.kind, x.x, x.z);
  syncInteractables(world, zone);
}

/** Mark one-time objects as used after loading a save (or starting a new character). */
export function syncInteractables(world: World, zone: ZoneRuntime): void {
  for (const e of world.query(Interactable)) {
    const it = world.req(e, Interactable);
    it.readyAt = 0;
    it.used = zone.found.has(it.poi);
    updateLook(world, e, it);
  }
}

function updateLook(world: World, e: Entity, it: Interactable): void {
  const r = world.get(e, Renderable);
  if (!r) return;
  const v = VISUAL[it.kind];
  // Picked-up keycards and claimed relics disappear; spent objects stop glowing.
  const gone = it.used && (it.kind === 'keycard' || it.kind === 'relic');
  r.scale = gone ? 0.0001 : (v?.scale ?? 1);
  // Pylons keep the colour they spawned with (restoreGlow brings it back after recharging).
  if (it.used || it.readyAt > 0) delete r.glow;
  else if (it.kind !== 'pylon' && v?.glow) r.glow = v.glow;
}

/** Can this object be used right now? */
export function usable(it: Interactable, now: number): boolean {
  if (it.used) return false;
  return it.readyAt <= now;
}

/** The usable interactable within reach of (x, z), nearest first. */
export function nearestInteractable(world: World, x: number, z: number, now: number): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of world.query(Interactable, Transform)) {
    const it = world.req(e, Interactable);
    if (!usable(it, now)) continue;
    const tr = world.req(e, Transform);
    const d = Math.hypot(tr.x - x, tr.z - z);
    if (d <= it.radius && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function interactSystem(world: World, _dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone) return;
  // Recharged pylons and refilled crates glow again.
  for (const e of world.query(Interactable)) {
    const it = world.req(e, Interactable);
    if (it.readyAt > 0 && it.readyAt <= ctx.time) {
      it.readyAt = 0;
      restoreGlow(world, e, it, zone);
    }
  }
  if (!ctx.input.wasPressed('pickup')) return;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined || world.has(player, Dead)) return;
  const ptr = world.req(player, Transform);
  // Loot on the ground takes priority over objects.
  if (nearestGroundItem(world, ptr.x, ptr.z, PICKUP_KEY_RADIUS) !== null) return;
  const target = nearestInteractable(world, ptr.x, ptr.z, ctx.time);
  if (target !== null) interact(world, ctx, player, target);
}

function restoreGlow(world: World, e: Entity, it: Interactable, zone: ZoneRuntime): void {
  const r = world.get(e, Renderable);
  if (!r) return;
  if (it.kind === 'pylon') {
    const poi = zone.def.pois.find((p) => p.id === it.poi);
    const color = PYLONS[poi?.data?.type as PylonType]?.color;
    if (color) r.glow = color;
  } else {
    const v = VISUAL[it.kind];
    if (v?.glow) r.glow = v.glow;
  }
}

/** Use an object. Returns true if something happened. */
export function interact(world: World, ctx: GameContext, player: Entity, target: Entity): boolean {
  const zone = ctx.zone;
  const it = world.get(target, Interactable);
  const tr = world.get(target, Transform);
  if (!zone || !it || !tr || !usable(it, ctx.time)) return false;
  const poi = zone.def.pois.find((p) => p.id === it.poi);
  const level = monsterLevel(world, ctx);
  const emit = (detail?: string) => {
    ctx.events.push({ type: 'interact', kind: it.kind, id: it.poi, ...(detail !== undefined ? { detail } : {}) });
    if (it.kind !== 'questObject') signal(ctx, { type: 'interact', kind: it.kind, id: it.poi });
  };
  const spend = () => {
    it.used = true;
    zone.found.add(it.poi);
    updateLook(world, target, it);
  };

  switch (it.kind) {
    case 'chest':
      ctx.rewards.push({ table: 'dt.supply_crate', level, x: tr.x, z: tr.z, xp: false });
      it.readyAt = ctx.time + CRATE_REFILL;
      updateLook(world, target, it);
      emit();
      return true;
    case 'lockedChest': {
      const key = String(poi?.data?.key ?? '');
      if (!zone.keycards.has(key)) {
        ctx.events.push({ type: 'notice', key: 'interact.needKeycard' });
        return false;
      }
      zone.keycards.delete(key);
      ctx.rewards.push({ table: 'dt.locked_chest', level, x: tr.x, z: tr.z, xp: false });
      spend();
      emit();
      return true;
    }
    case 'keycard':
      zone.keycards.add(it.poi);
      spend();
      emit();
      return true;
    case 'pylon': {
      const type = poi?.data?.type as PylonType | undefined;
      const def = type ? PYLONS[type] : undefined;
      if (!def) return false;
      applyStatus(world, ctx, player, { status: def.status, duration: def.duration }, { team: 'player', level });
      it.readyAt = ctx.time + PYLON_RECHARGE;
      updateLook(world, target, it);
      ctx.events.push({ type: 'vfx', kind: 'heal', x: tr.x, z: tr.z, radius: 2.5, facing: 0 });
      emit(type);
      return true;
    }
    case 'relic': {
      const stat = String(poi?.data?.stat ?? 'maxLife');
      if (ctx.account) {
        ctx.account.relics[it.poi] = stat;
        world.add(player, AccountBonuses, { effects: relicEffects(ctx.account) });
        recomputePlayer(world, player);
      }
      spend();
      emit(stat);
      return true;
    }
    case 'lore': {
      const prog = world.get(player, Progression);
      if (prog) grantXp(world, ctx, player, LORE_XP_PER_LEVEL * prog.level);
      spend();
      emit(String(poi?.data?.log ?? it.poi));
      return true;
    }
    case 'signalTower':
      revealAround(zone, tr.x, tr.z, SIGNAL_TOWER_RADIUS);
      spend();
      ctx.events.push({ type: 'vfx', kind: 'shockwave', x: tr.x, z: tr.z, radius: 6, facing: 0 });
      emit();
      return true;
    case 'teleporter':
    case 'npc':
    case 'stash':
      emit();
      return true;
    case 'questObject':
      // Quest objects vanish when used; the quest log decides what they mean.
      it.used = true;
      world.destroyDeferred(target);
      ctx.events.push({ type: 'vfx', kind: 'heal', x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
      signal(ctx, { type: 'interact', kind: it.kind, id: it.poi });
      emit();
      return true;
    default:
      return false;
  }
}

// ---- Explosive barrels and blasts ---------------------------------------------------

/** Player attacks that reach a barrel set it off. */
export function hitDestructibles(world: World, x: number, z: number, radius: number): number {
  let n = 0;
  for (const e of world.query(Destructible, Transform)) {
    const tr = world.req(e, Transform);
    const d = world.req(e, Destructible);
    if (Math.hypot(tr.x - x, tr.z - z) > radius + d.radius) continue;
    breakDestructible(world, e, 0);
    n++;
  }
  return n;
}

function breakDestructible(world: World, e: Entity, fuse: number): void {
  const d = world.get(e, Destructible);
  if (!d) return;
  world.remove(e, Destructible);
  if (d.blast) {
    world.add(e, Blast, { fuse, radius: d.blast.radius, owner: null, coefficient: 0, flat: d.blast.flat, hurtsPlayer: true });
  } else {
    world.destroyDeferred(e);
  }
}

const BLAST_IMPACT: Impact = {
  coefficient: 1,
  damageType: 'heat',
  knockback: 2.5,
  applies: [],
  hitstopMs: 0,
  shake: 0,
  delivery: 'ranged',
  lifeSteal: 0,
};

export function blastSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Blast, Transform)) {
    const b = world.req(e, Blast);
    b.fuse -= dt;
    if (b.fuse > 0) continue;
    const tr = world.req(e, Transform);
    world.remove(e, Blast);
    world.destroyDeferred(e);
    const level = monsterLevel(world, ctx);
    for (const target of livingInCircle(world, ctx, tr.x, tr.z, b.radius, 'enemy')) {
      if (b.owner !== null && isAlive(world, b.owner)) {
        hitOne(world, ctx, b.owner, target, tr.x, tr.z, { ...BLAST_IMPACT, coefficient: b.coefficient });
      } else {
        const raw = b.flat + BARREL.perLevel * level;
        const taken = computeTaken(raw, 'heat', targetState(world, target, 'ranged'), level).final;
        applyDamage(world, ctx, target, taken, { crit: false, damageType: 'heat', dot: false, sourceTeam: 'player' });
      }
    }
    if (b.hurtsPlayer) {
      for (const p of livingInCircle(world, ctx, tr.x, tr.z, b.radius, 'player')) {
        if (!world.has(p, PlayerControlled)) continue;
        const max = world.get(p, Health)?.max ?? 0;
        applyDamage(world, ctx, p, max * BARREL.playerFraction, { crit: false, damageType: 'heat', dot: false, sourceTeam: 'enemy' });
      }
    }
    // Other barrels in the blast go off a moment later.
    for (const other of world.query(Destructible, Transform)) {
      const ot = world.req(other, Transform);
      if (Math.hypot(ot.x - tr.x, ot.z - tr.z) <= b.radius) breakDestructible(world, other, BARREL.chainDelay);
    }
    ctx.events.push({ type: 'vfx', kind: 'explosion', x: tr.x, z: tr.z, radius: b.radius, facing: 0 });
    ctx.events.push({ type: 'shake', trauma: b.hurtsPlayer ? 0.45 : 0.2 });
  }
}
