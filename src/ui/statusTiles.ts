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
