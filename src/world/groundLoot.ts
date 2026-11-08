/**
 * A11: loot on the ground survives a zone change. When the player leaves a zone, what lies on its ground is
 * remembered on the zone's runtime; coming back within `LOOT_KEEP` seconds of game time puts it back where it
 * was (no pop-out animation). Older than that, it is gone. Each zone keeps its own pile.
 */
import { GroundGold, GroundItem, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import type { ZoneRuntime } from './zone';

/** How long (s of game time) ground loot is kept while the player is in another zone. */
export const LOOT_KEEP = 300;

/** Remember the ground items and gold of the zone the player is leaving (call before the entities are cleared). */
export function stashGroundLoot(world: World, ctx: GameContext, zone: ZoneRuntime): void {
  const items = world.query(GroundItem, Transform).map((e) => {
    const tr = world.req(e, Transform);
    return { item: structuredClone(world.req(e, GroundItem).item), x: tr.x, z: tr.z };
  });
  const gold = world.query(GroundGold, Transform).map((e) => {
    const tr = world.req(e, Transform);
    return { amount: world.req(e, GroundGold).amount, x: tr.x, z: tr.z };
  });
  if (items.length === 0 && gold.length === 0) delete zone.groundLoot;
  else zone.groundLoot = { at: ctx.time, items, gold };
}

/** Put a zone's remembered loot back (call after the zone is populated); returns how many pieces came back. */
export function restoreGroundLoot(world: World, ctx: GameContext, zone: ZoneRuntime): number {
  const mem = zone.groundLoot;
  delete zone.groundLoot;
  if (!mem || ctx.time - mem.at > LOOT_KEEP) return 0;
  for (const { item, x, z } of mem.items) {
    const e = world.create();
    world.add(e, Transform, makeTransform(x, 0, z, ctx.loot.rng.range(0, Math.PI * 2)));
    world.add(e, GroundItem, { item, age: 5 });
  }
  for (const { amount, x, z } of mem.gold) {
    const e = world.create();
    world.add(e, Transform, makeTransform(x, 0, z));
    world.add(e, GroundGold, { amount, age: 5 });
  }
  return mem.items.length + mem.gold.length;
}
