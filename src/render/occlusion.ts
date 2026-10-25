/**
 * Enemies hidden behind tall props (F018). A depth-tested "silhouette" pass would also paint every enemy's own far
 * limbs (it needs a stencil buffer on the composer targets to tell them apart), so this uses the cheaper cue: a ring
 * on the ground under each enemy that a tall prop hides from the camera, drawn with the depth test off. The test is
 * the one that already fades tall props in front of the hero (`propBlocksView`), run at 10 Hz over the few tall props
 * near the hero and the nearest enemies. Off on the "low" graphics setting.
 */
import * as THREE from 'three';
import { Dead, EnemyAI, Mover, Renderable, Transform } from '../core/components';
import type { Entity, World } from '../core/ecs';
import type { GraphicsQuality } from './postfx';

export const SILHOUETTE = {
  /** Props shorter than this never hide anyone (the same limit as the hero's see-through props). */
  minPropHeight: 4.5,
  /** Enemies this far from the hero (m) are considered, at most `maxMarkers` of them (nearest first). */
  range: 26,
  maxMarkers: 8,
  /** Seconds between occlusion tests, and between rebuilds of the tall-prop list. */
  testEvery: 0.1,
  propsEvery: 1,
  /** Tall props within this many metres of the hero are kept. */
  propRange: 40,
  /** Ring colour and peak opacity; seconds to fade in or out. */
  color: '#ff5a3a',
  opacity: 0.75,
  fade: 0.15,
} as const;

/** The cue is off on the "low" setting, where post-processing and shadows are off too. */
export function silhouetteEnabled(quality: GraphicsQuality): boolean {
  return quality !== 'low';
}

export interface Prop {
  x: number;
  z: number;
  /** Height and footprint radius in metres. */
  h: number;
  r: number;
}

/** Does `prop` stand between the camera and a creature at `target`? The ray runs from `eyeY` up to the camera. */
export function propBlocksView(cam: { x: number; y: number; z: number }, target: { x: number; z: number }, prop: Prop, eyeY = 1.4): boolean {
  if (prop.h < SILHOUETTE.minPropHeight) return false;
  const vx = cam.x - target.x;
  const vz = cam.z - target.z;
  const len2 = vx * vx + vz * vz;
  if (len2 < 1e-6) return false;
  const t = Math.max(0, Math.min(1, ((prop.x - target.x) * vx + (prop.z - target.z) * vz) / len2));
  if (t <= 0) return false;
  const d = Math.hypot(target.x + vx * t - prop.x, target.z + vz * t - prop.z);
  const rayY = eyeY + t * (cam.y - eyeY);
  return d < prop.r + 1.2 && rayY < prop.h;
}

/** Ids of the (at most `max`) nearest enemies within `range` of `hero` that some prop hides, nearest first. */
export function hiddenEnemies(
  enemies: readonly { id: number; x: number; z: number }[],
  props: readonly Prop[],
  cam: { x: number; y: number; z: number },
  hero: { x: number; z: number },
  range: number = SILHOUETTE.range,
  max: number = SILHOUETTE.maxMarkers,
): number[] {
  if (props.length === 0) return [];
  return enemies
    .map((e) => ({ e, d: Math.hypot(e.x - hero.x, e.z - hero.z) }))
    .filter((c) => c.d <= range)
    .sort((a, b) => a.d - b.d)
    .filter((c) => props.some((p) => propBlocksView(cam, c.e, p)))
    .slice(0, max)
    .map((c) => c.e.id);
}

interface Ring {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  alpha: number;
}

export class OcclusionCue {
  private readonly root = new THREE.Group();
  private readonly geo = new THREE.RingGeometry(0.62, 0.78, 28).rotateX(-Math.PI / 2);
  private readonly rings = new Map<Entity, Ring>();
  private readonly spare: Ring[] = [];
  private props: Prop[] = [];
  private propsAge = Infinity;
  private testAge = Infinity;
  private hidden = new Set<number>();
  private readonly enemyBuf: { id: number; x: number; z: number }[] = [];
  private time = 0;

  constructor(scene: THREE.Object3D) {
    this.root.renderOrder = 11;
    scene.add(this.root);
  }

  /**
   * `propSize` gives a prop model's height and radius; `objects` are the renderer's models (rings follow their
   * interpolated position). Nothing is queried or drawn while `enabled` is false.
   */
  update(
    world: World,
    objects: ReadonlyMap<Entity, THREE.Object3D>,
    cam: THREE.Vector3,
    hero: { x: number; z: number },
    dt: number,
    enabled: boolean,
    propSize: (assetId: string) => { h: number; r: number },
  ): void {
    this.time += dt;
    if (!enabled) {
      if (this.rings.size > 0) this.clear();
      this.propsAge = this.testAge = Infinity;
      return;
    }
    this.propsAge += dt;
    this.testAge += dt;
    if (this.propsAge >= SILHOUETTE.propsEvery) {
      this.propsAge = 0;
      this.props = [];
      for (const e of world.query(Renderable, Transform)) {
        if (world.has(e, Mover)) continue;
        const tr = world.req(e, Transform);
        if (Math.abs(tr.x - hero.x) > SILHOUETTE.propRange || Math.abs(tr.z - hero.z) > SILHOUETTE.propRange) continue;
        const r = world.req(e, Renderable);
        const size = propSize(r.assetId);
        const scale = r.scale ?? 1;
        if (size.h * scale >= SILHOUETTE.minPropHeight) this.props.push({ x: tr.x, z: tr.z, h: size.h * scale, r: size.r * scale });
      }
    }
    if (this.testAge >= SILHOUETTE.testEvery) {
      this.testAge = 0;
      const enemies = this.enemyBuf;
      enemies.length = 0;
      if (this.props.length > 0) {
        for (const e of world.query(EnemyAI, Transform)) {
          if (world.has(e, Dead)) continue;
          const tr = world.req(e, Transform);
          enemies.push({ id: e, x: tr.x, z: tr.z });
        }
      }
      this.hidden = new Set(hiddenEnemies(enemies, this.props, cam, hero));
    }
    this.animate(objects, dt);
  }

  private animate(objects: ReadonlyMap<Entity, THREE.Object3D>, dt: number): void {
    for (const id of this.hidden) {
      if (!this.rings.has(id as Entity) && objects.has(id as Entity)) this.rings.set(id as Entity, this.acquire());
    }
    const step = dt / SILHOUETTE.fade;
    for (const [id, ring] of this.rings) {
      const obj = objects.get(id);
      const show = this.hidden.has(id) && obj !== undefined;
      ring.alpha = show ? Math.min(1, ring.alpha + step) : Math.max(0, ring.alpha - step);
      if (ring.alpha <= 0 && !show) {
        this.release(id, ring);
        continue;
      }
      if (obj) {
        const s = 0.7 + Math.min(2, (obj.userData.baseScale as number | undefined) ?? 1) * 0.5;
        ring.mesh.position.set(obj.position.x, 0.06, obj.position.z);
        ring.mesh.scale.setScalar(s * (1 + Math.sin(this.time * 6 + id) * 0.04));
      }
      ring.material.opacity = SILHOUETTE.opacity * ring.alpha;
    }
  }

  private acquire(): Ring {
    const ring = this.spare.pop() ?? this.make();
    ring.alpha = 0;
    ring.mesh.visible = true;
    return ring;
  }

  private make(): Ring {
    const material = new THREE.MeshBasicMaterial({ color: SILHOUETTE.color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
    const mesh = new THREE.Mesh(this.geo, material);
    mesh.renderOrder = 11;
    this.root.add(mesh);
    return { mesh, material, alpha: 0 };
  }

  private release(id: Entity, ring: Ring): void {
    ring.mesh.visible = false;
    this.rings.delete(id);
    this.spare.push(ring);
  }

  private clear(): void {
    for (const [id, ring] of [...this.rings]) this.release(id, ring);
    this.hidden = new Set();
  }

  dispose(): void {
    this.clear();
    for (const ring of this.spare) ring.material.dispose();
    this.geo.dispose();
    this.root.removeFromParent();
  }
}
