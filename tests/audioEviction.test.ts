import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/engine';
import { CROSSFADE, MUSIC_RESIDENT, MusicController } from '../src/audio/music';
import { MENU_SCENE, type AudioScene } from '../src/data/audio';

/** A just-enough AudioContext whose decodeAudioData hands back a distinct buffer per call. */
function installFakeAudio() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = () => ({ gain: param(), pan: param(), connect: (n: unknown) => n, disconnect: vi.fn() });
  class FakeContext {
    state = 'running';
    currentTime = 0;
    destination = node();
    createGain = node;
    createStereoPanner = node;
    createBiquadFilter = () => ({ type: '', frequency: param(), Q: param(), connect: (n: unknown) => n, disconnect: vi.fn() });
    createOscillator = () => ({ type: '', frequency: param(), connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() });
    createBufferSource = () => ({ buffer: null, playbackRate: { value: 1 }, loop: false, loopStart: 0, loopEnd: 0, onended: null, connect: (n: unknown) => n, disconnect: vi.fn(), stop: vi.fn(), start: vi.fn() });
    resume = vi.fn(async () => {});
    suspend = vi.fn(async () => {});
    sampleRate = 100;
    createBuffer = () => ({ getChannelData: () => new Float32Array(1000) });
    decodeAudioData = vi.fn(async () => ({ duration: 30 }));
  }
  vi.stubGlobal('AudioContext', FakeContext);
  const fetched: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetched.push(url);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  }));
  return { fetched };
}

const scene = (over: Partial<AudioScene>): AudioScene => ({ ...MENU_SCENE, phase: 'play', ...over });
const music = (e: AudioEngine) => e.loadedBuffers().filter((f) => f.startsWith('music/'));

describe('decoded audio is evicted (T008)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps at most three music tracks resident across zones, hubs and boss fights', async () => {
    const { fetched } = installFakeAudio();
    const e = new AudioEngine();
    e.unlock();
    const m = new MusicController(e);
    m.update(MENU_SCENE, 0.1);
    await vi.waitFor(() => expect(music(e)).toEqual(['music/menu']));
    const steps: Partial<AudioScene>[] = [
      { zoneId: 'zone.cinder_flats' },
      { zoneId: 'zone.cinder_flats', inHub: true },
      { zoneId: 'zone.refinery_district' },
      { zoneId: 'zone.hydroponic_vaults' },
      { zoneId: 'zone.deep_mines', bossEngaged: true },
      { zoneId: 'zone.the_core' },
    ];
    for (const step of steps) {
      m.update(scene(step), 0.1);
      await vi.waitFor(() => expect(fetched.length).toBeGreaterThan(0));
      await new Promise((r) => setTimeout(r, 0));
      expect(music(e).length).toBeLessThanOrEqual(MUSIC_RESIDENT);
    }
    // Playing started: the menu track is gone for good.
    expect(music(e)).not.toContain('music/menu');
  });

  it('decodes a released track again when it comes back', async () => {
    const { fetched } = installFakeAudio();
    const e = new AudioEngine();
    e.unlock();
    const m = new MusicController(e);
    const visit = async (zoneId: string, file: string) => {
      m.update(scene({ zoneId }), 0.1);
      await vi.waitFor(() => expect(music(e)).toContain(file));
    };
    await visit('zone.cinder_flats', 'music/cinder_flats');
    await visit('zone.refinery_district', 'music/refinery_district');
    await visit('zone.hydroponic_vaults', 'music/hydroponic_vaults');
    await visit('zone.deep_mines', 'music/deep_mines');
    expect(music(e)).not.toContain('music/cinder_flats');
    const before = fetched.filter((u) => u.includes('cinder_flats')).length;
    await visit('zone.cinder_flats', 'music/cinder_flats');
    expect(fetched.filter((u) => u.includes('cinder_flats')).length).toBe(before + 1);
  });

  it('drops the previous zone ambience once the crossfade has ended', async () => {
    installFakeAudio();
    const e = new AudioEngine();
    e.unlock();
    const m = new MusicController(e);
    m.update(scene({ zoneId: 'zone.deep_mines' }), 0.1);
    await vi.waitFor(() => expect(e.loadedBuffers().some((f) => f.startsWith('amb/'))).toBe(true));
    const first = e.loadedBuffers().filter((f) => f.startsWith('amb/'));
    vi.useFakeTimers();
    m.update(scene({ zoneId: 'zone.the_core' }), 0.1);
    await vi.advanceTimersByTimeAsync(100);
    // Still fading out: still resident.
    expect(first.every((f) => e.loadedBuffers().includes(f))).toBe(true);
    await vi.advanceTimersByTimeAsync(CROSSFADE * 1000 + 500);
    const now = e.loadedBuffers().filter((f) => f.startsWith('amb/'));
    for (const f of first) {
      // Dropped unless the new zone uses the same file.
      if (!now.includes(f)) expect(e.loadedBuffers()).not.toContain(f);
    }
    expect(first).toEqual(['amb/mine']);
    expect(now).not.toContain('amb/mine');
  });
});
