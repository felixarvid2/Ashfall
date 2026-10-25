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
/** Short phone screens (under 700 px tall) keep the player lower: the HUD leaves little room above (H092). */
const PORTRAIT_SHIFT_SHORT = 0.08;
const SHORT_SCREEN_PX = 700;

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
 * the player sits about 38% from the top, clear of the thumbs on the lower third. Under 700 px of screen
 * height the slide is smaller (about 46% from the top), so the HUD chrome does not sit on the player.
 */
export function viewForAspect(aspect: number, baseFovDeg: number = DEFAULTS.fovDeg, screenHeightPx?: number): AspectView {
  if (!(aspect < 1)) return { fovDeg: baseFovDeg, fullFovDeg: baseFovDeg, distanceScale: 1, shift: 0 };
  const fovDeg = baseFovDeg + (1 - aspect) * 34;
  const s = screenHeightPx !== undefined && screenHeightPx < SHORT_SCREEN_PX ? PORTRAIT_SHIFT_SHORT : PORTRAIT_SHIFT;
  const fullFovDeg = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * (1 + s)));
  return { fovDeg, fullFovDeg, distanceScale: 1.15, shift: s };
}

/** Furthest the look-ahead moves the focus from the hero (m). */
export const LOOK_AHEAD_MAX = 1.5;
/** Cursor distance (m) at which the look-ahead reaches its maximum. */
const LOOK_AHEAD_FULL_AT = 12;
/** This many hostile enemies close by pull the camera back a little (F018). */
export const CROWD_COUNT = 5;
export const CROWD_RANGE = 12;
export const CROWD_ZOOM = 1.1;

/**
 * Look-ahead (F018): how far to shift the camera focus toward the aim point. `dx`/`dz` run from the hero to the
 * cursor; the shift grows with the cursor distance and never exceeds `max` metres.
 */
export function lookAheadOffset(dx: number, dz: number, max: number = LOOK_AHEAD_MAX): { x: number; z: number } {
  const len = Math.hypot(dx, dz);
  if (len < 1e-3 || max <= 0) return { x: 0, z: 0 };
  const k = (Math.min(max, (len / LOOK_AHEAD_FULL_AT) * max)) / len;
  return { x: dx * k, z: dz * k };
}

/** Distance multiplier for a crowd: 1.1 from five hostile enemies on (F018). */
export function crowdZoom(hostilesNear: number): number {
  return hostilesNear >= CROWD_COUNT ? CROWD_ZOOM : 1;
}

/** Seconds a boss/elite intro push-in takes to settle (F021). */
const PULSE_IN = 0.3;
const PULSE_OUT = 0.4;

/**
 * Distance multiplier of a push-in (F021) `age` seconds after it started: eases to `factor` (< 1 = closer), holds, then
 * eases back so it is exactly 1 at `total`.
 */
export function pulseZoomCurve(age: number, total: number, factor: number): number {
  if (age <= 0 || age >= total) return 1;
  const inT = Math.min(PULSE_IN, total / 2);
  const outT = Math.min(PULSE_OUT, total / 2);
  const w = age < inT ? age / inT : age > total - outT ? (total - age) / outT : 1;
  const eased = w * w * (3 - 2 * w);
  return 1 + (factor - 1) * eased;
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
  /** Look-ahead target and its smoothed value (F018). */
  private lookTarget = { x: 0, z: 0 };
  private look = { x: 0, z: 0 };
  /** Crowd pull-back: target and smoothed multiplier (F018). */
  private crowdTarget = 1;
  private crowd = 1;
  /** A timed push-in (F021). */
  private pulse = { age: 0, total: 0, factor: 1 };

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

  /** Shift the focus toward an aim point (offset in metres from the hero); smoothed. Zero turns it off. */
  setLookAhead(x: number, z: number): void {
    this.lookTarget.x = x;
    this.lookTarget.z = z;
  }

  /** Pull back a little when `hostilesNear` enemies are close (F018). */
  setCrowd(hostilesNear: number): void {
    this.crowdTarget = crowdZoom(hostilesNear);
  }

  /** Soft push-in for `seconds` (F021): the follow distance shrinks to `factor` of itself and eases back. */
  pulseZoom(seconds: number, factor = 0.82): void {
    this.pulse = { age: 0, total: seconds, factor };
  }

  /** The distance the camera sits at now, with crowd and push-in applied (tests, debugging). */
  get effectiveDistance(): number {
    return this.distance * this.crowd * pulseZoomCurve(this.pulse.age, this.pulse.total, this.pulse.factor);
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(targetX: number, targetY: number, targetZ: number, dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.shakeTime += dt;
    const k = 1 - Math.exp(-this.opts.followSharpness * dt);
    const kl = 1 - Math.exp(-3 * dt);
    this.look.x += (this.lookTarget.x - this.look.x) * kl;
    this.look.z += (this.lookTarget.z - this.look.z) * kl;
    this.crowd += (this.crowdTarget - this.crowd) * (1 - Math.exp(-2 * dt));
    if (this.pulse.age < this.pulse.total) this.pulse.age += dt;
    this.focus.x += (targetX + this.look.x - this.focus.x) * k;
    this.focus.y += (targetY + 1 - this.focus.y) * k;
    this.focus.z += (targetZ + this.look.z - this.focus.z) * k;
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-10 * dt));
    this.apply();
  }

  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }

  /** Fit the projection to a screen aspect (width / height); portrait gets its own FOV, distance and framing. */
  setAspect(aspect: number, screenHeightPx?: number): void {
    const view = viewForAspect(aspect, this.opts.fovDeg, screenHeightPx);
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
    const distance = this.effectiveDistance;
    const horizontal = Math.cos(this.pitch) * distance;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.sin(this.pitch) * distance,
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
