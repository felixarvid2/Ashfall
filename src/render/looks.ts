/**
 * Variant looks for enemies in The Core (docs/regions/the-core.md):
 * - `lumen`: Lumen's own creations. Third-party low-poly models are repainted a dark indigo with a low violet glow
 *   and a gold-white fresnel rim that pulses like a heartbeat, so their flat colours do not show. The body stays
 *   well below the pale Lumen ground in brightness (and under the bloom threshold); only the rim blooms, which
 *   keeps the silhouette readable instead of a white blob.
 * - `shade`: returning enemies as memories. Their own textures under a violet tint, glowing and flickering in and
 *   out; the core stays dark enough to read against pale ground.
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
  /** Fresnel exponent: higher keeps the rim thinner, at the very edge of the silhouette. */
  rimPower: number;
  /** Does the translucent body write depth? (Flickering shades must not.) */
  depthWrite: boolean;
  /** Keep the model's own texture (as a pale, glowing memory of itself) instead of one flat colour. */
  keepTexture: boolean;
}

export const LOOKS: Record<EnemyLook, LookSpec> = {
  lumen: { color: '#3b2f7a', emissive: '#6f4dff', rim: '#ffe49a', rimStrength: 1.7, rimPower: 2.4, depthWrite: true, keepTexture: false },
  shade: { color: '#6c5aa6', emissive: '#7c5cff', rim: '#e4d6ff', rimStrength: 1.3, rimPower: 2.0, depthWrite: false, keepTexture: true },
};

export interface LookState {
  opacity: number;
  /** Emissive intensity. */
  glow: number;
}

/** The look at `time` (s) for one creature; `seed` (its entity id) keeps neighbours out of step. */
export function lookState(look: EnemyLook, time: number, seed: number): LookState {
  if (look === 'lumen') {
    // A slow heartbeat: a double pulse every ~2.4 s. Opaque: a translucent body washes out against the pale ground.
    const t = ((time + seed * 0.37) % 2.4) / 2.4;
    const beat = Math.exp(-((t - 0.1) ** 2) / 0.004) + 0.6 * Math.exp(-((t - 0.3) ** 2) / 0.006);
    return { opacity: 1, glow: 0.3 + 0.3 * beat };
  }
  // Shades: a soft shimmer, and every so often the memory drops out for a moment (never fully: the core stays).
  const shimmer = 0.78 + 0.1 * Math.sin(time * 7 + seed);
  const dropout = Math.sin(time * 23 + seed * 3.1) * Math.sin(time * 5.3 + seed) > 0.82 ? 0.55 : 1;
  return { opacity: shimmer * dropout, glow: 0.4 + 0.15 * Math.sin(time * 3.2 + seed) };
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
export function addFresnel(mat: THREE.MeshStandardMaterial, color: string, strength: number, key: string, power = 2): void {
  const rim = new THREE.Color(color).multiplyScalar(strength);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lookRim = { value: rim };
    const exponent = power.toFixed(2);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 lookRim;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n  float lookF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), ${exponent});\n  totalEmissiveRadiance += lookRim * lookF;`,
      );
  };
  mat.customProgramCacheKey = () => `look-${key}-${power}`;
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
    m.roughness = 0.6;
    m.transparent = true;
    m.depthWrite = spec.depthWrite;
    addFresnel(m, spec.rim, spec.rimStrength, look, spec.rimPower);
  }
}
