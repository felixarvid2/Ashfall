/**
 * Procedural wind for the Cinder Flats (no file): looped noise through a band-pass whose centre and
 * level drift on slow LFOs. `setIntensity` (0..1) raises the level and the pitch during an Ash Storm.
 */
export interface Wind {
  setIntensity(intensity: number, seconds: number): void;
  /** Silence the generator while the game is paused (and bring it back): a held breath, not a loop that carries on. */
  setPaused(paused: boolean, seconds: number): void;
  /** Fade out and release. */
  stop(seconds: number): void;
}

/** Level of the calm wind and the extra the storm adds (before the ambience bus). */
const CALM = 0.16;
const STORM = 0.5;

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Brown-ish noise (leaky integrator): rumbly rather than hissy.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

export function createWind(ctx: AudioContext, destination: AudioNode, fadeIn: number): Wind {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 4);
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.7;

  const out = ctx.createGain();
  out.gain.value = 0;
  // After `out`, so a pause does not fight the level ramps.
  const hold = ctx.createGain();

  // Slow gusts: one LFO swings the filter centre, another the level.
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.07;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 260;
  swell.connect(swellDepth).connect(filter.frequency);

  const gust = ctx.createOscillator();
  gust.frequency.value = 0.13;
  const gustDepth = ctx.createGain();
  gustDepth.gain.value = 0.05;
  gust.connect(gustDepth).connect(out.gain);

  src.connect(filter).connect(out).connect(hold).connect(destination);
  src.start();
  swell.start();
  gust.start();

  let level = CALM;
  const ramp = (to: number, seconds: number) => {
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(to, now + Math.max(0.01, seconds));
  };
  ramp(level, fadeIn);

  return {
    setIntensity(intensity, seconds) {
      const x = Math.max(0, Math.min(1, intensity));
      level = CALM + STORM * x;
      ramp(level, seconds);
      filter.frequency.setTargetAtTime(420 + 520 * x, ctx.currentTime, seconds / 3 + 0.01);
    },
    setPaused(paused, seconds) {
      hold.gain.setTargetAtTime(paused ? 0 : 1, ctx.currentTime, Math.max(0.01, seconds) / 3);
    },
    stop(seconds) {
      ramp(0, seconds);
      setTimeout(() => {
        for (const n of [src, swell, gust]) {
          try {
            n.stop();
          } catch {
            // Already stopped.
          }
        }
        out.disconnect();
        hold.disconnect();
      }, seconds * 1000 + 120);
    },
  };
}
