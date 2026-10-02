/**
 * Plays a character's animation clips (from the Meshy rig/animation step) based
 * on what the entity is doing, with short cross-fades.
 */
import * as THREE from 'three';

export interface PlayRequest {
  state: string;
  loop: boolean;
  /** Fit a one-shot clip into this many seconds (e.g. a skill's wind-up + recovery). */
  fit?: number;
  /** Playback speed multiplier for loops (e.g. scale the run cycle with movement speed). */
  speed?: number;
  /** Changes when the same one-shot should restart (new swing). */
  token?: unknown;
}

const FALLBACKS: Record<string, string[]> = {
  run: ['walk', 'idle'],
  walk: ['run', 'idle'],
  cast: ['attack', 'idle'],
  attack2: ['attack', 'idle'],
  attack: ['idle'],
  hit: [],
  death: [],
  idle: [],
};

export class CharacterAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: { state: string; action: THREE.AnimationAction; token: unknown } | null = null;

  constructor(root: THREE.Object3D, clips: Map<string, THREE.AnimationClip>) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const [state, clip] of clips) this.actions.set(state, this.mixer.clipAction(clip));
  }

  has(state: string): boolean {
    return this.actions.has(state);
  }

  /** Resolve a state to an available clip using fallbacks (no run clip → walk → idle). */
  private resolve(state: string): string | null {
    if (this.actions.has(state)) return state;
    for (const alt of FALLBACKS[state] ?? []) if (this.actions.has(alt)) return alt;
    return null;
  }

  play(req: PlayRequest): void {
    const state = this.resolve(req.state);
    if (!state) return;
    const action = this.actions.get(state)!;
    const same = this.current?.state === state && (req.loop || this.current.token === req.token);
    if (same) {
      if (req.loop && req.speed !== undefined) action.timeScale = req.speed;
      return;
    }
    const duration = action.getClip().duration;
    action.reset();
    action.setLoop(req.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !req.loop;
    action.timeScale = req.fit ? THREE.MathUtils.clamp(duration / req.fit, 0.5, 4) : (req.speed ?? 1);
    action.play();
    const fade = state === 'death' ? 0.1 : 0.15;
    if (this.current && this.current.action !== action) this.current.action.crossFadeTo(action, fade, false);
    this.current = { state, action, token: req.token };
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  get state(): string | null {
    return this.current?.state ?? null;
  }
}
