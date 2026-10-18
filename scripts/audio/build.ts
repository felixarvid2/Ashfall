/**
 * npm run audio:build — turns the CC0 source sounds into the game's audio files and the catalog the
 * engine reads. Needs ffmpeg on the PATH. Sources are not committed (assets-src/third-party/, or
 * $AUDIO_SRC); the pack list is in PACKS. See docs/credits.md.
 *
 *  SFX       one mono sprite, public/assets/audio/sfx.{ogg,mp3}: every clip trimmed, capped, peak-
 *            normalised to -3 dBFS, separated by 0.1 s of silence, starting on a 10 ms grid
 *  Ambience  amb/<name>.{ogg,mp3}: mono loops, the tail crossfaded into the head, -24 dBFS RMS
 *  Music     music/<name>.{ogg,mp3}: stereo loops at -16 LUFS, length untouched
 *  Catalog   src/audio/catalog.gen.ts (SoundEntry per SoundId, see src/audio/soundIds.ts)
 *
 * mp3 and offsets: an mp3 encoder delays the audio by 1105 samples (576 encoder + 529 decoder), and
 * players only undo that when the file carries a LAME header. The sprite is therefore encoded
 * without that header (-write_xing 0), after dropping the first DELAY samples of its silent lead-in,
 * with DELAY measured by encoding the sprite once without compensation and decoding it again. The
 * clips then sit at the same offsets in the .mp3 as in the .ogg and the .wav in every decoder, tag
 * support or not (checked by decoding both back and cross-correlating). Loops keep the header
 * instead: browsers trim the delay and padding with it, so their length is exact (checked too).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { AMBIENCE_IDS, MUSIC_IDS, SFX_IDS, type SoundBus, type SoundId } from '../../src/audio/soundIds';

const ROOT = new URL('../..', import.meta.url).pathname;
const SRC = process.env.AUDIO_SRC ?? join(ROOT, 'assets-src', 'third-party', 'audio');
const OUT = join(ROOT, 'public', 'assets', 'audio');
const CATALOG = join(ROOT, 'src', 'audio', 'catalog.gen.ts');

const SR = 44100;
const BUDGET = 12_000_000; // bytes, everything in public/assets/audio
const SFX_PEAK_DB = -3;
const SFX_CAP = 2.5; // seconds
const GAP = 4410; // samples of silence between sprite clips (and before the first)
const GRID = 441; // clips start on multiples of 10 ms so the catalog offsets are exact decimals
const AMB_FADE = 0.5; // seconds of tail crossfaded into the head
const AMB_RMS_DB = -24;
const MUSIC_LUFS = -16;
const MUSIC_TP_DB = -1.5;

/** Source packs: directory under SRC → where to get it. */
const PACKS: Record<string, string> = {
  'kenney-sci-fi-sounds': 'https://kenney.nl/assets/sci-fi-sounds',
  'kenney-impact-sounds': 'https://kenney.nl/assets/impact-sounds',
  'kenney-interface-sounds': 'https://kenney.nl/assets/interface-sounds',
  'kenney-digital-audio': 'https://kenney.nl/assets/digital-audio',
  'kenney-rpg-audio': 'https://kenney.nl/assets/rpg-audio',
  'kenney-ui-audio': 'https://kenney.nl/assets/ui-audio',
  'kenney-music-jingles': 'https://kenney.nl/assets/music-jingles',
  abstraction: 'https://tallbeard.itch.io/music-loop-bundle',
};

const SCI = 'kenney-sci-fi-sounds/Audio';
const IMP = 'kenney-impact-sounds/Audio';
const INT = 'kenney-interface-sounds/Audio';
const DIG = 'kenney-digital-audio/Audio';
const RPG = 'kenney-rpg-audio/Audio';
const UI = 'kenney-ui-audio/Audio';
const HIT = 'kenney-music-jingles/Audio/Hit jingles';

/** `from('dir', 'a', 'b')` → ['dir/a.ogg', 'dir/b.ogg'] */
const from = (dir: string, ...names: string[]) => names.map((n) => `${dir}/${n}.ogg`);

interface Pick {
  /** One file is one clip; several are variants, one is played at random. Relative to SRC. */
  files: string[];
  /** Linear gain the engine applies on top of the bus (the catalog's `gain`); the file itself stays at -3 dBFS. */
  gain: number;
  /** Longest clip in seconds (default SFX_CAP); longer sources are cut and faded out. */
  cap?: number;
}

/** id → source. Chosen by file name and length (nobody has auditioned them); 2-4 variants for the repeated ones. */
const SFX: Record<(typeof SFX_IDS)[number], Pick> = {
  'hit.physical': { files: from(IMP, 'impactPunch_medium_000', 'impactPunch_medium_001', 'impactSoft_medium_000', 'impactSoft_medium_001'), gain: 0.9 },
  'hit.heat': { files: from(SCI, 'thrusterFire_000', 'thrusterFire_001'), gain: 0.8, cap: 0.45 },
  'hit.cold': { files: from(IMP, 'impactGlass_light_000', 'impactGlass_light_001', 'impactGlass_light_002'), gain: 0.85 },
  'hit.toxic': { files: from(SCI, 'slime_000', 'slime_001'), gain: 0.9, cap: 0.6 },
  'hit.energy': { files: from(DIG, 'zap1', 'zap2'), gain: 0.7, cap: 0.8 },
  'hit.void': { files: from(DIG, 'phaserDown1', 'phaserDown2', 'phaserDown3'), gain: 0.8 },
  'hit.crit': { files: from(IMP, 'impactMetal_heavy_000', 'impactMetal_heavy_001', 'impactPlate_heavy_000'), gain: 1 },
  'hit.player': { files: from(IMP, 'impactPunch_heavy_000', 'impactPunch_heavy_001', 'impactPunch_heavy_002'), gain: 1 },
  miss: { files: from(RPG, 'knifeSlice', 'knifeSlice2', 'cloth2'), gain: 0.55 },
  'death.organic': { files: from(IMP, 'impactSoft_heavy_000', 'impactSoft_heavy_001').concat(from(SCI, 'slime_000')), gain: 1 },
  'death.machine': { files: from(SCI, 'explosionCrunch_002').concat(from(IMP, 'impactMetal_heavy_003', 'impactPlate_heavy_002')), gain: 1 },
  'death.player': { files: from(SCI, 'lowFrequency_explosion_001'), gain: 1 },
  'shot.light': { files: from(SCI, 'laserSmall_000', 'laserSmall_001', 'laserSmall_002'), gain: 0.6 },
  'shot.heavy': { files: from(SCI, 'laserLarge_000', 'laserLarge_001', 'laserLarge_002'), gain: 0.8 },
  'shot.enemy': { files: from(SCI, 'laserRetro_000', 'laserRetro_001', 'laserRetro_002'), gain: 0.55 },
  'melee.swing': { files: from(RPG, 'knifeSlice', 'knifeSlice2', 'drawKnife2'), gain: 0.7 },
  'melee.slam': { files: from(IMP, 'impactMining_000', 'impactMining_001', 'impactPlate_heavy_003'), gain: 1 },
  'explosion.small': { files: from(SCI, 'explosionCrunch_000', 'explosionCrunch_001'), gain: 0.9 },
  'explosion.large': { files: from(SCI, 'lowFrequency_explosion_000', 'explosionCrunch_004'), gain: 1 },
  'cast.tech': { files: from(DIG, 'phaserUp1', 'phaserUp2', 'phaserUp3'), gain: 0.7 },
  'cast.bio': { files: from(SCI, 'slime_001'), gain: 0.8, cap: 0.9 },
  'cast.shield': { files: from(SCI, 'forceField_000', 'forceField_001'), gain: 0.75 },
  'cast.blink': { files: from(DIG, 'phaseJump1', 'phaseJump2'), gain: 0.75 },
  'cast.summon': { files: from(DIG, 'powerUp1', 'powerUp3'), gain: 0.75 },
  'cast.trap': { files: from(RPG, 'metalLatch').concat(from(IMP, 'impactMetal_light_000')), gain: 0.85 },
  'cast.flame': { files: from(SCI, 'thrusterFire_002', 'thrusterFire_003'), gain: 0.75, cap: 0.8 },
  heal: { files: from(DIG, 'powerUp8', 'powerUp9'), gain: 0.7 },
  overheat: { files: from(DIG, 'zapThreeToneDown'), gain: 0.7 },
  telegraph: { files: from(DIG, 'lowThreeTone'), gain: 0.7 },
  footstep: { files: from(IMP, 'footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002', 'footstep_concrete_003'), gain: 0.5 },
  levelUp: { files: from(HIT, 'jingles_HIT15'), gain: 0.85 },
  'quest.start': { files: from(INT, 'question_002'), gain: 0.7 },
  'quest.step': { files: from(INT, 'confirmation_001'), gain: 0.7 },
  'quest.complete': { files: from(HIT, 'jingles_HIT11'), gain: 0.85 },
  discover: { files: from(INT, 'bong_001'), gain: 0.7 },
  'wave.start': { files: from(DIG, 'lowRandom'), gain: 0.8 },
  'wave.cleared': { files: from(HIT, 'jingles_HIT03'), gain: 0.8 },
  'boss.banner': { files: from(HIT, 'jingles_HIT09'), gain: 0.9 },
  zoneGate: { files: from(SCI, 'doorOpen_000', 'doorOpen_001'), gain: 0.9 },
  interact: { files: from(RPG, 'metalClick'), gain: 0.7 },
  'ui.click': { files: from(UI, 'click1', 'click3'), gain: 0.7 },
  'ui.hover': { files: from(UI, 'rollover2'), gain: 0.25 },
  'ui.open': { files: from(INT, 'open_001'), gain: 0.6 },
  'ui.close': { files: from(INT, 'close_001'), gain: 0.6 },
  'ui.error': { files: from(INT, 'error_001'), gain: 0.6 },
  'ui.equip': { files: from(RPG, 'beltHandle1', 'beltHandle2', 'clothBelt'), gain: 0.7 },
  'ui.coins': { files: from(RPG, 'handleCoins', 'handleCoins2'), gain: 0.7 },
};

/** id → source (5 s Kenney engine / computer noise), looped with a crossfade. */
const AMBIENCE: Record<(typeof AMBIENCE_IDS)[number], { file: string; gain: number }> = {
  'amb.industrial': { file: `${SCI}/spaceEngineLarge_000.ogg`, gain: 1 },
  'amb.hum': { file: `${SCI}/computerNoise_000.ogg`, gain: 1 },
  'amb.mine': { file: `${SCI}/spaceEngineLow_000.ogg`, gain: 1 },
};

/** id → Abstraction loop; they are already seamless, only the level changes. */
const MUSIC: Record<(typeof MUSIC_IDS)[number], { file: string; gain: number }> = {
  'music.menu': { file: 'abstraction/Week 19 - Dark Portents MYSTERIOUS TRAVELER.ogg', gain: 0.8 },
  'music.hub': { file: 'abstraction/Week 20 - Dust Bowl HOPE OF RAIN.ogg', gain: 0.8 },
  'music.cinder_flats': { file: 'abstraction/Week 20 - Dust Bowl PARCHED.ogg', gain: 0.8 },
  'music.refinery_district': { file: 'abstraction/Week 20.1 - Magnetic Tape SCUFFED.ogg', gain: 0.8 },
  'music.hydroponic_vaults': { file: 'abstraction/Week 13 - Primordial Soup BASE.ogg', gain: 0.8 },
  'music.deep_mines': { file: 'abstraction/Week 24 - Pull Me Down DEEP WELL.ogg', gain: 0.8 },
  'music.boss': { file: 'abstraction/Week 19 - Dark Portents SHROUDED FUTURE.ogg', gain: 0.8 },
  'music.boss_mines': { file: 'abstraction/Week 24 - Pull Me Down GRAVITY.ogg', gain: 0.8 },
};

interface Entry {
  id: SoundId;
  file: string;
  clips: { start: number; duration: number }[];
  loop: boolean;
  bus: SoundBus;
  gain: number;
}

// ---------------------------------------------------------------------------------------------
// ffmpeg and PCM helpers

const FFMPEG_BASE = ['-nostdin', '-y', '-loglevel', 'error'];

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', [...FFMPEG_BASE, ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

/** Decodes any audio file to float PCM at 44.1 kHz, one array per channel. */
function decode(file: string, channels: number): Float32Array[] {
  const raw = execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-i', file, '-ac', String(channels), '-ar', String(SR), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  const all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const n = Math.floor(all.length / channels);
  return Array.from({ length: channels }, (_, c) => Float32Array.from({ length: n }, (_, i) => all[i * channels + c]!));
}

/** 16-bit PCM WAV, any channel count. */
function wav(channels: Float32Array[]): Buffer {
  const nch = channels.length;
  const n = channels[0]!.length;
  const buf = Buffer.alloc(44 + n * nch * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * nch * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(nch, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * nch * 2, 28);
  buf.writeUInt16LE(nch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * nch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(channels[c]![i]! * 32768))), o);
      o += 2;
    }
  }
  return buf;
}

const db = (x: number) => 10 ** (x / 20);
const peakOf = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rmsOf = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

/**
 * The lag, in samples, at which `test` best matches `ref` over `len` samples from `from`
 * (positive: test is late). Brute-force cross-correlation; the windows are short.
 */
function lagOf(ref: Float32Array, test: Float32Array, from: number, len: number, maxLag: number): number {
  let best = 0;
  let bestSum = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = from; i < from + len; i++) sum += ref[i]! * (test[i + lag] ?? 0);
    if (sum > bestSum) {
      bestSum = sum;
      best = lag;
    }
  }
  return best;
}

function encodeOgg(wavFile: string, out: string): void {
  mkdirSync(dirname(out), { recursive: true });
  ffmpeg(['-i', wavFile, '-map_metadata', '-1', '-c:a', 'libvorbis', '-q:a', '3', out]);
}

function encodeMp3(wavFile: string, out: string, bitrate: string, gaplessTag: boolean): void {
  mkdirSync(dirname(out), { recursive: true });
  ffmpeg(['-i', wavFile, '-map_metadata', '-1', '-write_id3v2', '0', '-c:a', 'libmp3lame', '-b:a', bitrate, '-write_xing', gaplessTag ? '1' : '0', out]);
}

// ---------------------------------------------------------------------------------------------
// SFX

/** Trims silence, caps the length, fades the edges and normalises the peak. */
function sfxClip(x: Float32Array, cap: number): Float32Array {
  const thr = peakOf(x) * db(-48);
  let a = 0;
  while (a < x.length && Math.abs(x[a]!) <= thr) a++;
  let b = x.length;
  while (b > a && Math.abs(x[b - 1]!) <= thr) b--;
  let y = x.slice(a, Math.min(b, a + Math.round(cap * SR)));
  const capped = b - a > y.length;
  const fadeIn = Math.min(y.length, Math.round(0.001 * SR));
  const fadeOut = Math.min(y.length, Math.round((capped ? 0.12 : 0.008) * SR));
  for (let i = 0; i < fadeIn; i++) y[i]! *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) y[y.length - 1 - i]! *= i / fadeOut;
  const k = db(SFX_PEAK_DB) / peakOf(y);
  return y.map((v) => v * k);
}

interface Sprite {
  pcm: Float32Array;
  clips: Map<string, { start: number; length: number }>; // by source file + cap, in samples
}

function buildSprite(): Sprite {
  const clips: Sprite['clips'] = new Map();
  const parts: Float32Array[] = [];
  let pos = GAP;
  parts.push(new Float32Array(GAP));
  for (const [id, pick] of Object.entries(SFX)) {
    for (const file of pick.files) {
      const cap = pick.cap ?? SFX_CAP;
      const key = `${file}|${cap}`;
      if (clips.has(key)) continue; // the same source, processed the same way, is stored once
      const y = sfxClip(decode(join(SRC, file), 1)[0]!, cap);
      if (y.length < SR * 0.02) throw new Error(`${id}: ${file} is silent or shorter than 20 ms`);
      const padded = Math.ceil((y.length + GAP) / GRID) * GRID;
      clips.set(key, { start: pos, length: y.length });
      const part = new Float32Array(padded);
      part.set(y);
      parts.push(part);
      pos += padded;
    }
  }
  const pcm = new Float32Array(pos);
  let o = 0;
  for (const p of parts) {
    pcm.set(p, o);
    o += p.length;
  }
  return { pcm, clips };
}

/** Encodes the sprite and checks both encodings against the WAV. Returns nothing; throws on a mismatch. */
function encodeSprite(sprite: Sprite, tmp: string): void {
  const full = join(tmp, 'sfx.wav');
  writeFileSync(full, wav([sprite.pcm]));

  // Measure the mp3 delay: encode without compensation or header, decode, correlate.
  const probe = join(tmp, 'probe.mp3');
  encodeMp3(full, probe, '96k', false);
  const delay = lagOf(sprite.pcm, decode(probe, 1)[0]!, GAP, 2 * SR, 2400);
  if (delay < 500 || delay > 2000) throw new Error(`implausible mp3 delay ${delay} samples`);

  // Compensate: drop that many samples of the silent lead-in so the encoder's delay puts them back.
  const comp = join(tmp, 'sfx-mp3.wav');
  writeFileSync(comp, wav([sprite.pcm.subarray(delay)]));
  encodeOgg(full, join(OUT, 'sfx.ogg'));
  encodeMp3(comp, join(OUT, 'sfx.mp3'), '96k', false);

  const lags = (['ogg', 'mp3'] as const).map((ext) => {
    const back = decode(join(OUT, `sfx.${ext}`), 1)[0]!;
    if (back.length < sprite.pcm.length - 2) throw new Error(`sfx.${ext} decodes ${sprite.pcm.length - back.length} samples short`);
    return lagOf(sprite.pcm, back, GAP, 2 * SR, 64);
  });
  console.log(`  sfx sprite ${(sprite.pcm.length / SR).toFixed(1)} s; mp3 delay ${delay} samples; decode-back lag ogg ${lags[0]}, mp3 ${lags[1]}`);
  if (lags.some((l) => Math.abs(l) > 1)) throw new Error(`sprite offsets are off: lag ogg ${lags[0]}, mp3 ${lags[1]} samples`);
}

// ---------------------------------------------------------------------------------------------
// Ambience and music

/** A seamless loop: the last AMB_FADE seconds are crossfaded (equal power) into the first ones and dropped. */
function loopWithCrossfade(x: Float32Array): Float32Array {
  const f = Math.round(AMB_FADE * SR);
  const len = x.length - f;
  const out = x.slice(0, len);
  for (let i = 0; i < f; i++) {
    const t = ((i + 0.5) / f) * (Math.PI / 2);
    out[i] = x[i]! * Math.sin(t) + x[len + i]! * Math.cos(t);
  }
  return out;
}

function ambience(tmp: string, id: string, file: string): { duration: number } {
  const name = id.slice('amb.'.length);
  let y = loopWithCrossfade(decode(join(SRC, file), 1)[0]!);
  const k = Math.min(db(AMB_RMS_DB) / rmsOf(y), db(SFX_PEAK_DB) / peakOf(y));
  y = y.map((v) => v * k);
  const w = join(tmp, `${name}.wav`);
  writeFileSync(w, wav([y]));
  encodeOgg(w, join(OUT, 'amb', `${name}.ogg`));
  encodeMp3(w, join(OUT, 'amb', `${name}.mp3`), '96k', true);
  verifyLoop(`amb/${name}`, [y]);
  return { duration: y.length / SR };
}

/** Loudness of a file by ffmpeg's loudnorm analysis (integrated LUFS and true peak dBTP). */
function loudness(file: string): { lufs: number; truePeak: number } {
  const r = spawnSync('ffmpeg', ['-nostdin', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(r.stderr);
  if (!m) throw new Error(`loudnorm gave no measurement for ${file}`);
  const j = JSON.parse(m[0]) as { input_i: string; input_tp: string };
  return { lufs: Number(j.input_i), truePeak: Number(j.input_tp) };
}

function music(tmp: string, id: string, file: string): { duration: number; lufs: number } {
  const name = id.slice('music.'.length);
  const src = join(SRC, file);
  const m = loudness(src);
  // Plain gain (loudnorm's linear mode without its dynamic fallback), so the loop point is untouched.
  const gainDb = Math.min(MUSIC_LUFS - m.lufs, MUSIC_TP_DB - m.truePeak);
  const ch = decode(src, 2).map((c) => c.map((v) => v * db(gainDb)));
  const w = join(tmp, `${name}.wav`);
  writeFileSync(w, wav(ch));
  encodeOgg(w, join(OUT, 'music', `${name}.ogg`));
  encodeMp3(w, join(OUT, 'music', `${name}.mp3`), '128k', true);
  verifyLoop(`music/${name}`, ch);
  return { duration: ch[0]!.length / SR, lufs: m.lufs + gainDb };
}

/** Both encodings of a loop must decode to its exact length and line up with the source. */
function verifyLoop(file: string, ref: Float32Array[]): void {
  const n = ref[0]!.length;
  for (const ext of ['ogg', 'mp3'] as const) {
    const back = decode(join(OUT, `${file}.${ext}`), ref.length)[0]!;
    const lag = lagOf(ref[0]!, back, SR, SR, 64);
    if (Math.abs(back.length - n) > 1 || Math.abs(lag) > 1) {
      throw new Error(`${file}.${ext}: decodes ${back.length} samples (want ${n}), lag ${lag}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------

function checkSources(): void {
  for (const [dir, origin] of Object.entries(PACKS)) {
    if (!existsSync(join(SRC, dir))) {
      throw new Error(
        `Missing audio pack ${dir} in ${SRC}.\n` +
          `The sources are not committed: copy third-party/audio from the felixarvid2/assets repo into assets-src/third-party/audio/ (or point AUDIO_SRC at it), ` +
          `or download the pack yourself from ${origin} (all CC0).`,
      );
    }
  }
  const files = [...Object.values(SFX).flatMap((p) => p.files), ...Object.values(AMBIENCE).map((a) => a.file), ...Object.values(MUSIC).map((m) => m.file)];
  const absent = files.filter((f) => !existsSync(join(SRC, f)));
  if (absent.length) throw new Error(`Source files missing from ${SRC}:\n  ${absent.join('\n  ')}`);
}

function sizeOf(dir: string): number {
  return readdirSync(dir).reduce((sum, n) => {
    const p = join(dir, n);
    return sum + (statSync(p).isDirectory() ? sizeOf(p) : statSync(p).size);
  }, 0);
}

const num = (x: number) => String(Math.round(x * 1e6) / 1e6);

function writeCatalog(entries: Entry[]): void {
  const lines = entries.map(
    (e) =>
      `  '${e.id}': { id: '${e.id}', file: '${e.file}', clips: [${e.clips.map((c) => `{ start: ${num(c.start)}, duration: ${num(c.duration)} }`).join(', ')}], ` +
      `loop: ${e.loop}, bus: '${e.bus}', gain: ${num(e.gain)} },`,
  );
  writeFileSync(
    CATALOG,
    `// Generated by scripts/audio/build.ts (npm run audio:build); do not edit.\n` +
      `import type { SoundEntry, SoundId } from './soundIds';\n\n` +
      `export const SOUND_CATALOG: Record<SoundId, SoundEntry> = {\n${lines.join('\n')}\n};\n`,
  );
}

function main(): void {
  checkSources();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'ashfall-audio-'));
  try {
    const entries: Entry[] = [];

    const sprite = buildSprite();
    encodeSprite(sprite, tmp);
    for (const id of SFX_IDS) {
      const pick = SFX[id];
      const clips = pick.files.map((f) => {
        const c = sprite.clips.get(`${f}|${pick.cap ?? SFX_CAP}`)!;
        // Round the duration up (to 0.1 ms): the extra sliver is silence.
        return { start: c.start / SR, duration: Math.ceil((c.length / SR) * 1e4) / 1e4 };
      });
      entries.push({ id, file: 'sfx', clips, loop: false, bus: id.startsWith('ui.') ? 'ui' : 'sfx', gain: pick.gain });
    }

    for (const id of AMBIENCE_IDS) {
      const { duration } = ambience(tmp, id, AMBIENCE[id].file);
      entries.push({ id, file: `amb/${id.slice(4)}`, clips: [{ start: 0, duration }], loop: true, bus: 'sfx', gain: AMBIENCE[id].gain });
      console.log(`  ${id} ${duration.toFixed(3)} s`);
    }

    for (const id of MUSIC_IDS) {
      const { duration, lufs } = music(tmp, id, MUSIC[id].file);
      entries.push({ id, file: `music/${id.slice(6)}`, clips: [{ start: 0, duration }], loop: true, bus: 'music', gain: MUSIC[id].gain });
      console.log(`  ${id} ${duration.toFixed(3)} s at ${lufs.toFixed(1)} LUFS`);
    }

    writeCatalog(entries);
    const size = sizeOf(OUT);
    console.log(`✓ ${entries.length} sounds, ${(size / 1e6).toFixed(2)} MB in public/assets/audio, catalog → src/audio/catalog.gen.ts`);
    if (size > BUDGET) throw new Error(`public/assets/audio is ${(size / 1e6).toFixed(2)} MB, over the ${BUDGET / 1e6} MB budget`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
