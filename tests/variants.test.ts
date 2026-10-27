import { existsSync, readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { classAssetIds, enemyAssetIds, instanceAssetIds, zoneAssetIds, zoneLaterAssetIds } from '../src/data/assetSets';
import { ENEMY_DEFS } from '../src/data/db';
import { INSTANCES } from '../src/data/instances';
import { validateGameData } from '../src/data/validate';
import { RIG_JOINTS, VARIANTS, assetIdsOf, expandAssetIds, type VariantDef } from '../src/data/variants';
import { ZONES } from '../src/data/zones';
import { AssetLibrary, attachVariantParts, type ModelLoader } from '../src/render/assets';

const manifestFile = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as {
  assets: { id: string; category: string; source?: string; file?: string; lods?: string[]; rig?: unknown; stats?: { bytes: number } }[];
};
const byId = new Map(manifestFile.assets.map((a) => [a.id, a]));
const fileBytes = (rel: string) => statSync(new URL(`../public/assets/${rel}`, import.meta.url)).size;

describe('variant data', () => {
  it('a variant stands for its base and its distinct parts; other ids stand for themselves', () => {
    expect(assetIdsOf('enemy.infected_colonist')).toEqual(['enemy.infected_colonist']);
    const ids = assetIdsOf('variant.crystal_walker');
    expect(ids[0]).toBe('enemy.infected_colonist');
    expect(ids).toEqual(expect.arrayContaining(['part.crystal_cluster_large', 'part.crystal_cluster_small', 'part.crystal_shard']));
    // Three shards on the variant, one file.
    expect(ids.length).toBe(new Set(ids).size);
    expect(expandAssetIds(['variant.crystal_walker', 'enemy.infected_colonist', 'prop.barricade'])).toEqual([...ids, 'prop.barricade']);
  });

  it('every variant passes the data validation (base, parts and joints exist) and its files are on disk', () => {
    expect(validateGameData()).toEqual([]);
    for (const def of VARIANTS.values()) {
      // Only parts on a bone need a rig; unrigged bases (drones, hound, Slagborn, loader, tentacle, the First) take root parts.
      if (def.parts.some((p) => p.bone)) expect(byId.get(def.base)?.rig, `${def.id}: ${def.base} is rigged`).toBeTruthy();
      for (const part of def.parts) {
        const entry = byId.get(part.asset)!;
        expect(entry.category).toBe('part');
        expect(entry.source).toBe('blender');
        expect(existsSync(new URL(`../public/assets/${entry.file}`, import.meta.url)), part.asset).toBe(true);
        if (part.bone) expect(RIG_JOINTS).toContain(part.bone);
      }
    }
  });

  it('the Deep Mines crystal walker wears the variant, and the asset sets bring base and parts', () => {
    expect(ENEMY_DEFS.get('crystal_walker')!.assetId).toBe('variant.crystal_walker');
    expect(enemyAssetIds(['crystal_walker'])).toEqual(expect.arrayContaining(assetIdsOf('variant.crystal_walker')));
    const mines = ZONES.find((z) => z.id === 'zone.deep_mines')!;
    expect(zoneAssetIds(mines)).toEqual(expect.arrayContaining(assetIdsOf('variant.crystal_walker')));
    // Only manifest ids ever appear in a set, never the variant id itself.
    for (const id of [...zoneAssetIds(mines), ...zoneLaterAssetIds(mines), ...INSTANCES.flatMap(instanceAssetIds), ...classAssetIds('bastion')]) expect(byId.has(id), id).toBe(true);
  });

  it('a zone budget counts the parts: their files are among the zone entry files and add only a few KB', () => {
    const mines = ZONES.find((z) => z.id === 'zone.deep_mines')!;
    const files = new Set(zoneAssetIds(mines).flatMap((id) => [byId.get(id)!.file, ...(byId.get(id)!.lods ?? [])]));
    const parts = VARIANTS.get('variant.crystal_walker')!.parts.map((p) => byId.get(p.asset)!.file!);
    for (const f of parts) expect(files.has(f), f).toBe(true);
    const partBytes = [...new Set(parts)].reduce((s, f) => s + fileBytes(f), 0);
    expect(partBytes).toBeLessThan(40 * 1024);
  });

  it('parts are small: under 800 triangles and 12 KB each, no textures', () => {
    for (const a of manifestFile.assets.filter((x) => x.category === 'part')) {
      expect(a.lods ?? []).toEqual([]);
      expect(fileBytes(a.file!), a.id).toBeLessThan(12 * 1024);
      const stats = (a as unknown as { stats: { triangles: number; textures: number } }).stats;
      expect(stats.triangles, a.id).toBeLessThan(800);
      expect(stats.textures, a.id).toBe(0);
    }
  });
});

/** A rigged fake like Meshy's: an Armature scaled 0.01 over bones in centimetres, with rolled bones. */
function fakeRig(): { scene: THREE.Group; bones: Record<string, THREE.Bone> } {
  const scene = new THREE.Group();
  const armature = new THREE.Group();
  armature.name = 'Armature';
  armature.scale.setScalar(0.01);
  const make = (name: string, parent: THREE.Object3D, pos: [number, number, number], rollDeg: number): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    b.rotation.set(0, 0, THREE.MathUtils.degToRad(rollDeg));
    parent.add(b);
    return b;
  };
  const hips = make('Hips', armature, [0, 96, 0], 90);
  const spine = make('Spine02', hips, [0, 14, 0], 35);
  const head = make('Head', spine, [0, 40, 0], -20);
  const geo = new THREE.BoxGeometry(0.4, 1.7, 0.2);
  const count = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(count).fill(0).flatMap(() => [1, 0, 0, 0]), 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ name: 'skin', color: '#ffffff' }));
  const skeleton = new THREE.Skeleton([hips, spine, head]);
  scene.add(armature, mesh);
  scene.updateMatrixWorld(true);
  skeleton.calculateInverses();
  mesh.bind(skeleton);
  return { scene, bones: { Hips: hips, Spine02: spine, Head: head } };
}

function fakePart(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), new THREE.MeshStandardMaterial({ color })));
  return g;
}

const placeholder = { shape: 'box' as const, color: '#888888', size: [1, 1, 1] as [number, number, number] };
const FAKE_MANIFEST = {
  version: 1,
  assets: [
    { id: 'enemy.rigged', category: 'enemy', status: 'optimized', file: 'enemies/rigged.glb', placeholder, heightMeters: 1.7, meshy: { clips: { idle: 'idle' } } },
    { id: 'part.spike', category: 'part', status: 'optimized', file: 'parts/spike.glb' },
    { id: 'part.knob', category: 'part', status: 'optimized', file: 'parts/knob.glb' },
  ],
};
const FAKE_VARIANT: VariantDef = {
  id: 'variant.spiky',
  base: 'enemy.rigged',
  look: { tint: '#8899aa', roughness: 0.9 },
  parts: [
    { asset: 'part.spike', bone: 'Spine02', position: [0.1, 0.2, -0.3], rotation: [-40, 0, 10], scale: 1.5 },
    { asset: 'part.spike', bone: 'Head', position: [0, 0.1, 0] },
    { asset: 'part.knob', position: [0, 1.8, 0] },
  ],
};

function fakeLibrary(variant: VariantDef = FAKE_VARIANT, delay = false) {
  const loads: string[] = [];
  const loader: ModelLoader = async (url) => {
    loads.push(url);
    if (delay) await new Promise((r) => setTimeout(r, 5));
    if (url.endsWith('rigged.glb')) return { scene: fakeRig().scene, animations: [new THREE.AnimationClip('idle', 1, [])] };
    return { scene: fakePart(url.includes('knob') ? '#ff0000' : '#00ffff'), animations: [] };
  };
  const library = new AssetLibrary(FAKE_MANIFEST, { loader, baseUrl: '/', retryDelayMs: 0, variants: new Map([[variant.id, variant]]) });
  return { library, loads };
}

describe('AssetLibrary variants', () => {
  it('knows variant ids, sizes them like the base and takes their clips from it', async () => {
    const { library } = fakeLibrary();
    expect(library.has('variant.spiky')).toBe(true);
    expect(library.entry('variant.spiky').placeholder).toEqual(placeholder);
    expect(library.entry('variant.spiky').id).toBe('variant.spiky');
    await library.ensure(['variant.spiky']);
    expect([...library.clips('variant.spiky').keys()]).toEqual(['idle']);
  });

  it('gives a variant no clips while it still shows the placeholder (base loaded, a part pending)', async () => {
    const { library } = fakeLibrary();
    await library.ensure(['enemy.rigged']);
    expect(library.hasModel('variant.spiky')).toBe(false);
    expect(library.clips('variant.spiky').size).toBe(0);
    expect(library.clips('enemy.rigged').size).toBe(1);
    await library.ensure(['variant.spiky']);
    expect([...library.clips('variant.spiky').keys()]).toEqual(['idle']);
  });

  it('loads the base and each part once for a variant id, and counts as loaded when all are', async () => {
    const { library, loads } = fakeLibrary(FAKE_VARIANT, true);
    expect(library.hasModel('variant.spiky')).toBe(false);
    const ready: string[] = [];
    library.onModelLoaded((id) => ready.push(id));
    await library.ensure(['variant.spiky', 'enemy.rigged']);
    expect(loads.sort()).toEqual(['/assets/enemies/rigged.glb', '/assets/parts/knob.glb', '/assets/parts/spike.glb']);
    expect(library.hasModel('variant.spiky')).toBe(true);
    // The variant is announced once, only when its last piece has arrived.
    expect(ready.filter((id) => id === 'variant.spiky')).toHaveLength(1);
    expect(ready.lastIndexOf('variant.spiky')).toBeGreaterThan(ready.indexOf('part.knob') - 1);
  });

  it('shows the base placeholder under the variant id until everything is loaded, and fetches it', async () => {
    const { library, loads } = fakeLibrary();
    const obj = library.create('variant.spiky', true);
    expect(obj.name).toBe('variant.spiky');
    expect(obj.userData.placeholder).toBe(true);
    await vi.waitFor(() => expect(loads.length).toBe(3));
    await library.ensure(['variant.spiky']);
    const real = library.create('variant.spiky', true);
    expect(real.userData.placeholder).toBeUndefined();
  });

  it('attaches each part as a child of its bone (or the root), once, and the part follows the bone', async () => {
    const { library } = fakeLibrary();
    await library.ensure(['variant.spiky']);
    const obj = library.create('variant.spiky', true);
    const spine = obj.getObjectByName('Spine02')!;
    const head = obj.getObjectByName('Head')!;
    const onSpine = spine.children.filter((c) => c.userData.noTint);
    const onHead = head.children.filter((c) => c.userData.noTint);
    expect(onSpine).toHaveLength(1);
    expect(onHead).toHaveLength(1);
    expect(obj.children.filter((c) => c.userData.noTint)).toHaveLength(1); // the knob on the root
    expect(obj.children.find((c) => c.userData.noTint)!.position.y).toBeCloseTo(1.8);

    // At create the part sits where the def says: the joint's position plus the offset in model axes.
    obj.updateMatrixWorld(true);
    const joint = new THREE.Vector3().setFromMatrixPosition(spine.matrixWorld);
    const part = onSpine[0]!;
    expect(new THREE.Vector3().setFromMatrixPosition(part.matrixWorld).sub(joint).toArray()).toEqual([0.1, 0.2, -0.3].map((n) => expect.closeTo(n, 5)));
    // ... with the def's scale in world space, whatever the armature's 0.01 does.
    expect(new THREE.Vector3().setFromMatrixScale(part.matrixWorld).x).toBeCloseTo(1.5, 5);

    // Moving the bone (what the animation does) carries the part: its offset in the bone's frame stays put.
    const local = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld).applyMatrix4(spine.matrixWorld.clone().invert());
    spine.position.x += 7;
    spine.rotation.x += 0.6;
    obj.updateMatrixWorld(true);
    const after = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld);
    expect(after.distanceTo(joint)).toBeGreaterThan(0.01);
    expect(after.toArray()).toEqual(local.applyMatrix4(spine.matrixWorld).toArray().map((n) => expect.closeTo(n, 5)));
  });

  it('shares geometry and part materials between instances; the base materials carry the look, per variant', async () => {
    const { library } = fakeLibrary();
    await library.ensure(['variant.spiky']);
    const a = library.create('variant.spiky', false);
    const b = library.create('variant.spiky', false);
    const meshes = (o: THREE.Object3D) => {
      const out: THREE.Mesh[] = [];
      o.traverse((c) => (c as THREE.Mesh).isMesh && out.push(c as THREE.Mesh));
      return out;
    };
    const skin = (o: THREE.Object3D) => meshes(o).find((m) => (m as THREE.SkinnedMesh).isSkinnedMesh)!;
    const parts = (o: THREE.Object3D) => meshes(o).filter((m) => !(m as THREE.SkinnedMesh).isSkinnedMesh);
    const [skinA, skinB, partsA, partsB] = [skin(a), skin(b), parts(a), parts(b)];
    expect(partsA).toHaveLength(3);
    partsA.forEach((m, i) => {
      expect(m.geometry).toBe(partsB[i]!.geometry);
      expect(m.material).toBe(partsB[i]!.material);
    });
    expect(skinA!.geometry).toBe(skinB!.geometry);
    // Not unique: every instance shares the variant's painted base material, which is not the base model's own.
    const painted = skinA!.material as THREE.MeshStandardMaterial;
    expect(skinB!.material).toBe(painted);
    expect(painted.color.getHexString()).toBe('8899aa'); // tint x white
    expect(painted.roughness).toBe(0.9);
    const plain = fakeLibrary().library;
    await plain.ensure(['enemy.rigged']);
    expect((skin(plain.create('enemy.rigged')).material as THREE.MeshStandardMaterial).roughness).not.toBe(0.9);
  });

  it('with uniqueMaterial the base is cloned into tint slots (look kept), the parts are left out and stay shared', async () => {
    const { library } = fakeLibrary();
    await library.ensure(['variant.spiky']);
    const a = library.create('variant.spiky', true);
    const b = library.create('variant.spiky', true);
    const slots = a.userData.tint as { material: THREE.MeshStandardMaterial; baseEmissive: THREE.Color }[];
    expect(slots).toHaveLength(1);
    expect(slots[0]!.material.roughness).toBe(0.9);
    expect(slots[0]!.material).not.toBe((b.userData.tint as { material: THREE.Material }[])[0]!.material);
    const partMat = (o: THREE.Object3D) => (o.getObjectByName('Head')!.children.find((c) => c.userData.noTint)!.children[0] as THREE.Mesh).material;
    expect(partMat(a)).toBe(partMat(b));
    // Hit flashes write emissive into slots only: the parts keep their own material.
    expect(slots.map((s) => s.material)).not.toContain(partMat(a));
  });

  it('a bone the clone does not have falls back to the root with a warning, and a part that fails to load is left off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const def: VariantDef = { id: 'variant.lost', base: 'enemy.rigged', parts: [{ asset: 'part.spike', bone: 'Tail' }, { asset: 'part.knob' }] };
    const loader: ModelLoader = async (url) => {
      if (url.includes('knob')) throw new Error('404');
      if (url.endsWith('rigged.glb')) return { scene: fakeRig().scene, animations: [] };
      return { scene: fakePart('#00ffff'), animations: [] };
    };
    const library = new AssetLibrary(FAKE_MANIFEST, { loader, baseUrl: '/', retryDelayMs: 0, variants: new Map([[def.id, def]]) });
    await library.ensure(['variant.lost']);
    expect(library.hasModel('variant.lost')).toBe(true);
    const obj = library.create('variant.lost');
    expect(obj.children.filter((c) => c.userData.noTint)).toHaveLength(1); // the spike, on the root
    expect(warn.mock.calls.some((c) => String(c[0]).includes('no bone Tail'))).toBe(true);
    warn.mockRestore();
  });

  it('attachVariantParts without a skeleton puts parts at their offset from the root', () => {
    const root = new THREE.Group();
    const part = fakePart('#fff');
    expect(attachVariantParts(root, [{ def: { asset: 'x', position: [1, 2, 3], rotation: [0, 90, 0], scale: [1, 2, 1] }, object: part }])).toEqual([]);
    expect(part.parent).toBe(root);
    expect(part.position.toArray()).toEqual([1, 2, 3]);
    expect(part.scale.y).toBe(2);
    expect(part.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)))).toBeCloseTo(0, 5);
  });
});
