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

/** The gamepad as player control sees it (null unless the pad was used last): sticks have +y up and a dead zone. */
export interface PadState {
  stick: { x: number; y: number } | null;
  aim: { x: number; y: number } | null;
  /** Basic attack held (the left-mouse slot) and the second skill held (the right-mouse slot). */
  attack: boolean;
  alt: boolean;
}

export interface InputState {
  isDown(action: Action): boolean;
  wasPressed(action: Action): boolean;
  isMouseDown(button?: number): boolean;
  wasMousePressed(button?: number): boolean;
  /** Present while the touch controls are shown. */
  touch?: TouchState | null;
  /** Present while the gamepad was the last device used and no menu owns it (round 3, A01). */
  pad?: PadState | null;
}

export interface GameContext {
  /** Enemy wayfinding: the grid round the player and a flow field per hunted target (navigation system). */
  nav?: import('../systems/navigation').NavService | undefined;
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
  /** Colliders: static ones (props) indexed once and patched, moving ones rebuilt each tick by the spatial system. */
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
  /** This character's endgame progress (Neural Matrix, glyphs, shards, recipes, materials; docs/endgame.md). */
  endgame?: import('./save').SaveData['endgame'];
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
  /** How many guaranteed items of `rarity` (default 1), and their fixed item power (default: by `level`). */
  count?: number;
  itemPower?: number;
  /** Also drop this specific unique (quest choices). */
  unique?: string;
}
