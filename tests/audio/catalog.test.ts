import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SOUND_CATALOG } from '../../src/audio/catalog.gen';
import { AMBIENCE_IDS, MUSIC_IDS, SFX_IDS, type SoundId } from '../../src/audio/soundIds';

const DIR = join(__dirname, '../../public/assets/audio');
const ALL: SoundId[] = [...SFX_IDS, ...AMBIENCE_IDS, ...MUSIC_IDS];
const entry = (id: SoundId) => SOUND_CATALOG[id];

/** Length in seconds of an Ogg Vorbis file: last page's granule position over the sample rate. */
function oggSeconds(file: string): number {
  const buf = readFileSync(file);
  const ident = buf.indexOf('\x01vorbis', 0, 'latin1');
  const rate = buf.readUInt32LE(ident + 12);
  const last = buf.lastIndexOf('OggS', buf.length, 'latin1');
  return Number(buf.readBigInt64LE(last + 6)) / rate;
}

describe('sound catalog', () => {
  it('has exactly one entry per sound id', () => {
    expect(Object.keys(SOUND_CATALOG).sort()).toEqual([...ALL].sort());
    for (const id of ALL) expect(entry(id).id).toBe(id);
  });

  it('puts music on the music bus, ui.* on ui and the rest on sfx', () => {
    for (const id of ALL) {
      const bus = (MUSIC_IDS as readonly string[]).includes(id) ? 'music' : id.startsWith('ui.') ? 'ui' : 'sfx';
      expect(entry(id).bus, id).toBe(bus);
    }
  });

  it('has clips and a gain for every sound', () => {
    for (const id of ALL) {
      const e = entry(id);
      expect(e.clips.length, id).toBeGreaterThan(0);
      expect(e.gain, id).toBeGreaterThan(0);
      expect(e.gain, id).toBeLessThanOrEqual(1);
      for (const c of e.clips) {
        expect(c.start, id).toBeGreaterThanOrEqual(0);
        expect(c.duration, id).toBeGreaterThan(0.02);
      }
    }
  });

  it('loops ambience and music as one clip and plays SFX once', () => {
    for (const id of SFX_IDS) {
      expect(entry(id).loop, id).toBe(false);
      expect(entry(id).file, id).toBe('sfx');
      for (const c of entry(id).clips) expect(c.duration, id).toBeLessThanOrEqual(2.5);
    }
    for (const id of [...AMBIENCE_IDS, ...MUSIC_IDS]) {
      expect(entry(id).loop, id).toBe(true);
      expect(entry(id).clips, id).toHaveLength(1);
      expect(entry(id).clips[0]!.start, id).toBe(0);
    }
  });

  it('has both an .ogg and an .mp3 for every file the catalog names', () => {
    for (const file of new Set(ALL.map((id) => entry(id).file))) {
      for (const ext of ['ogg', 'mp3']) {
        const path = join(DIR, `${file}.${ext}`);
        expect(existsSync(path), path).toBe(true);
        expect(statSync(path).size, path).toBeGreaterThan(1000);
      }
    }
  });

  it('keeps every clip inside its file, and loops as long as the file', () => {
    for (const id of ALL) {
      const e = entry(id);
      const length = oggSeconds(join(DIR, `${e.file}.ogg`));
      for (const c of e.clips) expect(c.start + c.duration, id).toBeLessThanOrEqual(length + 1e-3);
      if (e.loop) expect(e.clips[0]!.duration, id).toBeCloseTo(length, 2);
    }
  });

  it('does not overlap SFX sprite clips', () => {
    const clips = SFX_IDS.flatMap((id) => entry(id).clips.map((c) => ({ id, ...c })));
    // Clips with identical source are stored once and shared between ids.
    const unique = [...new Map(clips.map((c) => [`${c.start}`, c])).values()].sort((a, b) => a.start - b.start);
    for (let i = 1; i < unique.length; i++) {
      const prev = unique[i - 1]!;
      expect(unique[i]!.start, `${prev.id} / ${unique[i]!.id}`).toBeGreaterThanOrEqual(prev.start + prev.duration);
    }
  });

  it('keeps public/assets/audio within the 13 MB budget', () => {
    const files = [...new Set(ALL.map((id) => entry(id).file))].flatMap((f) => ['ogg', 'mp3'].map((e) => join(DIR, `${f}.${e}`)));
    expect(files.reduce((sum, f) => sum + statSync(f).size, 0)).toBeLessThanOrEqual(13_000_000);
  });
});
