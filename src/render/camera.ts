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

/** How far (as a fraction of the screen height) the picture is pushed up in portrait. */
const PORTRAIT_SHIFT = 0.25;

export interface AspectView {
  /** Vertical FOV of what is on screen, degrees. */
  fovDeg: number;
  /** Vertical FOV of the full (taller) frustum, degrees; equals `fovDeg` when `shift` is 0. */
  fullFovDeg: number;
  /** Multiplier for the follow distance range. */
  distanceScale: number;
  /** Extra frustum height above the visible slice, as a fraction of the screen height. */
  shift: number;
}

/**
 * Landscape keeps the base FOV. A portrait screen widens the vertical FOV (the horizontal view would
 * otherwise be a quarter of landscape), pulls the camera back a little, and slides the picture up so
 * the player sits about 38% from the top, clear of the thumbs on the lower third.
 */
export function viewForAspect(aspect: number, baseFovDeg: number = DEFAULTS.fovDeg): AspectView {
  if (!(aspect < 1)) return { fovDeg: baseFovDeg, fullFovDeg: baseFovDeg, distanceScale: 1, shift: 0 };
  const fovDeg = baseFovDeg + (1 - aspect) * 34;
  const s = PORTRAIT_SHIFT;
  const fullFovDeg = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * (1 + s)));
  return { fovDeg, fullFovDeg, distanceScale: 1.15, shift: s };
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly yaw: number;
  private readonly pitch: number;
  private readonly opts: CameraRigOptions;
  private readonly focus = new THREE.Vector3();
  private distance: number;
  private targetDistance: number;
  /** Portrait screens scale the follow distance range (see `viewForAspect`). */
  private distanceScale = 1;
  /** Screen-shake trauma in [0, 1]; shake strength is trauma². */
  private trauma = 0;
  private shakeTime = 0;

  constructor(aspect: number, options: Partial<CameraRigOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.camera = new THREE.PerspectiveCamera(this.opts.fovDeg, aspect, 0.5, 1200);
    this.yaw = THREE.MathUtils.degToRad(this.opts.yawDeg);
    this.pitch = THREE.MathUtils.degToRad(this.opts.pitchDeg);
    this.distance = this.targetDistance = (this.opts.minDistance + this.opts.maxDistance) / 2;
    this.setAspect(aspect);
  }

  /** Jump straight to a target (on spawn / load) with no easing. */
  snapTo(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
    this.distance = this.targetDistance;
    this.apply();
  }

  /** Wheel steps: positive zooms out. */
  zoom(steps: number): void {
    const min = this.opts.minDistance * this.distanceScale;
    const max = this.opts.maxDistance * this.distanceScale;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + steps * (max - min) * 0.15, min, max);
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(targetX: number, targetY: number, targetZ: number, dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.shakeTime += dt;
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

  /** Fit the projection to a screen aspect (width / height); portrait gets its own FOV, distance and framing. */
  setAspect(aspect: number): void {
    const view = viewForAspect(aspect, this.opts.fovDeg);
    const ratio = view.distanceScale / this.distanceScale;
    this.distanceScale = view.distanceScale;
    this.distance *= ratio;
    this.targetDistance *= ratio;
    const cam = this.camera;
    if (view.shift > 0) {
      // The frustum is (1 + shift) times taller than the screen and the screen shows its lower part,
      // so the focus point (centre of the full frustum) lands above the middle of the screen. Picking
      // and projection both go through the projection matrix, so they stay in step.
      cam.fov = view.fullFovDeg;
      cam.aspect = aspect / (1 + view.shift);
      cam.setViewOffset(aspect, 1 + view.shift, 0, view.shift, aspect, 1);
    } else {
      cam.fov = view.fovDeg;
      cam.aspect = aspect;
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
  }

  private apply(): void {
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.focus);
    if (this.trauma > 0) {
      // Smooth pseudo-noise from summed sines; avoids jittery random shake.
      const s = this.trauma * this.trauma;
      const t = this.shakeTime * 32;
      this.camera.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * s * 0.35;
      this.camera.position.y += (Math.sin(t * 1.7) + Math.sin(t * 3.1) * 0.5) * s * 0.35;
      this.camera.rotation.z += Math.sin(t * 1.3) * s * 0.02;
    }
  }
}
