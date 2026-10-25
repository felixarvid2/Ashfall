/**
 * Which sounds a game event makes. Pure: the game feeds it each drained event and plays what comes
 * back. Loot, pickup and gold keep their synthesised sounds (`lootSounds.ts`), and notices and UI
 * actions are played where the UI handles them, so those events map to nothing here.
 */
import type { GameEvent, TelegraphCue, TelegraphShape, VfxKind } from '../core/events';
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
  // Enemy and minion swings are other, lower clips than the player's, so they are told apart (F002).
  enemySlash: 'swing.enemy',
  minionSlash: 'swing.minion',
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
  // Lightbearer: a bell and shimmer for the cast, a soft tick (rate-limited in the engine) for each pulse of
  // a sanctuary or a guardian light, and a glassy `hit.holy` for the blows landing with them (see soundsForEvents).
  holy: 'cast.holy',
  holyRing: 'holy.pulse',
  sporePulse: 'cast.bio',
  // Only the Corpse Explosion skill sounds; an enemy's burst dies with its own death sound (see `soundsForEvent`).
  corpseBurst: 'cast.bio',
  // Falling dust is dressing; the cave-in itself is a `slam`.
  dust: null,
} as const satisfies Record<VfxKind, SfxId | null>;

/** Explosions this wide are the big sound. */
const LARGE_EXPLOSION_RADIUS = 4;

function explosionSound(radius: number): SfxId {
  return radius >= LARGE_EXPLOSION_RADIUS ? 'explosion.large' : 'explosion.small';
}

/** The warning sound for a telegraph: by what is coming (cone: a swing, circle: a slam or blast, line: a beam). */
export function telegraphSound(shape: TelegraphShape, cue?: TelegraphCue): SfxId {
  if (cue === 'boss') return 'telegraph.boss';
  if (cue === 'charge') return 'telegraph.charge';
  switch (shape.kind) {
    case 'cone':
      return 'telegraph.melee';
    case 'line':
      return 'telegraph.beam';
    default:
      return 'telegraph.slam';
  }
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
      // An enemy's corpse burst is followed by its death sound: two bursts at once would read as a skill cast.
      if (event.kind === 'corpseBurst' && event.source !== 'skill') return [];
      const id = event.kind === 'explosion' ? explosionSound(event.radius) : sound;
      return [{ id, x: event.x, z: event.z }];
    }
    case 'telegraph':
      return [{ id: telegraphSound(event.shape, event.cue), x: event.x, z: event.z }];
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

/** A blow this close to a holy pulse or cast is Lightbearer's (metres beyond the effect's radius). */
const HOLY_REACH = 1.5;

/**
 * The sounds of a whole frame of events. Same as `soundsForEvent` for each, with two things only the whole
 * batch can tell:
 *  - energy blows that land inside a holy cast or pulse of the same frame are `hit.holy` (Lightbearer's
 *    impacts are all energy, so they would otherwise share the one zap with every other energy skill);
 *  - an enemy that dies this frame does not also play the hit sound of the blow that killed it (a
 *    critical blow keeps its `hit.crit`): the death sound is the only kill sound.
 */
export function soundsForEvents(events: readonly GameEvent[]): SoundCue[] {
  const dying = new Set<unknown>();
  const holy: { x: number; z: number; r: number }[] = [];
  for (const e of events) {
    if (e.type === 'death' && !e.isPlayer && e.family !== undefined) dying.add(e.target);
    else if (e.type === 'vfx' && (e.kind === 'holy' || e.kind === 'holyRing')) holy.push({ x: e.x, z: e.z, r: e.radius + HOLY_REACH });
  }
  const cues: SoundCue[] = [];
  for (const e of events) {
    if (e.type !== 'damage' || e.toPlayer) {
      cues.push(...soundsForEvent(e));
      continue;
    }
    const own = soundsForEvent(e);
    const killing = dying.has(e.target);
    const isHoly = e.damageType === 'energy' && holy.some((h) => Math.hypot(e.x - h.x, e.z - h.z) <= h.r);
    for (const cue of own) {
      if (cue.id === 'hit.crit') cues.push(cue);
      else if (!killing) cues.push(isHoly ? { ...cue, id: 'hit.holy' } : cue);
    }
  }
  return cues;
}
