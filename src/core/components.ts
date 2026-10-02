/** Core component definitions. Components are plain data — no methods, no Three.js objects. */
import { defineComponent } from './ecs';

/** World-space position (metres, y up) and facing (radians around y, 0 = +z). */
export interface Transform {
  x: number;
  y: number;
  z: number;
  facing: number;
  /** Previous tick's values, used by the renderer to interpolate. */
  prevX: number;
  prevY: number;
  prevZ: number;
  prevFacing: number;
}
export const Transform = defineComponent<Transform>('Transform');

export function makeTransform(x = 0, y = 0, z = 0, facing = 0): Transform {
  return { x, y, z, facing, prevX: x, prevY: y, prevZ: z, prevFacing: facing };
}

/** Can move on the ground plane. `vx/vz` is the desired velocity this tick (m/s). */
export interface Mover {
  speed: number;
  /** How fast the entity turns to face its movement (radians/s). */
  turnRate: number;
  vx: number;
  vz: number;
}
export const Mover = defineComponent<Mover>('Mover');

/** Tag: driven by player input. */
export type PlayerControlled = Record<string, never>;
export const PlayerControlled = defineComponent<PlayerControlled>('PlayerControlled');

/** Walk toward a ground point (click-to-move). Removed on arrival. */
export interface MoveTarget {
  x: number;
  z: number;
}
export const MoveTarget = defineComponent<MoveTarget>('MoveTarget');

/** Drawn by the render layer using the asset (or its placeholder) from the manifest. */
export interface Renderable {
  assetId: string;
  /** Uniform scale applied to the model (default 1). */
  scale?: number;
}
export const Renderable = defineComponent<Renderable>('Renderable');
