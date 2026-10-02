/**
 * Near-isometric follow camera: fixed pitch and yaw, smooth damped follow,
 * small mouse-wheel zoom range.
 */
import * as THREE from 'three';

export interface CameraRigOptions {
  /** Angle above the horizon, degrees. */
  pitchDeg: number;
  /** Rotation around the target, degrees (0 = camera on +z looking toward -z). */
  yawDeg: number;
  fovDeg: number;
  minDistance: number;
  maxDistance: number;
  /** Follow stiffness; higher = snappier. Frame-rate independent. */
  followSharpness: number;
}

const DEFAULTS: CameraRigOptions = {
  pitchDeg: 55,
  yawDeg: 45,
  fovDeg: 38,
  minDistance: 14,
  maxDistance: 24,
  followSharpness: 8,
};

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly yaw: number;
  private readonly pitch: number;
  private readonly opts: CameraRigOptions;
  private readonly focus = new THREE.Vector3();
  private distance: number;
  private targetDistance: number;

  constructor(aspect: number, options: Partial<CameraRigOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.camera = new THREE.PerspectiveCamera(this.opts.fovDeg, aspect, 0.5, 200);
    this.yaw = THREE.MathUtils.degToRad(this.opts.yawDeg);
    this.pitch = THREE.MathUtils.degToRad(this.opts.pitchDeg);
    this.distance = this.targetDistance = (this.opts.minDistance + this.opts.maxDistance) / 2;
  }

  /** Jump straight to a target (on spawn / load) with no easing. */
  snapTo(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
    this.distance = this.targetDistance;
    this.apply();
  }

  /** Wheel steps: positive zooms out. */
  zoom(steps: number): void {
    const range = this.opts.maxDistance - this.opts.minDistance;
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + steps * range * 0.15,
      this.opts.minDistance,
      this.opts.maxDistance,
    );
  }

  update(targetX: number, targetY: number, targetZ: number, dt: number): void {
    const k = 1 - Math.exp(-this.opts.followSharpness * dt);
    this.focus.x += (targetX - this.focus.x) * k;
    this.focus.y += (targetY + 1 - this.focus.y) * k;
    this.focus.z += (targetZ - this.focus.z) * k;
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-10 * dt));
    this.apply();
  }

  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private apply(): void {
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.focus);
  }
}
