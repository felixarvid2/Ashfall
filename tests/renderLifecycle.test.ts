/** Resource lifecycle in the render layer without a GL context: owned-resource disposal and VFX pool trimming. */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeOwned, trackOwned } from '../src/render/owned';
import { VfxSystem } from '../src/render/vfx';

describe('owned render resources', () => {
  it('disposes exactly what the object tracks, once', () => {
    const obj = new THREE.Group();
    const own = new THREE.MeshBasicMaterial();
    const shared = new THREE.MeshBasicMaterial();
    const ownDispose = vi.spyOn(own, 'dispose');
    const sharedDispose = vi.spyOn(shared, 'dispose');
    trackOwned(obj, own);
    disposeOwned(obj);
    disposeOwned(obj);
    expect(ownDispose).toHaveBeenCalledTimes(1);
    expect(sharedDispose).not.toHaveBeenCalled();
  });

  it('does nothing for an object that owns nothing', () => {
    expect(() => disposeOwned(new THREE.Group())).not.toThrow();
  });
});

describe('VFX pools', () => {
  /** A VfxSystem without its constructor (which loads the sprite atlas); only the pool state is needed. */
  function bareVfx() {
    const vfx = Object.create(VfxSystem.prototype) as { pools: Map<string, unknown[]>; root: THREE.Group; acquire: (key: string, build: () => unknown) => { active: boolean }; trimPools(cap?: number): void };
    vfx.pools = new Map();
    vfx.root = new THREE.Group();
    return vfx;
  }

  it('trims idle entries beyond the cap, frees their own geometry and keeps active and shared ones', () => {
    const vfx = bareVfx();
    const shared = new THREE.CircleGeometry(1, 8);
    const sharedDispose = vi.spyOn(shared, 'dispose');
    const own: THREE.BufferGeometry[] = [];
    const mats: THREE.MeshBasicMaterial[] = [];
    const entries = [] as { active: boolean }[];
    for (let i = 0; i < 12; i++) {
      // Every acquire finds no idle entry (all are active), so each builds a new one.
      const fx = vfx.acquire('hazard:x:0.5', () => {
        const mat = new THREE.MeshBasicMaterial();
        const geo = new THREE.RingGeometry(0.5, 1, 8);
        mats.push(mat);
        own.push(geo);
        const group = new THREE.Group();
        group.add(new THREE.Mesh(shared, mat), new THREE.Mesh(geo, mat));
        return { group, materials: [mat], geometries: [geo] };
      });
      entries.push(fx);
    }
    expect(vfx.root.children.length).toBe(12);
    for (const fx of entries) fx.active = false;
    entries[0]!.active = true; // still playing: never trimmed
    const spies = own.map((g) => vi.spyOn(g, 'dispose'));
    const matSpies = mats.map((m) => vi.spyOn(m, 'dispose'));

    vfx.trimPools(8);

    expect(vfx.pools.get('hazard:x:0.5')!.length).toBe(9); // 8 idle + the active one
    expect(vfx.root.children.length).toBe(9);
    // The three oldest idle entries (indices 1 to 3) went; the active first entry and the newest eight stayed.
    expect(spies.filter((s) => s.mock.calls.length > 0).length).toBe(3);
    expect(matSpies.filter((s) => s.mock.calls.length > 0).length).toBe(3);
    expect(sharedDispose).not.toHaveBeenCalled();

    vfx.trimPools(0);
    expect(vfx.pools.get('hazard:x:0.5')!.length).toBe(1);
    entries[0]!.active = false;
    vfx.trimPools(0);
    expect(vfx.pools.has('hazard:x:0.5')).toBe(false);
    expect(sharedDispose).not.toHaveBeenCalled();
  });
});
