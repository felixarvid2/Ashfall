/**
 * B15: warm the next zone while the player walks towards a border gate. Within `PREFETCH_RANGE` metres of a gate (and the
 * gate not locked) the zone behind it has its models and ground textures requested once, in browser idle time, so the
 * fade on the other side finds them loaded. Nothing here touches the renderer directly: the game hands in what to call.
 */
import type { ZoneDef, ZoneGateDef } from '../data/zones/zoneTypes';

/** How close to a gate's edge the player must be (metres). A gate's own radius comes on top. */
export const PREFETCH_RANGE = 60;

/** The gates whose far zone should be fetched now: near enough, open, and not requested before. */
export function gatesToPrefetch(
  gates: readonly ZoneGateDef[],
  px: number,
  pz: number,
  requested: ReadonlySet<string>,
  isLocked: (gate: ZoneGateDef) => boolean = () => false,
  range: number = PREFETCH_RANGE,
): ZoneGateDef[] {
  return gates.filter((g) => !requested.has(g.to.zone) && Math.hypot(g.x - px, g.z - pz) <= g.radius + range && !isLocked(g));
}

export interface PrefetchDeps {
  hasZone: (id: string) => boolean;
  zoneDef: (id: string) => ZoneDef;
  /** Manifest ids to fetch for a zone (everything standing in it when it loads). */
  assetIds: (zone: ZoneDef) => string[];
  /** Fetch models; never needs to reject. */
  ensure: (ids: string[]) => Promise<unknown>;
  /** Fetch ground textures. */
  ground: (zone: ZoneDef) => Promise<unknown>;
  /** Run the callback when the browser is idle (requestIdleCallback with a timer fallback). */
  idle: (fn: () => void) => void;
}

export class ZonePrefetcher {
  /** Zone ids already requested this session (models stay cached, so once is enough). */
  readonly requested = new Set<string>();

  constructor(private readonly deps: PrefetchDeps) {}

  /** Call every so often with the player's position; requests the zones behind nearby gates. Returns their ids. */
  update(zone: ZoneDef, px: number, pz: number, isLocked?: (gate: ZoneGateDef) => boolean): string[] {
    const out: string[] = [];
    for (const gate of gatesToPrefetch(zone.gates, px, pz, this.requested, isLocked)) {
      if (!this.deps.hasZone(gate.to.zone)) continue;
      this.requested.add(gate.to.zone);
      out.push(gate.to.zone);
      this.deps.idle(() => {
        const target = this.deps.zoneDef(gate.to.zone);
        void Promise.all([this.deps.ensure(this.deps.assetIds(target)), this.deps.ground(target)]).catch(() => undefined); // each loader already warns per file
      });
    }
    return out;
  }
}

/** requestIdleCallback where the browser has it (Safari does not), else a short timer. */
export function whenIdle(fn: () => void): void {
  const w = globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 300);
}
