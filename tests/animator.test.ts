import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CharacterAnimator } from '../src/render/animator';

function clip(name: string, duration = 1): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [new THREE.VectorKeyframeTrack('.position', [0, duration], [0, 0, 0, 1, 1, 1])]);
}

function make(...states: string[]) {
  const root = new THREE.Object3D();
  const clips = new Map(states.map((s) => [s, clip(s, s === 'attack' ? 2 : 1)] as const));
  return { root, animator: new CharacterAnimator(root, clips) };
}

describe('CharacterAnimator clip selection', () => {
  it('plays a clip that exists', () => {
    const { animator } = make('idle', 'run');
    animator.play({ state: 'run', loop: true });
    expect(animator.state).toBe('run');
    expect(animator.has('run')).toBe(true);
    expect(animator.has('dodge')).toBe(false);
  });

  it('falls back through the chain: no run clip means walk, then idle', () => {
    const a = make('idle', 'walk').animator;
    a.play({ state: 'run', loop: true });
    expect(a.state).toBe('walk');
    const b = make('idle').animator;
    b.play({ state: 'run', loop: true });
    expect(b.state).toBe('idle');
    const c = make('idle', 'attack').animator;
    c.play({ state: 'shoot', loop: false });
    expect(c.state).toBe('attack');
  });

  it('ignores a request with no clip and no fallback, keeping the current one', () => {
    const { animator } = make('idle');
    animator.play({ state: 'idle', loop: true });
    animator.play({ state: 'death', loop: false });
    expect(animator.state).toBe('idle');
    animator.play({ state: 'unknown', loop: true });
    expect(animator.state).toBe('idle');
  });
});

const actionsOf = (animator: CharacterAnimator): Map<string, THREE.AnimationAction> =>
  (animator as unknown as { actions: Map<string, THREE.AnimationAction> }).actions;

describe('CharacterAnimator transitions', () => {
  it('cross-fades the previous action out while the new one comes in', () => {
    const { animator } = make('idle', 'run');
    animator.play({ state: 'idle', loop: true });
    animator.update(0.1);
    animator.play({ state: 'run', loop: true });
    animator.update(0.075); // halfway through the 0.15 s fade
    const actions = actionsOf(animator);
    const idle = actions.get('idle')!.getEffectiveWeight();
    const run = actions.get('run')!.getEffectiveWeight();
    expect(idle).toBeGreaterThan(0);
    expect(idle).toBeLessThan(1);
    expect(run).toBeGreaterThan(0);
    expect(run).toBeLessThan(1);
    animator.update(0.2);
    expect(actions.get('idle')!.getEffectiveWeight()).toBe(0);
    expect(actions.get('run')!.getEffectiveWeight()).toBe(1);
  });

  it('a loop request for the running state only retunes its speed', () => {
    const { animator } = make('idle', 'run');
    animator.play({ state: 'run', loop: true, speed: 1 });
    animator.update(0.4);
    const run = actionsOf(animator).get('run')!;
    const time = run.time;
    animator.play({ state: 'run', loop: true, speed: 1.8 });
    expect(run.timeScale).toBe(1.8);
    expect(run.time).toBe(time); // not restarted
  });

  it('restarts a one-shot only when the token changes', () => {
    const { animator } = make('idle', 'attack');
    animator.play({ state: 'attack', loop: false, token: 1 });
    animator.update(0.5);
    const attack = actionsOf(animator).get('attack')!;
    const time = attack.time;
    expect(time).toBeGreaterThan(0);
    animator.play({ state: 'attack', loop: false, token: 1 });
    expect(attack.time).toBe(time);
    animator.play({ state: 'attack', loop: false, token: 2 });
    expect(attack.time).toBe(0);
  });

  it('fits a one-shot into the requested time, within 0.5x to 4x', () => {
    const { animator } = make('attack'); // a 2 s clip
    let token = 0;
    const speedOf = (fit: number): number => {
      animator.play({ state: 'attack', loop: false, fit, token: ++token });
      return actionsOf(animator).get('attack')!.timeScale;
    };
    expect(speedOf(1)).toBeCloseTo(2);
    expect(speedOf(8)).toBe(0.5); // would be 0.25: clamped
    expect(speedOf(0.1)).toBe(4); // would be 20: clamped
  });
});
