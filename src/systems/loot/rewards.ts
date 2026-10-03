/**
 * Rewards: XP and levelling, drop rolls (items, crystals, gold) spawned on the ground,
 * and picking loot up (gold automatically, items by click/walk-over or the pickup key).
 */
import { PYLON_EFFECTS } from '../../data/interactables';
import {
  AccountBonuses,
  Dead,
  GroundGold,
  GroundItem,
  Health,
  Inventory,
  MoveTarget,
  PickupTarget,
  PlayerControlled,
  Progression,
  CombatStats,
  SkillUser,
  StatusEffects,
  Transform,
  makeTransform,
} from '../../core/components';
import type { GameContext } from '../../core/context';
import type { Entity, World } from '../../core/ecs';
import { PROGRESSION, UNIQUE_DEFS, dropTable } from '../../data/loot/db';
import { heal } from '../combat';
import { recomputePlayer } from '../stats';
import { addToGrid } from './inventory';
import { generateItem, generateUnique, itemPowerFor, killXp, rollDrops, xpToNext } from './generate';

export const GOLD_PICKUP_RADIUS = 1.8;
export const ITEM_PICKUP_RADIUS = 1.6;
export const PICKUP_KEY_RADIUS = 2.6;

/** Optional localisation of base item names for generated items. */
let nameOf: ((baseId: string) => string) | undefined;
export function setItemNamer(fn: (baseId: string) => string): void {
  nameOf = fn;
}

export function nextItemUid(ctx: GameContext): string {
  ctx.loot.seq++;
  return `${ctx.rng.seed}-${ctx.loot.seq}`;
}

/** Add XP, handling multiple level-ups. Returns levels gained. */
export function grantXp(world: World, ctx: GameContext, player: Entity, amount: number): number {
  const prog = world.get(player, Progression);
  if (!prog || amount <= 0) return 0;
  if (prog.level >= PROGRESSION.maxLevel) return 0;
  prog.xp += amount;
  ctx.events.push({ type: 'xp', amount });
  let gained = 0;
  while (prog.level < PROGRESSION.maxLevel && prog.xp >= xpToNext(prog.level)) {
    prog.xp -= xpToNext(prog.level);
    prog.level++;
    prog.skillPoints++;
    gained++;
    ctx.events.push({ type: 'levelUp', level: prog.level });
  }
  if (prog.level >= PROGRESSION.maxLevel) prog.xp = 0;
  if (gained > 0) {
    recomputePlayer(world, player);
    // Levelling up fully restores life, as in classic ARPGs.
    const health = world.get(player, Health);
    if (health && !world.has(player, Dead)) health.current = health.max;
  }
  return gained;
}

function spawnGround(world: World, ctx: GameContext, x: number, z: number, i: number, n: number): { x: number; z: number } {
  // Spread drops in a small ring so they don't stack.
  const angle = (i / Math.max(1, n)) * Math.PI * 2 + ctx.loot.rng.range(0, 0.6);
  const r = n > 1 ? 0.9 + ctx.loot.rng.range(0, 0.5) : ctx.loot.rng.range(0, 0.4);
  const lim = ctx.worldHalfSize - 1;
  return {
    x: Math.max(-lim, Math.min(lim, x + Math.sin(angle) * r)),
    z: Math.max(-lim, Math.min(lim, z + Math.cos(angle) * r)),
  };
}

export function rewardSystem(world: World, _dt: number, ctx: GameContext): void {
  if (ctx.rewards.length === 0) return;
  const player = world.first(PlayerControlled, Inventory);
  const classId = player !== undefined ? (world.get(player, SkillUser)?.classId ?? 'bastion') : 'bastion';
  const requests = ctx.rewards;
  ctx.rewards = [];
  for (const req of requests) {
    const table = dropTable(req.table);
    if (player !== undefined && req.xp) {
      const magnet = world.get(player, StatusEffects)?.list.some((st) => st.id === 'magnet') ? PYLON_EFFECTS.magnetXp : 1;
      grantXp(world, ctx, player, killXp(table, req.level) * magnet);
      const lifeOnKill = world.get(player, CombatStats)?.lifeOnKill ?? 0;
      if (lifeOnKill > 0) heal(world, ctx, player, lifeOnKill);
    }
    const drop = rollDrops(ctx.loot.rng, table, req.level, classId, () => nextItemUid(ctx), nameOf);
    if (req.rarity) {
      const itemPower = itemPowerFor(req.level, ctx.loot.rng);
      drop.items.push(generateItem(ctx.loot.rng, { itemPower, classId, uid: nextItemUid(ctx), rarity: req.rarity, nameOf }));
    }
    const unique = req.unique ? UNIQUE_DEFS.get(req.unique) : undefined;
    if (unique) drop.items.push(generateUnique(ctx.loot.rng, unique, itemPowerFor(req.level, ctx.loot.rng), nextItemUid(ctx)));
    const total = drop.items.length + (drop.gold > 0 ? 1 : 0);
    drop.items.forEach((item, i) => {
      const p = spawnGround(world, ctx, req.x, req.z, i, total);
      const e = world.create();
      world.add(e, Transform, makeTransform(p.x, 0, p.z, ctx.loot.rng.range(0, Math.PI * 2)));
      world.add(e, GroundItem, { item, age: 0 });
      ctx.events.push({ type: 'loot', entity: e, rarity: item.rarity, x: p.x, z: p.z });
    });
    // Restoration tier 3: more gold.
    if (drop.gold > 0 && player !== undefined) drop.gold = Math.round(drop.gold * (1 + (world.get(player, AccountBonuses)?.goldFind ?? 0)));
    if (drop.gold > 0) {
      const p = spawnGround(world, ctx, req.x, req.z, drop.items.length, total);
      const e = world.create();
      world.add(e, Transform, makeTransform(p.x, 0, p.z));
      world.add(e, GroundGold, { amount: drop.gold, age: 0 });
    }
  }
}

/** Try to move a ground item into the player's backpack. */
export function pickUp(world: World, ctx: GameContext, player: Entity, itemEntity: Entity): boolean {
  const ground = world.get(itemEntity, GroundItem);
  const inv = world.get(player, Inventory);
  if (!ground || !inv) return false;
  const r = addToGrid(inv, ground.item);
  if (!r.ok) {
    ctx.events.push({ type: 'notice', key: 'loot.inventoryFull' });
    return false;
  }
  ctx.events.push({ type: 'pickup', kind: 'item', rarity: ground.item.rarity, name: ground.item.name });
  world.destroyDeferred(itemEntity);
  return true;
}

export function nearestGroundItem(world: World, x: number, z: number, radius: number): Entity | null {
  let best: Entity | null = null;
  let bestD = radius;
  for (const e of world.query(GroundItem, Transform)) {
    const tr = world.req(e, Transform);
    const d = Math.hypot(tr.x - x, tr.z - z);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function pickupSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(GroundItem)) world.req(e, GroundItem).age += dt;
  for (const e of world.query(GroundGold)) world.req(e, GroundGold).age += dt;

  const player = world.first(PlayerControlled, Inventory);
  if (player === undefined || world.has(player, Dead)) return;
  const ptr = world.req(player, Transform);
  const inv = world.req(player, Inventory);

  for (const e of world.query(GroundGold, Transform)) {
    const gold = world.req(e, GroundGold);
    const tr = world.req(e, Transform);
    if (gold.age > 0.4 && Math.hypot(tr.x - ptr.x, tr.z - ptr.z) <= GOLD_PICKUP_RADIUS) {
      inv.gold += gold.amount;
      ctx.events.push({ type: 'pickup', kind: 'gold', amount: gold.amount });
      world.destroyDeferred(e);
    }
  }

  if (ctx.input.wasPressed('pickup')) {
    const near = nearestGroundItem(world, ptr.x, ptr.z, PICKUP_KEY_RADIUS);
    if (near !== null) pickUp(world, ctx, player, near);
  }

  const order = world.get(player, PickupTarget);
  if (order) {
    const target = world.get(order.target, Transform);
    if (!target || !world.has(order.target, GroundItem)) {
      world.remove(player, PickupTarget);
    } else if (Math.hypot(target.x - ptr.x, target.z - ptr.z) <= ITEM_PICKUP_RADIUS) {
      pickUp(world, ctx, player, order.target);
      world.remove(player, PickupTarget);
      world.remove(player, MoveTarget);
    }
  }
}
