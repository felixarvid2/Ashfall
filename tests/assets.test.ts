import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeManifestSchema } from '../src/data/assetManifest';
import { AssetLibrary, shareLodTextures, type ModelLoader } from '../src/render/assets';
import { readRuntimeManifest, toRuntimeManifest } from '../scripts/assets/runtimeManifest';
import { readFileSync } from 'node:fs';

const placeholder = { shape: 'box' as const, color: '#888888', size: [1, 1, 1] as [number, number, number] };
const manifest = (files: Record<string, string[]>) => ({
  version: 1,
  assets: Object.entries(files).map(([id, [file, ...lods]]) => ({
    id,
    category: 'prop',
    status: 'optimized',
    file,
    ...(lods.length ? { lods } : {}),
    placeholder,
  })),
});

/** A model with one textured material (or an untextured one for LODs). */
function fakeModel(tex: THREE.Texture | null, name = 'mat') {
  const mat = new THREE.MeshStandardMaterial({ name });
  if (tex) {
    mat.map = tex;
    mat.normalMap = tex;
  }
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
  return { scene, animations: [] as THREE.AnimationClip[] };
}

describe('LOD texture sharing (T002)', () => {
  it('points LOD materials at the base model textures', () => {
    const tex = new THREE.Texture();
    const base = fakeModel(tex).scene;
    const lod1 = fakeModel(null).scene;
    const lod2 = fakeModel(null).scene;
    shareLodTextures([base, lod1, lod2]);
    const mat = (o: THREE.Object3D) => (o.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(mat(lod1).map).toBe(tex);
    expect(mat(lod2).map).toBe(tex);
    expect(mat(lod1).normalMap).toBe(tex);
  });

  it('pairs materials by name, else by order', () => {
    const a = new THREE.Texture();
    const b = new THREE.Texture();
    const scene = (n1: string, n2: string, ta: THREE.Texture | null, tb: THREE.Texture | null) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: n1, map: ta })));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: n2, map: tb })));
      return g;
    };
    const base = scene('x', 'y', a, b);
    const swapped = scene('y', 'x', null, null);
    const unnamed = scene('', '', null, null);
    shareLodTextures([base, swapped, unnamed]);
    const maps = (g: THREE.Group) => g.children.map((c) => ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).map);
    expect(maps(swapped)).toEqual([b, a]);
    expect(maps(unnamed)).toEqual([a, b]);
  });

  it('every LOD file in public/assets is texture-free and the library shares the base textures', async () => {
    const full = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as { assets: { lods?: string[] }[] };
    expect(full.assets.filter((a) => a.lods?.length).length).toBeGreaterThan(50);
    // The GLB JSON chunk lists images; a stripped LOD has none.
    for (const asset of full.assets) {
      for (const lod of asset.lods ?? []) {
        const b = readFileSync(new URL(`../public/assets/${lod}`, import.meta.url));
        const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { images?: unknown[] };
        expect(json.images ?? [], lod).toHaveLength(0);
      }
    }
  });
});

describe('AssetLibrary loading (T014, T003)', () => {
  const okLoader = (failing: (url: string) => boolean = () => false): { loader: ModelLoader; calls: string[] } => {
    const calls: string[] = [];
    const tex = new THREE.Texture();
    const loader: ModelLoader = async (url) => {
      calls.push(url);
      if (failing(url)) throw new Error('HTTP 404');
      return fakeModel(url.includes('_lod') ? null : tex);
    };
    return { loader, calls };
  };
  const lib = (m: unknown, loader: ModelLoader) => new AssetLibrary(m, { loader, retryDelayMs: 0, baseUrl: '/', lazy: false });

  it('keeps the model when only a LOD file is missing', async () => {
    const { loader, calls } = okLoader((u) => u.endsWith('_lod2.glb'));
    const assets = lib(manifest({ 'prop.a': ['props/a.glb', 'props/a_lod1.glb', 'props/a_lod2.glb'] }), loader);
    await assets.ensure(['prop.a']);
    expect(assets.hasModel('prop.a')).toBe(true);
    expect(assets.create('prop.a')).toBeInstanceOf(THREE.LOD);
    expect((assets.create('prop.a') as THREE.LOD).levels).toHaveLength(2);
    expect(assets.failed).toEqual([{ id: 'prop.a', file: 'props/a_lod2.glb', reason: 'HTTP 404' }]);
    // one retry of the failing file
    expect(calls.filter((c) => c.endsWith('_lod2.glb'))).toHaveLength(2);
  });

  it('a missing LOD 0 gives a placeholder and one failure entry', async () => {
    const { loader } = okLoader((u) => u.endsWith('/a.glb'));
    const assets = lib(manifest({ 'prop.a': ['props/a.glb', 'props/a_lod1.glb'] }), loader);
    await assets.ensure(['prop.a']);
    expect(assets.hasModel('prop.a')).toBe(false);
    expect(assets.create('prop.a').userData.placeholder).toBe(true);
    expect(assets.failed).toHaveLength(1);
  });

  it('a transient failure is retried once and nothing is recorded', async () => {
    let n = 0;
    const tex = new THREE.Texture();
    const assets = lib(manifest({ 'prop.a': ['props/a.glb'] }), async () => {
      if (n++ === 0) throw new Error('reset');
      return fakeModel(tex);
    });
    await assets.ensure(['prop.a']);
    expect(assets.hasModel('prop.a')).toBe(true);
    expect(assets.failed).toEqual([]);
  });

  it('ensure loads only what is missing, once, and tells listeners', async () => {
    const { loader, calls } = okLoader();
    const assets = lib(manifest({ 'prop.a': ['props/a.glb'], 'prop.b': ['props/b.glb'], 'prop.c': ['props/c.glb'] }), loader);
    const seen: string[] = [];
    assets.onModelLoaded((id) => seen.push(id));
    await Promise.all([assets.ensure(['prop.a', 'prop.b']), assets.ensure(['prop.b', 'prop.unknown'])]);
    await assets.ensure(['prop.a']);
    expect(calls.sort()).toEqual(['/assets/props/a.glb', '/assets/props/b.glb']);
    expect(seen.sort()).toEqual(['prop.a', 'prop.b']);
    expect(assets.hasModel('prop.c')).toBe(false);
  });

  it('fetches a model asked for before it is loaded, and says when it arrives', async () => {
    const { loader, calls } = okLoader();
    const assets = new AssetLibrary(manifest({ 'prop.a': ['props/a.glb'] }), { loader, retryDelayMs: 0, baseUrl: '/' });
    const seen: string[] = [];
    assets.onModelLoaded((id) => seen.push(id));
    expect(assets.create('prop.a').userData.placeholder).toBe(true);
    assets.create('prop.a');
    await vi.waitFor(() => expect(seen).toEqual(['prop.a']));
    expect(calls).toHaveLength(1);
    expect(assets.create('prop.a').userData.placeholder).toBeUndefined();
  });

  it('does not keep re-fetching a model whose file is missing', async () => {
    const { loader, calls } = okLoader(() => true);
    const assets = new AssetLibrary(manifest({ 'prop.a': ['props/a.glb'] }), { loader, retryDelayMs: 0, baseUrl: '/' });
    assets.create('prop.a');
    await vi.waitFor(() => expect(assets.failed).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 5));
    const n = calls.length;
    assets.create('prop.a');
    assets.create('prop.a');
    await new Promise((r) => setTimeout(r, 5));
    expect(calls.length).toBe(n);
  });

  it('shares LOD textures with LOD 0 after loading', async () => {
    const { loader } = okLoader();
    const assets = lib(manifest({ 'prop.a': ['props/a.glb', 'props/a_lod1.glb'] }), loader);
    await assets.ensure(['prop.a']);
    const lod = assets.create('prop.a') as THREE.LOD;
    const map = (o: THREE.Object3D) => ((o.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).map;
    expect(map(lod.levels[1]!.object)).toBe(map(lod.levels[0]!.object));
    expect(map(lod.levels[0]!.object)).not.toBeNull();
  });
});

describe('runtime manifest (T006)', () => {
  it('keeps every entry but none of the pipeline bookkeeping', () => {
    const full = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as { assets: Record<string, unknown>[] };
    const slim = readRuntimeManifest();
    expect(slim.assets.map((a) => a.id)).toEqual(full.assets.map((a) => a.id));
    const text = JSON.stringify(slim);
    expect(text).not.toContain('"prompt"');
    expect(text).not.toContain('previewTaskId');
    expect(text.length).toBeLessThan(JSON.stringify(full).length / 2);
    expect(RuntimeManifestSchema.safeParse(slim).success).toBe(true);
    // The library reads the slim form, and the full file still parses for anything that passes it.
    expect(() => new AssetLibrary(slim)).not.toThrow();
    expect(() => new AssetLibrary(full)).not.toThrow();
    const withClips = slim.assets.find((a) => a.meshy.clips);
    expect(withClips).toBeDefined();
    expect(toRuntimeManifest(full).assets.length).toBe(full.assets.length);
  });
});
