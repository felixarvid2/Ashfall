/**
 * Falling ash: a single Points cloud that wraps around the camera focus,
 * so it always surrounds the player without spawning or freeing anything.
 */
import * as THREE from 'three';

function makeFlakeTexture(): THREE.Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class AshFall {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly drift: Float32Array;
  private readonly box = { x: 44, y: 22, z: 44 };
  private time = 0;
  /** Fall (ash) or rise (the Core's motes of light), and the heights the cloud spans. */
  private dir = -1;
  private yMin = 0;
  private yMax = 22;

  constructor(count = 2500) {
    this.positions = new Float32Array(count * 3);
    this.drift = new Float32Array(count);
    // Visual-only randomness: Math.random is fine here (not gameplay).
    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * this.box.x;
      this.positions[i * 3 + 1] = Math.random() * this.box.y;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
      this.drift[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    // White vertex colours until a zone asks for a palette; the material colour tints them all.
    const colors = new Float32Array(count * 3).fill(1);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.13,
      map: makeFlakeTexture(),
      color: 0xb8b2aa,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  /** Tint the falling particles (grey ash; green spores in the Hydroponic Vaults). */
  setColor(color: string): void {
    const m = this.points.material as THREE.PointsMaterial;
    this.setFlow('fall', 0, 22);
    m.color.set(color);
    this.paint(['#ffffff']);
  }

  /**
   * Glowing motes that rise from far below the ground (seen through the Core's abyss) instead of falling ash:
   * additive, a bit bigger, in these colours.
   */
  setMotes(colors: string[]): void {
    const m = this.points.material as THREE.PointsMaterial;
    this.setFlow('rise', -34, 16);
    m.color.set('#ffffff');
    this.paint(colors);
  }

  private setFlow(mode: 'fall' | 'rise', yMin: number, yMax: number): void {
    const m = this.points.material as THREE.PointsMaterial;
    this.dir = mode === 'rise' ? 1 : -1;
    this.yMin = yMin;
    this.yMax = yMax;
    m.size = mode === 'rise' ? 0.24 : 0.13;
    m.opacity = mode === 'rise' ? 0.85 : 0.75;
    m.blending = mode === 'rise' ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.needsUpdate = true;
    // Spread the cloud over its new height range.
    const span = yMax - yMin;
    for (let i = 0; i < this.drift.length; i++) this.positions[i * 3 + 1] = yMin + ((this.drift[i]! * 7.31) % 1) * span;
  }

  private paint(colors: string[]): void {
    const attr = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < this.drift.length; i++) {
      c.set(colors[i % colors.length]!);
      attr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    const { x: bx, z: bz } = this.box;
    const p = this.positions;
    for (let i = 0; i < this.drift.length; i++) {
      const phase = this.drift[i]!;
      let x = p[i * 3]! + (Math.sin(this.time * 0.6 + phase) * 0.35 + 0.25) * dt;
      let y = p[i * 3 + 1]! + this.dir * (0.7 + (phase % 1) * 0.5) * dt;
      let z = p[i * 3 + 2]! + Math.cos(this.time * 0.5 + phase) * 0.25 * dt;
      // Wrap relative to the focus so the cloud follows the camera.
      const rx = x - focus.x;
      const rz = z - focus.z;
      if (rx > bx / 2) x -= bx;
      else if (rx < -bx / 2) x += bx;
      if (rz > bz / 2) z -= bz;
      else if (rz < -bz / 2) z += bz;
      if (y < this.yMin) y += this.yMax - this.yMin;
      else if (y > this.yMax) y -= this.yMax - this.yMin;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
  }
}
