/** Advances corpses and removes them after their linger time; the toll for dying in the campaign. */
import { Dead, Inventory, Progression, SkillUser } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';

export function deathSystem(world: World, dt: number, _ctx: GameContext): void {
  for (const e of world.query(Dead)) {
    const dead = world.req(e, Dead);
    dead.elapsed += dt;
    if (dead.elapsed >= dead.removeAfter) world.destroyDeferred(e);
  }
}

/** The death toll (G018, docs/decisions.md): a small, recoverable loss, not a punishment. */
export const DEATH_PENALTY = {
  /** Share of carried gold lost, and the most that can be lost per level of the character. */
  goldShare: 0.05,
  goldCapPerLevel: 40,
  /** Potion charges are halved (rounded down) but never below this while any were left. */
  potionKeep: 1,
};

/**
 * Applied on respawn after an open-world or dungeon death (not for Rifts and the Endless Shaft, which end the
 * run themselves): 5 % of carried gold (at most 40 x level) and half the potion charges. Returns what was lost.
 */
export function applyDeathPenalty(world: World, player: Entity): { gold: number; potions: number } {
  const inv = world.get(player, Inventory);
  const level = world.get(player, Progression)?.level ?? 1;
  const gold = inv ? Math.min(Math.floor(inv.gold * DEATH_PENALTY.goldShare), DEATH_PENALTY.goldCapPerLevel * level) : 0;
  if (inv) inv.gold -= gold;
  const user = world.get(player, SkillUser);
  let potions = 0;
  if (user && user.potionCharges > 0) {
    const left = Math.max(DEATH_PENALTY.potionKeep, Math.floor(user.potionCharges / 2));
    potions = user.potionCharges - left;
    user.potionCharges = left;
  }
  return { gold, potions };
}
