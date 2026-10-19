/** The player's statuses as HUD tiles (the bar above the action bar). */
import type { StatusInstance } from '../core/components';
import { STATUS_DEFS } from '../data/db';
import { PYLONS } from '../data/interactables';
import type { HudStatus } from './hud';

const PYLON_STATUSES = new Set<string>(Object.values(PYLONS).map((p) => p.status));

const HARMFUL = new Set(['dot', 'slow', 'disable', 'vulnerable', 'mark']);

/** The player's statuses for the HUD: one tile per status (stacks counted), boons before harm. */
export function playerStatuses(list: readonly StatusInstance[]): HudStatus[] {
  const byId = new Map<string, HudStatus>();
  for (const st of list) {
    if (st.remaining <= 0) continue;
    const def = STATUS_DEFS[st.id];
    const cur = byId.get(st.id);
    if (cur) {
      cur.stacks = (cur.stacks ?? 1) + 1;
      cur.remaining = Math.max(cur.remaining, st.remaining);
      continue;
    }
    // Statuses refreshed every tick (wading, standing in a field) show no countdown.
    byId.set(st.id, { id: st.id, remaining: st.remaining, color: def.color, harmful: HARMFUL.has(def.kind), timed: st.duration > 1 || PYLON_STATUSES.has(st.id) });
  }
  return [...byId.values()].sort((a, b) => Number(a.harmful) - Number(b.harmful));
}

/** Tiles shown at once on a phone; the rest collapse into one "+N" tile (H043). */
export const MAX_STATUS_TILES = 8;

/**
 * Tile slots for a list: when the list fits, all of it; otherwise `slots - 1` tiles (boons first, as sorted) and
 * the number left over, which the "+N" tile stands for (so the row is never longer than `slots`).
 */
export function capStatuses<T>(list: readonly T[], slots = MAX_STATUS_TILES + 1): { shown: T[]; more: number } {
  if (list.length <= slots) return { shown: [...list], more: 0 };
  return { shown: list.slice(0, slots - 1), more: list.length - (slots - 1) };
}

/**
 * How many tile slots the phone's left column can spare: two rows of 28 px tiles, one row on a short screen (the
 * thumb menu button sits below the column there), never more than eight tiles and the "+N". `width` and `height` are
 * the viewport; the column is the screen minus the quest tracker (150-196 px) and the margins.
 */
export function statusSlots(width: number, height: number): number {
  const tracker = Math.min(196, Math.max(150, width * 0.42));
  const columnWidth = width - tracker - 24;
  const perRow = Math.max(3, Math.floor((columnWidth + 4) / 32));
  const rows = height <= 700 ? 1 : 2;
  return Math.min(MAX_STATUS_TILES + 1, perRow * rows);
}

/** A timed status about to run out (H046): its tile blinks. */
export const EXPIRING_SECONDS = 3;
export const isExpiring = (s: { timed?: boolean; remaining: number }): boolean => !!s.timed && s.remaining > 0 && s.remaining <= EXPIRING_SECONDS;
