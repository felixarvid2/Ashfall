/**
 * Synthesised loot sounds (WebAudio, no files): each rarity has its own sound
 * (brief §5.6). They share the game's AudioContext (`engine.ts`) and play through its sfx bus,
 * so the volume sliders and mute apply to them too.
 */
import type { Rarity } from '../data/loot/schemas';
import { audio as engine } from './engine';

/** The context this file's synth chain was built on, and its level before the sfx bus. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  const live = engine.context;
  const bus = engine.sfxBus;
  if (!live || !bus || live.state !== 'running') return null;
  if (ctx !== live) {
    ctx = live;
    master = live.createGain();
    master.gain.value = 0.35;
    master.connect(bus);
  }
  return ctx;
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

/** The drop sound of each rarity: a distinct id for the debug trail, and the hitstop that marks the best drops (F020). */
export const DROP_SOUNDS: Record<Rarity, { id: string; hitstopMs: number }> = {
  common: { id: 'loot.common', hitstopMs: 0 },
  magic: { id: 'loot.magic', hitstopMs: 0 },
  rare: { id: 'loot.rare', hitstopMs: 0 },
  legendary: { id: 'loot.legendary', hitstopMs: 0 },
  unique: { id: 'loot.unique', hitstopMs: 60 },
  mythic: { id: 'loot.mythic', hitstopMs: 60 },
};

/** Milliseconds the game freezes when this rarity drops (0 for most). */
export function dropHitstopMs(rarity: Rarity): number {
  return DROP_SOUNDS[rarity].hitstopMs;
}

/**
 * White: a dull thud. Blue: a two-note chime. Gold: a quick rising arpeggio. Legendary: that arpeggio with a
 * shimmer and a low swell. Unique and mythic: a sub-bass hit under a longer, wider rise.
 */
export function playDropSound(rarity: Rarity): void {
  if (!audio()) return;
  engine.record(DROP_SOUNDS[rarity].id);
  switch (rarity) {
    case 'common':
      tone(150, 0, 0.14, 'sine', 0.22, 70);
      tone(420, 0, 0.05, 'square', 0.03);
      break;
    case 'magic':
      tone(660, 0, 0.18, 'triangle', 0.18);
      tone(990, 0.07, 0.24, 'sine', 0.12);
      break;
    case 'rare':
      for (const [i, f] of [523, 659, 784, 1046].entries()) tone(f, i * 0.065, 0.28, 'triangle', 0.17);
      break;
    case 'legendary':
      tone(110, 0, 0.7, 'sawtooth', 0.12, 82);
      for (const [i, f] of [523, 659, 784, 1046, 1318].entries()) tone(f, i * 0.07, 0.5, 'triangle', 0.16);
      tone(2093, 0.3, 0.7, 'sine', 0.06);
      break;
    case 'unique':
      tone(55, 0, 1.0, 'sine', 0.4, 38);
      tone(110, 0, 0.9, 'sawtooth', 0.16, 55);
      for (const [i, f] of [392, 523, 659, 784, 988].entries()) tone(f, 0.05 + i * 0.09, 0.9, 'triangle', 0.15);
      break;
    case 'mythic':
      tone(48, 0, 1.6, 'sine', 0.45, 32);
      tone(80, 0, 1.6, 'sawtooth', 0.22, 40);
      for (let i = 0; i < 6; i++) tone(330 * Math.pow(1.5, i / 2), 0.05 + i * 0.12, 1.3, 'sine', 0.13);
      tone(2637, 0.5, 1.2, 'sine', 0.06);
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
