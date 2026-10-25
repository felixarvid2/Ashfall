/**
 * The Core's music, synthesised for `npm run audio:build` (no source files, so no licence to record):
 *
 *  the_core   a 60 s drone and wordless choir: a sub root with a slow fifth, and six detuned voices through
 *             a vowel "ah" formant curve that swell in and out out of step with each other
 *  boss_core  a 40 s variation: the same choir a half step lower in the root, a double-beat pulse underneath and a
 *             rising swell every ten seconds
 *
 * Every oscillator, swell and vibrato completes a whole number of cycles inside the loop and the echo
 * wraps around, so the loop point is seamless. Output is stereo float PCM at `sr`, roughly unit scale
 * (the builder normalises the loudness afterwards).
 */

const TAU = Math.PI * 2;

/** Frequency snapped so it completes a whole number of cycles in `seconds`. */
export const snapToLoop = (freq: number, seconds: number): number => Math.max(1, Math.round(freq * seconds)) / seconds;

/** Equal-tempered frequency of a MIDI note. */
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Strength of harmonic `h` of a voice at `f0` for the vowel "ah" (formants near 700, 1100, 2600 Hz). */
function formant(f0: number, h: number): number {
  const f = f0 * h;
  const band = (centre: number, width: number, gain: number) => gain * Math.exp(-(((f - centre) / width) ** 2));
  return 0.12 + band(700, 260, 1) + band(1100, 300, 0.7) + band(2600, 500, 0.35);
}

interface Voice {
  note: number;
  /** -1 (left) .. 1 (right). */
  pan: number;
  /** Swell cycles per loop and where in its cycle the voice starts (0..1). */
  swells: number;
  phase: number;
  level: number;
}

interface Piece {
  seconds: number;
  root: number;
  voices: Voice[];
  /** Beats in the loop for the pulse; 0 for none. */
  beats: number;
  /** Echo taps (seconds, level) wrapped around the loop. */
  echo: [number, number][];
}

function render(piece: Piece, sr: number): Float32Array[] {
  const n = Math.round(piece.seconds * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const rootF = snapToLoop(midi(piece.root), piece.seconds);
  const subF = snapToLoop(rootF / 2, piece.seconds);
  const fifthF = snapToLoop(rootF * 0.75, piece.seconds);

  // Choir voices: harmonics 1..14, vowel-weighted, with a slow vibrato and a swell that rests near silence.
  for (const v of piece.voices) {
    const f0 = snapToLoop(midi(v.note), piece.seconds);
    const vibHz = snapToLoop(4.8, piece.seconds);
    const vibDepth = 0.0035;
    const gl = Math.cos(((v.pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((v.pan + 1) * Math.PI) / 4);
    const harmonics: number[] = [];
    for (let h = 1; h <= 14; h++) harmonics.push(formant(f0, h) / h);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const swell = 0.5 - 0.5 * Math.cos(TAU * (v.swells * (t / piece.seconds) + v.phase));
      const amp = v.level * (0.08 + 0.92 * swell * swell);
      const vib = vibDepth * Math.sin(TAU * vibHz * t) * Math.sin(Math.PI * Math.min(1, swell * 2));
      const ph = TAU * f0 * t + vib * TAU * f0 * 0.2;
      let s = 0;
      for (let h = 1; h <= 14; h++) s += harmonics[h - 1]! * Math.sin(ph * h);
      s *= amp;
      L[i]! += s * gl;
      R[i]! += s * gr;
    }
  }

  // Sub drone: root and fifth below, breathing slowly; the second partial drifts against the first.
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const breath = 0.75 + 0.25 * Math.sin(TAU * (2 * t) / piece.seconds);
    const sub = Math.sin(TAU * subF * t) * 0.9 + Math.sin(TAU * rootF * t) * 0.5 + Math.sin(TAU * fifthF * t) * 0.25;
    const drift = Math.sin(TAU * (rootF * 2 + 1 / piece.seconds * 3) * t) * 0.12;
    const s = (sub + drift) * breath * 0.55;
    L[i]! += s;
    R[i]! += s;
  }

  // Pulse (boss): a low double beat, every beat a sine that falls from 95 to 38 Hz.
  if (piece.beats > 0) {
    const beat = piece.seconds / piece.beats;
    for (let b = 0; b < piece.beats; b++) {
      for (const [offset, level] of [[0, 1], [0.34, 0.55]] as const) {
        const start = Math.floor((b * beat + offset * beat) * sr);
        const len = Math.floor(0.45 * sr);
        // A swell every tenth beat-group: the hit is harder at the top of each 10 s.
        const accent = b % Math.round(10 / beat) === 0 ? 1.35 : 1;
        for (let k = 0; k < len; k++) {
          const t = k / sr;
          const f = 38 + 57 * Math.exp(-t * 14);
          const env = Math.exp(-t * 7) * Math.min(1, t * 400);
          const s = Math.sin(TAU * f * t) * env * level * accent * 0.9;
          const idx = (start + k) % n;
          L[idx]! += s;
          R[idx]! += s;
        }
      }
    }
  }

  // Wrap-around echo (a few passes so the tails reach the loop's start): a cheap hall.
  const echoed = [new Float32Array(n), new Float32Array(n)];
  for (const [ch, src] of [L, R].entries()) {
    const out = echoed[ch]!;
    out.set(src);
    for (let pass = 0; pass < 3; pass++) {
      const prev = out.slice();
      for (const [delay, level] of piece.echo) {
        const d = Math.round((delay + ch * 0.013) * sr);
        for (let i = 0; i < n; i++) out[i]! += prev[(i - d + n * 4) % n]! * level;
      }
    }
  }
  return echoed;
}

/** Choir voices as D-minor stacks (MIDI notes), spread across the stereo field. */
const stack = (notes: number[], swells: number[]): Voice[] =>
  notes.map((note, i) => ({ note, pan: -0.8 + (1.6 * i) / (notes.length - 1), swells: swells[i]!, phase: i / notes.length, level: 0.5 }));

export const SYNTH_MUSIC: Record<string, (sr: number) => Float32Array[]> = {
  the_core: (sr) =>
    render(
      {
        seconds: 60,
        root: 38, // D2
        voices: stack([50, 57, 62, 65, 69, 74], [1, 2, 3, 2, 1, 3]),
        beats: 0,
        echo: [[0.41, 0.32], [0.67, 0.27], [1.13, 0.22]],
      },
      sr,
    ),
  boss_core: (sr) =>
    render(
      {
        seconds: 40,
        root: 37, // C#2, a half step from the Core's D: the boss unsettles the room
        voices: stack([49, 55, 61, 64, 68, 73], [2, 4, 3, 5, 2, 4]),
        beats: 40 / 0.625, // 96 beats per minute
        echo: [[0.29, 0.28], [0.53, 0.24], [0.89, 0.2]],
      },
      sr,
    ),
};
