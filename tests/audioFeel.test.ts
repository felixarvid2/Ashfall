import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOUND_CATALOG } from '../src/audio/catalog.gen';
import { COMBAT_LOOP_SECONDS, renderCombatLoop } from '../src/audio/combatLayer';
import { AudioEngine, PAUSE_DUCK, ruleFor } from '../src/audio/engine';
import { soundsForEvent, soundsForEvents, telegraphSound } from '../src/audio/eventSounds';
import { SURFACE_STEP, footstepPlay } from '../src/audio/footsteps';
import { DROP_SOUNDS, dropHitstopMs, playDropSound } from '../src/audio/lootSounds';
import { ThreatMeter } from '../src/audio/music';
import { AMBIENCE_IDS, SFX_IDS, type SfxId } from '../src/audio/soundIds';
import { audio as engine } from '../src/audio/engine';
import type { GameEvent, TelegraphShape } from '../src/core/events';
import { MENU_SCENE, THREAT_ENEMIES, THREAT_HEALTH, THREAT_HOLD, isThreatened, pickMusic, surfaceOf, type AudioScene, type Surface } from '../src/data/audio';
import { RARITIES } from '../src/data/loot/schemas';
import { MATCH_FLOOR_DB, matchGains, shortTermDb } from '../scripts/audio/loudness';

const play = (over: Partial<AudioScene> = {}): AudioScene => ({ ...MENU_SCENE, phase: 'play', zoneId: 'zone.cinder_flats', ...over });
const ids = (events: GameEvent[]) => soundsForEvents(events).map((c) => c.id);

const damage = (over: Partial<Extract<GameEvent, { type: 'damage' }>> = {}): GameEvent => ({
  type: 'damage', target: 1 as never, x: 3, y: 1, z: 4, amount: 10, absorbed: 0, crit: false, damageType: 'physical', toPlayer: false, dot: false, ...over,
});
type DeathEvent = Extract<GameEvent, { type: 'death' }>;
type DeathOver = Partial<Omit<DeathEvent, 'family'>> & { family?: DeathEvent['family'] | undefined };
/** A death event; passing `family: undefined` leaves the family off (summons and props). */
const death = (over: DeathOver = {}): GameEvent => {
  const { family, ...rest } = over;
  const fam = 'family' in over ? family : 'infected';
  return { type: 'death', target: 1 as never, x: 3, z: 4, isPlayer: false, ...rest, ...(fam && { family: fam }) };
};
const clipStarts = (id: SfxId) => SOUND_CATALOG[id].clips.map((c) => c.start);

/** A just-enough AudioContext. */
function installFakeAudio() {
  const started: { rate: number }[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = () => ({ gain: param(), pan: param(), connect: (n: unknown) => n, disconnect: vi.fn() });
  const filters: { type: string; frequency: { value: number } }[] = [];
  class FakeContext {
    state = 'running';
    currentTime = 0;
    destination = node();
    createGain = node;
    createStereoPanner = node;
    createBiquadFilter() {
      const f = { type: '', frequency: param(), connect: (n: unknown) => n, disconnect: vi.fn() };
      filters.push(f);
      return f;
    }
    createOscillator = () => ({ type: '', frequency: param(), connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() });
    createBufferSource() {
      const src = { buffer: null as unknown, playbackRate: { value: 1 }, loop: false, onended: null, connect: (n: unknown) => n, disconnect: vi.fn(), stop: vi.fn(), start: () => started.push({ rate: src.playbackRate.value }) };
      return src;
    }
    resume = vi.fn(async () => {});
    decodeAudioData = vi.fn(async () => ({ duration: 100 }));
  }
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
  return { started, filters };
}

describe('F002 enemy swings and whiffs', () => {
  it('maps enemy and minion slashes to their own ids, at a lower rate than the player', () => {
    const slash = (kind: 'slash' | 'enemySlash' | 'minionSlash') => soundsForEvent({ type: 'vfx', kind, x: 0, z: 0, radius: 1, facing: 0 })[0]!.id;
    expect(slash('slash')).toBe('melee.swing');
    expect(slash('enemySlash')).toBe('swing.enemy');
    expect(slash('minionSlash')).toBe('swing.minion');
    expect(SOUND_CATALOG['swing.enemy'].rate).toBeLessThan(1);
    expect(SOUND_CATALOG['swing.minion'].rate).toBeLessThan(1);
  });

  it('shares no clip between the player swing, the whiff and the enemy swings', () => {
    const groups: SfxId[] = ['melee.swing', 'miss', 'swing.enemy', 'swing.minion'];
    const seen = new Map<number, SfxId>();
    for (const id of groups) {
      for (const start of clipStarts(id)) {
        expect(seen.get(start), `${id} shares a clip with ${seen.get(start)}`).toBeUndefined();
        seen.set(start, id);
      }
    }
  });
});

describe('F003 Lightbearer sounds', () => {
  const holyCast = { type: 'vfx', kind: 'holy', x: 10, z: 10, radius: 4, facing: 0 } as const;

  it('casts chime, pulses tick (rate-limited), and the blows inside them are hit.holy', () => {
    expect(soundsForEvent(holyCast)[0]!.id).toBe('cast.holy');
    expect(soundsForEvent({ ...holyCast, kind: 'holyRing' })[0]!.id).toBe('holy.pulse');
    expect(ruleFor('holy.pulse')).toMatchObject({ max: 1, interval: 0.6 });
    const near = damage({ damageType: 'energy', x: 12, z: 10, target: 2 as never });
    const far = damage({ damageType: 'energy', x: 40, z: 40, target: 3 as never });
    const fire = damage({ damageType: 'heat', x: 11, z: 10, target: 4 as never });
    expect(ids([holyCast, near, far, fire])).toEqual(['cast.holy', 'hit.holy', 'hit.energy', 'hit.heat']);
    // Without a holy effect in the frame the zap stays the energy hit.
    expect(ids([near])).toEqual(['hit.energy']);
  });

  it('keeps energy hits short so a volley does not smear', () => {
    for (const c of SOUND_CATALOG['hit.energy'].clips) expect(c.duration).toBeLessThanOrEqual(0.35 + 1e-3);
    expect(SOUND_CATALOG['hit.holy'].clips.length).toBeGreaterThan(0);
  });
});

describe('F010 telegraph sounds', () => {
  const cone: TelegraphShape = { kind: 'cone', radius: 3, arcDeg: 90, facing: 0 };
  const circle: TelegraphShape = { kind: 'circle', radius: 3 };
  const line: TelegraphShape = { kind: 'line', length: 8, width: 2, facing: 0 };

  it('picks the sound from the shape, a charge from its cue and boss attacks from theirs', () => {
    expect(telegraphSound(cone)).toBe('telegraph.melee');
    expect(telegraphSound(circle)).toBe('telegraph.slam');
    expect(telegraphSound(line)).toBe('telegraph.beam');
    expect(telegraphSound(line, 'charge')).toBe('telegraph.charge');
    expect(telegraphSound(circle, 'boss')).toBe('telegraph.boss');
    expect(telegraphSound(cone, 'boss')).toBe('telegraph.boss');
  });

  it('soundsForEvent uses it, at the telegraph', () => {
    const e = (shape: TelegraphShape, cue?: 'charge' | 'boss'): GameEvent => ({ type: 'telegraph', owner: null, x: 2, z: 3, shape, duration: 1, color: '#f00', ...(cue ? { cue } : {}) });
    expect(soundsForEvent(e(cone))).toEqual([{ id: 'telegraph.melee', x: 2, z: 3 }]);
    expect(soundsForEvent(e(line, 'charge'))[0]!.id).toBe('telegraph.charge');
    expect(soundsForEvent(e(circle, 'boss'))[0]!.id).toBe('telegraph.boss');
    for (const id of ['telegraph.melee', 'telegraph.slam', 'telegraph.beam', 'telegraph.charge', 'telegraph.boss'] as const) expect(SOUND_CATALOG[id]).toBeDefined();
  });
});

describe('F011 one kill sound', () => {
  it('an enemy corpse burst is silent, the skill burst sounds', () => {
    const burst = (source?: 'skill'): GameEvent => ({ type: 'vfx', kind: 'corpseBurst', x: 0, z: 0, radius: 2, facing: 0, ...(source ? { source } : {}) });
    expect(ids([burst()])).toEqual([]);
    expect(ids([burst('skill')])).toEqual(['cast.bio']);
  });

  it('a kill plays death.organic only; a critical keeps its crit sound; survivors keep theirs', () => {
    expect(ids([damage({ target: 7 as never }), death({ target: 7 as never })])).toEqual(['death.organic']);
    expect(ids([damage({ target: 7 as never, crit: true }), death({ target: 7 as never })])).toEqual(['hit.crit', 'death.organic']);
    expect(ids([damage({ target: 8 as never }), death({ target: 7 as never })])).toEqual(['hit.physical', 'death.organic']);
    // Summons and props die silently, so their last hit is still heard.
    expect(ids([damage({ target: 7 as never }), death({ target: 7 as never, family: undefined })])).toEqual(['hit.physical']);
    // Hits taken by the player are untouched.
    expect(ids([damage({ target: 9 as never, toPlayer: true }), death({ target: 9 as never, isPlayer: true, family: undefined })])).toEqual(['hit.player', 'death.player']);
  });
});

describe('F012 the Core music and long ambience', () => {
  it('has its own exploration and boss tracks', () => {
    expect(pickMusic(play({ zoneId: 'zone.the_core' }))).toBe('music.the_core');
    expect(pickMusic(play({ zoneId: 'zone.the_core', bossEngaged: true }))).toBe('music.boss_core');
    expect(pickMusic(play({ zoneId: 'zone.deep_mines' }))).toBe('music.deep_mines');
    expect(SOUND_CATALOG['music.the_core'].clips[0]!.duration).toBeGreaterThanOrEqual(60);
    expect(SOUND_CATALOG['music.boss_core'].clips[0]!.duration).toBeGreaterThanOrEqual(30);
  });

  it('loops every ambience for 20 s or more', () => {
    for (const id of AMBIENCE_IDS) expect(SOUND_CATALOG[id].clips[0]!.duration, id).toBeGreaterThanOrEqual(20);
  });
});

describe('F015 footsteps per surface', () => {
  it('maps zones to surfaces, stone by default', () => {
    expect(surfaceOf('zone.cinder_flats')).toBe('ash');
    expect(surfaceOf('zone.refinery_district')).toBe('metal');
    expect(surfaceOf('zone.hydroponic_vaults')).toBe('wet');
    expect(surfaceOf('zone.the_core')).toBe('crystal');
    expect(surfaceOf('zone.test_arena')).toBe('stone');
    expect(surfaceOf('')).toBe('stone');
  });

  it('gives each surface its own rate, and dulls the soft ones', () => {
    const rates = (Object.keys(SURFACE_STEP) as Surface[]).map((s) => footstepPlay(s).rate);
    expect(new Set(rates).size).toBe(rates.length);
    expect(footstepPlay('metal').rate!).toBeGreaterThan(footstepPlay('ash').rate!);
    expect(footstepPlay('wet').rate!).toBeLessThan(footstepPlay('stone').rate!);
    expect(footstepPlay('ash').lowpass).toBeDefined();
    expect(footstepPlay('metal').lowpass).toBeUndefined();
    for (const s of Object.keys(SURFACE_STEP) as Surface[]) expect(footstepPlay(s).volume!).toBeLessThan(0.5);
  });
});

describe('engine: rates, pause, jitter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('applies the surface rate and filter and reports the last sound played', async () => {
    const fake = installFakeAudio();
    const e = new AudioEngine();
    e.unlock();
    await vi.waitFor(() => expect(e.debugState().spriteLoaded).toBe(true));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(e.play('footstep', footstepPlay('wet'))).toBe(true);
    expect(fake.started.at(-1)!.rate).toBeCloseTo(SURFACE_STEP.wet.rate, 5);
    expect(fake.filters.some((f) => f.type === 'lowpass' && f.frequency.value === SURFACE_STEP.wet.lowpass)).toBe(true);
    expect(e.debugState().lastPlay).toMatchObject({ id: 'footstep' });
    expect(e.debugState().lastPlay!.rate).toBeCloseTo(SURFACE_STEP.wet.rate, 5);
    vi.restoreAllMocks();
  });

  it('plays a catalogued base rate (swing.enemy) and jitters hits by 6 %', async () => {
    const fake = installFakeAudio();
    const e = new AudioEngine();
    e.unlock();
    await vi.waitFor(() => expect(e.debugState().spriteLoaded).toBe(true));
    const rnd = vi.spyOn(Math, 'random');
    rnd.mockReturnValue(0.5);
    e.play('swing.enemy');
    expect(fake.started.at(-1)!.rate).toBeCloseTo(SOUND_CATALOG['swing.enemy'].rate!, 5);
    rnd.mockReturnValue(0.999);
    e.play('hit.physical');
    expect(fake.started.at(-1)!.rate).toBeGreaterThan(1.055);
    expect(fake.started.at(-1)!.rate).toBeLessThanOrEqual(1.06);
    vi.restoreAllMocks();
  });

  it('hit sounds get a 40 ms cooldown and room for a volley', () => {
    expect(ruleFor('hit.energy')).toMatchObject({ interval: 0.04 });
    expect(ruleFor('hit.holy').max).toBeGreaterThanOrEqual(6);
  });

  it('drops the music and ambience while paused and restores them', async () => {
    installFakeAudio();
    const e = new AudioEngine();
    e.unlock();
    expect(e.debugState().pauseLevel).toBe(1);
    e.setPaused(true);
    expect(e.debugState().pauseLevel).toBeLessThan(0.5);
    expect(PAUSE_DUCK).toBeCloseTo(0.355, 2);
    expect(e.isPaused).toBe(true);
    e.setPaused(false);
    expect(e.debugState().pauseLevel).toBe(1);
  });
});

describe('F020 loot drop tiers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has a distinct sound id per rarity, and a hitstop only for unique and mythic', () => {
    const idsOf = RARITIES.map((r) => DROP_SOUNDS[r].id);
    expect(new Set(idsOf).size).toBe(RARITIES.length);
    for (const r of RARITIES) expect(dropHitstopMs(r)).toBe(r === 'unique' || r === 'mythic' ? 60 : 0);
  });

  it('records the tier in the debug trail when it plays', () => {
    installFakeAudio();
    engine.unlock();
    for (const r of RARITIES) {
      playDropSound(r);
      expect(engine.debugState().recent.at(-1)).toBe(DROP_SOUNDS[r].id);
    }
  });
});

describe('F023 combat music', () => {
  it('is threatened by 3 hunting enemies or life under 30 %, and not in menus, hubs, boss fights or when dead', () => {
    expect(isThreatened(play({ aggroCount: THREAT_ENEMIES - 1 }))).toBe(false);
    expect(isThreatened(play({ aggroCount: THREAT_ENEMIES }))).toBe(true);
    expect(isThreatened(play({ healthFraction: THREAT_HEALTH }))).toBe(false);
    expect(isThreatened(play({ healthFraction: THREAT_HEALTH - 0.01 }))).toBe(true);
    expect(isThreatened({ ...MENU_SCENE, aggroCount: 9 })).toBe(false);
    expect(isThreatened(play({ aggroCount: 9, inHub: true }))).toBe(false);
    expect(isThreatened(play({ aggroCount: 9, bossEngaged: true }))).toBe(false);
    expect(isThreatened(play({ aggroCount: 9, playerDead: true }))).toBe(false);
  });

  it('holds the layer for 6 s after the danger passes', () => {
    const meter = new ThreatMeter();
    expect(meter.update(play(), 1)).toBe(false);
    expect(meter.update(play({ aggroCount: 4 }), 0.1)).toBe(true);
    expect(THREAT_HOLD).toBe(6);
    for (let t = 0; t < 5.5; t += 0.5) expect(meter.update(play(), 0.5)).toBe(true);
    expect(meter.update(play(), 1)).toBe(false);
    // New danger during the hold restarts it; dying ends it at once.
    meter.update(play({ aggroCount: 3 }), 0.1);
    meter.update(play(), 4);
    meter.update(play({ aggroCount: 3 }), 0.1);
    expect(meter.update(play(), 4)).toBe(true);
    expect(meter.update(play({ playerDead: true }), 0.1)).toBe(false);
  });

  it('renders a drum bed of the right length that does not clip and starts quietly', () => {
    const data = renderCombatLoop(8000);
    expect(data.length).toBe(Math.round(COMBAT_LOOP_SECONDS * 8000));
    let peak = 0;
    for (const v of data) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThan(1);
    expect(Math.abs(data[0]!)).toBeLessThan(0.05);
    expect(renderCombatLoop(8000)).toEqual(data);
  });
});

describe('F024 gain matching of long clips', () => {
  it('matches loud sounds down to the median and never boosts', () => {
    const levels = new Map([['a', -12], ['b', -16], ['c', -20], ['d', -9], ['e', -30]]);
    const g = matchGains(levels);
    expect(g.get('b')).toBe(1);
    expect(g.get('c')).toBe(1);
    expect(g.get('a')).toBeCloseTo(10 ** (-4 / 20), 2);
    expect(g.get('d')).toBeCloseTo(10 ** (-7 / 20), 2);
    for (const v of g.values()) expect(v).toBeLessThanOrEqual(1);
    // A very loud sound is not turned down by more than the floor.
    expect(matchGains(new Map([['x', 0], ['y', -30], ['z', -31]])).get('x')).toBeCloseTo(10 ** (MATCH_FLOOR_DB / 20), 2);
    expect(matchGains(levels, new Map([['b', 0.5]])).get('b')).toBe(0.5);
  });

  it('measures the loudest 100 ms, so a decaying tail does not read as quiet', () => {
    const sr = 8000;
    const burst = new Float32Array(sr).map((_, i) => (i < 800 ? 0.5 : 0));
    expect(shortTermDb(burst, sr)).toBeCloseTo(20 * Math.log10(0.5), 0);
    expect(shortTermDb(new Float32Array(10), sr)).toBeLessThan(-100);
  });

  it('keeps every hit clip at or under 0.4 s and every hit gain a usable level', () => {
    for (const id of SFX_IDS.filter((i) => i.startsWith('hit.'))) {
      for (const c of SOUND_CATALOG[id].clips) expect(c.duration, id).toBeLessThanOrEqual(0.4 + 1e-3);
      expect(SOUND_CATALOG[id].gain, id).toBeGreaterThanOrEqual(0.3);
      expect(SOUND_CATALOG[id].gain, id).toBeLessThanOrEqual(1);
    }
  });
});
