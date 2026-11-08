/**
 * A GL-less stand-in for the renderer (round 4 B03, B04): node cannot create a WebGL context, so tests that need a real
 * GameRenderer mock `three`'s WebGLRenderer and the PostFx pass with these. `FakeGpu` does what the driver does for
 * `renderer.info.memory`: it "uploads" every geometry, material and texture the scene draws, and forgets one when
 * its `dispose` event fires. A leak shows up as a count that keeps growing.
 */
import type * as THREE from 'three';

export class FakeGpu {
  readonly geometries = new Set<THREE.BufferGeometry>();
  readonly materials = new Set<THREE.Material>();
  readonly textures = new Set<THREE.Texture>();
  /** Off for CPU budgets: the scene walk below is the test's bookkeeping, not the game's cost. */
  enabled = true;

  private track<T extends { addEventListener(type: 'dispose', fn: () => void): void }>(set: Set<T>, res: T): void {
    if (set.has(res)) return;
    set.add(res);
    // A disposed resource is re-uploaded the next time it is drawn, like in three.js.
    res.addEventListener('dispose', () => set.delete(res));
  }

  private texture(t: THREE.Texture | null | undefined): void {
    if (t && (t as THREE.Texture).isTexture) this.track(this.textures, t);
  }

  /** Walk the scene like the renderer's draw pass: visible meshes, points, lines and sprites. */
  upload(scene: THREE.Object3D): void {
    if (!this.enabled) return;
    scene.traverseVisible((o) => {
      const d = o as THREE.Mesh;
      if (d.geometry) this.track(this.geometries, d.geometry);
      const mats = Array.isArray(d.material) ? d.material : d.material ? [d.material] : [];
      for (const m of mats) {
        this.track(this.materials, m);
        for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) this.texture(v as THREE.Texture);
      }
    });
    this.texture((scene as THREE.Scene).background as THREE.Texture | null);
  }

  get counts(): { geometries: number; materials: number; textures: number } {
    return { geometries: this.geometries.size, materials: this.materials.size, textures: this.textures.size };
  }
}

/** The one FakeGpu a test run shares (the mocked PostFx writes into it). */
export const gpu = new FakeGpu();

/** Enough of WebGLRenderer for GameRenderer's constructor and per-frame calls. */
export class FakeWebGLRenderer {
  outputColorSpace = '';
  toneMapping = 0;
  toneMappingExposure = 1;
  shadowMap = { enabled: false, type: 0 };
  capabilities = { getMaxAnisotropy: () => 4 };
  info = { autoReset: true, render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, reset: () => undefined };
  domElement: unknown;
  constructor(opts: { canvas?: unknown } = {}) {
    this.domElement = opts.canvas;
  }
  setPixelRatio(): void {}
  getPixelRatio(): number {
    return 1;
  }
  setSize(): void {}
  render(scene: THREE.Object3D): void {
    gpu.upload(scene);
  }
  dispose(): void {}
}

export class FakePostFx {
  enabled = true;
  setGrade(): void {}
  setDeathDesat(): void {}
  setLevelGlow(): void {}
  setQuality(): void {}
  setSize(): void {}
  render(scene: THREE.Scene): void {
    gpu.upload(scene);
  }
}

/** A canvas 2D context that accepts every call (gradients, fills, text) and draws nothing. */
export function installFakeCanvas(): void {
  const noop = (): unknown => undefined;
  const ctx: unknown = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop: noop });
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        if (prop === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        return noop;
      },
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
}
