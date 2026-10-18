/**
 * Variant looks for enemies in The Core (docs/regions/the-core.md):
 * - `lumen`: Lumen's own creations. Third-party low-poly models are repainted gold-white, emissive and slightly
 *   translucent with a violet fresnel rim, pulsing like a heartbeat, so their flat colours do not show.
 * - `shade`: returning enemies as memories. Their own models, but pale, glowing and flickering in and out.
 * Both are driven by `Renderable.look` (set from `EnemyDef.look`); `gameRenderer` applies the materials once and
 * `lookState` each frame. Also here: the fade-and-shrink death for models without a death clip.
 */
import * as THREE from 'three';
import type { EnemyLook } from '../data/schemas';
import { FADE_DEATH } from '../data/core';

export interface LookSpec {
  /** Surface colour replacing the model's own. */
  color: string;
  /** Emissive colour (an elite's glow overrides it). */
  emissive: string;
  /** Fresnel rim colour and strength. */
  rim: string;
  rimStrength: number;
  /** Does the translucent body write depth? (Flickering shades must not.) */
  depthWrite: boolean;
  /** Keep the model's own texture (as a pale, glowing memory of itself) instead of one flat colour. */
  keepTexture: boolean;
}

export const LOOKS: Record<EnemyLook, LookSpec> = {
  lumen: { color: '#fff1c4', emissive: '#ffd46a', rim: '#a26bff', rimStrength: 1.5, depthWrite: true, keepTexture: false },
  shade: { color: '#f4ead0', emissive: '#ffe7a0', rim: '#fff3cf', rimStrength: 1.0, depthWrite: false, keepTexture: true },
};

export interface LookState {
  opacity: number;
  /** Emissive intensity. */
  glow: number;
}

/** The look at `time` (s) for one creature; `seed` (its entity id) keeps neighbours out of step. */
export function lookState(look: EnemyLook, time: number, seed: number): LookState {
  if (look === 'lumen') {
    // A slow heartbeat: a double pulse every ~2.4 s.
    const t = ((time + seed * 0.37) % 2.4) / 2.4;
    const beat = Math.exp(-((t - 0.1) ** 2) / 0.004) + 0.6 * Math.exp(-((t - 0.3) ** 2) / 0.006);
    return { opacity: 0.86, glow: 0.65 + 0.55 * beat };
  }
  // Shades: a soft shimmer, and every so often the memory drops out for a moment.
  const shimmer = 0.5 + 0.08 * Math.sin(time * 7 + seed);
  const dropout = Math.sin(time * 23 + seed * 3.1) * Math.sin(time * 5.3 + seed) > 0.82 ? 0.45 : 1;
  return { opacity: shimmer * dropout, glow: 0.7 + 0.2 * Math.sin(time * 3.2 + seed) };
}

/** Fade-and-shrink death: scale and opacity (both 1 → 0) `elapsed` seconds after dying. */
export function deathFade(elapsed: number, seconds: number = FADE_DEATH.seconds): { scale: number; opacity: number } {
  const k = Math.min(1, Math.max(0, elapsed / seconds));
  return { scale: 1 - 0.85 * k * k, opacity: 1 - k };
}

/** Models without a death clip (but with an animator: the clip check decides) fade and shrink; unrigged ones topple. */
export function fadesOnDeath(hasAnimator: boolean, hasDeathClip: boolean): boolean {
  return hasAnimator && !hasDeathClip;
}

/** Fresnel rim light: bright where the surface turns away from the camera. */
export function addFresnel(mat: THREE.MeshStandardMaterial, color: string, strength: number, key: string): void {
  const rim = new THREE.Color(color).multiplyScalar(strength);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lookRim = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 lookRim;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float lookF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.0);\n  totalEmissiveRadiance += lookRim * lookF;',
      );
  };
  mat.customProgramCacheKey = () => `look-${key}`;
  mat.needsUpdate = true;
}

/**
 * Repaint a freshly created model: flat colour instead of the model's textures and vertex colours, translucent,
 * with the look's rim. `slots` are the model's own (cloned) materials from `AssetLibrary.create`.
 */
export function applyLookMaterials(slots: readonly { material: THREE.MeshStandardMaterial }[], look: EnemyLook): void {
  const spec = LOOKS[look];
  for (const { material: m } of slots) {
    m.color.set(spec.color);
    if (spec.keepTexture) {
      m.emissiveMap = m.map;
    } else {
      m.map = null;
      m.emissiveMap = null;
      m.vertexColors = false;
    }
    m.metalness = 0.05;
    m.roughness = 0.45;
    m.transparent = true;
    m.depthWrite = spec.depthWrite;
    addFresnel(m, spec.rim, spec.rimStrength, look);
  }
}
