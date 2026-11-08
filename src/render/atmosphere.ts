/** Ambient life and weather clouds (round 4, D10/D11; data in src/data/atmosphere.ts): Points that wrap around the camera focus. */
import * as THREE from 'three';
import type { CloudDef } from '../data/atmosphere';

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Advance one particle: pure, so the wrap and the motion can be tested. Positions are relative to the focus box. */
export function stepCloud(pos: Float32Array, phase: Float32Array, def: CloudDef, time: number, dt: number, focus: { x: number; z: number }, box: number): void {
  for (let i = 0; i < phase.length; i++) {
    const ph = phase[i]!;
    let x = pos[i * 3]! + (def.vel[0] + Math.sin(time * def.freq + ph) * def.wander) * dt;
    let y = pos[i * 3 + 1]! + (def.vel[1] + Math.sin(time * def.freq * 0.8 + ph * 1.7) * def.wander * 0.5) * dt;
    let z = pos[i * 3 + 2]! + (def.vel[2] + Math.cos(time * def.freq + ph) * def.wander) * dt;
    const half = box / 2;
    if (x - focus.x > half) x -= box;
    else if (x - focus.x < -half) x += box;
    if (z - focus.z > half) z -= box;
    else if (z - focus.z < -half) z += box;
    const [y0, y1] = def.y;
    if (y < y0) y += y1 - y0;
    else if (y > y1) y -= y1 - y0;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
  }
}

export class AtmosphereCloud {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly phase: Float32Array;
  private time = 0;
  private static texture: THREE.Texture | null = null;

  constructor(readonly def: CloudDef, private readonly box = 40) {
    this.pos = new Float32Array(def.count * 3);
    this.phase = new Float32Array(def.count);
    const colors = new Float32Array(def.count * 3);
    const c = new THREE.Color();
    // Visual-only randomness (not gameplay), like the ash.
    for (let i = 0; i < def.count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * box;
      this.pos[i * 3 + 1] = def.y[0] + Math.random() * (def.y[1] - def.y[0]);
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * box;
      this.phase[i] = Math.random() * Math.PI * 2;
      c.set(def.colors[i % def.colors.length]!);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    AtmosphereCloud.texture ??= dotTexture();
    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: def.size,
      map: AtmosphereCloud.texture,
      transparent: true,
      opacity: def.opacity,
      depthWrite: false,
      sizeAttenuation: true,
      blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    stepCloud(this.pos, this.phase, this.def, this.time, dt, focus, this.box);
    this.points.geometry.attributes.position!.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** A zone's ambient life and weather. Rebuilt when the zone or the graphics preset changes. */
export class AmbientLayers {
  readonly root = new THREE.Group();
  private clouds: AtmosphereCloud[] = [];

  set(defs: { ambient: CloudDef | null; weather: CloudDef | null }): void {
    for (const c of this.clouds) {
      this.root.remove(c.points);
      c.dispose();
    }
    this.clouds = [defs.ambient, defs.weather].filter((d): d is CloudDef => d !== null).map((d) => new AtmosphereCloud(d));
    for (const c of this.clouds) this.root.add(c.points);
  }

  get count(): number {
    return this.clouds.length;
  }

  update(dt: number, focus: THREE.Vector3): void {
    for (const c of this.clouds) c.update(dt, focus);
  }
}
