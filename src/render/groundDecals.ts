/**
 * Short-lived ground decals (round 4, D17): blood under organic deaths, oil under machines, ash under burned
 * enemies and scorch marks under explosions. A small pool of flat quads that fade out; the oldest is reused. The
 * pictures are the zone decals' (src/render/decals.ts), so nothing new is loaded.
 */
import * as THREE from 'three';
import { artUrl } from '../ui/art';

export type GroundDecalKind = 'blood' | 'oil' | 'ash' | 'scorch';

const PICTURE: Record<GroundDecalKind, { key: string; color: number; peak: number }> = {
  blood: { key: 'decals/blood_stain', color: 0xb04a42, peak: 0.75 },
  oil: { key: 'decals/oil_stain', color: 0x8a8a96, peak: 0.7 },
  ash: { key: 'decals/scorch_mark', color: 0x9a9690, peak: 0.55 },
  scorch: { key: 'decals/scorch_mark', color: 0xffffff, peak: 0.85 },
};

export const GROUND_DECAL_POOL = 40;
export const GROUND_DECAL_LIFE = 16;

/** Opacity factor 0..1 at `age`: full for the first 60 % of its life, then a linear fade. */
export function decalFade(age: number, life = GROUND_DECAL_LIFE): number {
  if (age >= life) return 0;
  const hold = life * 0.6;
  return age <= hold ? 1 : 1 - (age - hold) / (life - hold);
}

interface Slot {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  peak: number;
  active: boolean;
}

export class GroundDecals {
  readonly root = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly textures = new Map<string, THREE.Texture | null>();
  private readonly geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private next = 0;

  constructor() {
    this.root.name = 'groundDecals';
  }

  private texture(key: string): THREE.Texture | null {
    if (this.textures.has(key)) return this.textures.get(key)!;
    let tex: THREE.Texture | null = null;
    try {
      const url = artUrl(key);
      if (url) {
        tex = new THREE.TextureLoader().load(url);
        tex.colorSpace = THREE.SRGBColorSpace;
      }
    } catch {
      tex = null;
    }
    this.textures.set(key, tex);
    return tex;
  }

  /** Lay a decal at (x, z), `size` metres wide; returns false when its picture is missing. */
  add(kind: GroundDecalKind, x: number, z: number, size: number, rotation = 0): boolean {
    const pic = PICTURE[kind];
    const map = this.texture(pic.key);
    if (!map) return false;
    let slot = this.slots[this.next];
    if (!slot) {
      const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.renderOrder = 2;
      mesh.frustumCulled = true;
      this.root.add(mesh);
      slot = { mesh, material, age: 0, peak: 1, active: false };
      this.slots[this.next] = slot;
    }
    this.next = (this.next + 1) % GROUND_DECAL_POOL;
    slot.material.map = map;
    slot.material.color.setHex(pic.color);
    slot.material.needsUpdate = true;
    slot.mesh.position.set(x, 0.03 + (this.next % 5) * 0.002, z);
    slot.mesh.rotation.y = rotation;
    slot.mesh.scale.set(size, 1, size);
    slot.age = 0;
    slot.peak = pic.peak;
    slot.active = true;
    slot.mesh.visible = true;
    slot.material.opacity = pic.peak;
    return true;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      const f = decalFade(s.age);
      if (f <= 0) {
        s.active = false;
        s.mesh.visible = false;
      } else s.material.opacity = s.peak * f;
    }
  }

  get activeCount(): number {
    return this.slots.filter((s) => s.active).length;
  }

  dispose(): void {
    for (const s of this.slots) s.material.dispose();
    this.geometry.dispose();
    for (const t of this.textures.values()) t?.dispose();
  }
}
