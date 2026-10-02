/**
 * Meshy pipeline settings (Phase 2). Read only by Node scripts — never imported under src/.
 */

/**
 * Ask for confirmation before sending a batch whose estimated cost exceeds this many credits.
 * Owner's choice: 800 (the brief's original default was 200). Override per run with --budget <n>.
 */
export const DEFAULT_BUDGET_CREDITS = 800;
