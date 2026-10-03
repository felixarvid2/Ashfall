/**
 * Asset library: turns an asset id into a Three.js object.
 *
 * Until an asset reaches status "optimized" in assets/manifest.json, the
 * library builds its placeholder shape. When the Meshy pipeline (Phase 2)
 * marks an asset optimized, the same id resolves to the real model and every
 * entity using it switches over automatically.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import manifestJson from '../../assets/manifest.json';
import { AssetManifestSchema, type AssetEntry } from '../data/assetManifest';

type Placeholder = NonNullable<AssetEntry['placeholder']>;

/** Per-mesh material state used for hit flashes and status tints. */
export interface TintSlot {
  material: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseIntensity: number;
}

interface LoadedModel {
  levels: THREE.Object3D[];
  animations: THREE.AnimationClip[];
  skinned: boolean;
}

/** Distances (metres from the camera) at which LOD 1 and LOD 2 take over. */
const LOD_DISTANCES = [0, 26, 38];

export class AssetLibrary {
  private readonly entries = new Map<string, AssetEntry>();
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly materialCache = new Map<string, THREE.Material>();
  private readonly models = new Map<string, LoadedModel>();

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

  /** Load every optimized model listed in the manifest. Missing files fall back to placeholders. */
  async preload(baseUrl: string, onProgress?: (done: number, total: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    // The meshopt decoder is WebAssembly, which artifact pages may not run; their models arrive decoded.
    if (!EMBEDDED) loader.setMeshoptDecoder((await import('three/examples/jsm/libs/meshopt_decoder.module.js')).MeshoptDecoder);
    if (EMBEDDED) {
      // Artifact pages may only fetch their own files: textures come as data: images, which must load
      // through an <img> (TextureLoader), never through fetch (ImageBitmapLoader).
      loader.register((parser) => {
        parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
        return { name: 'ashfall_image_element_textures' };
      });
    }
    const todo = [...this.entries.values()].filter((e) => e.status === 'optimized' && e.file && e.category !== 'icon');
    let done = 0;
    await Promise.all(
      todo.map(async (entry) => {
        try {
          // Artifact builds ship one level per model (smaller download; the CPU cost of full detail is small).
          const files = EMBEDDED ? [entry.file!] : [entry.file!, ...(entry.lods ?? [])];
          const gltfs = await Promise.all(files.map((f) => loadModel(loader, `${baseUrl}assets/${modelFile(f)}`)));
          const levels = gltfs.map((g) => g.scene);
          if (entry.glow) {
            const glow = entry.glow;
            for (const level of levels) {
              level.traverse((o) => {
                const mat = (o as THREE.Mesh).material;
                if (mat instanceof THREE.MeshStandardMaterial) {
                  mat.emissive.set(glow.color);
                  mat.emissiveIntensity = glow.intensity;
                  mat.emissiveMap = mat.map;
                }
              });
            }
          }
          let skinned = false;
          for (const level of levels) {
            level.traverse((o) => {
              if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
              if ((o as THREE.Mesh).isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
              }
            });
          }
          this.models.set(entry.id, { levels, animations: gltfs[0]!.animations, skinned });
        } catch (err) {
          console.warn(`[assets] ${entry.id}: failed to load, using placeholder`, err);
        } finally {
          onProgress?.(++done, todo.length);
        }
      }),
    );
  }

  /** URL of an optimized 2D icon (category "icon"), or null if it hasn't been generated yet. */
  iconUrl(id: string, baseUrl: string): string | null {
    const entry = this.entries.get(id);
    return entry && entry.status === 'optimized' && entry.file ? `${baseUrl}assets/${entry.file}` : null;
  }

  /** True once a real (Meshy) model is loaded for this id. */
  hasModel(id: string): boolean {
    return this.models.has(id);
  }

  /** Animation clips by game state name ("idle", "run", "attack", …). */
  clips(id: string): Map<string, THREE.AnimationClip> {
    const map = new Map<string, THREE.AnimationClip>();
    const model = this.models.get(id);
    if (!model) return map;
    const names = this.entry(id).meshy.clips ?? {};
    for (const [state, clipName] of Object.entries(names)) {
      const clip = model.animations.find((c) => c.name === clipName);
      if (clip) map.set(state, clip);
    }
    return map;
  }

  /**
   * New Object3D for this asset: the loaded model (with LODs for static props) or its
   * placeholder. Geometry is shared; with `uniqueMaterial` each instance gets its own
   * materials so it can flash and tint (listed in userData.tint).
   */
  create(id: string, uniqueMaterial = false): THREE.Object3D {
    const model = this.models.get(id);
    let obj: THREE.Object3D;
    if (model) {
      if (model.skinned || model.levels.length === 1) {
        obj = new THREE.Group();
        obj.add(model.skinned ? cloneSkinned(model.levels[0]!) : model.levels[0]!.clone());
      } else {
        const lod = new THREE.LOD();
        model.levels.forEach((level, i) => lod.addLevel(level.clone(), LOD_DISTANCES[i] ?? 50 * i));
        obj = lod;
      }
      obj.name = id;
    } else {
      const placeholder = this.entry(id).placeholder;
      if (!placeholder) throw new Error(`Asset ${id} has no placeholder`);
      obj = this.buildPlaceholder(id, placeholder);
    }
    if (uniqueMaterial) {
      const tint: TintSlot[] = [];
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || o.userData.noTint) return;
        const mat = mesh.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        const own = mat.clone();
        mesh.material = own;
        tint.push({ material: own, baseEmissive: own.emissive.clone(), baseIntensity: own.emissiveIntensity });
      });
      obj.userData.tint = tint;
    }
    return obj;
  }

  /** Shared geometry + material, for InstancedMesh use (debris, rocks, scrap). */
  instancingParts(id: string): { geometry: THREE.BufferGeometry; material: THREE.Material } {
    const model = this.models.get(id);
    if (model && !model.skinned) {
      // Bake the first mesh's normalised transform into a geometry copy. Scatter uses the lightest
      // LOD: thousands of instances don't need the close-up mesh.
      const root = model.levels[model.levels.length - 1]!;
      root.updateMatrixWorld(true);
      let found: { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (found || !mesh.isMesh) return;
        found = {
          geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),
          material: Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material,
        };
      });
      if (found) return found;
    }
    const p = this.entry(id).placeholder;
    if (!p) throw new Error(`Asset ${id} has no placeholder`);
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
      visor.userData.noTint = true;
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

/**
 * The artifact build (npm run build:artifact) ships models as embedded glTF JSON, since claude.ai
 * artifacts don't serve .glb files.
 */
/** Artifact builds (npm run build:artifact) ship each model as `.glb.json`: `{ "glb": "<base64>" }`. */
const EMBEDDED = import.meta.env.VITE_MODEL_FORMAT === 'json';

function modelFile(file: string): string {
  return EMBEDDED ? file.replace(/\.glb$/, '.glb.json') : file;
}

async function loadModel(loader: GLTFLoader, url: string) {
  if (!EMBEDDED) return loader.loadAsync(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const { glb } = (await res.json()) as { glb: string };
  const bin = atob(glb);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, '');
}
