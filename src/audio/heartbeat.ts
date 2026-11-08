/**
 * Low-life heartbeat (C12): two soft low thumps every 1.3 s while life is under the threshold. Synthesised on the
 * game's AudioContext through the sfx bus (so the volume sliders and mute apply); silent with reduced motion.
 */
import { audio as engine } from './engine';

/** Life share under which the vignette and the heartbeat start. */
export const LOW_LIFE_SHARE = 0.25;
export const HEARTBEAT_PERIOD_MS = 1300;

let timer: ReturnType<typeof setInterval> | undefined;

function thump(offset: number, gain: number): void {
  const ctx = engine.context;
  const bus = engine.sfxBus;
  if (!ctx || !bus || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + offset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(78, t0);
  osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.16);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  osc.connect(g).connect(bus);
  osc.start(t0);
  osc.stop(t0 + 0.25);
}

/** One beat: a strong thump and a weaker one right after. */
export function playHeartbeat(): void {
  thump(0, 0.4);
  thump(0.22, 0.25);
}

/** Starts or stops the repeating heartbeat; safe to call every frame with the same value. */
export function setHeartbeat(on: boolean): void {
  if (!on) {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    return;
  }
  if (timer !== undefined) return;
  playHeartbeat();
  timer = setInterval(playHeartbeat, HEARTBEAT_PERIOD_MS);
}

export function heartbeatRunning(): boolean {
  return timer !== undefined;
}
