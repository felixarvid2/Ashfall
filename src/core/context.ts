/** Shared per-game context handed to every system. */
import type { Rarity } from '../data/loot/schemas';
import type { ZoneRuntime } from '../world/zone';
import type { Action, Settings } from '../data/settings';
import type { EventQueue } from './events';
import type { Rng } from './rng';
import type { SpatialHash } from './spatial';

/** The slice of Input that systems use — lets tests pass a fake. */
/** On-screen touch controls (phones and tablets). */
export interface TouchState {
  /** Joystick deflection in screen space (x right, y up), length 0–1; null when released. */
  stick: { x: number; y: number } | null;
  /** The attack button is held. */
  attack: boolean;
}

export interface InputState {
  isDown(action: Action): boolean;
  wasPressed(action: Action): boolean;
  isMouseDown(button?: number): boolean;
  wasMousePressed(button?: number): boolean;
  /** Present while the touch controls are shown. */
  touch?: TouchState | null;
}

export interface GameContext {
  input: InputState;
  settings: Settings;
  rng: Rng;
  /** Number of fixed ticks simulated so far. */
  tick: number;
  /** Simulated seconds since start. */
  time: number;
  /** Camera yaw (radians) so WASD moves relative to the screen. */
  cameraYaw: number;
  /** Half-size of the walkable square, in metres. */
  worldHalfSize: number;
  /** Ground point under the cursor, provided by the render layer. */
  pickGround(): { x: number; z: number } | null;
  events: EventQueue;
  /** Moving colliders, rebuilt each tick by the spatial system. */
  spatial: SpatialHash;
  debug: { godMode: boolean };
  stats: { kills: number };
  /** Loot randomness lives in its own stream so combat rolls don't reshuffle drops. */
  loot: { rng: Rng; seq: number };
  /** Rewards to hand out this tick (kills, wave caches); consumed by the reward system. */
  rewards: RewardRequest[];
  /** Monster level range of the current zone. */
  zoneLevels: [number, number];
  /** Open-world zone state (absent in the test arena and headless sims). */
  zone?: ZoneRuntime;
  /** Every zone this character has visited, by id (the current one included). */
  zones?: Map<string, ZoneRuntime>;
  /** The dungeon or bunker the player is in, if any. */
  instance?: import('../world/instance').InstanceRuntime;
  /** Quest log and the signals systems send it (kills, interactions, objectives). */
  quests?: import('../systems/quests').QuestRuntime;
  /** Account-wide progress (Echo Relics, Restoration); absent in headless sims. */
  account?: import('./account').AccountData;
}

export interface RewardRequest {
  table: string;
  level: number;
  x: number;
  z: number;
  /** Grant XP (kills) or only loot (caches). */
  xp: boolean;
  /** Also drop one guaranteed item of this rarity (debug, boss chests). */
  rarity?: Rarity;
  /** Also drop this specific unique (quest choices). */
  unique?: string;
}
