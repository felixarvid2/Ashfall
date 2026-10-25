/**
 * GPU resources that belong to one scene object (a cloned material, a per-entity sprite material) are listed in
 * `obj.userData.owned` and freed when the object is retired. Shared ones (cached asset materials, textures,
 * geometry reused across entities) are never listed, so they are never freed from under another entity.
 */
import type { Object3D } from 'three';

export interface Disposable {
  dispose(): void;
}

/** Mark a resource as owned by `obj`. */
export function trackOwned(obj: Object3D, resource: Disposable): void {
  ((obj.userData.owned ??= []) as Disposable[]).push(resource);
}

/** Free everything `obj` owns. Safe to call twice. */
export function disposeOwned(obj: Object3D): void {
  const owned = obj.userData.owned as Disposable[] | undefined;
  if (!owned) return;
  for (const resource of owned) resource.dispose();
  owned.length = 0;
}
