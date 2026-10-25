/**
 * Which music and ambience plays where. Sound ids come from `src/audio/soundIds.ts`; the music
 * controller (`src/audio/music.ts`) reads this table and never names a zone itself.
 */
import type { AmbienceId, MusicId } from '../audio/soundIds';

export interface ZoneAudio {
  /** Exploration track. */
  music: MusicId;
  /** Track while a boss is engaged. */
  boss: MusicId;
  /** Looping ambience file, or 'wind' for the procedural Cinder Flats wind (stronger in an Ash Storm). */
  ambience: AmbienceId | 'wind' | null;
}

/** Zones without an entry (the test arena, anything new) use this: Cinder Flats music, no ambience. */
export const DEFAULT_ZONE_AUDIO: ZoneAudio = { music: 'music.cinder_flats', boss: 'music.boss', ambience: null };

export const ZONE_AUDIO: Record<string, ZoneAudio> = {
  'zone.cinder_flats': { music: 'music.cinder_flats', boss: 'music.boss', ambience: 'wind' },
  'zone.refinery_district': { music: 'music.refinery_district', boss: 'music.boss', ambience: 'amb.industrial' },
  'zone.hydroponic_vaults': { music: 'music.hydroponic_vaults', boss: 'music.boss', ambience: 'amb.hum' },
  'zone.deep_mines': { music: 'music.deep_mines', boss: 'music.boss_mines', ambience: 'amb.mine' },
  // The Core has its own drone-and-choir track and boss theme (synthesised by scripts/audio/synth.ts).
  'zone.the_core': { music: 'music.the_core', boss: 'music.boss_core', ambience: 'amb.hum' },
};

/** Music in every hub (settlements are safe: the same calm theme in all regions). */
export const HUB_MUSIC: MusicId = 'music.hub';
/** Title and character select. */
export const MENU_MUSIC: MusicId = 'music.menu';

export function zoneAudio(zoneId: string): ZoneAudio {
  return ZONE_AUDIO[zoneId] ?? DEFAULT_ZONE_AUDIO;
}

/** What the music controller needs to know about the game each frame. */
export interface AudioScene {
  /** 'menu' until the first character is played. */
  phase: 'menu' | 'play';
  zoneId: string;
  /** Standing in a hub of the open world (ignored inside dungeons). */
  inHub: boolean;
  /** A boss is engaged and alive. */
  bossEngaged: boolean;
  playerDead: boolean;
  /** Ash Storm exposure 0..1. */
  storm: number;
  /** Enemies hunting the player nearby (aggroed and within earshot). */
  aggroCount: number;
  /** The player's life, 0..1. */
  healthFraction: number;
}

export const MENU_SCENE: AudioScene = { phase: 'menu', zoneId: '', inHub: false, bossEngaged: false, playerDead: false, storm: 0, aggroCount: 0, healthFraction: 1 };

/** The combat layer comes in at this many hunting enemies, or when life falls below the fraction. */
export const THREAT_ENEMIES = 3;
export const THREAT_HEALTH = 0.3;
/** Seconds the layer stays after the danger has gone. */
export const THREAT_HOLD = 6;

/** Is the situation dangerous enough for the combat layer? Not in menus, hubs, boss fights (they have their own track) or when dead. */
export function isThreatened(scene: AudioScene): boolean {
  if (scene.phase !== 'play' || scene.inHub || scene.bossEngaged || scene.playerDead) return false;
  return scene.aggroCount >= THREAT_ENEMIES || scene.healthFraction < THREAT_HEALTH;
}

/** What the ground sounds like underfoot. */
export type Surface = 'stone' | 'ash' | 'metal' | 'wet' | 'crystal';

/** The ground of each zone (anything not listed is stone). */
export const ZONE_SURFACE: Record<string, Surface> = {
  'zone.cinder_flats': 'ash',
  'zone.refinery_district': 'metal',
  'zone.hydroponic_vaults': 'wet',
  'zone.deep_mines': 'stone',
  'zone.the_core': 'crystal',
};

export function surfaceOf(zoneId: string): Surface {
  return ZONE_SURFACE[zoneId] ?? 'stone';
}

/** The music track a scene calls for. */
export function pickMusic(scene: AudioScene): MusicId {
  if (scene.phase === 'menu') return MENU_MUSIC;
  const zone = zoneAudio(scene.zoneId);
  if (scene.bossEngaged) return zone.boss;
  return scene.inHub ? HUB_MUSIC : zone.music;
}

/** The ambience a scene calls for (none in menus). */
export function pickAmbience(scene: AudioScene): ZoneAudio['ambience'] {
  return scene.phase === 'menu' ? null : zoneAudio(scene.zoneId).ambience;
}
