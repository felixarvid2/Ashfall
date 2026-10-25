/**
 * Hand-held weapons built in code instead of loaded from a model file (WeaponMount.asset `procedural.<name>`).
 * Like the loaded ones they stand on y = 0 and reach up to `length` metres.
 */
import * as THREE from 'three';

const BRASS = '#b8893a';
const DARK_BRASS = '#6e5224';

/** A short brass haft with a lantern-censer on a chain: a cage of brass around a warm glowing core. */
function censer(length: number): THREE.Object3D {
  const group = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.85, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK_BRASS, metalness: 0.7, roughness: 0.5 });
  const core = new THREE.MeshBasicMaterial({ color: '#ffd878', fog: false });
  const handle = length * 0.72;
  const lantern = 0.1;
  const add = (mesh: THREE.Mesh, y: number): void => {
    mesh.position.y = y;
    group.add(mesh);
  };
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, handle, 8), dark), handle / 2);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), brass), handle);
  // The chain is a thin rod; the cage a faceted open sphere with a bright core and a cap.
  const chain = length - handle - lantern * 1.6;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, chain, 5), brass), handle + chain / 2);
  const centre = handle + chain + lantern * 0.9;
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(lantern, 1), new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.85, roughness: 0.35, wireframe: true })), centre);
  add(new THREE.Mesh(new THREE.SphereGeometry(lantern * 0.55, 12, 8), core), centre);
  add(new THREE.Mesh(new THREE.ConeGeometry(lantern * 0.55, lantern * 0.5, 8), brass), centre + lantern * 1.1);
  add(new THREE.Mesh(new THREE.CylinderGeometry(lantern * 0.5, lantern * 0.3, lantern * 0.3, 8), brass), centre - lantern * 1.05);
  return group;
}

const BUILDERS: Record<string, (length: number) => THREE.Object3D> = { censer };

/** The named procedural weapon, or an empty group for an unknown name. */
export function proceduralWeapon(name: string, length: number): THREE.Object3D {
  return BUILDERS[name]?.(length) ?? new THREE.Group();
}
