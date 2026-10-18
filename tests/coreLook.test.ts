import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { caveGrid, setBridges, walkableAt } from '../src/data/zones/caves';
import { BRIDGES, ISLANDS, THE_CORE } from '../src/data/zones/theCore';
import { scatterInstances } from '../src/world/arena';
import { blurCut, bridgeSpan, cutCells, ghostMaterial, sampleCut, skirtGeometry, traceLoops } from '../src/render/coreLook';
import * as THREE from 'three';

const grid = caveGrid(THE_CORE)!;
const caves = THE_CORE.caves!;
const cut = cutCells(grid, caves);
const field = blurCut(grid, cut)!;
const cellAt = (x: number, z: number) => Math.floor((z + grid.half) / grid.cell) * grid.n + Math.floor((x + grid.half) / grid.cell);

describe("the Core's cut ground (abyss and bridges)", () => {
  it('opens the abyss and the bridge strips, never walkable ground or melt pools', () => {
    for (const isl of ISLANDS) expect(cut[cellAt(isl.x, isl.z)], isl.id).toBe(0);
    for (const h of caves.holes ?? []) expect(cut[cellAt(h.x, h.z)], 'melt pool').toBe(0);
    for (const b of grid.bridges ?? []) for (const k of b.cells) expect(cut[k], b.def.id).toBe(1);
    // Open air in the Gardens' abyss, between islands.
    const a = caves.abyss![0]!;
    let air = 0;
    for (let d = 40; d < a.radius; d += 6) if (cut[cellAt(a.x + d, a.z)]) air++;
    expect(air).toBeGreaterThan(5);
    // The same whatever the bridges' on/off state: the cut is drawn geometry, not gameplay.
    setBridges(grid, 5);
    expect(cutCells(grid, caves)).toEqual(cut);
    setBridges(grid, 0);
  });

  it('smooths the staircase: the field falls from the cut to the ground over a few metres', () => {
    const isl = ISLANDS[0]!;
    expect(sampleCut(field, isl.x, isl.z)).toBe(0);
    expect(field.f.reduce((m, v) => Math.max(m, v), 0)).toBeCloseTo(1, 2);
    // Walk out of an island along +x: monotone from 0 up to 1 with values in between (no one-cell jump).
    const samples: number[] = [];
    for (let d = 0; d < isl.radius + 14; d += 0.5) samples.push(sampleCut(field, isl.x + d, isl.z));
    const mid = samples.filter((v) => v > 0.1 && v < 0.9).length;
    expect(mid).toBeGreaterThanOrEqual(4);
  });

  it('traces one closed outline per island, lying on the half-way line', () => {
    const loops = traceLoops(field);
    expect(loops.length).toBeGreaterThanOrEqual(ISLANDS.length);
    for (const loop of loops) {
      expect(loop.length).toBeGreaterThanOrEqual(12);
      for (let k = 0; k < loop.length; k += 2) expect(Math.abs(sampleCut(field, loop[k]!, loop[k + 1]!) - 0.5)).toBeLessThan(0.1);
    }
    for (const isl of ISLANDS) {
      const around = loops.find((loop) => {
        const n = loop.length / 2;
        let cx = 0;
        let cz = 0;
        for (let k = 0; k < n; k++) {
          cx += loop[k * 2]!;
          cz += loop[k * 2 + 1]!;
        }
        return Math.hypot(cx / n - isl.x, cz / n - isl.z) < 6 && n < 400;
      });
      // An island that touches the abyss' rim is part of the rim's outline.
      const rim = caves.abyss!.some((a) => Math.hypot(isl.x - a.x, isl.z - a.z) + isl.radius > a.radius - 4);
      if (!rim) expect(around, isl.id).toBeDefined();
    }
  });

  it('hangs rock from the outlines, tapering below the islands', () => {
    const loops = traceLoops(field);
    const geo = skirtGeometry(loops, field, (x, z) => walkableAt(grid, x, z))!;
    expect(geo.getAttribute('position').count).toBeGreaterThan(1000);
    const pos = geo.getAttribute('position');
    let low = 0;
    for (let i = 0; i < pos.count; i++) low = Math.min(low, pos.getY(i));
    // Deeper than any island is tall, no deeper than the glow below.
    expect(low).toBeLessThan(-30);
    expect(low).toBeGreaterThan(-52);
    geo.dispose();
  });

  it('draws every bridge between island edges: the span ends where walkable ground begins', () => {
    for (const b of grid.bridges!) {
      const span = bridgeSpan(grid, b)!;
      expect(span, b.def.id).not.toBeNull();
      const dx = b.def.b[0] - b.def.a[0];
      const dz = b.def.b[1] - b.def.a[1];
      const full = Math.hypot(dx, dz);
      const at = (t: number) => [b.def.a[0] + (dx / full) * t, b.def.a[1] + (dz / full) * t] as const;
      // Over the strip itself: cut. Just beyond each end (on the island): ground.
      const [mx, mz] = at((span.t0 + span.t1) / 2);
      expect(cut[cellAt(mx, mz)], `${b.def.id} middle`).toBe(1);
      const [sx, sz] = at(span.t0 - 1.6);
      const [ex, ez] = at(span.t1 + 1.6);
      expect(cut[cellAt(sx, sz)], `${b.def.id} start`).toBe(0);
      expect(cut[cellAt(ex, ez)], `${b.def.id} end`).toBe(0);
    }
    expect(BRIDGES.length).toBe(grid.bridges!.length);
  });
});

describe("the Core's look data", () => {
  it('has a ground that exists, covers the base and paints only layers it has', () => {
    const ground = THE_CORE.ground!;
    expect(ground.base).toBe('lumen_matter');
    expect(existsSync(new URL('../public/assets/textures/ground/lumen_matter.webp', import.meta.url))).toBe(true);
    expect(ground.layers.length).toBeLessThanOrEqual(6);
    for (const p of ground.patches) expect(p.layer).toBeLessThan(ground.layers.length);
    // The base is the path: no road ribbon over it, so the rusty plate of the bore fades by its patches.
    for (const road of THE_CORE.roads) expect(road.surface, road.id).toBe(ground.base);
  });

  it('keeps the shaft landmark lit by its beam, and the columns at a sensible size without a flat glow', () => {
    expect(THE_CORE.beams!.length).toBeGreaterThanOrEqual(1);
    const columns = THE_CORE.props.filter((p) => p.asset === 'prop.core_column');
    expect(columns.length).toBeGreaterThan(10);
    for (const c of columns) {
      // A column is 5 m at scale 1: the shaft's core is the tallest at about 17 m, the rest 5–8 m.
      expect(c.scale ?? 1, `${c.x},${c.z}`).toBeLessThanOrEqual(3.4);
      if (c.landmark) expect(c.scale).toBe(3.4);
      else expect(c.scale ?? 1).toBeLessThanOrEqual(1.5);
      // `glow` paints the whole mesh with a flat emissive: it turned the columns cream and translucent-looking.
      expect(c.glow).toBeUndefined();
    }
    for (const d of THE_CORE.props.filter((p) => p.asset === 'prop.core_door')) expect(d.scale ?? 1).toBeLessThanOrEqual(1);
  });

  it('scatters the four memories inside their circles, leaning and floating, deterministically', () => {
    const memories = THE_CORE.scatter.map((def, index) => ({ def, index })).filter(({ def }) => def.within);
    expect(memories.length).toBeGreaterThanOrEqual(12);
    const seen = new Set<string>();
    for (const { def, index } of memories) {
      const w = def.within!;
      const spots = scatterInstances(THE_CORE, index);
      expect(spots.length, def.asset).toBeGreaterThan(5);
      expect(scatterInstances(THE_CORE, index)).toEqual(spots);
      for (const s of spots) {
        expect(Math.hypot(s.x - w.x, s.z - w.z)).toBeLessThanOrEqual(w.radius);
        expect(Math.abs(s.lean!.x)).toBeLessThanOrEqual(def.tilt!);
        expect(s.lift!).toBeGreaterThanOrEqual(0);
        expect(s.lift!).toBeLessThanOrEqual(def.lift!);
        expect(walkableAt(grid, s.x, s.z)).toBe(true);
      }
      seen.add(`${w.x},${w.z}`);
    }
    expect(seen.size).toBe(4);
  });

  it('turns a material into a violet-rimmed ghost', () => {
    const base = new THREE.MeshStandardMaterial({ color: '#888888' });
    const ghost = ghostMaterial(base, '#b48cff') as THREE.MeshStandardMaterial;
    expect(ghost).not.toBe(base);
    expect(ghost.transparent).toBe(true);
    expect(base.transparent).toBe(false);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
    ghost.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain('ghostRim');
    expect(shader.fragmentShader).toContain('diffuseColor.a *=');
    expect(shader.uniforms.ghostRim).toBeDefined();
  });
});
