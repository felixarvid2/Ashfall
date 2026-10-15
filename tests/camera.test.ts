import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, viewForAspect } from '../src/render/camera';

describe('camera framing by aspect', () => {
  it('landscape keeps the base FOV and distance range', () => {
    expect(viewForAspect(16 / 9)).toEqual({ fovDeg: 38, fullFovDeg: 38, distanceScale: 1, shift: 0 });
    const rig = new CameraRig(16 / 9);
    expect(rig.camera.fov).toBe(38);
    expect(rig.camera.view?.enabled ?? false).toBe(false);
  });

  it('portrait widens the vertical FOV and enlarges the full frustum by the shift', () => {
    const v = viewForAspect(390 / 844);
    expect(v.fovDeg).toBeCloseTo(38 + (1 - 390 / 844) * 34, 6);
    expect(v.fovDeg).toBeGreaterThan(55);
    expect(v.fovDeg).toBeLessThan(57);
    expect(v.distanceScale).toBe(1.15);
    // The visible slice (1 / 1.25 of the full height) keeps the FOV above.
    const visible = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(v.fullFovDeg) / 2) / 1.25);
    expect(THREE.MathUtils.radToDeg(visible)).toBeCloseTo(v.fovDeg, 6);
  });

  it('portrait puts the focus point about 38% from the top and picks the same spot back', () => {
    const rig = new CameraRig(390 / 844);
    rig.snapTo(10, 0, 5);
    rig.camera.updateMatrixWorld();
    const p = rig.focusPoint.clone().project(rig.camera);
    const fromTop = (1 - p.y) / 2;
    expect(fromTop).toBeCloseTo(0.375, 3);
    expect(p.x).toBeCloseTo(0, 6);
    // Unprojecting the screen point of the focus gives a ray through the focus.
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(p.x, p.y), rig.camera);
    const toFocus = rig.focusPoint.clone().sub(ray.ray.origin);
    expect(ray.ray.distanceToPoint(rig.focusPoint)).toBeLessThan(1e-3);
    expect(toFocus.dot(ray.ray.direction)).toBeGreaterThan(0);
  });

  it('portrait scales the zoom range by 1.15 and landscape restores it', () => {
    const rig = new CameraRig(390 / 844);
    rig.zoom(100);
    rig.snapTo(0, 0, 0);
    expect(rig.camera.position.distanceTo(rig.focusPoint)).toBeCloseTo(24 * 1.15, 6);
    rig.zoom(-100);
    rig.snapTo(0, 0, 0);
    expect(rig.camera.position.distanceTo(rig.focusPoint)).toBeCloseTo(14 * 1.15, 6);
    rig.setAspect(16 / 9);
    expect(rig.camera.view?.enabled ?? false).toBe(false);
    expect(rig.camera.fov).toBe(38);
    rig.snapTo(0, 0, 0);
    expect(rig.camera.position.distanceTo(rig.focusPoint)).toBeCloseTo(14, 6);
  });
});
