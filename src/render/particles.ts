/**
 * Sprite particles: the painted effect sprites (public/assets/vfx/atlas.webp, generated with
 * FLUX.2 Turbo and packed by scripts/vfx/pack.ts) drawn as camera-facing or ground-flat quads.
 *
 * One instanced draw call carries every particle. Colours are premultiplied, so a single blend mode
 * (one, one-minus-source-alpha) draws both kinds: additive fire and sparks write no alpha and simply
 * add light, while tinted smoke, dust and splats cover what is behind them. The simulation runs on
 * the CPU in flat typed arrays (no per-particle objects) and drops new particles once the cap for the
 * graphics setting is reached.
 */
import * as THREE from 'three';
import { ATLAS_COLS, SPRITE, type SpriteKey } from './vfxAtlas';

export interface ParticleSpawn {
  sprite: SpriteKey;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Seconds. */
  life: number;
  /** Size (m) at birth and at death; `aspect` is width ÷ height. */
  size: number;
  size1?: number;
  aspect?: number;
  rot?: number;
  spin?: number;
  /** Tint at birth and death (multiplies the sprite's own colour; masks are white). */
  color?: THREE.ColorRepresentation;
  color1?: THREE.ColorRepresentation;
  /** Peak opacity, and the share of the life spent fading in and (from `fadeOut`) out. */
  alpha?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** 1 = adds light (fire, glows); 0 = covers (smoke, dust, decals). */
  additive?: number;
  /** m/s² upward (negative rises), and the share of speed lost per second. */
  gravity?: number;
  drag?: number;
  /** Lies flat on the ground instead of facing the camera. */
  flat?: boolean;
}

/** Fields per particle in the simulation arrays. */
const F = {
  x: 0, y: 1, z: 2, vx: 3, vy: 4, vz: 5, age: 6, life: 7, s0: 8, s1: 9, aspect: 10, rot: 11, spin: 12,
  r0: 13, g0: 14, b0: 15, r1: 16, g1: 17, b1: 18, alpha: 19, fin: 20, fout: 21, add: 22, grav: 23, drag: 24, frame: 25, flat: 26,
} as const;
const STRIDE = 27;

const white = new THREE.Color(1, 1, 1);
const c0 = new THREE.Color();
const c1 = new THREE.Color();

/** The simulation: no THREE objects, so it runs (and is tested) without a canvas. */
export class ParticleField {
  readonly data: Float32Array;
  count = 0;

  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * STRIDE);
  }

  /** Room for more (the renderer lowers this on low graphics). */
  limit = Infinity;

  spawn(p: ParticleSpawn): boolean {
    if (this.count >= Math.min(this.capacity, this.limit)) return false;
    const o = this.count++ * STRIDE;
    const d = this.data;
    c0.set(p.color ?? white);
    c1.set(p.color1 ?? p.color ?? white);
    d[o + F.x] = p.x;
    d[o + F.y] = p.y;
    d[o + F.z] = p.z;
    d[o + F.vx] = p.vx ?? 0;
    d[o + F.vy] = p.vy ?? 0;
    d[o + F.vz] = p.vz ?? 0;
    d[o + F.age] = 0;
    d[o + F.life] = Math.max(0.01, p.life);
    d[o + F.s0] = p.size;
    d[o + F.s1] = p.size1 ?? p.size;
    d[o + F.aspect] = p.aspect ?? 1;
    d[o + F.rot] = p.rot ?? 0;
    d[o + F.spin] = p.spin ?? 0;
    d[o + F.r0] = c0.r;
    d[o + F.g0] = c0.g;
    d[o + F.b0] = c0.b;
    d[o + F.r1] = c1.r;
    d[o + F.g1] = c1.g;
    d[o + F.b1] = c1.b;
    d[o + F.alpha] = p.alpha ?? 1;
    d[o + F.fin] = p.fadeIn ?? 0.1;
    d[o + F.fout] = p.fadeOut ?? 0.5;
    d[o + F.add] = p.additive ?? 1;
    d[o + F.grav] = p.gravity ?? 0;
    d[o + F.drag] = p.drag ?? 0;
    d[o + F.frame] = SPRITE[p.sprite];
    d[o + F.flat] = p.flat ? 1 : 0;
    return true;
  }

  /** Age and move everything; dead particles are swapped out (order doesn't matter). */
  update(dt: number): void {
    const d = this.data;
    for (let i = 0; i < this.count; ) {
      const o = i * STRIDE;
      d[o + F.age]! += dt;
      if (d[o + F.age]! >= d[o + F.life]!) {
        this.count--;
        if (i !== this.count) d.copyWithin(o, this.count * STRIDE, (this.count + 1) * STRIDE);
        continue;
      }
      const keep = Math.max(0, 1 - d[o + F.drag]! * dt);
      d[o + F.vx]! *= keep;
      d[o + F.vz]! *= keep;
      d[o + F.vy] = d[o + F.vy]! * keep - d[o + F.grav]! * dt;
      d[o + F.x]! += d[o + F.vx]! * dt;
      d[o + F.y]! += d[o + F.vy]! * dt;
      d[o + F.z]! += d[o + F.vz]! * dt;
      if (d[o + F.flat]! === 0 && d[o + F.y]! < 0.05) {
        d[o + F.y] = 0.05;
        if (d[o + F.vy]! < 0) d[o + F.vy] = 0;
      }
      d[o + F.rot]! += d[o + F.spin]! * dt;
      i++;
    }
  }

  /** Opacity now (fade in, hold, fade out). */
  static opacity(t: number, fin: number, fout: number): number {
    if (t < fin) return t / fin;
    if (t > fout) return Math.max(0, (1 - t) / Math.max(1e-3, 1 - fout));
    return 1;
  }
}

const VERT = /* glsl */ `
attribute vec4 iA; // x, y, z, rotation
attribute vec4 iB; // width, height, atlas cell, flat
attribute vec4 iC; // premultiplied tint (rgb), opacity
attribute float iAdd;
uniform float uCols;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  vec2 p = position.xy * iB.xy;
  float c = cos(iA.w);
  float s = sin(iA.w);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec3 world;
  if (iB.w > 0.5) {
    world = iA.xyz + vec3(p.x, 0.0, -p.y);
  } else {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    world = iA.xyz + right * p.x + up * p.y;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  float cell = iB.z;
  vec2 rc = vec2(mod(cell, uCols), floor(cell / uCols));
  vUv = vec2((rc.x + uv.x) / uCols, 1.0 - (rc.y + 1.0 - uv.y) / uCols);
  vColor = iC;
  vAdd = iAdd;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  // Premultiplied: additive particles write no alpha, so they only add light.
  gl_FragColor = vec4(t.rgb * vColor.rgb * vColor.a, t.a * vColor.a * (1.0 - vAdd));
}`;

/** The draw side: one instanced mesh fed from a ParticleField every frame. */
export class ParticleRenderer {
  readonly mesh: THREE.Mesh;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly c: Float32Array;
  private readonly add: Float32Array;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly attrs: THREE.InstancedBufferAttribute[];

  constructor(readonly field: ParticleField, atlasUrl: string) {
    const n = field.capacity;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.a = new Float32Array(n * 4);
    this.b = new Float32Array(n * 4);
    this.c = new Float32Array(n * 4);
    this.add = new Float32Array(n);
    this.attrs = [
      new THREE.InstancedBufferAttribute(this.a, 4),
      new THREE.InstancedBufferAttribute(this.b, 4),
      new THREE.InstancedBufferAttribute(this.c, 4),
      new THREE.InstancedBufferAttribute(this.add, 1),
    ];
    ['iA', 'iB', 'iC', 'iAdd'].forEach((name, i) => {
      this.attrs[i]!.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, this.attrs[i]!);
    });
    geo.instanceCount = 0;
    this.geo = geo;
    const atlas = new THREE.TextureLoader().load(atlasUrl, undefined, undefined, () => console.warn('[vfx] particle atlas failed to load'));
    atlas.colorSpace = THREE.NoColorSpace;
    atlas.premultiplyAlpha = false;
    atlas.anisotropy = 4;
    const material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas }, uCols: { value: ATLAS_COLS } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  /** Copy the field into the instance buffers. */
  sync(): void {
    const { data, count } = this.field;
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE;
      const t = data[o + F.age]! / data[o + F.life]!;
      const size = data[o + F.s0]! + (data[o + F.s1]! - data[o + F.s0]!) * t;
      const k = i * 4;
      this.a[k] = data[o + F.x]!;
      this.a[k + 1] = data[o + F.y]!;
      this.a[k + 2] = data[o + F.z]!;
      this.a[k + 3] = data[o + F.rot]!;
      this.b[k] = size * data[o + F.aspect]!;
      this.b[k + 1] = size;
      this.b[k + 2] = data[o + F.frame]!;
      this.b[k + 3] = data[o + F.flat]!;
      this.c[k] = data[o + F.r0]! + (data[o + F.r1]! - data[o + F.r0]!) * t;
      this.c[k + 1] = data[o + F.g0]! + (data[o + F.g1]! - data[o + F.g0]!) * t;
      this.c[k + 2] = data[o + F.b0]! + (data[o + F.b1]! - data[o + F.b0]!) * t;
      this.c[k + 3] = data[o + F.alpha]! * ParticleField.opacity(t, data[o + F.fin]!, data[o + F.fout]!);
      this.add[i] = data[o + F.add]!;
    }
    this.geo.instanceCount = count;
    for (const attr of this.attrs) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
}
