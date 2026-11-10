import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CharacterAnimator } from '../src/render/animator';
import { BORROWED_STATES, borrowClips, hasSharedSkeleton, hipsHeight, retargetClip } from '../src/render/sharedClips';
import { ENEMY_DEFS } from '../src/data/db';
import { IDLE_ONLY_BASES, CLIP_DONOR_ID, VARIANTS, borrowsClips } from '../src/data/variants';
import { enemyAssetIds } from '../src/data/assetSets';

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8'));
const entries: { id: string; meshy?: { clips?: Record<string, string> } }[] = manifest.assets ?? manifest;

const JOINTS = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg'];
function skeleton(hips: number): THREE.Object3D {
  const root = new THREE.Object3D();
  const h = new THREE.Object3D();
  h.name = 'Hips';
  h.position.y = hips;
  root.add(h);
  for (const n of JOINTS.slice(1)) {
    const b = new THREE.Object3D();
    b.name = n;
    h.add(b);
  }
  return root;
}
function donorClip(name: string): THREE.AnimationClip {
  return new THREE.AnimationClip(name, 1, [
    new THREE.QuaternionKeyframeTrack('Spine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.7071, 0, 0.7071]),
    new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 1, 0, 0, 1.2, 0]),
    new THREE.VectorKeyframeTrack('Head.position', [0, 1], [0, 0.2, 0, 0, 0.2, 0]),
    new THREE.VectorKeyframeTrack('Head.scale', [0, 1], [1, 1, 1, 1, 1, 1]),
  ]);
}

/** The node names of a GLB (read from its JSON chunk). */
function glbNodes(path: string): string[] {
  const buf = readFileSync(new URL(`../public/assets/${path}`, import.meta.url));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  return json.nodes.map((n: { name?: string }) => n.name ?? '');
}

describe('A18 shared clips', () => {
  it('the real donor and every idle-only model share the same joint names', () => {
    const donor = new Set(glbNodes('enemies/sergeant.glb'));
    for (const e of entries.filter((x) => IDLE_ONLY_BASES.includes(x.id))) {
      const file = (e as unknown as { file: string }).file;
      const nodes = new Set(glbNodes(file));
      for (const j of JOINTS) {
        expect(donor.has(j)).toBe(true);
        expect(nodes.has(j)).toBe(true);
      }
    }
  });

  it('keeps rotations, scales the hips and drops other translations and scales', () => {
    const c = retargetClip(donorClip('walk'), 'borrowed.walk', 0.5);
    expect(c.tracks.map((t) => t.name).sort()).toEqual(['Hips.position', 'Spine.quaternion']);
    const hips = c.tracks.find((t) => t.name === 'Hips.position')!;
    expect(Array.from(hips.values).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0.5, 0, 0, 0.6, 0]);
    expect(c.duration).toBe(1);
  });

  it('fills the missing states from the donor, but not for a model with its own walk', () => {
    const own = new Map([['idle', new THREE.AnimationClip('idle', 1, [])]]);
    const donor = new Map(['idle', ...BORROWED_STATES].map((s) => [s, donorClip(s)] as const));
    const out = borrowClips(own, donor, 1);
    for (const s of BORROWED_STATES) expect(out.has(s)).toBe(true);
    expect(out.get('idle')).toBe(own.get('idle'));
    const withWalk = new Map([...own, ['walk', new THREE.AnimationClip('walk', 1, [])] as const]);
    expect(borrowClips(withWalk, donor, 1).size).toBe(2);
  });

  it('a borrower animates: its animator plays walk and death after the borrowed clips arrive', () => {
    const body = skeleton(1.0);
    const animator = new CharacterAnimator(body, new Map([['idle', new THREE.AnimationClip('idle', 1, [])]]));
    animator.pendingBorrow = 'x';
    animator.play({ state: 'walk', loop: true });
    expect(animator.state).toBe('idle');
    expect(animator.has('death')).toBe(false);
    const donor = new Map(['idle', ...BORROWED_STATES].map((s) => [s, donorClip(s)] as const));
    animator.addClips(borrowClips(new Map(), donor, hipsHeight(body) / hipsHeight(skeleton(2))));
    animator.play({ state: 'walk', loop: true });
    expect(animator.state).toBe('walk');
    animator.play({ state: 'death', loop: false });
    expect(animator.state).toBe('death');
    expect(hasSharedSkeleton(body)).toBe(true);
    expect(hasSharedSkeleton(new THREE.Object3D())).toBe(false);
  });

  it('the idle-only list matches the manifest and the donor can really animate', () => {
    const idleOnly = entries.filter((e) => e.meshy?.clips?.idle === 'idle' && !e.meshy.clips.walk && !e.meshy.clips.run).map((e) => e.id).sort();
    expect([...IDLE_ONLY_BASES].sort()).toEqual(idleOnly);
    const donor = entries.find((e) => e.id === CLIP_DONOR_ID)!;
    for (const s of BORROWED_STATES) expect(donor.meshy?.clips?.[s]).toBeTruthy();
  });

  it('the Absorbed borrow, and their zone sets bring the donor along', () => {
    const borrowers = [...ENEMY_DEFS.values()].filter((d) => borrowsClips(d.assetId));
    expect(borrowers.map((d) => d.id)).toEqual(expect.arrayContaining(['absorbed_ostrow', 'absorbed_lenn', 'absorbed_danner']));
    for (const d of borrowers) {
      expect(VARIANTS.has(d.assetId) || IDLE_ONLY_BASES.includes(d.assetId)).toBe(true);
      expect(enemyAssetIds([d.id])).toContain(CLIP_DONOR_ID);
    }
    expect(enemyAssetIds(['sergeant'])).toContain(CLIP_DONOR_ID);
  });
});
