/**
 * A18: shared animation clips. Every Meshy-rigged biped has the same 24-joint skeleton (`Hips`, `Spine`, `LeftUpLeg` …), but
 * some models (the town NPCs and the Absorbed built from them) were rigged with an idle clip only. They borrow the other
 * clips from a donor (the sergeant): only the joint rotations carry over, since bone lengths differ between bodies, and
 * the hips' translation is scaled by the ratio of the two hips heights.
 */
import * as THREE from 'three';

/** The states a borrower takes from the donor when it has none of its own. */
export const BORROWED_STATES = ['walk', 'attack', 'attack2', 'hit', 'death'] as const;

/** The joints the clips animate; a skeleton lacking any of these is not compatible. */
export const SHARED_JOINTS = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg'] as const;

/** Does this model carry the shared skeleton? */
export function hasSharedSkeleton(root: THREE.Object3D): boolean {
  return SHARED_JOINTS.every((n) => root.getObjectByName(n) !== undefined);
}

/** Local height of the hips in the rest pose (0 when there are none). */
export function hipsHeight(root: THREE.Object3D): number {
  return root.getObjectByName('Hips')?.position.y ?? 0;
}

/**
 * A copy of the donor's clip for another body: rotation tracks as they are, the hips' translation scaled by `hipsRatio`,
 * every other translation and every scale track dropped (they would stretch the borrower to the donor's proportions).
 */
export function retargetClip(clip: THREE.AnimationClip, name: string, hipsRatio: number): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const node = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);
    if (prop === 'quaternion' || prop === 'rotation') tracks.push(track.clone());
    else if (prop === 'position' && node === 'Hips') {
      const copy = track.clone();
      for (let i = 0; i < copy.values.length; i++) copy.values[i]! *= hipsRatio;
      tracks.push(copy);
    }
  }
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

/**
 * `own` plus a retargeted copy of each `BORROWED_STATES` clip the borrower lacks. The map is returned unchanged when the
 * borrower already has a walk clip of its own (a fully animated model keeps its own moves).
 */
export function borrowClips(
  own: ReadonlyMap<string, THREE.AnimationClip>,
  donor: ReadonlyMap<string, THREE.AnimationClip>,
  hipsRatio: number,
): Map<string, THREE.AnimationClip> {
  const out = new Map(own);
  if (own.has('walk')) return out;
  for (const state of BORROWED_STATES) {
    const clip = donor.get(state);
    if (clip && !out.has(state)) out.set(state, retargetClip(clip, `borrowed.${state}`, hipsRatio));
  }
  return out;
}
