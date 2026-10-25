/**
 * The game's one AudioContext: buses (master → music / sfx / ui), the sound sprite, distance
 * attenuation and stereo pan from the fixed isometric camera, and voice limiting. Game code asks for
 * sounds by id (`soundIds.ts`); what a clip looks like comes from the generated catalog only.
 *
 * Browsers keep audio locked until a gesture, so nothing is created before the first
 * pointer/touch/key event. Without an AudioContext (node, vitest) every call is a no-op.
 * Audio files are fetched and decoded (no <audio> elements, no data: URLs: the claude.ai artifact
 * CSP blocks data: fetches); a missing file just means silence.
 */
import { SOUND_CATALOG } from './catalog.gen';
import type { SoundBus, SoundEntry, SoundId } from './soundIds';
import type { AudioSettings } from '../data/settings';

export type BusName = 'master' | SoundBus;

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, music: 0.5, sfx: 0.8, ui: 0.6, muted: false };

/** Gain of a bus node: the master node carries the mute, the others their slider. */
export function busVolume(a: AudioSettings, bus: BusName): number {
  if (bus === 'master') return a.muted ? 0 : a.master;
  return a[bus];
}

/** What a bus is worth at the speakers (master × bus, 0 when muted). */
export function effectiveVolume(a: AudioSettings, bus: SoundBus): number {
  return busVolume(a, 'master') * a[bus];
}

export function pickFormat(canPlay: (type: string) => string): 'ogg' | 'mp3' {
  return canPlay('audio/ogg; codecs="vorbis"') !== '' ? 'ogg' : 'mp3';
}

// ---- Positional sound -------------------------------------------------------------------------

/** Full volume inside NEAR metres, silent beyond FAR. */
const NEAR = 6;
const FAR = 42;
/** Distance to the side at which a sound sits fully in one ear (screen metres on the ground). */
const PAN_RANGE = 16;
const MAX_PAN = 0.85;
/** Quieter than this is not worth a voice. */
const AUDIBLE = 0.02;

export interface Listener {
  x: number;
  z: number;
  /** Camera yaw (radians): the camera sits at focus + (sin yaw, cos yaw) and looks at the focus. */
  yaw: number;
}

/** Gain and stereo pan (-1 left … 1 right) of a sound at (x, z) heard from `listener`. */
export function spatialMix(listener: Listener, x: number, z: number): { gain: number; pan: number } {
  const dx = x - listener.x;
  const dz = z - listener.z;
  const dist = Math.hypot(dx, dz);
  const k = dist <= NEAR ? 1 : Math.max(0, 1 - (dist - NEAR) / (FAR - NEAR));
  // Screen-right on the ground is (cos yaw, -sin yaw) for a camera at (sin yaw, cos yaw) looking inward.
  const right = dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw);
  const pan = Math.max(-MAX_PAN, Math.min(MAX_PAN, (right / PAN_RANGE) * MAX_PAN));
  return { gain: k * k, pan };
}

// ---- Voice management -------------------------------------------------------------------------

export interface VoiceRule {
  /** Simultaneous voices of one id. */
  max: number;
  /** Minimum seconds between two starts of one id. */
  interval: number;
}

const DEFAULT_RULE: VoiceRule = { max: 4, interval: 0.05 };
/** Hit sounds: a short cooldown and room for a volley of several (F024); they are capped at 0.4 s in the sprite. */
const HIT_RULE: VoiceRule = { max: 6, interval: 0.04 };
const RULES: Record<string, VoiceRule> = {
  footstep: { max: 2, interval: 0.12 },
  'hit.crit': { max: 2, interval: 0.08 },
  'melee.swing': { max: 3, interval: 0.06 },
  'swing.enemy': { max: 3, interval: 0.06 },
  'swing.minion': { max: 2, interval: 0.08 },
  // A sanctuary or guardian pulses about twice a second at most; one tick per 0.6 s keeps a crowd of lights quiet.
  'holy.pulse': { max: 1, interval: 0.6 },
  'cast.holy': { max: 2, interval: 0.15 },
  'melee.slam': { max: 2, interval: 0.1 },
  'explosion.small': { max: 3, interval: 0.07 },
  'explosion.large': { max: 2, interval: 0.12 },
  'telegraph.melee': { max: 3, interval: 0.15 },
  'telegraph.slam': { max: 3, interval: 0.15 },
  'telegraph.beam': { max: 2, interval: 0.4 },
  'telegraph.charge': { max: 2, interval: 0.3 },
  'telegraph.boss': { max: 1, interval: 0.5 },
  heal: { max: 2, interval: 0.2 },
  'death.organic': { max: 3, interval: 0.06 },
  'death.machine': { max: 3, interval: 0.06 },
  levelUp: { max: 1, interval: 1 },
  'boss.banner': { max: 1, interval: 1 },
  zoneGate: { max: 1, interval: 1 },
  'wave.start': { max: 1, interval: 1 },
  'wave.cleared': { max: 1, interval: 1 },
  'ui.hover': { max: 2, interval: 0.08 },
  'ui.click': { max: 3, interval: 0.04 },
};

export function ruleFor(id: string): VoiceRule {
  return RULES[id] ?? (id.startsWith('quest.') ? { max: 1, interval: 0.4 } : id.startsWith('hit.') ? HIT_RULE : DEFAULT_RULE);
}

/** Decides whether a sound may start: per-id voice cap, per-id retrigger interval and a global cap. */
export class VoiceLimiter {
  private voices: { id: string; end: number }[] = [];
  private lastStart = new Map<string, number>();

  constructor(
    readonly globalCap = 24,
    private readonly rule: (id: string) => VoiceRule = ruleFor,
  ) {}

  /** Try to start `id` at time `now` (seconds) for `duration` seconds. Returns false when it must be dropped. */
  tryStart(id: string, now: number, duration: number): boolean {
    this.prune(now);
    const rule = this.rule(id);
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < rule.interval) return false;
    if (this.voices.length >= this.globalCap) return false;
    if (this.voices.reduce((n, v) => n + (v.id === id ? 1 : 0), 0) >= rule.max) return false;
    this.voices.push({ id, end: now + Math.max(0.01, duration) });
    this.lastStart.set(id, now);
    return true;
  }

  /** Voices still sounding at `now`. */
  active(now: number): number {
    this.prune(now);
    return this.voices.length;
  }

  private prune(now: number): void {
    if (this.voices.some((v) => v.end <= now)) this.voices = this.voices.filter((v) => v.end > now);
  }
}

// ---- Engine -----------------------------------------------------------------------------------

export interface PlayOptions {
  /** Where the sound happens (metres); without it the sound is centred at full volume. */
  x?: number;
  z?: number;
  /** Extra linear gain (footsteps are quiet). */
  volume?: number;
  /** Playback rate on top of the sound's own (footsteps on another surface). */
  rate?: number;
  /** Low-pass cutoff in Hz: a duller version of the clip (footsteps in ash and mud). */
  lowpass?: number;
}

/** A looping sound (music, ambience) that fades in and out. */
export interface LoopHandle {
  readonly id: SoundId;
  /** Fade this loop's own level (0..1) over `seconds`. */
  setLevel(level: number, seconds: number): void;
  /** Fade out and release. */
  stop(seconds: number): void;
}

/** Random pitch spread of a repeated sound: 4 % either way, 6 % for hits (F024). */
const PITCH = 0.04;
const HIT_PITCH = 0.06;
const RECENT = 10;

/** While the game is paused the music and ambience drop 9 dB and lose their highs (F016). */
export const PAUSE_DUCK = 10 ** (-9 / 20);
export const PAUSE_CUTOFF = 900;
const OPEN_CUTOFF = 22000;
/** Seconds to come back from a pause. */
export const PAUSE_RESTORE = 0.25;

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'click'] as const;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private busNodes: Partial<Record<BusName, GainNode>> = {};
  private duckNode: GainNode | null = null;
  private ambienceNode: GainNode | null = null;
  private pauseStages: { filter: BiquadFilterNode; gain: GainNode }[] = [];
  private paused = false;
  private settings: AudioSettings = { ...DEFAULT_AUDIO };
  private readonly limiter = new VoiceLimiter();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly failed = new Set<string>();
  private readonly hooks: (() => void)[] = [];
  private readonly recent: string[] = [];
  private listener: Listener = { x: 0, z: 0, yaw: Math.PI / 4 };
  private ext: 'ogg' | 'mp3' | null = null;
  private installed = false;
  private unlocked = false;
  /** Set by the music controller, shown in the debug state. */
  nowPlaying: { music: string | null; ambience: string | null; layer: string | null } = { music: null, ambience: null, layer: null };
  /** The last one-shot started, for the debug state (the footsteps' `rate` differs by surface). */
  private last: { id: string; rate: number; volume: number } | null = null;

  /** Listen for the first gesture (capture, so touch controls that preventDefault cannot hide it). */
  install(): void {
    if (this.installed || typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
    this.installed = true;
    const unlock = () => this.unlock();
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => {});
      else if (this.unlocked) void this.ctx.resume().catch(() => {});
    });
  }

  /** Create the context on a user gesture (or resume it if the browser suspended it again). */
  unlock(): void {
    if (typeof AudioContext === 'undefined' || (typeof document !== 'undefined' && document.hidden)) return;
    if (!this.ctx) this.build();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    if (this.unlocked) return;
    this.unlocked = true;
    void this.load(SOUND_CATALOG['hit.physical']?.file ?? 'sfx');
    for (const hook of this.hooks) hook();
  }

  /** Run `cb` once audio is unlocked (immediately if it already is). */
  onUnlock(cb: () => void): void {
    if (this.unlocked) cb();
    else this.hooks.push(cb);
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Bus a synthesised sound should connect to (null before unlock). */
  get sfxBus(): AudioNode | null {
    return this.busNodes.sfx ?? null;
  }

  /** Bus the music and its layers play on (before the duck and pause stages). */
  get musicBus(): AudioNode | null {
    return this.busNodes.music ?? null;
  }

  /** Bus for ambience loops, under sfx at its own level. */
  get ambienceBus(): AudioNode | null {
    return this.ambienceNode;
  }

  private build(): void {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      // No Web Audio here (or blocked): the game plays silently.
      return;
    }
    this.ctx = ctx;
    const gain = (): GainNode => ctx.createGain();
    const master = gain();
    const music = gain();
    const sfx = gain();
    const ui = gain();
    const duck = gain();
    const amb = gain();
    amb.gain.value = AMBIENCE_LEVEL;
    // Music and ambience each pass a pause stage (low-pass + gain) that is wide open until the game pauses.
    const stage = (): { filter: BiquadFilterNode; gain: GainNode } => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = OPEN_CUTOFF;
      const g = gain();
      filter.connect(g);
      return { filter, gain: g };
    };
    const musicStage = stage();
    const ambStage = stage();
    music.connect(duck).connect(musicStage.filter);
    musicStage.gain.connect(master);
    amb.connect(ambStage.filter);
    ambStage.gain.connect(sfx);
    this.pauseStages = [musicStage, ambStage];
    sfx.connect(master);
    ui.connect(master);
    master.connect(ctx.destination);
    this.duckNode = duck;
    this.ambienceNode = amb;
    this.busNodes = { master, music, sfx, ui };
    this.refresh(true);
  }

  /** Use these settings (the live object from `Settings.audio`) and apply them to the buses. */
  bind(settings: AudioSettings): void {
    this.settings = settings;
    this.refresh(true);
  }

  /** Re-read the volumes (after a slider moved or mute toggled). */
  refresh(immediate = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const bus of ['master', 'music', 'sfx', 'ui'] as const) {
      const node = this.busNodes[bus];
      if (!node) continue;
      const v = busVolume(this.settings, bus);
      if (immediate) node.gain.setValueAtTime(v, now);
      else node.gain.setTargetAtTime(v, now, 0.03);
    }
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.refresh();
  }

  setListener(x: number, z: number, yaw: number): void {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  /** Pause or resume the music and ambience: -9 dB and a low-pass while paused, back over PAUSE_RESTORE seconds. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    const ctx = this.ctx;
    if (!ctx) return;
    // Going in is quick, coming out takes PAUSE_RESTORE.
    const seconds = paused ? 0.08 : PAUSE_RESTORE;
    for (const { filter, gain } of this.pauseStages) {
      gain.gain.setTargetAtTime(paused ? PAUSE_DUCK : 1, ctx.currentTime, seconds / 3);
      filter.frequency.setTargetAtTime(paused ? PAUSE_CUTOFF : OPEN_CUTOFF, ctx.currentTime, seconds / 3);
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Note a synthesised sound (the loot tones) in the debug trail, as the sprite sounds are. */
  record(id: string): void {
    this.recent.push(id);
    if (this.recent.length > RECENT) this.recent.shift();
  }

  /** Lower the music to `level` (0..1) over `seconds`; 1 restores it. */
  duckMusic(level: number, seconds: number): void {
    if (!this.ctx || !this.duckNode) return;
    this.duckNode.gain.setTargetAtTime(level, this.ctx.currentTime, Math.max(0.01, seconds / 3));
  }

  // ---- Files ----

  get format(): 'ogg' | 'mp3' {
    if (!this.ext) {
      let probe: (type: string) => string = () => '';
      if (typeof document !== 'undefined') {
        const el = document.createElement('audio');
        probe = (type) => el.canPlayType(type);
      }
      this.ext = pickFormat(probe);
    }
    return this.ext;
  }

  private url(file: string): string {
    return `${import.meta.env.BASE_URL}assets/audio/${file}.${this.format}`;
  }

  /** Fetch and decode a file once; failures are remembered and mean silence. */
  private load(file: string): Promise<void> {
    const ctx = this.ctx;
    const known = this.loading.get(file);
    if (known || !ctx) return known ?? Promise.resolve();
    const job = (async () => {
      try {
        const res = await fetch(this.url(file));
        if (!res.ok) throw new Error(String(res.status));
        this.buffers.set(file, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch (err) {
        console.warn(`[audio] ${file} failed to load`, err);
        this.failed.add(file);
      }
    })();
    this.loading.set(file, job);
    return job;
  }

  /** Files whose decoded audio is held right now (the sprite, music and ambience loops). */
  loadedBuffers(): string[] {
    return [...this.buffers.keys()];
  }

  /**
   * Let go of a decoded file that is no longer needed (T008): a loop already playing it keeps its own
   * reference until it ends, and asking for the file again fetches and decodes it afresh.
   */
  release(file: string): void {
    const inFlight = this.loading.get(file);
    if (inFlight && !this.buffers.has(file)) {
      void inFlight.then(() => this.release(file));
      return;
    }
    this.buffers.delete(file);
    this.loading.delete(file);
  }

  private bufferFor(entry: SoundEntry): AudioBuffer | null {
    const buf = this.buffers.get(entry.file);
    if (buf) return buf;
    void this.load(entry.file);
    return null;
  }

  // ---- Playback ----

  /** Play a one-shot (a random clip of the sound). Returns whether a voice started. */
  play(id: SoundId, opts: PlayOptions = {}): boolean {
    const ctx = this.ctx;
    const entry = SOUND_CATALOG[id];
    if (!ctx || !entry || entry.loop || ctx.state !== 'running') return false;
    const busNode = this.busNodes[entry.bus];
    if (!busNode || effectiveVolume(this.settings, entry.bus) <= 0) return false;
    let level = entry.gain * (opts.volume ?? 1);
    let pan = 0;
    if (opts.x !== undefined && opts.z !== undefined) {
      const mix = spatialMix(this.listener, opts.x, opts.z);
      if (mix.gain < AUDIBLE) return false;
      level *= mix.gain;
      pan = mix.pan;
    }
    const buffer = this.bufferFor(entry);
    if (!buffer || entry.clips.length === 0) return false;
    const clip = entry.clips[Math.floor(Math.random() * entry.clips.length)]!;
    const spread = id.startsWith('hit.') ? HIT_PITCH : PITCH;
    const rate = (entry.rate ?? 1) * (opts.rate ?? 1) * (entry.bus === 'sfx' ? 1 + (Math.random() * 2 - 1) * spread : 1);
    if (!this.limiter.tryStart(id, ctx.currentTime, clip.duration / rate)) return false;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(g);
    // Optional dulling filter, then the pan, then the bus.
    let tail: AudioNode = g;
    let filter: BiquadFilterNode | null = null;
    if (opts.lowpass !== undefined && typeof ctx.createBiquadFilter === 'function') {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = opts.lowpass;
      g.connect(filter);
      tail = filter;
    }
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail.connect(p).connect(busNode);
    } else {
      tail.connect(busNode);
    }
    src.start(0, clip.start, clip.duration);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      filter?.disconnect();
    };
    this.last = { id, rate, volume: level };
    this.record(id);
    return true;
  }

  /**
   * Start a looping file (music or ambience) at level 0 and fade it in. The file loads in the
   * background; stopping before it arrives cancels the start. Null while audio is locked.
   */
  startLoop(id: SoundId, fadeIn: number): LoopHandle | null {
    const ctx = this.ctx;
    const entry = SOUND_CATALOG[id];
    if (!ctx || !entry) return null;
    const dest = entry.bus === 'music' ? this.busNodes.music : this.ambienceNode;
    if (!dest) return null;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(dest);
    let src: AudioBufferSourceNode | null = null;
    let stopped = false;
    let level = 1;
    const ramp = (to: number, seconds: number) => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(to * entry.gain, now + Math.max(0.01, seconds));
    };
    void this.load(entry.file).then(() => {
      const buf = this.buffers.get(entry.file);
      if (stopped || !buf) return;
      const clip = entry.clips[0];
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      if (clip && clip.duration > 0) {
        src.loopStart = clip.start;
        src.loopEnd = clip.start + clip.duration;
      }
      src.connect(g);
      src.start(0, clip?.start ?? 0);
      ramp(level, fadeIn);
    });
    return {
      id,
      setLevel: (v, seconds) => {
        level = v;
        if (src && !stopped) ramp(v, seconds);
      },
      stop: (seconds) => {
        if (stopped) return;
        stopped = true;
        ramp(0, seconds);
        const s = src;
        setTimeout(() => {
          try {
            s?.stop();
          } catch {
            // Already stopped.
          }
          g.disconnect();
        }, seconds * 1000 + 120);
      },
    };
  }

  /** Snapshot for the debug API. */
  debugState(): {
    format: 'ogg' | 'mp3';
    context: string;
    spriteLoaded: boolean;
    failedFiles: string[];
    music: string | null;
    ambience: string | null;
    /** The combat layer over the music ('combat') or null. */
    layer: string | null;
    /** 1 normally, PAUSE_DUCK while the music and ambience are held down for a pause. */
    pauseLevel: number;
    voices: number;
    recent: string[];
    /** The last sprite sound started: its id, playback rate and level. */
    lastPlay: { id: string; rate: number; volume: number } | null;
    muted: boolean;
  } {
    const sprite = SOUND_CATALOG['hit.physical']?.file ?? 'sfx';
    return {
      format: this.format,
      context: this.ctx?.state ?? 'none',
      spriteLoaded: this.buffers.has(sprite),
      failedFiles: [...this.failed],
      music: this.nowPlaying.music,
      ambience: this.nowPlaying.ambience,
      layer: this.nowPlaying.layer,
      pauseLevel: this.paused ? PAUSE_DUCK : 1,
      voices: this.ctx ? this.limiter.active(this.ctx.currentTime) : 0,
      recent: [...this.recent],
      lastPlay: this.last ? { ...this.last } : null,
      muted: this.settings.muted,
    };
  }
}

/** Ambience sits under the sfx bus at this level. */
const AMBIENCE_LEVEL = 0.6;

/** The one engine of the game. */
export const audio = new AudioEngine();
