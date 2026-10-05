/**
 * Ground decals (generated with FLUX.2 Turbo): oil and blood stains, scorch marks, puddles, rubble,
 * hazard stripes, grates, manholes, footprints, tyre tracks, moss, crystal shards and bones, each
 * zone with its own set. They are scattered once when the zone is built (seeded, so a zone always
 * looks the same): along the roads and tunnels, around hubs, and loosely across open ground; never in
 * rock, molten metal or deep water. One instanced mesh per decal picture.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { caveGrid, walkableAt } from '../data/zones/caves';
import type { ArenaDef } from '../data/zones/testArena';
import type { EnvFeature, HubDef, Road } from '../data/zones/zoneTypes';
import { artUrl } from '../ui/art';

type DecalKey =
  | 'oil_stain' | 'blood_stain' | 'scorch_mark' | 'puddle' | 'rubble' | 'hazard_stripes' | 'manhole' | 'floor_grate'
  | 'tire_tracks' | 'footprints' | 'moss_patch' | 'lumen_growth' | 'bones' | 'crystal_shards';

/** Which decals each zone uses, with weights and a size range (m). */
const SETS: Record<string, [DecalKey, number, number, number][]> = {
  'zone.cinder_flats': [['scorch_mark', 3, 2.5, 5], ['oil_stain', 2, 1.5, 3], ['rubble', 3, 1.5, 3], ['tire_tracks', 2, 3, 5], ['blood_stain', 1, 1, 2], ['bones', 1, 1.5, 2.5], ['footprints', 1, 1.5, 2.5], ['lumen_growth', 1, 1.5, 3]],
  'zone.refinery_district': [['oil_stain', 3, 1.5, 3.5], ['hazard_stripes', 2, 2.5, 4], ['manhole', 2, 1.2, 1.8], ['floor_grate', 2, 1.2, 2], ['scorch_mark', 2, 2, 4], ['rubble', 2, 1.5, 3], ['tire_tracks', 2, 3, 5]],
  'zone.hydroponic_vaults': [['moss_patch', 3, 2, 4], ['puddle', 3, 1.5, 3.5], ['lumen_growth', 2, 1.5, 3], ['footprints', 2, 1.5, 2.5], ['floor_grate', 1, 1.2, 2], ['blood_stain', 1, 1, 2], ['bones', 1, 1.5, 2.5]],
  'zone.deep_mines': [['rubble', 3, 1.5, 3.5], ['puddle', 2, 1.5, 3], ['crystal_shards', 2, 1.5, 3], ['bones', 2, 1.5, 2.5], ['footprints', 2, 1.5, 2.5], ['lumen_growth', 1, 1.5, 3], ['oil_stain', 1, 1.5, 2.5]],
};

const textures = new Map<DecalKey, THREE.Texture>();
function texture(key: DecalKey): THREE.Texture | null {
  let t = textures.get(key);
  if (!t) {
    const url = artUrl(`decals/${key}`);
    if (!url) return null;
    t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures.set(key, t);
  }
  return t;
}

interface ZoneLike extends ArenaDef {
  roads?: Road[];
  hubs?: HubDef[];
  env?: EnvFeature[];
}

/** Scatter the zone's decals under `root`. Returns nothing to dispose (textures are shared). */
export function buildDecals(root: THREE.Object3D, arena: ArenaDef): void {
  const zone = arena as ZoneLike;
  const set = SETS[arena.id];
  if (!set) return;
  const rng = new Rng(`decals:${arena.id}`);
  const grid = caveGrid(arena as unknown as Parameters<typeof caveGrid>[0]);
  const lim = arena.halfSize - 4;
  const blocked = (x: number, z: number) =>
    Math.abs(x) > lim ||
    Math.abs(z) > lim ||
    (grid !== null && !walkableAt(grid, x, z)) ||
    (zone.env ?? []).some((f) => (f.kind === 'molten' || f.kind === 'water') && Math.hypot(x - f.x, z - f.z) < f.radius + 1);

  const spots: { x: number; z: number }[] = [];
  // Along roads and tunnels.
  for (const road of zone.roads ?? []) {
    for (let k = 0; k < road.points.length - 1; k++) {
      const [ax, az] = road.points[k]!;
      const [bx, bz] = road.points[k + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = rng.range(0, 14); d < len; d += rng.range(9, 20)) {
        const t = d / len;
        const off = rng.range(-0.5, 0.5) * road.width * 1.1;
        spots.push({ x: ax + (bx - ax) * t + ((az - bz) / len) * off, z: az + (bz - az) * t + ((bx - ax) / len) * off });
      }
    }
  }
  // Around hubs.
  for (const h of zone.hubs ?? []) {
    for (let i = 0; i < 10; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = h.radius * rng.range(0.5, 1.4);
      spots.push({ x: h.x + Math.sin(a) * r, z: h.z + Math.cos(a) * r });
    }
  }
  // Loosely across open ground (not underground, where only tunnels are open).
  if (!grid) for (let i = 0; i < 160; i++) spots.push({ x: rng.range(-lim, lim), z: rng.range(-lim, lim) });

  const total = set.reduce((n, s) => n + s[1], 0);
  const byKey = new Map<DecalKey, THREE.Matrix4[]>();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const s of spots) {
    if (blocked(s.x, s.z)) continue;
    let pick = rng.range(0, total);
    const entry = set.find((e) => (pick -= e[1]) < 0) ?? set[0]!;
    const size = rng.range(entry[2], entry[3]);
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    pos.set(s.x, 0.02 + rng.range(0, 0.008), s.z);
    scale.set(size, 1, size);
    const list = byKey.get(entry[0]) ?? [];
    list.push(new THREE.Matrix4().compose(pos, q, scale));
    byKey.set(entry[0], list);
  }
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const [key, mats] of byKey) {
    const map = texture(key);
    if (!map) continue;
    const material = new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      color: 0xc8c0b8,
    });
    const mesh = new THREE.InstancedMesh(plane, material, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    root.add(mesh);
  }
}
