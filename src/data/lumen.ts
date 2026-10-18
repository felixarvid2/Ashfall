/**
 * The end of the game (docs/regions/the-core.md, "Final boss: Lumen"): the choice made in Lumen's third phase, which
 * epilogue it picks, and the credits. The choice is a flag in the Core's `found` set, so it is saved with the character.
 */
import { LUMEN_HEART } from './zones/theCore';

export type LumenChoice = 'listen' | 'fight';

/** The saved flags (ids in the Core's `found` set). At most one is set: the latest choice wins. */
export const LUMEN_CHOICE_FLAGS: Record<LumenChoice, string> = {
  listen: `${LUMEN_HEART.id}.choice.listen`,
  fight: `${LUMEN_HEART.id}.choice.fight`,
};

/** The choice a character made in Lumen's beat, or null. */
export function lumenChoiceOf(found: ReadonlySet<string>): LumenChoice | null {
  if (found.has(LUMEN_CHOICE_FLAGS.listen)) return 'listen';
  if (found.has(LUMEN_CHOICE_FLAGS.fight)) return 'fight';
  return null;
}

/** Language keys of the epilogue card for a choice (no choice reads as Fight: the player never stopped to listen). */
export function epilogueKeys(choice: LumenChoice | null): { title: string; text: string } {
  const c: LumenChoice = choice ?? 'fight';
  return { title: `ending.${c}Title`, text: `ending.epilogue.${c}` };
}

/** The credits, in order (language keys under `ending.credits`). */
export const CREDIT_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'].map((k) => `ending.credits.${k}`);
