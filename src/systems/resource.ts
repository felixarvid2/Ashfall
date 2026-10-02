/** Class resources: idle decay/regeneration and Bastion's overheat. */
import { Dead, Health, Resource } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { applyDamage, gainResource } from './combat';

const OVERHEAT_TICK = 0.25;

export function resourceSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Resource)) {
    if (world.has(e, Dead)) continue;
    const r = world.req(e, Resource);
    r.sinceCombat += dt;
    if (r.sinceCombat >= r.config.idleDelay) gainResource(r, r.config.idleRate * dt);

    const overheat = r.config.overheat;
    if (!overheat) continue;
    if (r.current >= r.max - 1e-6) {
      const wasSafe = r.atMaxFor < overheat.grace;
      r.atMaxFor += dt;
      if (r.atMaxFor >= overheat.grace) {
        if (wasSafe) ctx.events.push({ type: 'overheat' });
        r.overheatTick -= dt;
        if (r.overheatTick <= 0) {
          r.overheatTick = OVERHEAT_TICK;
          const max = world.get(e, Health)?.max ?? 0;
          // Self-inflicted, unmitigated heat damage — the cost of riding the red line.
          applyDamage(world, ctx, e, max * overheat.damagePerSecond * OVERHEAT_TICK, {
            crit: false,
            damageType: 'heat',
            dot: true,
            sourceTeam: 'enemy',
          });
        }
      }
    } else {
      r.atMaxFor = 0;
      r.overheatTick = 0;
    }
  }
}
