/**
 * Meshy pipeline settings (Phase 2). Read only by Node scripts — never imported under src/.
 */

/**
 * Ask for confirmation before sending a batch whose estimated cost exceeds this many credits.
 * Owner's choice: 800 (the brief's original default was 200). Override per run with --budget <n>.
 */
export const DEFAULT_BUDGET_CREDITS = 800;

/** Model for new 3D tasks. "latest" resolves server-side to the newest model (Meshy 7.1 as of 2026-10). */
export const DEFAULT_AI_MODEL = 'latest';
/** Used automatically if the account is not entitled to DEFAULT_AI_MODEL. */
export const FALLBACK_AI_MODEL = 'meshy-6';

/** Texture settings for the refine step. 2K keeps downloads small; the optimizer downsizes further. */
export const TEXTURE_RESOLUTION = '2k' as const;

/** Meshy allows 10 queued tasks on the Pro tier; stay below it. */
export const MAX_CONCURRENT_TASKS = 6;

/** Texture size (px) the optimizer resizes to for in-game use. */
export const GAME_TEXTURE_SIZE = 1024;

/** LOD levels as a fraction of the base triangle count. */
export const LOD_RATIOS = [0.5, 0.2];
