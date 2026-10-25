/**
 * Music and ambience controller. Each frame the game hands it an `AudioScene`; it picks the track
 * and ambience from `src/data/audio.ts`, crossfades when they change, ducks the music while the
 * player is dead and briefly under stings (level up, quest complete). Without audio it does nothing.
 */
import { MENU_SCENE, THREAT_HOLD, isThreatened, pickAmbience, pickMusic, type AudioScene } from '../data/audio';
import { SOUND_CATALOG } from './catalog.gen';
import { createCombatLayer, type CombatLayer } from './combatLayer';
import type { AudioEngine, LoopHandle } from './engine';
import type { SoundId } from './soundIds';
import { createWind, type Wind } from './wind';

/** Seconds of crossfade between tracks. */
export const CROSSFADE = 2;
/** A boss track cuts in quicker. */
const BOSS_FADE = 1.2;
const DEATH_DUCK = 0.25;
const STING_DUCK = 0.35;
const STING_SECONDS = 2.8;
/** The combat layer fades in over this long, and out over the same. */
export const LAYER_FADE = 1.5;
/** Decoded music tracks kept in memory: the current one, the one it replaced and the boss or hub track (T008). */
export const MUSIC_RESIDENT = 3;

/** Holds the combat layer on for THREAT_HOLD seconds after the danger has passed (F023). */
export class ThreatMeter {
  private calm = Infinity;
  private on = false;

  /** Advance by `dt`; returns whether the layer should be playing. */
  update(scene: AudioScene, dt: number): boolean {
    if (isThreatened(scene)) {
      this.calm = 0;
      this.on = true;
    } else if (this.on) {
      this.calm += dt;
      if (this.calm >= THREAT_HOLD || scene.phase !== 'play' || scene.playerDead || scene.bossEngaged || scene.inHub) this.on = false;
    }
    return this.on;
  }
}

export class MusicController {
  private scene: AudioScene = MENU_SCENE;
  private music: LoopHandle | null = null;
  private ambience: LoopHandle | null = null;
  private wind: Wind | null = null;
  private windOn = false;
  private ambienceKey: string | null = null;
  /** Files of the music tracks that are decoded, least recently used first. */
  private readonly residentMusic: string[] = [];
  private stingLeft = 0;
  private lastDuck = 1;
  private lastStorm = -1;
  private readonly threat = new ThreatMeter();
  private layer: CombatLayer | null = null;
  private layerOn = false;
  private paused = false;

  constructor(private readonly engine: AudioEngine) {
    engine.onUnlock(() => this.reconcile());
  }

  /** The scene for this frame; cheap when nothing changed. */
  update(scene: AudioScene, dt: number): void {
    const changed = scene.phase !== this.scene.phase || scene.zoneId !== this.scene.zoneId || scene.inHub !== this.scene.inHub || scene.bossEngaged !== this.scene.bossEngaged;
    this.scene = scene;
    if (changed) this.reconcile();
    // The storm builds over seconds: retarget the wind only when it has moved noticeably.
    if (this.wind && this.windOn && Math.abs(scene.storm - this.lastStorm) > 0.03) {
      this.lastStorm = scene.storm;
      this.wind.setIntensity(scene.storm, 1.5);
    }
    this.updateLayer(this.threat.update(scene, dt));
    if (this.stingLeft > 0) this.stingLeft = Math.max(0, this.stingLeft - dt);
    const duck = Math.min(scene.playerDead ? DEATH_DUCK : 1, this.stingLeft > 0 ? STING_DUCK : 1);
    if (duck !== this.lastDuck) {
      this.lastDuck = duck;
      this.engine.duckMusic(duck, duck < 1 ? 0.25 : 1.2);
    }
  }

  private updateLayer(want: boolean): void {
    if (want === this.layerOn) return;
    const ctx = this.engine.context;
    const bus = this.engine.musicBus;
    if (!ctx || !bus) return;
    this.layerOn = want;
    if (want && !this.layer) this.layer = createCombatLayer(ctx, bus);
    this.layer?.setLevel(want ? 1 : 0, LAYER_FADE);
    this.engine.nowPlaying.layer = want ? 'combat' : null;
  }

  /** The game is paused (the Escape menu): music and ambience drop and dull, the wind holds its breath. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.engine.setPaused(paused);
    this.wind?.setPaused(paused, 0.25);
  }

  /** Lower the music for a moment under a short fanfare. */
  sting(): void {
    this.stingLeft = STING_SECONDS;
  }

  /** Start, swap or stop the loops to match the current scene. */
  reconcile(): void {
    if (!this.engine.context) return;
    const scene = this.scene;
    const want = pickMusic(scene);
    if (this.music?.id !== want) {
      const fade = scene.bossEngaged ? BOSS_FADE : CROSSFADE;
      this.music?.stop(fade);
      this.music = this.engine.startLoop(want, fade);
      this.music?.setLevel(1, fade);
      this.engine.nowPlaying.music = this.music ? want : null;
      this.trimMusic(SOUND_CATALOG[want].file, scene.phase === 'play');
    }
    this.setAmbience(pickAmbience(scene));
  }

  /** Keep the newest few tracks decoded and release the rest; the menu track goes as soon as play starts. */
  private trimMusic(file: string, playing: boolean): void {
    const at = this.residentMusic.indexOf(file);
    if (at >= 0) this.residentMusic.splice(at, 1);
    this.residentMusic.push(file);
    const menu = SOUND_CATALOG['music.menu'].file;
    if (playing && file !== menu) {
      const i = this.residentMusic.indexOf(menu);
      if (i >= 0) this.residentMusic.splice(i, 1);
      this.engine.release(menu);
    }
    while (this.residentMusic.length > MUSIC_RESIDENT) this.engine.release(this.residentMusic.shift()!);
  }

  private setAmbience(want: ReturnType<typeof pickAmbience>): void {
    if (this.ambienceKey === want) return;
    // The ambience being faded out is released once the crossfade has ended (unless it came back).
    const old = this.ambienceKey && this.ambienceKey !== 'wind' ? SOUND_CATALOG[this.ambienceKey as SoundId]?.file : undefined;
    if (old) {
      setTimeout(() => {
        const now = this.ambienceKey && this.ambienceKey !== 'wind' ? SOUND_CATALOG[this.ambienceKey as SoundId]?.file : undefined;
        if (now !== old) this.engine.release(old);
      }, CROSSFADE * 1000 + 250);
    }
    this.ambienceKey = want;
    this.ambience?.stop(CROSSFADE);
    this.ambience = null;
    this.stopWind();
    this.engine.nowPlaying.ambience = want;
    if (want === 'wind') {
      const ctx = this.engine.context;
      const bus = this.engine.ambienceBus;
      if (ctx && bus) {
        this.wind = createWind(ctx, bus, CROSSFADE);
        if (this.paused) this.wind.setPaused(true, 0.01);
        this.windOn = true;
        this.lastStorm = this.scene.storm;
        this.wind.setIntensity(this.scene.storm, 0.1);
      }
    } else if (want) {
      this.ambience = this.engine.startLoop(want as SoundId, CROSSFADE);
      this.ambience?.setLevel(1, CROSSFADE);
    }
  }

  private stopWind(): void {
    this.windOn = false;
    this.wind?.stop(CROSSFADE);
    this.wind = null;
  }
}
