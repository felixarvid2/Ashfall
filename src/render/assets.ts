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
import runtimeManifest from 'virtual:asset-manifest';
import { RuntimeManifestSchema, type RuntimeEntry } from '../data/assetManifest';
import { VARIANTS, assetIdsOf, type VariantDef, type VariantMaterialLook, type VariantPart } from '../data/variants';
import { applyLookMaterials } from './looks';

type Placeholder = NonNullable<RuntimeEntry['placeholder']>;

/** Per-mesh material state used for hit flashes and status tints. */
export interface TintSlot {
  material: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseIntensity: number;
}

interface LoadedModel {
  levels: THREE.Object3D[];
  /** Distance (metres from the camera) at which each level takes over. */
  distances: number[];
  animations: THREE.AnimationClip[];
  skinned: boolean;
}

/** One model file that could not be loaded (after one retry). */
export interface AssetFailure {
  id: string;
  file: string;
  reason: string;
}

/** Fetches and parses one model file. Injectable so tests need no network or WebGL. */
export type ModelLoader = (url: string) => Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>;

export interface AssetLibraryOptions {
  loader?: ModelLoader;
  /** Wait before the single retry of a failed file (default 1 s). */
  retryDelayMs?: number;
  /** Where `assets/` lives (default the Vite base). */
  baseUrl?: string;
  /**
   * Fetch a model in the background when something asks for it before it is loaded (default true): the
   * caller gets the placeholder now and `onModelLoaded` fires when the real one arrives.
   */
  lazy?: boolean;
  /** Variant definitions (default: src/data/variants.ts); tests pass their own. */
  variants?: ReadonlyMap<string, VariantDef>;
}

/** Distances (metres from the camera) at which LOD 1 and LOD 2 take over. */
const LOD_DISTANCES = [0, 26, 38];
/** Models parsed at once; more only adds memory pressure on phones. */
const LOAD_CONCURRENCY = 6;

/** Texture slots a LOD material takes from the base model's material. */
const TEXTURE_SLOTS = ['map', 'normalMap', 'metalnessMap', 'roughnessMap', 'emissiveMap', 'aoMap'] as const;

/**
 * LOD files carry geometry and material parameters but no images (T002): point each LOD material's
 * textures at the base model's, so the image is decoded and uploaded once per model. Materials pair up
 * by name, else by order of first use (simplification keeps both). A texture the LOD brings itself is replaced.
 */
export function shareLodTextures(levels: THREE.Object3D[]): void {
  const materialsOf = (root: THREE.Object3D): THREE.MeshStandardMaterial[] => {
    const list: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const mats = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).material : null;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        if (m instanceof THREE.MeshStandardMaterial && !list.includes(m)) list.push(m);
      }
    });
    return list;
  };
  const base = levels[0];
  if (!base) return;
  const baseMats = materialsOf(base);
  const byName = new Map(baseMats.filter((m) => m.name).map((m) => [m.name, m]));
  for (const level of levels.slice(1)) {
    materialsOf(level).forEach((mat, i) => {
      const from = (mat.name ? byName.get(mat.name) : undefined) ?? baseMats[i];
      if (!from || from === mat) return;
      for (const slot of TEXTURE_SLOTS) {
        if (from[slot] && mat[slot] !== from[slot]) mat[slot] = from[slot];
      }
      mat.needsUpdate = true;
    });
  }
}

const DEG = Math.PI / 180;

/**
 * Attach variant parts under `root`. Each part sits where its def says in the model's own axes in the bind pose
 * (so the bone's roll and the armature's centimetre scale do not matter), as a child of the named bone (found in
 * `root`) or of `root`; from then on it moves with the bone for free. Returns the parts that found no bone.
 */
export function attachVariantParts(root: THREE.Object3D, parts: readonly { def: VariantPart; object: THREE.Object3D }[]): VariantPart[] {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const missing: VariantPart[] = [];
  const offset = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const { def, object } of parts) {
    const bone = def.bone ? root.getObjectByName(def.bone) : undefined;
    if (def.bone && !bone) missing.push(def);
    const [px, py, pz] = def.position ?? [0, 0, 0];
    const [rx, ry, rz] = def.rotation ?? [0, 0, 0];
    const s = def.scale ?? 1;
    pos.set(px, py, pz);
    quat.setFromEuler(euler.set(rx * DEG, ry * DEG, rz * DEG, 'XYZ'));
    if (typeof s === 'number') scale.setScalar(s);
    else scale.set(s[0], s[1], s[2]);
    offset.compose(pos, quat, scale);
    object.userData.noTint = true;
    object.traverse((o) => (o.userData.noTint = true));
    if (!bone) {
      offset.decompose(object.position, object.quaternion, object.scale);
      root.add(object);
      continue;
    }
    // The joint in root space (bind pose), then the wanted placement from there, then back into the bone's frame.
    const boneInRoot = rootInverse.clone().multiply(bone.matrixWorld);
    const joint = new THREE.Matrix4().makeTranslation(...new THREE.Vector3().setFromMatrixPosition(boneInRoot).toArray());
    const local = boneInRoot.clone().invert().multiply(joint).multiply(offset);
    local.decompose(object.position, object.quaternion, object.scale);
    bone.add(object);
  }
  return missing;
}

/** The look of a variant's base materials: `tint` multiplies the colour (textures stay), the rest replaces. */
function paintVariantMaterial(m: THREE.MeshStandardMaterial, look: VariantMaterialLook): void {
  if (look.tint) m.color.multiply(new THREE.Color(look.tint));
  if (look.emissive) m.emissive.set(look.emissive);
  if (look.emissiveIntensity !== undefined) m.emissiveIntensity = look.emissiveIntensity;
  if (look.roughness !== undefined) m.roughness = look.roughness;
  if (look.metalness !== undefined) m.metalness = look.metalness;
}

export class AssetLibrary {
  private readonly variants: ReadonlyMap<string, VariantDef>;
  /** Variants that need a given manifest id (base or part), to announce them when their last piece arrives. */
  private readonly dependents = new Map<string, string[]>();
  /** Per variant: the base's materials with the variant's look, shared by every instance. */
  private readonly variantMaterials = new Map<string, Map<THREE.Material, THREE.Material>>();
  private readonly variantEntries = new Map<string, RuntimeEntry>();
  private readonly entries = new Map<string, RuntimeEntry>();
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly materialCache = new Map<string, THREE.Material>();
  private readonly models = new Map<string, LoadedModel>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly listeners = new Set<(id: string) => void>();
  private readonly queue: (() => void)[] = [];
  /** Models whose full-detail file failed: not fetched again on demand. */
  private readonly gaveUp = new Set<string>();
  private running = 0;
  private loader: Promise<ModelLoader> | null = null;
  private baseUrl: string;
  /** Files that failed to load (after a retry), for the debug panel. */
  readonly failed: AssetFailure[] = [];

  constructor(manifest: unknown = runtimeManifest, private readonly options: AssetLibraryOptions = {}) {
    this.baseUrl = options.baseUrl ?? import.meta.env.BASE_URL;
    this.variants = options.variants ?? VARIANTS;
    const parsed = RuntimeManifestSchema.parse(manifest);
    for (const entry of parsed.assets) {
      if (this.entries.has(entry.id)) throw new Error(`Duplicate asset id: ${entry.id}`);
      this.entries.set(entry.id, entry);
    }
    for (const def of this.variants.values()) {
      if (this.entries.has(def.id)) throw new Error(`Variant id ${def.id} is also a manifest asset id`);
      for (const piece of new Set([def.base, ...def.parts.map((p) => p.asset)])) this.dependents.set(piece, [...(this.dependents.get(piece) ?? []), def.id]);
    }
  }

  /** Is this a known asset id: a manifest asset or a variant? */
  has(id: string): boolean {
    return this.entries.has(id) || this.variants.has(id);
  }

  /** The manifest entry; a variant answers with its base's (placeholder, height, clips) under its own id. */
  entry(id: string): RuntimeEntry {
    const variant = this.variants.get(id);
    if (variant) {
      let entry = this.variantEntries.get(id);
      if (!entry) {
        entry = { ...this.entry(variant.base), id };
        this.variantEntries.set(id, entry);
      }
      return entry;
    }
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown asset id: ${id}`);
    return entry;
  }

  /** Ids of every optimized 3D model in the manifest (icons are plain images). */
  modelIds(): string[] {
    return [...this.entries.values()].filter(isModel).map((e) => e.id);
  }

  /** Called whenever a model finishes loading, so the renderer can swap a placeholder for it. */
  onModelLoaded(cb: (id: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Load every optimized model listed in the manifest. Missing files fall back to placeholders. */
  async preload(baseUrl: string, onProgress?: (done: number, total: number) => void): Promise<void> {
    this.baseUrl = baseUrl;
    await this.ensure(this.modelIds(), onProgress);
  }

  /**
   * Load these models if they are not loaded yet (T003). Already loaded or loading ids are not fetched
   * again; unknown ids and entries without a model are skipped. A failed file never rejects: LOD 0
   * missing leaves the placeholder, a missing LOD just drops that level, and `failed` says what went wrong.
   */
  async ensure(ids: Iterable<string>, onProgress?: (done: number, total: number) => void): Promise<void> {
    // A variant stands for its base and its parts.
    const pieces = new Set<string>();
    for (const id of ids) for (const piece of assetIdsOf(id, this.variants)) pieces.add(piece);
    const todo = [...pieces].map((id) => this.entries.get(id)).filter((e): e is RuntimeEntry => !!e && isModel(e) && !this.models.has(e.id));
    for (const e of todo) this.gaveUp.delete(e.id);
    let done = 0;
    await Promise.all(
      todo.map(async (entry) => {
        try {
          let job = this.pending.get(entry.id);
          if (!job) {
            job = this.limited(() => this.loadEntry(entry)).finally(() => {
              this.pending.delete(entry.id);
              this.announceVariants(entry.id);
            });
            this.pending.set(entry.id, job);
          }
          await job;
        } finally {
          onProgress?.(++done, todo.length);
        }
      }),
    );
  }

  private limited<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.running++;
        task().then(resolve, reject).finally(() => {
          this.running--;
          this.queue.shift()?.();
        });
      };
      if (this.running < LOAD_CONCURRENCY) run();
      else this.queue.push(run);
    });
  }

  private async defaultLoader(): Promise<ModelLoader> {
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
    return (url) => loadModel(loader, url);
  }

  /** One file, retried once after a pause; the failure is recorded when the retry fails too. */
  private async loadFile(load: ModelLoader, entry: RuntimeEntry, file: string) {
    const url = `${this.baseUrl}assets/${modelFile(file)}`;
    try {
      return await load(url);
    } catch {
      // Retried once; the second failure is logged below.
      await new Promise((r) => setTimeout(r, this.options.retryDelayMs ?? 1000));
      try {
        return await load(url);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.failed.push({ id: entry.id, file, reason });
        console.warn(`[assets] ${entry.id}: ${file} failed to load (${reason})`);
        throw err;
      }
    }
  }

  private async loadEntry(entry: RuntimeEntry): Promise<void> {
    try {
      const load = await (this.loader ??= this.options.loader ? Promise.resolve(this.options.loader) : this.defaultLoader());
      // Artifact builds ship one level per model (smaller download; the CPU cost of full detail is small).
      const files = EMBEDDED ? [entry.file!] : [entry.file!, ...(entry.lods ?? [])];
      const results = await Promise.allSettled(files.map((f) => this.loadFile(load, entry, f)));
      // The full-detail level is required; a missing LOD only drops that level.
      if (results[0]!.status === 'rejected') {
        this.gaveUp.add(entry.id);
        return;
      }
      const gltfs: { index: number; gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } }[] = [];
      results.forEach((r, index) => {
        if (r.status === 'fulfilled') gltfs.push({ index, gltf: r.value });
      });
      const levels = gltfs.map((g) => g.gltf.scene);
      shareLodTextures(levels);
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
      this.models.set(entry.id, {
        levels,
        distances: gltfs.map((g) => LOD_DISTANCES[g.index] ?? 50 * g.index),
        animations: gltfs[0]!.gltf.animations,
        skinned,
      });
      for (const cb of this.listeners) cb(entry.id);
    } catch (err) {
      console.warn(`[assets] ${entry.id}: failed to load, using placeholder`, err);
    }
  }

  /** A piece of a variant finished (or gave up): tell the listeners about every variant that is now complete. */
  private announceVariants(pieceId: string): void {
    for (const id of this.dependents.get(pieceId) ?? []) if (this.hasModel(id)) for (const cb of this.listeners) cb(id);
  }

  /** URL of an optimized 2D icon (category "icon"), or null if it hasn't been generated yet. */
  iconUrl(id: string, baseUrl: string): string | null {
    const entry = this.entries.get(id);
    return entry && entry.status === 'optimized' && entry.file ? `${baseUrl}assets/${entry.file}` : null;
  }

  /**
   * True once a real model is loaded for this id. A variant counts when its base is loaded and each part is loaded
   * or given up on (a part that cannot be fetched is left off rather than keeping the placeholder forever).
   */
  hasModel(id: string): boolean {
    const variant = this.variants.get(id);
    if (!variant) return this.models.has(id);
    return this.models.has(variant.base) && variant.parts.every((p) => this.models.has(p.asset) || this.gaveUp.has(p.asset));
  }

  /**
   * Animation clips by game state name ("idle", "run", "attack", …). Empty while the id still shows its placeholder
   * (a variant whose base is loaded but a part is not): a mixer on a bone-less placeholder only warns about every track.
   */
  clips(id: string): Map<string, THREE.AnimationClip> {
    const map = new Map<string, THREE.AnimationClip>();
    if (!this.hasModel(id)) return map;
    const baseId = this.variants.get(id)?.base ?? id;
    const model = this.models.get(baseId);
    if (!model) return map;
    const names = this.entry(baseId).meshy.clips ?? {};
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
    const variant = this.variants.get(id);
    let obj: THREE.Object3D;
    if (variant ? this.hasModel(id) : this.models.has(id)) {
      obj = variant ? this.createVariant(variant) : this.instantiate(id);
      obj.name = id;
    } else {
      // (A variant shows its base's placeholder until the base and every part are loaded.)
      const entry = this.entry(id);
      const placeholder = entry.placeholder;
      if (!placeholder) throw new Error(`Asset ${id} has no placeholder`);
      obj = this.buildPlaceholder(id, placeholder);
      // A model nobody prefetched: show the placeholder now, swap when it arrives.
      if (this.options.lazy !== false && isModel(entry) && !this.gaveUp.has(variant ? variant.base : id)) void this.ensure([id]);
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

  /** A fresh copy of a loaded model: a Group around the clone, or a LOD of the levels of a static prop. */
  private instantiate(id: string): THREE.Object3D {
    const model = this.models.get(id)!;
    if (model.skinned || model.levels.length === 1) {
      const group = new THREE.Group();
      group.add(model.skinned ? cloneSkinned(model.levels[0]!) : model.levels[0]!.clone());
      return group;
    }
    const lod = new THREE.LOD();
    model.levels.forEach((level, i) => lod.addLevel(level.clone(), model.distances[i] ?? 50 * i));
    return lod;
  }

  /**
   * The base clone with the variant's look and its parts attached to their bones, once, here: nothing runs per
   * frame. Parts share geometry and materials with every other instance (and are left out of the tint slots, so
   * they do not flash with a hit); the base's materials carry the look, shared per variant until `create` clones
   * them for an entity that flashes.
   */
  private createVariant(def: VariantDef): THREE.Object3D {
    const base = this.instantiate(def.base);
    // Parts need a Group to hang from; a static prop's LOD gets one around it.
    const root = base instanceof THREE.Group ? base : new THREE.Group().add(base);
    if (def.look) this.paintVariant(root, def);
    const parts: { def: VariantPart; object: THREE.Object3D }[] = [];
    for (const part of def.parts) {
      const model = this.models.get(part.asset);
      if (!model) continue;
      const object = model.levels[0]!.clone();
      object.name = `part:${part.asset}`;
      parts.push({ def: part, object });
    }
    for (const part of attachVariantParts(root, parts)) console.warn(`[assets] ${def.id}: no bone ${part.bone} on ${def.base}, ${part.asset} attached to the root`);
    return root;
  }

  private paintVariant(root: THREE.Object3D, def: VariantDef): void {
    let swaps = this.variantMaterials.get(def.id);
    if (!swaps) this.variantMaterials.set(def.id, (swaps = new Map()));
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      let painted = swaps!.get(mesh.material);
      if (!painted) {
        const source = mesh.material;
        painted = source.clone();
        painted.name = `${source.name}:${def.id}`;
        if (painted instanceof THREE.MeshStandardMaterial && def.look) {
          if (typeof def.look === 'string') applyLookMaterials([{ material: painted }], def.look);
          else paintVariantMaterial(painted, def.look);
        }
        swaps!.set(source, painted);
      }
      mesh.material = painted;
    });
  }

  /** Shared geometry + material, for InstancedMesh use (debris, rocks, scrap). */
  /**
   * Geometry and material for instanced scatter, one part per mesh with its normalised transform
   * baked in. Thousands of debris instances use the lightest LOD; a few hundred pieces of clutter
   * lying by the roads (`detail: 'full'`) use the close-up mesh.
   */
  instancingParts(id: string, detail: 'low' | 'full' = 'low'): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
    const model = this.models.get(id);
    if (model && !model.skinned) {
      const root = detail === 'full' ? model.levels[0]! : model.levels[model.levels.length - 1]!;
      root.updateMatrixWorld(true);
      const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        // Instancing has no morph targets.
        geometry.morphAttributes = {};
        parts.push({
          geometry,
          material: Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material,
        });
      });
      if (parts.length) return parts;
    }
    const p = this.entry(id).placeholder;
    if (!p) throw new Error(`Asset ${id} has no placeholder`);
    return [{ geometry: this.geometry(p), material: this.material(p) }];
  }

  private buildPlaceholder(id: string, p: Placeholder): THREE.Object3D {
    const root = new THREE.Group();
    root.name = id;
    // The renderer swaps it for the real model if that finishes loading later (onModelLoaded).
    root.userData.placeholder = true;
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

/** An optimized 3D model with a file to load (icons are images, planned entries have nothing yet). */
function isModel(e: RuntimeEntry): boolean {
  return e.status === 'optimized' && !!e.file && e.category !== 'icon';
}

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
