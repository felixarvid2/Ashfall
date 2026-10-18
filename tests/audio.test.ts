import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOUND_CATALOG } from '../src/audio/catalog.gen';
import { AudioEngine, DEFAULT_AUDIO, VoiceLimiter, busVolume, effectiveVolume, pickFormat, ruleFor, spatialMix } from '../src/audio/engine';
import { VFX_SOUNDS, soundsForEvent } from '../src/audio/eventSounds';
import { FootstepClock, STEP_INTERVAL } from '../src/audio/footsteps';
import { SFX_IDS, type SoundId } from '../src/audio/soundIds';
import type { GameEvent, VfxKind } from '../src/core/events';
import { MENU_SCENE, pickAmbience, pickMusic, zoneAudio, type AudioScene } from '../src/data/audio';
import { DAMAGE_TYPES } from '../src/data/schemas';
import { AudioSettingsSchema, SettingsSchema, defaultSettings, loadSettings, migrateSettings, resolveKeybindings } from '../src/data/settings';

const damage = (over: Partial<Extract<GameEvent, { type: 'damage' }>> = {}): GameEvent => ({
  type: 'damage',
  target: 1 as never,
  x: 3,
  y: 1,
  z: 4,
  amount: 10,
  absorbed: 0,
  crit: false,
  damageType: 'physical',
  toPlayer: false,
  dot: false,
  ...over,
});

describe('event sounds', () => {
  it('lists every VfxKind deliberately', () => {
    const src = readFileSync('src/core/events.ts', 'utf8');
    const block = /export type VfxKind =([\s\S]*?);/.exec(src)![1]!;
    const kinds = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1]!);
    expect(kinds.length).toBeGreaterThan(20);
    expect(Object.keys(VFX_SOUNDS).sort()).toEqual([...kinds].sort());
  });

  it('maps each effect to a catalogued sound, or to nothing on purpose', () => {
    for (const kind of Object.keys(VFX_SOUNDS) as VfxKind[]) {
      const cues = soundsForEvent({ type: 'vfx', kind, x: 1, z: 2, radius: 1, facing: 0 });
      const mapped = VFX_SOUNDS[kind];
      if (mapped === null) expect(cues).toEqual([]);
      else {
        expect(cues).toHaveLength(1);
        expect(cues[0]).toMatchObject({ x: 1, z: 2 });
        expect(SOUND_CATALOG[cues[0]!.id]).toBeDefined();
      }
    }
    // Impacts are the damage event's job.
    expect(VFX_SOUNDS.boltHit).toBeNull();
    expect(VFX_SOUNDS.shotHit).toBeNull();
  });

  it('specific effects', () => {
    const vfx = (kind: VfxKind, radius = 1) => soundsForEvent({ type: 'vfx', kind, x: 0, z: 0, radius, facing: 0 })[0]?.id;
    expect(vfx('muzzle')).toBe('shot.light');
    expect(vfx('slash')).toBe('melee.swing');
    expect(vfx('enemySlash')).toBe('melee.swing');
    expect(vfx('minionSlash')).toBe('melee.swing');
    expect(vfx('slam')).toBe('melee.slam');
    expect(vfx('leapLand')).toBe('melee.slam');
    expect(vfx('shockwave')).toBe('melee.slam');
    expect(vfx('shield')).toBe('cast.shield');
    expect(vfx('blink')).toBe('cast.blink');
    expect(vfx('dodge')).toBe('cast.blink');
    expect(vfx('trapPlace')).toBe('cast.trap');
    expect(vfx('raise')).toBe('cast.summon');
    expect(vfx('flame')).toBe('cast.flame');
    expect(vfx('heal')).toBe('heal');
    expect(vfx('sporePulse')).toBe('cast.bio');
    expect(vfx('corpseBurst')).toBe('cast.bio');
    expect(vfx('bomblet')).toBe('explosion.small');
    expect(vfx('explosion', 2)).toBe('explosion.small');
    expect(vfx('explosion', 6)).toBe('explosion.large');
    expect(vfx('dust')).toBeUndefined();
  });

  it('plays a hit sound per damage type, at the target', () => {
    for (const damageType of DAMAGE_TYPES) {
      expect(soundsForEvent(damage({ damageType }))).toEqual([{ id: `hit.${damageType}`, x: 3, z: 4 }]);
    }
  });

  it('adds the crit sound, and uses the player-hit sound for hits taken', () => {
    expect(soundsForEvent(damage({ crit: true, damageType: 'heat' })).map((c) => c.id)).toEqual(['hit.heat', 'hit.crit']);
    expect(soundsForEvent(damage({ toPlayer: true, crit: true, damageType: 'toxic' })).map((c) => c.id)).toEqual(['hit.player']);
  });

  it('stays silent for damage-over-time ticks and zero-damage events', () => {
    expect(soundsForEvent(damage({ dot: true }))).toEqual([]);
    expect(soundsForEvent(damage({ amount: 0, absorbed: 0 }))).toEqual([]);
    expect(soundsForEvent(damage({ amount: 0, absorbed: 5 }))).toHaveLength(1);
  });

  it('deaths: player, machine, organic, and silent for things without a family', () => {
    const death = (over: Partial<Extract<GameEvent, { type: 'death' }>>): GameEvent => ({ type: 'death', target: 1 as never, x: 5, z: 6, isPlayer: false, ...over });
    expect(soundsForEvent(death({ isPlayer: true }))[0]!.id).toBe('death.player');
    expect(soundsForEvent(death({ family: 'machine' }))).toEqual([{ id: 'death.machine', x: 5, z: 6 }]);
    for (const family of ['infected', 'insect', 'beast', 'lumen', 'human'] as const) {
      expect(soundsForEvent(death({ family }))[0]!.id).toBe('death.organic');
    }
    // Lumen's light creatures burst instead of falling.
    expect(soundsForEvent(death({ family: 'light' }))).toEqual([{ id: 'explosion.small', x: 5, z: 6 }]);
    expect(soundsForEvent(death({}))).toEqual([]);
  });

  it('progress and world events', () => {
    const ids = (e: GameEvent) => soundsForEvent(e).map((c) => c.id);
    expect(ids({ type: 'levelUp', level: 3 })).toEqual(['levelUp']);
    expect(ids({ type: 'quest', id: 'q', state: 'started' })).toEqual(['quest.start']);
    expect(ids({ type: 'quest', id: 'q', state: 'step' })).toEqual(['quest.step']);
    expect(ids({ type: 'quest', id: 'q', state: 'completed' })).toEqual(['quest.complete']);
    expect(ids({ type: 'quest', id: 'q', state: 'progress' })).toEqual([]);
    expect(ids({ type: 'quest', id: 'q', state: 'failed' })).toEqual(['ui.error']);
    expect(ids({ type: 'wave', wave: 2, enemies: 5 })).toEqual(['wave.start']);
    expect(ids({ type: 'waveCleared', wave: 2 })).toEqual(['wave.cleared']);
    expect(ids({ type: 'banner', key: 'bosses.krell.phase2' })).toEqual(['boss.banner']);
    expect(ids({ type: 'banner', key: 'bosses.warden.intro' })).toEqual(['boss.banner']);
    expect(ids({ type: 'banner', key: 'storm.warning' })).toEqual([]);
    expect(ids({ type: 'zoneGate', gate: 'g' })).toEqual(['zoneGate']);
    expect(ids({ type: 'discover', id: 'x' })).toEqual(['discover']);
    expect(ids({ type: 'overheat' })).toEqual(['overheat']);
    expect(ids({ type: 'interact', kind: 'lore', id: 'x' })).toEqual(['interact']);
    expect(ids({ type: 'telegraph', owner: null, x: 1, z: 2, shape: { kind: 'circle', radius: 2 }, duration: 1, color: '#f00' })).toEqual(['telegraph']);
    expect(ids({ type: 'miss', x: 0, y: 0, z: 0 })).toEqual(['miss']);
  });

  it('leaves loot, pickups and notices to the synth sounds and the UI', () => {
    expect(soundsForEvent({ type: 'pickup', kind: 'gold', amount: 5 })).toEqual([]);
    expect(soundsForEvent({ type: 'notice', key: 'x' })).toEqual([]);
    expect(soundsForEvent({ type: 'hitstop', ms: 40 })).toEqual([]);
  });

  it('only names sounds that exist in the catalog', () => {
    for (const id of SFX_IDS) expect(SOUND_CATALOG[id]).toBeDefined();
  });
});

describe('voice limiter', () => {
  it('caps simultaneous voices per id', () => {
    const l = new VoiceLimiter(24, () => ({ max: 2, interval: 0 }));
    expect(l.tryStart('a', 0, 1)).toBe(true);
    expect(l.tryStart('a', 0.1, 1)).toBe(true);
    expect(l.tryStart('a', 0.2, 1)).toBe(false);
    expect(l.tryStart('b', 0.2, 1)).toBe(true);
    // The first voice has ended by t = 1.05.
    expect(l.tryStart('a', 1.05, 1)).toBe(true);
  });

  it('enforces a minimum retrigger interval per id', () => {
    const l = new VoiceLimiter(24, () => ({ max: 10, interval: 0.05 }));
    expect(l.tryStart('a', 0, 0.5)).toBe(true);
    expect(l.tryStart('a', 0.03, 0.5)).toBe(false);
    expect(l.tryStart('b', 0.03, 0.5)).toBe(true);
    expect(l.tryStart('a', 0.06, 0.5)).toBe(true);
  });

  it('caps all voices together', () => {
    const l = new VoiceLimiter(3, () => ({ max: 10, interval: 0 }));
    expect(l.tryStart('a', 0, 1)).toBe(true);
    expect(l.tryStart('b', 0, 1)).toBe(true);
    expect(l.tryStart('c', 0, 1)).toBe(true);
    expect(l.tryStart('d', 0, 1)).toBe(false);
    expect(l.active(0.5)).toBe(3);
    expect(l.active(1.5)).toBe(0);
    expect(l.tryStart('d', 1.5, 1)).toBe(true);
  });

  it('has sensible default rules', () => {
    expect(ruleFor('hit.physical')).toEqual({ max: 4, interval: 0.05 });
    expect(ruleFor('footstep').max).toBeLessThanOrEqual(2);
    expect(ruleFor('levelUp').max).toBe(1);
    expect(ruleFor('quest.complete').max).toBe(1);
    expect(new VoiceLimiter().globalCap).toBe(24);
  });
});

describe('bus volumes', () => {
  it('multiplies master by the bus', () => {
    const a = { master: 0.5, music: 0.4, sfx: 1, ui: 0.2, muted: false };
    expect(effectiveVolume(a, 'music')).toBeCloseTo(0.2);
    expect(effectiveVolume(a, 'sfx')).toBeCloseTo(0.5);
    expect(effectiveVolume(a, 'ui')).toBeCloseTo(0.1);
    expect(busVolume(a, 'master')).toBe(0.5);
    expect(busVolume(a, 'music')).toBe(0.4);
  });

  it('mute silences everything but keeps the sliders', () => {
    const a = { ...DEFAULT_AUDIO, muted: true };
    for (const bus of ['music', 'sfx', 'ui'] as const) expect(effectiveVolume(a, bus)).toBe(0);
    expect(busVolume(a, 'master')).toBe(0);
    expect(busVolume(a, 'music')).toBe(DEFAULT_AUDIO.music);
  });

  it('picks ogg where the browser can play it, else mp3', () => {
    expect(pickFormat((t) => (t.includes('ogg') ? 'probably' : ''))).toBe('ogg');
    expect(pickFormat(() => '')).toBe('mp3');
  });
});

describe('positional sound', () => {
  it('is full volume nearby and fades to silence far away', () => {
    const l = { x: 0, z: 0, yaw: 0 };
    expect(spatialMix(l, 2, 0).gain).toBe(1);
    const mid = spatialMix(l, 0, 20).gain;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(spatialMix(l, 0, 60).gain).toBe(0);
  });

  it('pans by where the source is on screen (camera at (sin yaw, cos yaw) looking at the player)', () => {
    // Yaw 0: the camera is on +z looking toward -z, so +x is screen-right.
    expect(spatialMix({ x: 0, z: 0, yaw: 0 }, 8, 0).pan).toBeGreaterThan(0.3);
    expect(spatialMix({ x: 0, z: 0, yaw: 0 }, -8, 0).pan).toBeLessThan(-0.3);
    expect(spatialMix({ x: 0, z: 0, yaw: 0 }, 0, 8).pan).toBeCloseTo(0);
    // Yaw 45°: screen-right is (cos, -sin) = (+x, -z).
    const yaw = Math.PI / 4;
    expect(spatialMix({ x: 0, z: 0, yaw }, 6, -6).pan).toBeGreaterThan(0.4);
    expect(spatialMix({ x: 0, z: 0, yaw }, -6, 6).pan).toBeLessThan(-0.4);
    expect(spatialMix({ x: 0, z: 0, yaw }, 6, 6).pan).toBeCloseTo(0);
    // Straight toward and away from the camera sits in the middle; the pan never leaves ±1.
    expect(Math.abs(spatialMix({ x: 0, z: 0, yaw }, 500, -500).pan)).toBeLessThanOrEqual(1);
  });
});

describe('footsteps', () => {
  it('steps about every third of a second while moving, and not when standing', () => {
    const clock = new FootstepClock();
    let steps = 0;
    for (let i = 0; i < 60 * 3; i++) if (clock.update(1 / 60, 6)) steps++;
    expect(steps).toBeGreaterThanOrEqual(8);
    expect(steps).toBeLessThanOrEqual(10);
    expect(STEP_INTERVAL).toBeCloseTo(0.33, 2);
    for (let i = 0; i < 120; i++) expect(clock.update(1 / 60, 0)).toBe(false);
  });
});

describe('music table', () => {
  const play = (over: Partial<AudioScene>): AudioScene => ({ ...MENU_SCENE, phase: 'play', zoneId: 'zone.cinder_flats', ...over });

  it('menus, zones, hubs and bosses', () => {
    expect(pickMusic(MENU_SCENE)).toBe('music.menu');
    expect(pickMusic(play({}))).toBe('music.cinder_flats');
    expect(pickMusic(play({ zoneId: 'zone.refinery_district' }))).toBe('music.refinery_district');
    expect(pickMusic(play({ zoneId: 'zone.hydroponic_vaults' }))).toBe('music.hydroponic_vaults');
    expect(pickMusic(play({ zoneId: 'zone.deep_mines' }))).toBe('music.deep_mines');
    expect(pickMusic(play({ inHub: true, zoneId: 'zone.deep_mines' }))).toBe('music.hub');
    expect(pickMusic(play({ bossEngaged: true }))).toBe('music.boss');
    expect(pickMusic(play({ bossEngaged: true, inHub: true, zoneId: 'zone.deep_mines' }))).toBe('music.boss_mines');
    expect(pickMusic(play({ zoneId: 'zone.test_arena' }))).toBe('music.cinder_flats');
  });

  it('ambience per zone', () => {
    expect(pickAmbience(MENU_SCENE)).toBeNull();
    expect(pickAmbience(play({}))).toBe('wind');
    expect(pickAmbience(play({ zoneId: 'zone.refinery_district' }))).toBe('amb.industrial');
    expect(pickAmbience(play({ zoneId: 'zone.hydroponic_vaults' }))).toBe('amb.hum');
    expect(pickAmbience(play({ zoneId: 'zone.deep_mines' }))).toBe('amb.mine');
    expect(zoneAudio('zone.unknown').ambience).toBeNull();
  });
});

describe('audio settings', () => {
  it('defaults', () => {
    expect(defaultSettings().audio).toEqual({ master: 0.8, music: 0.5, sfx: 0.8, ui: 0.6, muted: false });
  });

  it('old settings without audio load with the defaults', () => {
    expect(SettingsSchema.parse({ moveMode: 'wasd' }).audio).toEqual(DEFAULT_AUDIO);
    const store = new Map<string, string>([['ashfall.settings', JSON.stringify({ moveMode: 'wasd', controlsVersion: 1, graphics: 'low' })]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null } as Storage;
    const loaded = loadSettings(storage);
    expect(loaded.graphics).toBe('low');
    expect(loaded.audio).toEqual(DEFAULT_AUDIO);
  });

  it('keeps saved values and fills in missing ones', () => {
    const store = new Map<string, string>([['ashfall.settings', JSON.stringify({ audio: { master: 0.3, muted: true } })]]);
    const loaded = loadSettings({ getItem: (k: string) => store.get(k) ?? null } as Storage);
    expect(loaded.audio).toEqual({ ...DEFAULT_AUDIO, master: 0.3, muted: true });
  });

  it('migrateSettings repairs a settings object that has no audio', () => {
    const bare = { ...defaultSettings() } as Partial<ReturnType<typeof defaultSettings>>;
    delete bare.audio;
    expect(migrateSettings(bare as ReturnType<typeof defaultSettings>).audio).toEqual(DEFAULT_AUDIO);
  });

  it('rejects volumes outside 0..1', () => {
    expect(AudioSettingsSchema.safeParse({ master: 1.5 }).success).toBe(false);
    expect(AudioSettingsSchema.safeParse({ ui: -0.1 }).success).toBe(false);
  });

  it('the mute key does not collide with the map (M)', () => {
    const b = resolveKeybindings(defaultSettings());
    expect(b.toggleMute).toEqual(['KeyN']);
    const owners = Object.entries(b).filter(([, keys]) => keys.includes('KeyN'));
    expect(owners.map(([a]) => a)).toEqual(['toggleMute']);
  });
});

/** A just-enough AudioContext: records what gets started. */
function installFakeAudio() {
  const started: { buffer: unknown; offset: number; duration: number; rate: number }[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = () => ({ gain: param(), pan: param(), connect: (n: unknown) => n, disconnect: vi.fn() });
  class FakeContext {
    state = 'running';
    currentTime = 0;
    destination = node();
    createGain = node;
    createStereoPanner = node;
    createBufferSource() {
      const src = { buffer: null as unknown, playbackRate: { value: 1 }, loop: false, loopStart: 0, loopEnd: 0, onended: null, connect: (n: unknown) => n, disconnect: vi.fn(), stop: vi.fn(), start: (_when: number, offset: number, duration: number) => started.push({ buffer: src.buffer, offset, duration, rate: src.playbackRate.value }) };
      return src;
    }
    resume = vi.fn(async () => {});
    suspend = vi.fn(async () => {});
    decodeAudioData = vi.fn(async () => ({ duration: 10 }));
  }
  vi.stubGlobal('AudioContext', FakeContext);
  const fetched: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetched.push(url);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  }));
  return { started, fetched };
}

describe('engine', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing without an AudioContext', () => {
    const e = new AudioEngine();
    e.install();
    e.unlock();
    expect(e.play('hit.physical')).toBe(false);
    expect(e.startLoop('music.menu', 1)).toBeNull();
    expect(e.debugState()).toMatchObject({ format: 'mp3', context: 'none', spriteLoaded: false, voices: 0, recent: [] });
  });

  it('loads the sprite after unlock, then plays clips with pitch variation and the voice cap', async () => {
    const { started, fetched } = installFakeAudio();
    const e = new AudioEngine();
    // Nothing exists before the first gesture.
    expect(e.context).toBeNull();
    expect(e.play('hit.physical')).toBe(false);
    e.unlock();
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toMatch(/assets\/audio\/sfx\.mp3$/);
    await vi.waitFor(() => expect(e.debugState().spriteLoaded).toBe(true));

    expect(e.play('hit.physical')).toBe(true);
    expect(started).toHaveLength(1);
    expect(started[0]!.rate).toBeGreaterThanOrEqual(0.96);
    expect(started[0]!.rate).toBeLessThanOrEqual(1.04);
    // Retrigger interval: the same id again in the same instant is dropped.
    expect(e.play('hit.physical')).toBe(false);
    // UI sounds are not pitched.
    expect(e.play('ui.click')).toBe(true);
    expect(started[1]!.rate).toBe(1);
    expect(e.debugState().recent).toEqual(['hit.physical', 'ui.click']);
    expect(e.debugState().voices).toBe(2);
  });

  it('drops sounds that are muted, silent or out of earshot', async () => {
    installFakeAudio();
    const e = new AudioEngine();
    e.bind({ ...DEFAULT_AUDIO });
    e.unlock();
    await vi.waitFor(() => expect(e.debugState().spriteLoaded).toBe(true));
    e.setListener(0, 0, 0);
    expect(e.play('hit.physical', { x: 200, z: 0 })).toBe(false);
    expect(e.play('hit.physical', { x: 3, z: 0 })).toBe(true);
    e.setMuted(true);
    expect(e.play('hit.cold')).toBe(false);
    e.setMuted(false);
    expect(e.play('hit.cold')).toBe(true);
  });

  it('keeps only the last 10 sounds in the debug state', async () => {
    installFakeAudio();
    const e = new AudioEngine();
    e.unlock();
    await vi.waitFor(() => expect(e.debugState().spriteLoaded).toBe(true));
    const ids: SoundId[] = ['hit.physical', 'hit.heat', 'hit.cold', 'hit.toxic', 'hit.energy', 'hit.void', 'miss', 'heal', 'overheat', 'telegraph', 'discover', 'interact'];
    for (const id of ids) expect(e.play(id)).toBe(true);
    expect(e.debugState().recent).toEqual(ids.slice(-10));
  });
});
