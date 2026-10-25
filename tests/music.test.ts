import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_SCENE, type AudioScene } from '../src/data/audio';
import { CROSSFADE, LAYER_FADE, MusicController } from '../src/audio/music';
import type { AudioEngine } from '../src/audio/engine';

const wind = { setIntensity: vi.fn(), setPaused: vi.fn(), stop: vi.fn() };
vi.mock('../src/audio/wind', () => ({ createWind: vi.fn(() => wind) }));
const layer = { setLevel: vi.fn() };
vi.mock('../src/audio/combatLayer', () => ({ createCombatLayer: vi.fn(() => layer) }));

interface FakeLoop {
  id: string;
  fadeIn: number;
  levels: [number, number][];
  stops: number[];
}

function fakeEngine(ready = true) {
  const loops: FakeLoop[] = [];
  let unlock: (() => void) | null = null;
  const engine = {
    context: ready ? ({} as AudioContext) : null,
    musicBus: ready ? ({} as AudioNode) : null,
    ambienceBus: ready ? ({} as AudioNode) : null,
    nowPlaying: { music: null as string | null, ambience: null as string | null, layer: null as string | null },
    onUnlock: (cb: () => void) => (unlock = cb),
    startLoop: (id: string, fadeIn: number) => {
      const loop: FakeLoop = { id, fadeIn, levels: [], stops: [] };
      loops.push(loop);
      return { id, setLevel: (l: number, s: number) => loop.levels.push([l, s]), stop: (s: number) => loop.stops.push(s) };
    },
    duckMusic: vi.fn(),
    setPaused: vi.fn(),
    release: vi.fn(),
  };
  return { engine, loops, unlock: () => unlock?.(), make: () => new MusicController(engine as unknown as AudioEngine) };
}

const play = (over: Partial<AudioScene> = {}): AudioScene => ({ ...MENU_SCENE, phase: 'play', zoneId: 'zone.deep_mines', ...over });

beforeEach(() => vi.clearAllMocks());

describe('MusicController scene changes', () => {
  it('plays the title track in the menu and the zone track once playing', () => {
    const { engine, loops, make } = fakeEngine();
    const music = make();
    music.update(MENU_SCENE, 0.016);
    music.reconcile();
    expect(engine.nowPlaying.music).toBe('music.menu');
    music.update(play(), 0.016);
    expect(engine.nowPlaying.music).toBe('music.deep_mines');
    // The old track fades out over the crossfade while the new one fades in.
    expect(loops[0]!.stops).toEqual([CROSSFADE]);
    expect(loops[1]!.fadeIn).toBe(CROSSFADE);
    expect(engine.nowPlaying.ambience).toBe('amb.mine');
    // The decoded title track is let go once play starts.
    expect(engine.release).toHaveBeenCalledWith(expect.stringContaining('menu'));
  });

  it('does not restart anything while the scene stays the same', () => {
    const { loops, make } = fakeEngine();
    const music = make();
    music.update(play(), 0.016);
    music.update(play(), 0.016);
    music.update(play({ storm: 0 }), 0.016);
    expect(loops.filter((l) => l.id.startsWith('music.'))).toHaveLength(1);
  });

  it('switches to the hub track in a hub and the zone boss track, faster, when a boss is engaged', () => {
    const { engine, loops, make } = fakeEngine();
    const music = make();
    music.update(play(), 0.016);
    music.update(play({ inHub: true }), 0.016);
    expect(engine.nowPlaying.music).toBe('music.hub');
    music.update(play({ bossEngaged: true }), 0.016);
    expect(engine.nowPlaying.music).toBe('music.boss_mines');
    const boss = loops.find((l) => l.id === 'music.boss_mines')!;
    expect(boss.fadeIn).toBeLessThan(CROSSFADE);
    // Back to the zone track afterwards.
    music.update(play(), 0.016);
    expect(engine.nowPlaying.music).toBe('music.deep_mines');
  });

  it('swaps the ambience with the zone', () => {
    const { engine, loops, make } = fakeEngine();
    const music = make();
    music.update(play({ zoneId: 'zone.refinery_district' }), 0.016);
    expect(engine.nowPlaying.ambience).toBe('amb.industrial');
    music.update(play({ zoneId: 'zone.hydroponic_vaults' }), 0.016);
    expect(engine.nowPlaying.ambience).toBe('amb.hum');
    expect(loops.find((l) => l.id === 'amb.industrial')!.stops).toEqual([CROSSFADE]);
  });

  it('uses the procedural wind in Cinder Flats and follows the storm', () => {
    const { make } = fakeEngine();
    const music = make();
    music.update(play({ zoneId: 'zone.cinder_flats', storm: 0 }), 0.016);
    music.update(play({ zoneId: 'zone.cinder_flats', storm: 0.9 }), 0.016);
    expect(wind.setIntensity).toHaveBeenLastCalledWith(0.9, 1.5);
  });

  it('waits for audio to unlock, then starts what the scene calls for', () => {
    const { engine, loops, unlock, make } = fakeEngine(false);
    const music = make();
    music.update(play(), 0.016);
    expect(loops).toHaveLength(0);
    (engine as { context: unknown }).context = {} as AudioContext;
    unlock();
    expect(engine.nowPlaying.music).toBe('music.deep_mines');
  });
});

describe('MusicController ducking and pause', () => {
  it('ducks while the player is dead and restores slowly', () => {
    const { engine, make } = fakeEngine();
    const music = make();
    music.update(play(), 0.016);
    music.update(play({ playerDead: true }), 0.016);
    expect(engine.duckMusic).toHaveBeenLastCalledWith(0.25, 0.25);
    music.update(play(), 0.016);
    expect(engine.duckMusic).toHaveBeenLastCalledWith(1, 1.2);
  });

  it('ducks under a sting for a few seconds and then lets go', () => {
    const { engine, make } = fakeEngine();
    const music = make();
    music.update(play(), 0.016);
    music.sting();
    music.update(play(), 0.016);
    expect(engine.duckMusic).toHaveBeenLastCalledWith(0.35, 0.25);
    music.update(play(), 3);
    expect(engine.duckMusic).toHaveBeenLastCalledWith(1, 1.2);
  });

  it('passes pause through once per change', () => {
    const { engine, make } = fakeEngine();
    const music = make();
    music.setPaused(true);
    music.setPaused(true);
    music.setPaused(false);
    expect(engine.setPaused).toHaveBeenCalledTimes(2);
  });
});

describe('combat layer', () => {
  it('fades in on a threat and out six seconds after it passes', () => {
    const { engine, make } = fakeEngine();
    const music = make();
    music.update(play(), 0.016);
    music.update(play({ aggroCount: 4 }), 0.016);
    expect(layer.setLevel).toHaveBeenLastCalledWith(1, LAYER_FADE);
    expect(engine.nowPlaying.layer).toBe('combat');
    music.update(play({ aggroCount: 0 }), 3);
    expect(engine.nowPlaying.layer).toBe('combat');
    music.update(play({ aggroCount: 0 }), 3.5);
    expect(layer.setLevel).toHaveBeenLastCalledWith(0, LAYER_FADE);
    expect(engine.nowPlaying.layer).toBeNull();
  });
});
