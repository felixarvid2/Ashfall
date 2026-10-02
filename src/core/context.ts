/** Shared per-game context handed to every system. */
import type { Action, Settings } from '../data/settings';
import type { Rng } from './rng';

/** The slice of Input that systems use — lets tests pass a fake. */
export interface InputState {
  isDown(action: Action): boolean;
  wasPressed(action: Action): boolean;
  isMouseDown(button?: number): boolean;
  wasMousePressed(button?: number): boolean;
}

export interface GameContext {
  input: InputState;
  settings: Settings;
  rng: Rng;
  /** Number of fixed ticks simulated so far. */
  tick: number;
  /** Camera yaw (radians) so WASD moves relative to the screen. */
  cameraYaw: number;
  /** Half-size of the walkable square, in metres. */
  worldHalfSize: number;
  /** Ground point under the cursor, provided by the render layer. */
  pickGround(): { x: number; z: number } | null;
}
