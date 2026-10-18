/**
 * The Core's look (docs/regions/the-core.md): floating islands of Lumen matter over a glowing abyss,
 * joined by energy bridges, and a column of light where the space elevator shaft rises out of sight.
 *
 * The ground plane is cut open over the abyss and the bridge strips by a smoothed mask (`buildCut`), so
 * island edges are rounded curves instead of the walkable grid's staircase. The same field is traced into
 * outlines (`traceLoops`) that rock skirts hang from, and a deep glowing plane shows through the cut.
 * Everything here is built once per zone; `CoreLook.update` only moves uniforms (no per-frame allocation).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bridgeCellsOf, bridgeState, type BridgeCycle, type Cavern, type CaveDef, type CaveGrid } from '../data/zones/caves';
import { gravityPhase, type Gravity } from '../world/theCore';

// ---- The cut: where the ground plane is open air ------------------------------------------------

/** 1 on every cell of the grid that is open air to look into: the abyss circles and the bridge strips. */
export function cutCells(grid: CaveGrid, caves: CaveDef): Uint8Array {
  const { n, cell, half } = grid;
  const cut = new Uint8Array(n * n);
  const bridgeCells = bridgeCellsOf(grid);
  const paint = (c: Cavern, v: number) => {
    const i0 = Math.max(0, Math.floor((c.x - c.radius + half) / cell));
    const i1 = Math.min(n - 1, Math.floor((c.x + c.radius + half) / cell));
    const j0 = Math.max(0, Math.floor((c.z - c.radius + half) / cell));
    const j1 = Math.min(n - 1, Math.floor((c.z + c.radius + half) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * cell - half;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cell - half;
        if ((x - c.x) ** 2 + (z - c.z) ** 2 <= c.radius * c.radius) cut[j * n + i] = v;
      }
    }
  };
  for (const a of caves.abyss ?? []) paint(a, 1);
  // Ground that can be walked stays ground (a bridge's cells are open while it is on, but drawn as light).
  for (let k = 0; k < cut.length; k++) if (grid.data[k] === 1 && !bridgeCells.has(k)) cut[k] = 0;
  // Melt pools keep their ground: the molten surface is drawn on it.
  for (const h of caves.holes ?? []) paint(h, 0);
  for (const k of bridgeCells) cut[k] = 1;
  return cut;
}

/** A smoothed copy of the cut over the box that holds it: `f[j * w + i]` belongs to grid cell (i0 + i, j0 + j). */
export interface CutField {
  cell: number;
  half: number;
  i0: number;
  j0: number;
  w: number;
  h: number;
  f: Float32Array;
}

const BLUR_PASSES = 3;
const PAD = BLUR_PASSES + 4;

/** Box-blur the cut a few times: thresholding the result at one half rounds every corner of the cell outline. */
export function blurCut(grid: CaveGrid, cut: Uint8Array): CutField | null {
  const { n, cell, half } = grid;
  let i0 = n;
  let i1 = -1;
  let j0 = n;
  let j1 = -1;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!cut[j * n + i]) continue;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
    }
  }
  if (i1 < 0) return null;
  i0 = Math.max(0, i0 - PAD);
  j0 = Math.max(0, j0 - PAD);
  i1 = Math.min(n - 1, i1 + PAD);
  j1 = Math.min(n - 1, j1 + PAD);
  const w = i1 - i0 + 1;
  const h = j1 - j0 + 1;
  let a = new Float32Array(w * h);
  let b = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) a[j * w + i] = cut[(j0 + j) * n + i0 + i]!;
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const l = a[j * w + Math.max(0, i - 1)]!;
        const r = a[j * w + Math.min(w - 1, i + 1)]!;
        b[j * w + i] = (l + a[j * w + i]! + r) / 3;
      }
    }
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const u = b[Math.max(0, j - 1) * w + i]!;
        const d = b[Math.min(h - 1, j + 1) * w + i]!;
        a[j * w + i] = (u + b[j * w + i]! + d) / 3;
      }
    }
  }
  b = new Float32Array(0);
  return { cell, half, i0, j0, w, h, f: a };
}

/** The field at a world point (bilinear between cell centres; zero outside the box). */
export function sampleCut(fd: CutField, x: number, z: number): number {
  const fi = (x + fd.half) / fd.cell - 0.5 - fd.i0;
  const fj = (z + fd.half) / fd.cell - 0.5 - fd.j0;
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  const tx = fi - i;
  const tz = fj - j;
  const at = (a: number, b: number) => (a < 0 || b < 0 || a >= fd.w || b >= fd.h ? 0 : fd.f[b * fd.w + a]!);
  const top = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
  const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
  return top + (bottom - top) * tz;
}

/** One texel per grid cell (plus the plane's margin) over the ground plane: row 0 is its −z edge, like the ground splat. */
export function cutTexture(fd: CutField, planeSize: number): THREE.DataTexture {
  const res = Math.round(planeSize / fd.cell);
  const margin = Math.round((planeSize - fd.half * 2) / 2 / fd.cell);
  const data = new Uint8Array(res * res);
  for (let j = 0; j < fd.h; j++) {
    const row = (fd.j0 + j + margin) * res + fd.i0 + margin;
    for (let i = 0; i < fd.w; i++) data[row + i] = Math.round(fd.f[j * fd.w + i]! * 255);
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Closed outlines of the cut (where the field crosses one half), as x, z pairs in metres. */
export function traceLoops(fd: CutField): number[][] {
  const { w, h, f, cell, half, i0, j0 } = fd;
  const val = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : f[j * w + i]!);
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  // A crossing sits on a lattice edge: key = (j * w + i) * 2 + (1 for the edge up to (i, j + 1), 0 for the one right to (i + 1, j)).
  const H = (i: number, j: number) => (j * w + i) * 2;
  const V = (i: number, j: number) => (j * w + i) * 2 + 1;
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const c0 = val(i, j) >= 0.5;
      const c1 = val(i + 1, j) >= 0.5;
      const c2 = val(i + 1, j + 1) >= 0.5;
      const c3 = val(i, j + 1) >= 0.5;
      const idx = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const e = [H(i, j), V(i + 1, j), H(i, j + 1), V(i, j)] as const;
      const centre = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4 >= 0.5;
      switch (idx) {
        case 1: case 14: link(e[3], e[0]); break;
        case 2: case 13: link(e[0], e[1]); break;
        case 3: case 12: link(e[3], e[1]); break;
        case 4: case 11: link(e[1], e[2]); break;
        case 6: case 9: link(e[0], e[2]); break;
        case 7: case 8: link(e[3], e[2]); break;
        case 5:
          if (centre) { link(e[0], e[1]); link(e[2], e[3]); } else { link(e[3], e[0]); link(e[1], e[2]); }
          break;
        case 10:
          if (centre) { link(e[3], e[0]); link(e[1], e[2]); } else { link(e[0], e[1]); link(e[2], e[3]); }
          break;
      }
    }
  }
  const pointOf = (key: number): [number, number] => {
    const vertical = key & 1;
    const k = key >> 1;
    const i = k % w;
    const j = Math.floor(k / w);
    const a = val(i, j);
    const b = vertical ? val(i, j + 1) : val(i + 1, j);
    const t = (0.5 - a) / (b - a || 1);
    return [(i0 + i + 0.5 + (vertical ? 0 : t)) * cell - half, (j0 + j + 0.5 + (vertical ? t : 0)) * cell - half];
  };
  const seen = new Set<number>();
  const loops: number[][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let prev = -1;
    let cur = start;
    for (;;) {
      seen.add(cur);
      const [x, z] = pointOf(cur);
      loop.push(x, z);
      const next = adj.get(cur)!.find((k) => k !== prev && !seen.has(k));
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 12) loops.push(loop);
  }
  return loops;
}

// ---- Island skirts and rim cliffs ----------------------------------------------------------------

const PLANE_Y = -46;
/** Where the walkable ground ends against rock: the cap sits at this height (buildCaveWalls). */
const ROCK_TOP = 3.6;
const ISLAND_RINGS = [0, -0.8, -4, -10, -17, -25, -34];
const CLIFF_RINGS = [0, -0.8, -4, -10, -20, -32, PLANE_Y - 2];
/** Rock palette (linear-ish, kept low: bloom turns anything bright into a white sheet), top to bottom. */
const RING_COLORS: [number, number, number][] = [
  [1.0, 0.8, 0.42],
  [0.3, 0.22, 0.18],
  [0.2, 0.14, 0.15],
  [0.14, 0.09, 0.14],
  [0.11, 0.06, 0.17],
  [0.1, 0.05, 0.22],
  [0.12, 0.06, 0.3],
];
const CRACK = [1.0, 0.72, 0.3];
const hash = (a: number, b: number) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Rock that hangs from every island edge (tapering to a point) and from the walls of the abyss, fading into its glow. */
export function skirtGeometry(loops: number[][], fd: CutField, groundAt: (x: number, z: number) => boolean): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const full of loops) {
    // One hanging column of rock per ~3 m of outline is plenty.
    const loop = full.length > 120 ? full.filter((_, i) => (i >> 1) % 2 === 0) : full;
    const m = loop.length / 2;
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < m; k++) {
      cx += loop[k * 2]!;
      cz += loop[k * 2 + 1]!;
    }
    cx /= m;
    cz /= m;
    let radius = 0;
    for (let k = 0; k < m; k++) radius += Math.hypot(loop[k * 2]! - cx, loop[k * 2 + 1]! - cz);
    radius /= m;
    // Normals of the outline, pointing towards the open air.
    const nrm: [number, number][] = [];
    let votes = 0;
    for (let k = 0; k < m; k++) {
      const a = (k + m - 1) % m;
      const b = (k + 1) % m;
      const tx = loop[b * 2]! - loop[a * 2]!;
      const tz = loop[b * 2 + 1]! - loop[a * 2 + 1]!;
      const len = Math.hypot(tx, tz) || 1;
      const nx = tz / len;
      const nz = -tx / len;
      nrm.push([nx, nz]);
      if (k % 4 === 0) votes += sampleCut(fd, loop[k * 2]! + nx * 1.6, loop[k * 2 + 1]! + nz * 1.6) > sampleCut(fd, loop[k * 2]! - nx * 1.6, loop[k * 2 + 1]! - nz * 1.6) ? 1 : -1;
    }
    const flip = votes < 0 ? -1 : 1;
    // Is the ground beside each vertex walkable (an island or the cavern's edge) or rock (the abyss' own wall)?
    const rim: boolean[] = [];
    let rimCount = 0;
    for (let k = 0; k < m; k++) {
      const [nx, nz] = nrm[k]!;
      const r = !groundAt(loop[k * 2]! - nx * flip * 2.4, loop[k * 2 + 1]! - nz * flip * 2.4);
      rim.push(r);
      if (r) rimCount++;
    }
    const island = rimCount === 0 && radius < 80 && sampleCut(fd, cx, cz) < 0.5;
    const rings = island ? ISLAND_RINGS : CLIFF_RINGS;
    const base = pos.length / 3;
    const depth = -rings[rings.length - 1]!;
    for (let k = 0; k < m; k++) {
      const px = loop[k * 2]!;
      const pz = loop[k * 2 + 1]!;
      const nx = nrm[k]![0] * flip;
      const nz = nrm[k]![1] * flip;
      const shade = 0.62 + 0.38 * (0.5 + 0.5 * (nx * -0.55 + nz * 0.8));
      const crack = hash(Math.floor(k / 3), Math.round(cx)) > 0.88;
      rings.forEach((y0, r) => {
        const d = -y0;
        // The outline's own height: against rock the wall hangs from the cap.
        const y = r === 0 && rim[k] ? ROCK_TOP : y0;
        // An island tapers to a point; a wall only roughens.
        // Near-vertical at first (the camera looks down at it), then curling in to the tip.
        const t = d / depth;
        const taper = island ? Math.min(0.94, 0.15 * t + 0.8 * t * t * t) * radius : 0;
        const crag = (hash(k, r + 3) - 0.5) * (1.2 + 5 * (d / depth)) + (hash(Math.floor(k / 2), r) - 0.5) * 2;
        const inset = taper + crag;
        pos.push(px - nx * inset, y, pz - nz * inset);
        // A wall's top edge is hidden under the cap: rock colour, not the island's gold lip.
        const c = RING_COLORS[r === 0 && rim[k] ? 2 : Math.min(r, RING_COLORS.length - 1)]!;
        // Gold seams run down some of the rock: Lumen matter showing through.
        const seam = crack && r >= 1 && r <= 5 ? 1 - Math.abs(r - 2.5) / 3.2 : 0;
        const s = r === 0 && !rim[k] ? 1 : shade;
        col.push(c[0] * s + (CRACK[0]! * 0.55 - c[0] * s) * seam, c[1] * s + (CRACK[1]! * 0.55 - c[1] * s) * seam, c[2] * s + (CRACK[2]! * 0.55 - c[2] * s) * seam);
      });
    }
    const R = rings.length;
    for (let k = 0; k < m; k++) {
      const k2 = (k + 1) % m;
      for (let r = 0; r < R - 1; r++) {
        const a = base + k * R + r;
        const b = base + k2 * R + r;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

// ---- Shader material helpers ---------------------------------------------------------------------

/** The deep glow under the abyss: violet in the dark, drifting gold clouds, brightest at its middle. */
function abyssMaterial(time: { value: number }, c: Cavern): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uCentre: { value: new THREE.Vector2(c.x, c.z) }, uRadius: { value: c.radius } },
    vertexShader: `varying vec2 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec2 uCentre; uniform float uRadius; varying vec2 vP;
      void main() {
        vec2 p = vP;
        float a = sin(p.x * 0.09 + uTime * 0.13) * sin(p.y * 0.11 - uTime * 0.1);
        float b = sin((p.x + p.y) * 0.05 + uTime * 0.08) * sin((p.x - p.y) * 0.067 - uTime * 0.07);
        float c = sin(p.x * 0.23 - uTime * 0.2) * sin(p.y * 0.21 + uTime * 0.16);
        float cloud = 0.5 + 0.5 * (a * 0.5 + b * 0.35 + c * 0.15);
        float mid = 1.0 - smoothstep(0.0, 1.0, length(p - uCentre) / uRadius);
        vec3 deep = vec3(0.02, 0.008, 0.09);
        vec3 violet = vec3(0.14, 0.05, 0.34);
        vec3 gold = vec3(0.5, 0.27, 0.07);
        vec3 col = mix(deep, violet, smoothstep(0.25, 0.85, cloud * 0.8 + mid * 0.35));
        col = mix(col, gold, smoothstep(0.62, 1.0, cloud * 0.7 + mid * 0.3) * 0.75);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
}

/** A translucent energy band: chevrons of light run along it, soft at the sides and dissolving at both ends. */
function bandMaterial(time: { value: number }, length: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uLevel: { value: 1 }, uLen: { value: length } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uLevel; uniform float uLen; varying vec2 vUv;
      void main() {
        float across = abs(vUv.x * 2.0 - 1.0);
        float along = vUv.y * uLen;
        float ends = smoothstep(0.0, 1.4, along) * smoothstep(0.0, 1.4, uLen - along);
        float sides = smoothstep(1.0, 0.7, across);
        float run = fract(along * 0.45 - uTime * 0.8 + across * 0.22);
        float chevron = pow(1.0 - run, 5.0);
        float a = uLevel * sides * ends * (0.1 + 0.4 * chevron);
        vec3 col = mix(vec3(0.5, 0.38, 1.0), vec3(1.0, 0.84, 0.5), chevron * 0.75 + 0.15);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

/** A column of light: streaks drift up it and it thins out with height, so it reads as rising out of sight. */
function beamMaterial(time: { value: number }, color: string, height: number, alpha: number, soft: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColor: { value: new THREE.Color(color) }, uHeight: { value: height }, uAlpha: { value: alpha }, uSoft: { value: soft } },
    vertexShader: `varying vec3 vL; varying vec3 vN; varying vec3 vV;
      void main() {
        vL = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uHeight; uniform float uAlpha; uniform float uSoft;
      varying vec3 vL; varying vec3 vN; varying vec3 vV;
      void main() {
        float h = clamp(vL.y / uHeight, 0.0, 1.0);
        float fade = pow(1.0 - h, 1.7) * smoothstep(0.0, 0.015, h);
        float ang = atan(vL.z, vL.x);
        float streak = 0.62 + 0.38 * sin(ang * 5.0 + vL.y * 0.045 - uTime * 0.6) * sin(ang * 3.0 - vL.y * 0.02 + uTime * 0.35);
        float pulse = 0.88 + 0.12 * sin(uTime * 1.3);
        // Soft sides: the column thins out where its wall turns edge-on, so it has no hard outline.
        float facing = smoothstep(0.0, 0.6, abs(dot(normalize(vN), normalize(vV))));
        gl_FragColor = vec4(uColor, uAlpha * fade * streak * pulse * mix(1.0, facing, uSoft));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

/** The pool of light a beam leaves on the ground. */
function poolMaterial(time: { value: number }, color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ring = 0.5 + 0.5 * sin(d * 22.0 - uTime * 1.6);
        float a = (1.0 - smoothstep(0.0, 1.0, d)) * (0.16 + 0.1 * ring) + (1.0 - smoothstep(0.0, 0.3, d)) * 0.25;
        vec3 c = mix(vec3(0.6, 0.4, 1.0), uColor, 1.0 - smoothstep(0.0, 0.7, d));
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

/**
 * A translucent, violet-rimmed copy of a prop's material (the Memory Halls' distorted memories):
 * the silhouette's edge glows and turns see-through.
 */
export function ghostMaterial(src: THREE.Material, color: string): THREE.Material {
  const mat = src.clone() as THREE.MeshStandardMaterial;
  mat.transparent = true;
  mat.depthWrite = true;
  const rim = new THREE.Color(color);
  mat.customProgramCacheKey = () => `ghost:${color}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.ghostRim = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 ghostRim;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `float ghostEdge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.2);
        outgoingLight += ghostRim * ghostEdge * 1.3;
        diffuseColor.a *= mix(1.0, 0.4, ghostEdge);
        #include <opaque_fragment>`,
      );
  };
  return mat;
}

// ---- The look itself -----------------------------------------------------------------------------

interface BridgeLook {
  cycle: BridgeCycle | undefined;
  band: THREE.ShaderMaterial;
  rails: THREE.MeshBasicMaterial;
  level: number;
}

/** Where a bridge lies over open air: its centre line from t0 to t1 (metres from `a`), as drawn. */
export function bridgeSpan(grid: CaveGrid, b: NonNullable<CaveGrid['bridges']>[number]): { t0: number; t1: number } | null {
  const dx = b.def.b[0] - b.def.a[0];
  const dz = b.def.b[1] - b.def.a[1];
  const full = Math.hypot(dx, dz);
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const k of b.cells) {
    const x = ((k % grid.n) + 0.5) * grid.cell - grid.half;
    const z = (Math.floor(k / grid.n) + 0.5) * grid.cell - grid.half;
    const along = ((x - b.def.a[0]) * dx + (z - b.def.a[1]) * dz) / full;
    t0 = Math.min(t0, along);
    t1 = Math.max(t1, along);
  }
  if (t0 > t1) return null;
  // The span runs from the first open cell's near side to the last one's far side: the islands' edges.
  return { t0: t0 - grid.cell / 2, t1: t1 + grid.cell / 2 };
}

export class CoreLook {
  private readonly time = { value: 0 };
  private readonly bridges: BridgeLook[] = [];
  private readonly fields: { field: Gravity; mat: THREE.MeshBasicMaterial }[] = [];
  private readonly beams: THREE.Object3D[] = [];
  private last = 0;

  constructor(
    root: THREE.Group,
    grid: CaveGrid,
    caves: CaveDef,
    cut: CutField | null,
    fields: Gravity[],
    beams: { x: number; z: number; radius: number; color: string }[],
    glow: THREE.Texture,
  ) {
    if (cut) this.buildAbyss(root, grid, caves, cut);
    this.buildBridges(root, grid);
    for (const beam of beams) this.buildBeam(root, beam);
    for (const field of fields) {
      const mat = new THREE.MeshBasicMaterial({ map: glow, color: '#b48cff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const w = field.rect ? field.rect.hx * 2 : field.radius * 2;
      const d = field.rect ? field.rect.hz * 2 : field.radius * 2;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(field.x, 0.09, field.z);
      root.add(mesh);
      this.fields.push({ field, mat });
    }
  }

  private buildAbyss(root: THREE.Group, grid: CaveGrid, caves: CaveDef, cut: CutField): void {
    // The glow far below, one plane per abyss: only ever seen through the cut in the ground.
    for (const a of caves.abyss ?? []) {
      const size = (a.radius + 24) * 2;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), abyssMaterial(this.time, a));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(a.x, PLANE_Y, a.z);
      root.add(plane);
    }
    const loops = traceLoops(cut);
    const solidAt = (x: number, z: number) => {
      const i = Math.floor((x + grid.half) / grid.cell);
      const j = Math.floor((z + grid.half) / grid.cell);
      return i >= 0 && j >= 0 && i < grid.n && j < grid.n && grid.data[j * grid.n + i] === 1 && !this.bridgeCells(grid).has(j * grid.n + i);
    };
    const geo = skirtGeometry(loops, cut, solidAt);
    if (geo) {
      // Lit and faceted like the cave walls, with a violet glow from the abyss under it.
      const rock = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, emissive: '#3a1a90', emissiveIntensity: 0.35, color: '#a090b8' });
      root.add(new THREE.Mesh(geo, rock));
    }
  }

  private bridgeSet: Set<number> | null = null;
  private bridgeCells(grid: CaveGrid): Set<number> {
    return (this.bridgeSet ??= bridgeCellsOf(grid));
  }

  /** Energy bridges: bright rails on both sides and a translucent band of running light between them. */
  private buildBridges(root: THREE.Group, grid: CaveGrid): void {
    const rail = new THREE.Color('#ffd484');
    for (const b of grid.bridges ?? []) {
      const span = bridgeSpan(grid, b);
      if (!span) continue;
      const dx = b.def.b[0] - b.def.a[0];
      const dz = b.def.b[1] - b.def.a[1];
      const full = Math.hypot(dx, dz);
      const OVER = 0.6;
      const len = span.t1 - span.t0 + OVER * 2;
      const centre = (span.t0 + span.t1) / 2 / full;
      const group = new THREE.Group();
      group.position.set(b.def.a[0] + dx * centre, 0.34, b.def.a[1] + dz * centre);
      group.rotation.y = Math.atan2(dx, dz);
      const band = bandMaterial(this.time, len);
      const plane = new THREE.PlaneGeometry(b.def.width - 0.2, len);
      const mesh = new THREE.Mesh(plane, band);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      group.add(mesh);
      // Rails run end to end at the span's inner side, with a post and a bright cap at each end.
      const half = b.def.width / 2 - 0.2;
      const railLen = len - OVER * 2 - 0.6;
      const parts: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        parts.push(new THREE.BoxGeometry(0.14, 0.14, railLen).translate(side * half, 0.5, 0));
        parts.push(new THREE.BoxGeometry(0.24, 0.08, railLen).translate(side * half, 0.02, 0));
        for (const end of [-1, 1]) parts.push(new THREE.BoxGeometry(0.3, 0.9, 0.3).translate(side * half, 0.4, end * (railLen / 2)));
      }
      const rails = new THREE.MeshBasicMaterial({ color: rail, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const merged = mergeGeometries(parts)!;
      parts.forEach((p) => p.dispose());
      const railMesh = new THREE.Mesh(merged, rails);
      railMesh.renderOrder = 2;
      group.add(railMesh);
      root.add(group);
      this.bridges.push({ cycle: b.def.cycle, band, rails, level: 1 });
    }
  }

  /** A column of light with a pool at its foot. */
  private buildBeam(root: THREE.Group, beam: { x: number; z: number; radius: number; color: string }): void {
    const H = 320;
    const group = new THREE.Group();
    group.position.set(beam.x, 0, beam.z);
    for (const [k, alpha] of [[1, 0.3], [2.2, 0.1], [4.5, 0.04]] as const) {
      const geo = new THREE.CylinderGeometry(beam.radius * k, beam.radius * k * 1.12, H, 28, 1, true).translate(0, H / 2, 0);
      const mesh = new THREE.Mesh(geo, beamMaterial(this.time, beam.color, H, alpha, k === 1 ? 0.5 : 1));
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      group.add(mesh);
    }
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(beam.radius * 14, beam.radius * 14), poolMaterial(this.time, beam.color));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.12;
    group.add(pool);
    root.add(group);
    this.beams.push(group);
  }

  /** Every frame with the game clock: bridges fade and flicker with their cycle, gravity fields shimmer, light drifts. */
  update(time: number): void {
    const dt = Math.max(0, Math.min(0.1, time - this.last));
    this.last = time;
    this.time.value = time;
    for (const b of this.bridges) {
      const st = bridgeState(b.cycle, time);
      // Flicker: the light stutters in the last second before it goes out.
      const target = !st.on ? 0 : st.flicker ? (Math.sin(time * 38) > 0 ? 1 : 0.15) : 1;
      b.level += (target - b.level) * Math.min(1, dt * (st.on ? 14 : 7));
      b.band.uniforms.uLevel!.value = b.level;
      b.rails.opacity = b.level * 0.6;
      b.band.visible = b.rails.visible = b.level > 0.01;
    }
    for (const { field, mat } of this.fields) {
      const { phase } = gravityPhase(field, time);
      mat.opacity = phase === 'idle' ? 0 : phase === 'shimmer' ? 0.12 + 0.1 * Math.sin(time * 16) : 0.18 + 0.04 * Math.sin(time * 5);
    }
  }
}
