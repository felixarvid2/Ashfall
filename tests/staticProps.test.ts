/** Plain static props stay out of the per-frame render sync (T015). */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Collider, Health, Renderable, Transform, makeTransform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { CULL_STEP, StaticProps } from '../src/render/staticProps';

const CULL = 95;
type View = [number, number, number, number, number];

function prop(sp: StaticProps, e: number, x: number, z: number, tall = false) {
  const obj = new THREE.Group();
  const tr = makeTransform(x, 0, z, 0.5);
  const r: Renderable = { assetId: 'prop.crate' };
  sp.add(e, obj, tr, r, tall);
  return { obj, tr, r };
}

function update(sp: StaticProps, fx: number, fz: number, view: View = [0, 20, 20, fx, fz], hides: (x: number, z: number) => boolean = () => false, faded: THREE.Object3D[] = []) {
  sp.update({ x: fx, z: fz }, CULL, view, (_r, x, z) => hides(x, z), (o, on) => {
    if (on) faded.push(o);
  });
}

describe('StaticProps', () => {
  it('places a prop once, from its transform', () => {
    const sp = new StaticProps();
    const { obj } = prop(sp, 1, 12, -7);
    expect(obj.position.toArray()).toEqual([12, 0, -7]);
    expect(obj.rotation.y).toBe(0.5);
  });

  it('culls by distance and only walks the props again after the focus moved', () => {
    const sp = new StaticProps();
    const near = prop(sp, 1, 10, 0);
    const far = prop(sp, 2, 200, 0);
    update(sp, 0, 0);
    expect(near.obj.visible).toBe(true);
    expect(far.obj.visible).toBe(false);
    const passes = sp.passes;
    update(sp, CULL_STEP * 0.4, 0);
    expect(sp.passes).toBe(passes);
    update(sp, 120, 0);
    expect(sp.passes).toBe(passes + 1);
    expect(near.obj.visible).toBe(false);
    expect(far.obj.visible).toBe(true);
  });

  it('landmarks are never culled', () => {
    const sp = new StaticProps();
    const obj = new THREE.Group();
    sp.add(1, obj, makeTransform(900, 0, 0), { assetId: 'prop.tower', landmark: true }, false);
    update(sp, 0, 0);
    expect(obj.visible).toBe(true);
  });

  it('a prop added later is culled in the same update', () => {
    const sp = new StaticProps();
    update(sp, 0, 0);
    const late = prop(sp, 9, 500, 0);
    update(sp, 0, 0);
    expect(late.obj.visible).toBe(false);
  });

  it('notices an edit to a static (moved, turned, resized) at the next pass', () => {
    const sp = new StaticProps();
    const { obj, tr, r } = prop(sp, 1, 5, 5);
    update(sp, 0, 0);
    tr.x = 8;
    tr.facing = 1.25;
    r.scale = 2;
    update(sp, 10, 0);
    expect(obj.position.x).toBe(8);
    expect(obj.rotation.y).toBe(1.25);
    expect(obj.scale.x).toBe(2);
  });

  it('tests only tall props for occlusion, and again only when the view changed', () => {
    const sp = new StaticProps();
    const tall = prop(sp, 1, 3, 3, true);
    prop(sp, 2, 4, 4, false);
    const asked: number[] = [];
    const run = (view: View) => sp.update({ x: 0, z: 0 }, CULL, view, (_r, x) => (asked.push(x), true), () => undefined);
    run([0, 20, 20, 0, 0]);
    expect(asked).toEqual([3]);
    run([0, 20, 20, 0, 0]);
    expect(asked).toEqual([3]);
    run([0, 20, 20, 0.5, 0]);
    expect(asked).toEqual([3, 3]);
    // A culled tall prop keeps whatever fade state it had.
    tall.obj.visible = false;
    sp.update({ x: 0, z: 0 }, CULL, [1, 20, 20, 0, 0], (_r, x) => (asked.push(x), true), () => undefined);
    expect(asked.length).toBe(2);
  });

  it('forgets removed props', () => {
    const sp = new StaticProps();
    prop(sp, 1, 0, 0, true);
    expect(sp.has(1)).toBe(true);
    sp.remove(1);
    expect(sp.has(1)).toBe(false);
    expect(sp.size).toBe(0);
  });
});

describe('World.hasOnly', () => {
  it('is true for entities with just the allowed components, and false once anything else is added', () => {
    const w = new World();
    const e = w.create();
    w.add(e, Transform, makeTransform());
    w.add(e, Renderable, { assetId: 'x' });
    expect(w.hasOnly(e, Transform, Renderable, Collider)).toBe(true);
    w.add(e, Collider, { radius: 1, mass: Infinity, layer: 'ground', isStatic: true });
    expect(w.hasOnly(e, Transform, Renderable, Collider)).toBe(true);
    w.add(e, Health, { current: 1, max: 1 });
    expect(w.hasOnly(e, Transform, Renderable, Collider)).toBe(false);
  });
});
