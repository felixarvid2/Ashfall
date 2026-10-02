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
    const material = new THREE.PointsMaterial({
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

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    const { x: bx, y: by, z: bz } = this.box;
    const p = this.positions;
    for (let i = 0; i < this.drift.length; i++) {
      const phase = this.drift[i]!;
      let x = p[i * 3]! + (Math.sin(this.time * 0.6 + phase) * 0.35 + 0.25) * dt;
      let y = p[i * 3 + 1]! - (0.7 + (phase % 1) * 0.5) * dt;
      let z = p[i * 3 + 2]! + Math.cos(this.time * 0.5 + phase) * 0.25 * dt;
      // Wrap relative to the focus so the cloud follows the camera.
      const rx = x - focus.x;
      const rz = z - focus.z;
      if (rx > bx / 2) x -= bx;
      else if (rx < -bx / 2) x += bx;
      if (rz > bz / 2) z -= bz;
      else if (rz < -bz / 2) z += bz;
      if (y < 0) y += by;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
  }
}
