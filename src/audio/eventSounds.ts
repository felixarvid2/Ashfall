/**
 * Which sounds a game event makes. Pure: the game feeds it each drained event and plays what comes
 * back. Loot, pickup and gold keep their synthesised sounds (`lootSounds.ts`), and notices and UI
 * actions are played where the UI handles them, so those events map to nothing here.
 */
import type { GameEvent, VfxKind } from '../core/events';
import type { SfxId } from './soundIds';

export interface SoundCue {
  id: SfxId;
  /** World position for attenuation and pan; absent = centred. */
  x?: number;
  z?: number;
}

/**
 * Every visual effect, deliberately: its sound, or null where the effect has none (the hit it
 * belongs to already makes a sound through its `damage` event, or it is only dressing).
 * `satisfies` makes a new VfxKind fail to compile until it is listed.
 */
export const VFX_SOUNDS = {
  slash: 'melee.swing',
  enemySlash: 'melee.swing',
  minionSlash: 'melee.swing',
  slam: 'melee.slam',
  leapLand: 'melee.slam',
  shockwave: 'melee.slam',
  muzzle: 'shot.light',
  // Impacts of bolts and shots: the damage event covers them.
  boltHit: null,
  shotHit: null,
  // Explosions pick their size from the radius (see `explosionSound`).
  explosion: 'explosion.small',
  bomblet: 'explosion.small',
  shield: 'cast.shield',
  dodge: 'cast.blink',
  blink: 'cast.blink',
  trapPlace: 'cast.trap',
  raise: 'cast.summon',
  flame: 'cast.flame',
  flare: 'cast.flame',
  // Vents and the orbital strike are heat/tech effects.
  vent: 'cast.flame',
  orbital: 'explosion.large',
  coolant: 'cast.tech',
  pull: 'cast.tech',
  mark: 'cast.tech',
  smoke: 'cast.tech',
  flash: 'explosion.small',
  heal: 'heal',
  // Lightbearer: the cast chimes like a heal; pulses of ground and guardian lights are silent.
  holy: 'heal',
  holyRing: null,
  sporePulse: 'cast.bio',
  corpseBurst: 'cast.bio',
  // Falling dust is dressing; the cave-in itself is a `slam`.
  dust: null,
} as const satisfies Record<VfxKind, SfxId | null>;

/** Explosions this wide are the big sound. */
const LARGE_EXPLOSION_RADIUS = 4;

function explosionSound(radius: number): SfxId {
  return radius >= LARGE_EXPLOSION_RADIUS ? 'explosion.large' : 'explosion.small';
}

/** Boss phase and intro banners; other banners (objectives, storms, events) stay silent. */
const BOSS_BANNER = /^bosses\..*\.(phase\d+|intro)$/;

export function soundsForEvent(event: GameEvent): SoundCue[] {
  switch (event.type) {
    case 'damage': {
      // Damage-over-time ticks would machine-gun; the status effect shows them instead.
      if (event.dot || (event.amount <= 0 && event.absorbed <= 0)) return [];
      const at = { x: event.x, z: event.z };
      if (event.toPlayer) return [{ id: 'hit.player', ...at }];
      const cues: SoundCue[] = [{ id: `hit.${event.damageType}`, ...at }];
      if (event.crit) cues.push({ id: 'hit.crit', ...at });
      return cues;
    }
    case 'miss':
      return [{ id: 'miss', x: event.x, z: event.z }];
    case 'death': {
      const at = { x: event.x, z: event.z };
      if (event.isPlayer) return [{ id: 'death.player', ...at }];
      // Only enemies carry a family; summons, turrets and props die silently.
      if (event.family === undefined) return [];
      return [{ id: event.family === 'machine' ? 'death.machine' : event.family === 'light' ? 'explosion.small' : 'death.organic', ...at }];
    }
    case 'vfx': {
      const sound = VFX_SOUNDS[event.kind];
      if (sound === null) return [];
      const id = event.kind === 'explosion' ? explosionSound(event.radius) : sound;
      return [{ id, x: event.x, z: event.z }];
    }
    case 'telegraph':
      return [{ id: 'telegraph', x: event.x, z: event.z }];
    case 'overheat':
      return [{ id: 'overheat' }];
    case 'levelUp':
      return [{ id: 'levelUp' }];
    case 'quest':
      switch (event.state) {
        case 'started':
          return [{ id: 'quest.start' }];
        case 'step':
          return [{ id: 'quest.step' }];
        case 'completed':
          return [{ id: 'quest.complete' }];
        case 'failed':
          return [{ id: 'ui.error' }];
        default:
          // 'progress' ticks on every kill of a counted step.
          return [];
      }
    case 'wave':
      return [{ id: 'wave.start' }];
    case 'waveCleared':
      return [{ id: 'wave.cleared' }];
    case 'banner':
      return BOSS_BANNER.test(event.key) ? [{ id: 'boss.banner' }] : [];
    case 'zoneGate':
      return [{ id: 'zoneGate' }];
    case 'discover':
      return [{ id: 'discover' }];
    case 'interact':
      return [{ id: 'interact' }];
    default:
      // heal (the heal vfx covers it), status, hitstop, shake, xp, loot, pickup, notice, hub.
      return [];
  }
}
