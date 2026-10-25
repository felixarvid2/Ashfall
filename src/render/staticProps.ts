/**
 * Plain static props (T015): the arena's trees, pipes and crates have a Transform, a Renderable and maybe a collider
 * and nothing else. They never move, animate, flash or tint, so the per-frame sync only has to keep them culled by
 * distance and faded when they hide the hero. This holds those entities apart from the per-frame loop: placed once on
 * creation, re-checked for edits and distance-culled when the camera has moved a couple of metres, and the tall ones
 * (the only ones that can hide the hero) tested again when the camera or the hero moved.
 */
import type * as THREE from 'three';
import type { Renderable, Transform } from '../core/components';
import type { Entity } from '../core/ecs';

/** Metres the camera focus must move before props are culled again (the cull radius is ~95 m, fog hides the edge). */
export const CULL_STEP = 2;
/** Metres the camera or the hero must move before the tall props are tested for occlusion again. */
const VIEW_STEP = 0.02;

interface Rec {
  obj: THREE.Object3D;
  tr: Transform;
  r: Renderable;
  /** What was applied, to notice an edit. */
  x: number;
  y: number;
  z: number;
  facing: number;
  scale: number;
  landmark: boolean;
  tall: boolean;
}

export class StaticProps {
  private readonly recs = new Map<Entity, Rec>();
  private readonly tall = new Set<Rec>();
  private dirty = true;
  private cullX = NaN;
  private cullZ = NaN;
  private readonly view = [NaN, NaN, NaN, NaN, NaN];
  /** How many culling passes ran (tests, stats). */
  passes = 0;

  get size(): number {
    return this.recs.size;
  }

  has(e: Entity): boolean {
    return this.recs.has(e);
  }

  /** Take over an object: it is placed now and not touched per frame. `tall` props are tested for occlusion. */
  add(e: Entity, obj: THREE.Object3D, tr: Transform, r: Renderable, tall: boolean): void {
    const rec: Rec = { obj, tr, r, x: NaN, y: NaN, z: NaN, facing: NaN, scale: NaN, landmark: r.landmark === true, tall };
    this.place(rec);
    this.recs.set(e, rec);
    if (tall) this.tall.add(rec);
    this.dirty = true;
  }

  remove(e: Entity): void {
    const rec = this.recs.get(e);
    if (!rec) return;
    this.recs.delete(e);
    this.tall.delete(rec);
  }

  clear(): void {
    this.recs.clear();
    this.tall.clear();
    this.dirty = true;
  }

  /** Position, turn and size from the entity (statics do not interpolate: previous and current agree). */
  private place(rec: Rec): void {
    const { tr, r, obj } = rec;
    const scale = r.scale ?? 1;
    if (tr.x !== rec.x || tr.y !== rec.y || tr.z !== rec.z) obj.position.set(tr.x, tr.y, tr.z);
    if (tr.facing !== rec.facing) obj.rotation.y = tr.facing;
    // Only an edit: the renderer already sized the object when it built it.
    if (scale !== rec.scale && !Number.isNaN(rec.scale)) {
      obj.scale.setScalar(scale);
      obj.userData.baseScale = scale;
    }
    rec.x = tr.x;
    rec.y = tr.y;
    rec.z = tr.z;
    rec.facing = tr.facing;
    rec.scale = scale;
  }

  /**
   * Called once per frame. Culls by distance when the focus moved `CULL_STEP` (or something was added), and runs the
   * occlusion test over the tall props when the view changed. `view` is the camera and the hero: [cx, cy, cz, hx, hz].
   */
  update(
    focus: { x: number; z: number },
    cullDistance: number,
    view: readonly [number, number, number, number, number],
    occludes: (r: Renderable, x: number, z: number) => boolean,
    setFaded: (obj: THREE.Object3D, on: boolean) => void,
  ): void {
    const moved = this.dirty || Math.hypot(focus.x - this.cullX, focus.z - this.cullZ) >= CULL_STEP || Number.isNaN(this.cullX);
    if (moved) {
      this.passes++;
      this.cullX = focus.x;
      this.cullZ = focus.z;
      const limit = cullDistance * cullDistance;
      for (const rec of this.recs.values()) {
        this.place(rec);
        if (!rec.landmark) rec.obj.visible = (rec.tr.x - focus.x) ** 2 + (rec.tr.z - focus.z) ** 2 < limit;
      }
    }
    let viewMoved = moved;
    for (let i = 0; i < view.length; i++) {
      if (Math.abs(view[i]! - this.view[i]!) > VIEW_STEP || Number.isNaN(this.view[i]!)) viewMoved = true;
    }
    if (viewMoved) {
      for (let i = 0; i < view.length; i++) this.view[i] = view[i]!;
      for (const rec of this.tall) if (rec.obj.visible) setFaded(rec.obj, occludes(rec.r, rec.tr.x, rec.tr.z));
    }
    this.dirty = false;
  }
}
