/**
 * Loot magnet (F020): gold and crystals (the crafting materials that drop on the ground) within `MAGNET_RADIUS` metres of
 * the hero fly to them. Gear never moves: it is picked up by clicking, walking over it or the pickup key, as before.
 * No setting; crystals only fly while the backpack has room, so nothing hovers at the hero's feet with no way in.
 */
import { GroundGold, GroundItem, Transform } from '../../core/components';
import type { Entity, World } from '../../core/ecs';

export const MAGNET_RADIUS = 2.5;
/** Ground loot must have lain this long (the pop-out arc) before it is pulled. */
export const MAGNET_MIN_AGE = 0.4;
/** Distance at which a flying pile or crystal counts as arrived. */
export const MAGNET_ARRIVE = 0.6;
/** Metres per second at take-off, and how much faster it gets every second in flight. */
export const MAGNET_SPEED = 8;
export const MAGNET_ACCEL = 28;
/** A flyer this far away (the hero teleported) gives up. */
export const MAGNET_LOSE = 6;

/** Where a flyer `dist` metres from the hero ends up after `dt` seconds of flight `flown` seconds in: the distance left. */
export function magnetStep(dist: number, flown: number, dt: number): number {
  const step = (MAGNET_SPEED + MAGNET_ACCEL * flown) * dt;
  return Math.max(0, dist - step);
}

/** Moves one piece of ground loot toward (px, pz). Returns true once it has arrived. */
function fly(tr: { x: number; z: number }, state: { magnet?: number }, px: number, pz: number, dt: number): boolean {
  const dx = px - tr.x;
  const dz = pz - tr.z;
  const dist = Math.hypot(dx, dz);
  const flown = state.magnet ?? 0;
  state.magnet = flown + dt;
  if (dist <= MAGNET_ARRIVE) return true;
  const left = magnetStep(dist, flown, dt);
  const k = left / dist;
  tr.x = px - dx * k;
  tr.z = pz - dz * k;
  return left <= MAGNET_ARRIVE;
}

/**
 * Pull the nearby gold and crystals one step. Returns the crystals that have arrived (the caller picks them up);
 * gold is picked up by the caller once its `magnet` is set and it is within `MAGNET_ARRIVE`.
 * `room` is false when the backpack is full: crystals then stay where they are.
 */
export function magnetPull(world: World, dt: number, px: number, pz: number, room: boolean): Entity[] {
  const arrived: Entity[] = [];
  for (const e of world.query(GroundGold, Transform)) {
    const g = world.req(e, GroundGold);
    const tr = world.req(e, Transform);
    const dist = Math.hypot(tr.x - px, tr.z - pz);
    if (g.magnet === undefined && (g.age < MAGNET_MIN_AGE || dist > MAGNET_RADIUS)) continue;
    if (dist > MAGNET_LOSE) {
      delete g.magnet;
      continue;
    }
    fly(tr, g, px, pz, dt);
  }
  for (const e of world.query(GroundItem, Transform)) {
    const g = world.req(e, GroundItem);
    if (!g.item.crystal) continue;
    const tr = world.req(e, Transform);
    const dist = Math.hypot(tr.x - px, tr.z - pz);
    if (g.magnet === undefined && (!room || g.age < MAGNET_MIN_AGE || dist > MAGNET_RADIUS)) continue;
    if (dist > MAGNET_LOSE || !room) {
      delete g.magnet;
      continue;
    }
    if (fly(tr, g, px, pz, dt)) arrived.push(e);
  }
  return arrived;
}
