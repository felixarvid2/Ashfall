/**
 * Endgame crafting (docs/endgame.md): tempering recipes and masterworking materials. This file is the
 * shared entry point drop sources call (world bosses, Ash Harvest caches, Deep Rift guardians).
 */
import type { GameContext } from '../../core/context';

/** Teaches the character a tempering recipe. Returns true if it was new. */
export function grantRecipe(ctx: GameContext, id: string): boolean {
  const e = ctx.endgame;
  if (!e || e.recipes.includes(id)) return false;
  e.recipes.push(id);
  return true;
}

/** Adds masterworking materials of one kind. */
export function grantMaterial(ctx: GameContext, id: string, amount: number): void {
  const e = ctx.endgame;
  if (!e || amount <= 0) return;
  e.materials[id] = (e.materials[id] ?? 0) + Math.floor(amount);
}
