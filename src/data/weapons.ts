/**
 * Weapons held by the playable classes: a model attached to a hand bone of the rigged character.
 * `grip` is where the hand closes, as a fraction of the weapon's length from its base; `rot` turns
 * the weapon into the hand (radians, about the hand bone's own axes).
 */
export interface WeaponMount {
  asset: string;
  bone: string;
  /** Length of the weapon in metres (its modelled height). */
  length: number;
  grip: number;
  rot: [number, number, number];
  /** Extra offset in metres in the hand's space (after rotation). */
  offset?: [number, number, number];
}

export const CLASS_WEAPONS: Record<string, WeaponMount[]> = {
  // Handle through the fist, head tilted up and back over the forearm.
  bastion: [{ asset: 'weapon.hydraulic_hammer', bone: 'RightHand', length: 1.3, grip: 0.15, rot: [2.1, 0, 0] }],
  spectre: [
    // Grip in the fist, barrel along the fingers (the model's barrel points −x).
    { asset: 'weapon.heavy_pistol', bone: 'RightHand', length: 0.22, grip: 0.3, rot: [Math.PI / 2, -Math.PI / 2, 0] },
    { asset: 'weapon.heavy_pistol', bone: 'LeftHand', length: 0.22, grip: 0.3, rot: [Math.PI / 2, -Math.PI / 2, 0] },
  ],
  // Held like a short sword, blade forward and a little down.
  xenomant: [{ asset: 'weapon.scalpel_blade', bone: 'RightHand', length: 0.85, grip: 0.12, rot: [1.3, 0, 0] }],
};
