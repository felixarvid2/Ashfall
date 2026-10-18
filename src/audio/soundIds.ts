/**
 * Every sound the game can play, by id. `scripts/audio/build.ts` generates `catalog.gen.ts` with one
 * entry per id (a test checks that the two match); game code refers to sounds only through these ids.
 */
export const SFX_IDS = [
  // Combat: hits by damage type, crits, the player being hit, misses.
  'hit.physical',
  'hit.heat',
  'hit.cold',
  'hit.toxic',
  'hit.energy',
  'hit.void',
  'hit.crit',
  'hit.player',
  'miss',
  // Deaths.
  'death.organic',
  'death.machine',
  'death.player',
  // Attacks and casts (mostly keyed from `vfx` events).
  'shot.light',
  'shot.heavy',
  'shot.enemy',
  'melee.swing',
  'melee.slam',
  'explosion.small',
  'explosion.large',
  'cast.tech',
  'cast.bio',
  'cast.shield',
  'cast.blink',
  'cast.summon',
  'cast.trap',
  'cast.flame',
  'heal',
  'overheat',
  'telegraph',
  'footstep',
  // Progress and world.
  'levelUp',
  'quest.start',
  'quest.step',
  'quest.complete',
  'discover',
  'wave.start',
  'wave.cleared',
  'boss.banner',
  'zoneGate',
  'interact',
  // Interface.
  'ui.click',
  'ui.hover',
  'ui.open',
  'ui.close',
  'ui.error',
  'ui.equip',
  'ui.coins',
] as const;

export const AMBIENCE_IDS = ['amb.industrial', 'amb.hum', 'amb.mine'] as const;

export const MUSIC_IDS = [
  'music.menu',
  'music.hub',
  'music.cinder_flats',
  'music.refinery_district',
  'music.hydroponic_vaults',
  'music.deep_mines',
  'music.boss',
  'music.boss_mines',
] as const;

export type SfxId = (typeof SFX_IDS)[number];
export type AmbienceId = (typeof AMBIENCE_IDS)[number];
export type MusicId = (typeof MUSIC_IDS)[number];
export type SoundId = SfxId | AmbienceId | MusicId;

export type SoundBus = 'music' | 'sfx' | 'ui';

/**
 * One generated catalog entry. SFX live in a shared sprite (`file` is the same for all of them and
 * each clip's `start`/`duration` in seconds locate it); ambience and music are one looping file each
 * with a single clip covering the true loop length. A sound with several clips plays a random one
 * (variation for hits, footsteps and so on). `file` is relative to `public/assets/audio/` and has no
 * extension: the engine appends `.ogg` or `.mp3`, whichever the browser can decode.
 */
export interface SoundEntry {
  id: SoundId;
  file: string;
  clips: { start: number; duration: number }[];
  loop: boolean;
  bus: SoundBus;
  /** Linear gain applied on top of the bus (after the pipeline's loudness normalisation). */
  gain: number;
}
