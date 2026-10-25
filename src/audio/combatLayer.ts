/**
 * The combat layer (F023): a procedural drum bed that fades in over the music when danger rises (several
 * enemies hunting the player, or low life) and out again once it has passed. No file: the two-bar pattern is
 * synthesised into one buffer and looped, so it costs nothing to ship. It plays on the music bus, so the
 * duck, the pause and the music slider apply to it.
 */

/** Beats per minute of the bed (the music beneath is not tempo-synced, so it stays plain). */
export const COMBAT_BPM = 104;
/** Eighth-note steps in the two-bar loop. */
const STEPS = 16;
const KICK = [0, 3, 8, 11];
const SNARE = [4, 12];
const TOM = [6, 14];

/** Length of the loop in seconds. */
export const COMBAT_LOOP_SECONDS = (STEPS * 60) / (COMBAT_BPM * 2);

/** Deterministic noise, so the buffer is the same on every run (and testable). */
function noise(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}

/** One mono loop of the drum bed at `sampleRate`, peak below 1. Tails wrap, so it loops without a click. */
export function renderCombatLoop(sampleRate: number): Float32Array {
  const n = Math.round(COMBAT_LOOP_SECONDS * sampleRate);
  const out = new Float32Array(n);
  const step = n / STEPS;
  const rnd = noise(7);
  const add = (at: number, len: number, voice: (t: number) => number) => {
    const start = Math.floor(at);
    for (let k = 0; k < Math.floor(len * sampleRate); k++) out[(start + k) % n]! += voice(k / sampleRate);
  };
  for (const s of KICK) {
    add(s * step, 0.4, (t) => Math.sin(2 * Math.PI * (45 + 70 * Math.exp(-t * 18)) * t) * Math.exp(-t * 8) * Math.min(1, t * 500) * 0.8);
  }
  for (const s of TOM) {
    add(s * step, 0.35, (t) => Math.sin(2 * Math.PI * (82 + 40 * Math.exp(-t * 12)) * t) * Math.exp(-t * 9) * Math.min(1, t * 500) * 0.45);
  }
  for (const s of SNARE) {
    let lp = 0;
    add(s * step, 0.3, (t) => {
      // Low-passed noise with a short body: a dull, wide thud rather than a bright snare.
      lp += 0.35 * (rnd() - lp);
      return lp * Math.exp(-t * 14) * Math.min(1, t * 800) * 0.6;
    });
  }
  // Quiet shaker on the off-beats keeps the pulse moving between the hits.
  for (let s = 1; s < STEPS; s += 2) {
    let prev = 0;
    add(s * step, 0.06, (t) => {
      const v = rnd();
      const hp = v - prev;
      prev = v;
      return hp * Math.exp(-t * 60) * 0.07;
    });
  }
  return out;
}

export interface CombatLayer {
  /** Fade to `level` (0..1) over `seconds`. */
  setLevel(level: number, seconds: number): void;
  /** Fade out and release. */
  stop(seconds: number): void;
}

/** Start the layer at level 0 on `destination` (the music bus). */
export function createCombatLayer(ctx: AudioContext, destination: AudioNode): CombatLayer {
  const data = renderCombatLoop(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(out).connect(destination);
  src.start();
  const ramp = (to: number, seconds: number) => {
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(to, now + Math.max(0.01, seconds));
  };
  return {
    setLevel: (level, seconds) => ramp(level * LAYER_GAIN, seconds),
    stop(seconds) {
      ramp(0, seconds);
      setTimeout(() => {
        try {
          src.stop();
        } catch {
          // Already stopped.
        }
        out.disconnect();
      }, seconds * 1000 + 120);
    },
  };
}

/** The bed sits under the music. */
const LAYER_GAIN = 0.55;
