/**
 * Events emitted by game logic for presentation (VFX, damage numbers, camera
 * shake, HUD). Logic never waits on them; the renderer/UI drain the queue
 * once per frame.
 */
import type { Entity } from './ecs';
import type { DamageType, StatusId } from '../data/schemas';
import type { Rarity } from '../data/loot/schemas';

export type TelegraphShape =
  | { kind: 'circle'; radius: number }
  | { kind: 'cone'; radius: number; arcDeg: number; facing: number }
  | { kind: 'line'; length: number; width: number; facing: number };

export type VfxKind =
  | 'slash'
  | 'shockwave'
  | 'leapLand'
  | 'shield'
  | 'dodge'
  | 'enemySlash'
  | 'sporePulse'
  | 'boltHit'
  | 'heal'
  | 'pull'
  | 'vent'
  | 'orbital'
  | 'coolant'
  | 'muzzle'
  | 'shotHit'
  | 'explosion'
  | 'bomblet'
  | 'trapPlace'
  | 'blink'
  | 'smoke'
  | 'mark'
  | 'raise'
  | 'minionSlash'
  | 'slam'
  | 'corpseBurst'
  | 'flame';

export type GameEvent =
  | {
      type: 'damage';
      target: Entity;
      x: number;
      y: number;
      z: number;
      amount: number;
      absorbed: number;
      crit: boolean;
      damageType: DamageType;
      toPlayer: boolean;
      dot: boolean;
    }
  | { type: 'heal'; target: Entity; x: number; y: number; z: number; amount: number }
  | { type: 'status'; target: Entity; status: StatusId }
  | { type: 'death'; target: Entity; x: number; z: number; isPlayer: boolean }
  | { type: 'hitstop'; ms: number }
  | { type: 'shake'; trauma: number }
  | { type: 'telegraph'; owner: Entity | null; x: number; z: number; shape: TelegraphShape; duration: number; color: string }
  | { type: 'vfx'; kind: VfxKind; x: number; z: number; radius: number; facing: number; arcDeg?: number }
  | { type: 'wave'; wave: number; enemies: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'overheat' }
  | { type: 'levelUp'; level: number }
  | { type: 'xp'; amount: number }
  | { type: 'loot'; entity: Entity; rarity: Rarity; x: number; z: number }
  | { type: 'pickup'; kind: 'gold'; amount: number }
  | { type: 'pickup'; kind: 'item'; rarity: Rarity; name: string }
  | { type: 'notice'; key: string }
  | { type: 'discover'; id: string }
  | { type: 'hub'; id: string; entered: boolean }
  /** The player walked into a border crossing. */
  | { type: 'zoneGate'; gate: string }
  /** The player used a point of interest (UI shows toasts, the lore reader, buff banners). */
  | { type: 'interact'; kind: string; id: string; detail?: string }
  | { type: 'quest'; id: string; state: 'started' | 'progress' | 'step' | 'completed' | 'failed' }
  /** Big centred message from game logic (boss phases, instance objectives). */
  | { type: 'banner'; key: string; params?: Record<string, string | number>; /** Params that are themselves language keys. */ keyParams?: Record<string, string>; seconds?: number };

export class EventQueue {
  private events: GameEvent[] = [];

  push(event: GameEvent): void {
    this.events.push(event);
  }

  /** Take all pending events, leaving the queue empty. */
  drain(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Read without draining (tests). */
  peek(): readonly GameEvent[] {
    return this.events;
  }
}
