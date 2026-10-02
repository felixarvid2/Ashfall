/**
 * Asset library: turns an asset id into a Three.js object.
 *
 * Until an asset reaches status "optimized" in assets/manifest.json, the
 * library builds its placeholder shape. When the Meshy pipeline (Phase 2)
 * marks an asset optimized, the same id resolves to the real model and every
 * entity using it switches over automatically.
 */
import * as THREE from 'three';
import manifestJson from '../../assets/manifest.json';
import { AssetManifestSchema, type AssetEntry } from '../data/assetManifest';

type Placeholder = AssetEntry['placeholder'];

export class AssetLibrary {
  private readonly entries = new Map<string, AssetEntry>();
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly materialCache = new Map<string, THREE.Material>();

  constructor(manifest: unknown = manifestJson) {
    const parsed = AssetManifestSchema.parse(manifest);
    for (const entry of parsed.assets) {
      if (this.entries.has(entry.id)) throw new Error(`Duplicate asset id: ${entry.id}`);
      this.entries.set(entry.id, entry);
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  entry(id: string): AssetEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown asset id: ${id}`);
    return entry;
  }

  /**
   * New Object3D for this asset. Geometry is shared; materials are shared too
   * unless `uniqueMaterial` is set (needed for per-entity hit flashes and tints).
   */
  create(id: string, uniqueMaterial = false): THREE.Object3D {
    // GLB loading for optimized assets arrives with the Meshy pipeline (Phase 2).
    const obj = this.buildPlaceholder(id, this.entry(id).placeholder);
    if (uniqueMaterial) {
      const body = obj.children[0];
      if (body instanceof THREE.Mesh) {
        body.material = (body.material as THREE.Material).clone();
        body.userData.baseEmissive = (body.material as THREE.MeshStandardMaterial).emissive.clone();
        body.userData.baseEmissiveIntensity = (body.material as THREE.MeshStandardMaterial).emissiveIntensity;
      }
    }
    return obj;
  }

  /** Shared geometry + material, for InstancedMesh use (debris, rocks, scrap). */
  instancingParts(id: string): { geometry: THREE.BufferGeometry; material: THREE.Material } {
    const p = this.entry(id).placeholder;
    return { geometry: this.geometry(p), material: this.material(p) };
  }

  private buildPlaceholder(id: string, p: Placeholder): THREE.Object3D {
    const root = new THREE.Group();
    root.name = id;
    const mesh = new THREE.Mesh(this.geometry(p), this.material(p));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);

    if (p.showFacing) {
      const visor = new THREE.Mesh(
        this.cachedGeometry('visor', () => new THREE.BoxGeometry(0.42, 0.14, 0.12)),
        this.cachedMaterial(`visor:${p.facingColor ?? '#ff8a2a'}`, () =>
          new THREE.MeshStandardMaterial({ color: 0x000000, emissive: p.facingColor ?? '#ff8a2a', emissiveIntensity: 3 }),
        ),
      );
      visor.position.set(0, p.size[1] * 0.82, p.size[2] * 0.42);
      root.add(visor);
    }
    return root;
  }

  /** Geometry with its pivot at the base (feet), so y = 0 stands on the ground. */
  private geometry(p: Placeholder): THREE.BufferGeometry {
    const [w, h, d] = p.size;
    const key = `${p.shape}:${w}:${h}:${d}`;
    return this.cachedGeometry(key, () => {
      let g: THREE.BufferGeometry;
      switch (p.shape) {
        case 'capsule': {
          const r = w / 2;
          g = new THREE.CapsuleGeometry(r, Math.max(0.01, h - 2 * r), 6, 14);
          break;
        }
        case 'box':
          g = new THREE.BoxGeometry(w, h, d);
          break;
        case 'cylinder':
          g = new THREE.CylinderGeometry(w / 2, w / 2, h, 12);
          break;
        case 'sphere':
          g = new THREE.SphereGeometry(0.5, 16, 10);
          g.scale(w, h, d);
          break;
      }
      g.translate(0, h / 2, 0);
      return g;
    });
  }

  private material(p: Placeholder): THREE.Material {
    const key = `${p.color}:${p.emissive ?? ''}:${p.emissiveIntensity ?? ''}`;
    return this.cachedMaterial(key, () => {
      const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85, metalness: 0.25 });
      if (p.emissive) {
        mat.emissive = new THREE.Color(p.emissive);
        mat.emissiveIntensity = p.emissiveIntensity ?? 1.6;
      }
      return mat;
    });
  }

  private cachedGeometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geometryCache.get(key);
    if (!g) {
      g = make();
      this.geometryCache.set(key, g);
    }
    return g;
  }

  private cachedMaterial(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.materialCache.get(key);
    if (!m) {
      m = make();
      this.materialCache.set(key, m);
    }
    return m;
  }
}
