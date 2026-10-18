/**
 * Neural Matrix and glyphs (docs/endgame.md): paragon progression after level 50. This file is the
 * shared entry point other endgame systems call (Deep Rifts upgrade glyphs, bosses grant them).
 */
import type { GameContext } from '../../core/context';

/** Gives the character a glyph at level 1 if it doesn't have it yet. Returns true if it was new. */
export function grantGlyph(ctx: GameContext, id: string): boolean {
  const e = ctx.endgame;
  if (!e || e.glyphs.some((g) => g.id === id)) return false;
  e.glyphs.push({ id, level: 1 });
  return true;
}

/**
 * One upgrade attempt for a glyph after a Deep Rift of `riftLevel`. Returns the new level, or null if
 * the attempt failed or the glyph is unknown.
 */
export function upgradeGlyph(ctx: GameContext, id: string, riftLevel: number): number | null {
  void riftLevel;
  const g = ctx.endgame?.glyphs.find((x) => x.id === id);
  if (!g) return null;
  g.level += 1;
  return g.level;
}
