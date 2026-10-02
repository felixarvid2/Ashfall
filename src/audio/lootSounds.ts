/**
 * Synthesised loot sounds (WebAudio, no files): each rarity has its own sound
 * (brief §5.6). Replaced or layered with the full audio system in Phase 8.
 */
import type { Rarity } from '../data/loot/schemas';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Browsers start audio suspended until a user gesture. */
export function unlockAudio(): void {
  void audio()?.resume();
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, gain: number, glideTo?: number): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function playDropSound(rarity: Rarity): void {
  switch (rarity) {
    case 'common':
      tone(420, 0, 0.08, 'square', 0.05);
      break;
    case 'magic':
      tone(660, 0, 0.18, 'triangle', 0.18);
      tone(990, 0.06, 0.2, 'sine', 0.1);
      break;
    case 'rare':
      tone(523, 0, 0.25, 'triangle', 0.22);
      tone(784, 0.08, 0.3, 'triangle', 0.18);
      tone(1046, 0.16, 0.35, 'sine', 0.12);
      break;
    case 'legendary':
    case 'unique':
      tone(110, 0, 0.9, 'sawtooth', 0.25, 55);
      tone(660, 0.1, 0.8, 'sine', 0.18);
      tone(990, 0.2, 0.9, 'sine', 0.14);
      tone(1320, 0.3, 1.0, 'sine', 0.1);
      break;
    case 'mythic':
      tone(80, 0, 1.6, 'sawtooth', 0.3, 40);
      for (let i = 0; i < 5; i++) tone(440 * Math.pow(1.5, i), i * 0.12, 1.2, 'sine', 0.12);
      break;
  }
}

export function playGoldSound(): void {
  tone(1800, 0, 0.05, 'square', 0.04);
  tone(2400, 0.04, 0.06, 'square', 0.03);
}

export function playPickupSound(): void {
  tone(300, 0, 0.08, 'triangle', 0.1, 600);
}
