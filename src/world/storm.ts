/**
 * Ash Storm (docs/regions/cinder-flats.md): every few minutes a storm rolls over a subzone (usually
 * Ash Valley), announced a few seconds ahead. Inside it the fog closes in and name plates only show
 * up close, but Lumen-infected enemies glow through the ash.
 */
import { PlayerControlled, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';

export const STORM = {
  calm: [180, 300] as [number, number],
  warning: 5,
  active: [60, 90] as [number, number],
  /** Chance the storm hits Ash Valley rather than another subzone. */
  valleyChance: 0.7,
  /** How fast the player's exposure fades in and out (per second). */
  fade: 0.5,
  /** Extra fog density at full exposure. */
  fog: 0.05,
};

export interface StormState {
  state: 'calm' | 'warning' | 'active';
  timer: number;
  subzone: string | null;
  /** 0..1: how deep in the storm the player is (drives fog and glow). */
  exposure: number;
}

export function createStorm(): StormState {
  return { state: 'calm', timer: 120, subzone: null, exposure: 0 };
}

export function stormSystem(world: World, dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone) return;
  const s = zone.storm;
  s.timer -= dt;
  if (s.state === 'calm' && s.timer <= 0) {
    const stormy = zone.def.subzones.filter((z) => z.radius > 0);
    const valley = zone.def.subzones.find((z) => z.storms);
    const pick = valley && ctx.rng.chance(STORM.valleyChance) ? valley : ctx.rng.pick(stormy);
    s.subzone = pick.id;
    s.state = 'warning';
    s.timer = STORM.warning;
    ctx.events.push({ type: 'banner', key: 'storm.warning', keyParams: { where: `zones.${zone.def.key}.${pick.id}` }, seconds: 3 });
  } else if (s.state === 'warning' && s.timer <= 0) {
    s.state = 'active';
    s.timer = ctx.rng.range(STORM.active[0], STORM.active[1]);
  } else if (s.state === 'active' && s.timer <= 0) {
    s.state = 'calm';
    s.timer = ctx.rng.range(STORM.calm[0], STORM.calm[1]);
    ctx.events.push({ type: 'banner', key: 'storm.over', seconds: 2 });
  }
  // Exposure: inside the storm's subzone (never inside a dungeon).
  let inside = false;
  const player = world.first(PlayerControlled, Transform);
  if (player !== undefined && s.state === 'active' && !ctx.instance) {
    const tr = world.req(player, Transform);
    const sz = zone.def.subzones.find((z) => z.id === s.subzone);
    inside = !!sz && Math.hypot(tr.x - sz.center[0], tr.z - sz.center[1]) < sz.radius;
  }
  s.exposure = Math.max(0, Math.min(1, s.exposure + (inside ? 1 : -1) * STORM.fade * dt));
}
