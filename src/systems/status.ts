/** Ticks status effects: expiry, damage-over-time, and derived flags (canAct, speedMul). */
import { PYLON_EFFECTS } from '../data/interactables';
import { Dead, Invulnerable, Mover, StatusEffects } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { STATUS_DEFS } from '../data/db';
import { applyDamage, dotTaken } from './combat';

/** DoT damage is grouped into ticks so damage numbers stay readable. */
export const DOT_TICK = 0.5;

export function statusSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Invulnerable)) {
    const inv = world.req(e, Invulnerable);
    inv.remaining -= dt;
    if (inv.remaining <= 0) world.remove(e, Invulnerable);
  }

  for (const e of world.query(StatusEffects)) {
    const effects = world.req(e, StatusEffects);
    if (world.has(e, Dead)) {
      effects.list.length = 0;
      continue;
    }

    for (const s of effects.list) {
      s.remaining -= dt;
      if (s.dps > 0) s.pending += s.dps * Math.min(dt, Math.max(0, s.remaining + dt));
    }

    effects.dotTimer -= dt;
    // Tick on the interval, and also when a DoT expires so its last damage isn't lost.
    const expiringWithDamage = effects.list.some((s) => s.remaining <= 0 && s.pending > 0);
    if (effects.dotTimer <= 0 || expiringWithDamage) {
      if (effects.dotTimer <= 0) effects.dotTimer = DOT_TICK;
      // Sum pending DoT per damage type so one number shows per type per tick.
      for (const s of effects.list) {
        if (s.pending <= 0) continue;
        const def = STATUS_DEFS[s.id];
        if (def.kind !== 'dot') continue;
        const amount = dotTaken(world, e, s.pending, def.damageType, s.attackerLevel);
        s.pending = 0;
        applyDamage(world, ctx, e, amount, { crit: false, damageType: def.damageType, dot: true, sourceTeam: s.sourceTeam });
        if (world.has(e, Dead)) break;
      }
    }

    effects.list = effects.list.filter((s) => s.remaining > 0);

    let canAct = true;
    let slow = 0;
    let haste = 1;
    for (const s of effects.list) {
      const def = STATUS_DEFS[s.id];
      if (def.kind === 'disable') canAct = false;
      if (def.kind === 'slow') slow = Math.max(slow, def.slow);
      if (s.id === 'kinetic') haste = 1 + PYLON_EFFECTS.kineticSpeed;
    }
    effects.canAct = canAct;
    const mover = world.get(e, Mover);
    if (mover) mover.speedMul = canAct ? (1 - slow) * haste : 0;
  }
}
