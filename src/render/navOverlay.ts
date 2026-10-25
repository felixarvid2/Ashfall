/**
 * What enemies are thinking, drawn in the world:
 *  - AwarenessMarkers: a "!" pops over an enemy that spots you, a "?" bobs over one searching for you.
 *  - NavDebugOverlay (debug panel or ?nav): the flow field toward the player as arrows coloured by
 *    walking distance, danger in orange, walls in red, and a line from every hunting enemy to where
 *    it is heading, coloured by why (field, ring place, firing spot, retreat, A* route, search).
 */
import * as THREE from 'three';
import { Dead, EnemyAI, Transform } from '../core/components';
import type { Entity, World } from '../core/ecs';
import { t } from '../data/i18n';
import { cellOf, flowNext, type NavMode, type NavService } from '../systems/navigation';

function glyphTexture(glyph: string, fill: string): THREE.Texture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(10, 6, 4, 0.9)';
  g.strokeText(glyph, size / 2, size / 2 + 3);
  g.fillStyle = fill;
  g.fillText(glyph, size / 2, size / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Seconds a "!" stays up. */
const SPOT_TIME = 1.3;

export class AwarenessMarkers {
  private readonly root = new THREE.Group();
  private readonly marks = new Map<Entity, THREE.Sprite>();
  private readonly spotted: THREE.SpriteMaterial;
  private readonly searching: THREE.SpriteMaterial;

  constructor(scene: THREE.Object3D) {
    const mat = (glyph: string, fill: string) =>
      new THREE.SpriteMaterial({ map: glyphTexture(glyph, fill), depthTest: false, depthWrite: false, transparent: true, fog: false });
    this.spotted = mat('!', '#ff5a2a');
    this.searching = mat('?', '#ffd23a');
    this.root.renderOrder = 10;
    scene.add(this.root);
  }

  /** `objects` are the renderer's models (for each enemy's height); `time` is game time. */
  update(world: World, objects: ReadonlyMap<Entity, THREE.Object3D>, time: number): void {
    const seen = new Set<Entity>();
    for (const e of world.query(EnemyAI, Transform)) {
      if (world.has(e, Dead)) continue;
      const ai = world.req(e, EnemyAI);
      const since = ai.spottedAt === undefined ? Infinity : time - ai.spottedAt;
      const kind = since >= 0 && since < SPOT_TIME ? 'spotted' : ai.search ? 'searching' : null;
      if (!kind) continue;
      const obj = objects.get(e);
      if (!obj) continue;
      seen.add(e);
      let s = this.marks.get(e);
      if (!s) {
        s = new THREE.Sprite(this.spotted);
        s.renderOrder = 10;
        obj.updateMatrixWorld(true);
        // Above the head, whatever the model's size.
        s.userData.height = new THREE.Box3().setFromObject(obj).max.y - obj.position.y + 0.55;
        this.marks.set(e, s);
        this.root.add(s);
      }
      s.material = kind === 'spotted' ? this.spotted : this.searching;
      // "!" pops in with a little overshoot; "?" bobs.
      const pop = kind === 'spotted' ? (since < 0.18 ? (since / 0.18) * 1.35 : 1 + 0.35 * Math.max(0, 1 - (since - 0.18) / 0.2)) : 1;
      const bob = kind === 'searching' ? Math.sin(time * 4 + e) * 0.08 : 0;
      s.scale.setScalar(0.9 * pop);
      s.position.set(obj.position.x, obj.position.y + (s.userData.height as number) + bob, obj.position.z);
      s.material.opacity = kind === 'spotted' && since > SPOT_TIME - 0.25 ? (SPOT_TIME - since) / 0.25 : 1;
    }
    for (const [e, s] of this.marks) {
      if (seen.has(e)) continue;
      this.root.remove(s);
      this.marks.delete(e);
    }
  }

  dispose(): void {
    for (const s of this.marks.values()) this.root.remove(s);
    this.marks.clear();
  }
}

const MODE_COLOUR: Record<NavMode, string> = {
  direct: '#9aa0a6',
  field: '#3ad8ff',
  slot: '#5aff7a',
  snipe: '#ff4ad8',
  flee: '#ffe24a',
  path: '#ffffff',
  search: '#ffb02a',
  escape: '#ff3a2a',
};

export class NavDebugOverlay {
  private readonly root = new THREE.Group();
  private readonly arrows: THREE.InstancedMesh;
  private readonly walls: THREE.InstancedMesh;
  private readonly lines: THREE.LineSegments;
  private readonly legend: HTMLDivElement;
  private builtAt = -1;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly c = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(private readonly scene: THREE.Object3D, maxCells = 81 * 81) {
    const arrow = new THREE.BufferGeometry();
    arrow.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.36, -0.2, 0, -0.22, 0.2, 0, -0.22], 3));
    arrow.setIndex([0, 1, 2]);
    const flat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.arrows = new THREE.InstancedMesh(arrow, flat, maxCells);
    this.walls = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2), flat.clone(), maxCells);
    (this.walls.material as THREE.MeshBasicMaterial).opacity = 0.35;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(600 * 6), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(600 * 6), 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, fog: false, transparent: true }));
    this.lines.renderOrder = 9;
    this.lines.frustumCulled = false;
    this.arrows.frustumCulled = this.walls.frustumCulled = false;
    this.root.add(this.walls, this.arrows, this.lines);
    scene.add(this.root);
    this.legend = document.createElement('div');
    this.legend.className = 'nav-legend';
    document.body.appendChild(this.legend);
  }

  update(nav: NavService | undefined, world: World): void {
    if (!nav) {
      this.arrows.count = this.walls.count = 0;
      this.lines.geometry.setDrawRange(0, 0);
      this.legend.innerHTML = this.legendHtml(null);
      this.builtAt = -1;
      return;
    }
    if (nav.grid.builtAt !== this.builtAt) {
      this.builtAt = nav.grid.builtAt;
      this.drawField(nav);
      this.legend.innerHTML = this.legendHtml(nav);
    }
    this.drawIntents(world, nav);
  }

  private drawField(nav: NavService): void {
    const f = nav.player;
    const { n, cell, x0, z0, blocked, cost, dist } = f;
    let a = 0;
    let w = 0;
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    for (let k = 0; k < n * n; k++) {
      const i = k % n;
      const j = (k - i) / n;
      pos.set(x0 + (i + 0.5) * cell, 0.07, z0 + (j + 0.5) * cell);
      if (blocked[k]! & 1) {
        // Only the edge of the blocked area, so rock doesn't paint the screen red.
        const edge = (i > 0 && !(blocked[k - 1]! & 1)) || (i < n - 1 && !(blocked[k + 1]! & 1)) || (j > 0 && !(blocked[k - n]! & 1)) || (j < n - 1 && !(blocked[k + n]! & 1));
        if (!edge) continue;
        this.m.compose(pos, this.q.identity(), one);
        this.walls.setMatrixAt(w, this.m);
        this.walls.setColorAt(w++, this.c.set('#ff2a2a'));
        continue;
      }
      if (!Number.isFinite(dist[k]!)) continue;
      const next = flowNext(f, dist, k);
      if (next < 0) continue;
      const ni = next % n;
      const nj = (next - ni) / n;
      this.q.setFromAxisAngle(this.up, Math.atan2(ni - i, nj - j));
      this.m.compose(pos, this.q, one);
      this.arrows.setMatrixAt(a, this.m);
      // Near: cyan, through blue to violet 40 m out. Danger: orange.
      if (cost[k]! >= 50) this.c.set('#ff8a2a');
      else this.c.setHSL(0.5 + 0.32 * Math.min(1, dist[k]! / 400), 0.95, 0.55);
      this.arrows.setColorAt(a++, this.c);
    }
    this.arrows.count = a;
    this.walls.count = w;
    this.arrows.instanceMatrix.needsUpdate = this.walls.instanceMatrix.needsUpdate = true;
    if (this.arrows.instanceColor) this.arrows.instanceColor.needsUpdate = true;
    if (this.walls.instanceColor) this.walls.instanceColor.needsUpdate = true;
  }

  private drawIntents(world: World, nav: NavService): void {
    const posAttr = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    let v = 0;
    const max = posAttr.count;
    for (const e of world.query(EnemyAI, Transform)) {
      if (v + 2 > max) break;
      if (world.has(e, Dead)) continue;
      const ai = world.req(e, EnemyAI);
      if (!ai.intent || !ai.aggro) continue;
      const t = world.req(e, Transform);
      // Only the hunt round the player (far-off enemies are asleep).
      if (cellOf(nav.grid, t.x, t.z) < 0) continue;
      this.c.set(MODE_COLOUR[ai.intent.mode]);
      posAttr.setXYZ(v, t.x, 0.15, t.z);
      colAttr.setXYZ(v++, this.c.r, this.c.g, this.c.b);
      posAttr.setXYZ(v, ai.intent.x, 0.15, ai.intent.z);
      colAttr.setXYZ(v++, this.c.r, this.c.g, this.c.b);
      // The rest of a planned route.
      let px = ai.intent.x;
      let pz = ai.intent.z;
      for (const p of ai.path?.slice(1) ?? []) {
        if (v + 2 > max) break;
        posAttr.setXYZ(v, px, 0.15, pz);
        colAttr.setXYZ(v++, 0.6, 0.6, 0.6);
        posAttr.setXYZ(v, p.x, 0.15, p.z);
        colAttr.setXYZ(v++, 0.6, 0.6, 0.6);
        px = p.x;
        pz = p.z;
      }
    }
    posAttr.needsUpdate = colAttr.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, v);
  }

  private legendHtml(nav: NavService | null): string {
    const head = nav ? t('debug.nav.head', { fields: nav.fields.size, ms: nav.buildMs.toFixed(2) }) : t('debug.nav.idle');
    const rows = (Object.keys(MODE_COLOUR) as NavMode[]).map((m) => `<span><i style="background:${MODE_COLOUR[m]}"></i>${t(`debug.nav.${m}`)}</span>`).join('');
    return `<b>${head}</b>${rows}`;
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.arrows.geometry.dispose();
    this.walls.geometry.dispose();
    this.lines.geometry.dispose();
    this.legend.remove();
  }
}

// ---- Guide line to the first objective (F007) ---------------------------------------------------------------

/** The line fades out inside this distance (m) and is fully visible beyond `GUIDE_FULL`. */
export const GUIDE_NEAR = 15;
export const GUIDE_FULL = 25;
/** Metres between dots, how many dots at most, and how fast they march toward the goal (m/s). */
const GUIDE_SPACING = 2.2;
const GUIDE_DOTS = 28;
const GUIDE_SPEED = 2.5;

/** Opacity of the guide line at `dist` metres from the objective: 0 within 15 m, 1 from 25 m. */
export function guideOpacity(dist: number): number {
  return Math.min(1, Math.max(0, (dist - GUIDE_NEAR) / (GUIDE_FULL - GUIDE_NEAR)));
}

/**
 * Dot positions on the straight line from (px, pz) toward (tx, tz): up to `GUIDE_DOTS` of them, `GUIDE_SPACING` apart,
 * sliding toward the goal with `time`. No dot lies past the goal.
 */
export function guideDots(px: number, pz: number, tx: number, tz: number, time: number): { x: number; z: number }[] {
  const dist = Math.hypot(tx - px, tz - pz);
  if (dist < 1e-3) return [];
  const dx = (tx - px) / dist;
  const dz = (tz - pz) / dist;
  const shift = (time * GUIDE_SPEED) % GUIDE_SPACING;
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < GUIDE_DOTS; i++) {
    const d = 2 + i * GUIDE_SPACING + shift;
    if (d >= dist) break;
    out.push({ x: px + dx * d, z: pz + dz * d });
  }
  return out;
}

/**
 * A golden dotted line on the ground from the hero toward the first objective. It is a straight line, not a route:
 * it shows the direction, and the minimap and quest tracker still carry the details.
 */
export class GuideLine {
  private readonly points: THREE.Points;
  private readonly position: THREE.BufferAttribute;

  constructor(private readonly scene: THREE.Object3D) {
    const geometry = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(GUIDE_DOTS * 3), 3);
    geometry.setAttribute('position', this.position);
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: '#ffd23a', size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.points.name = 'guideLine';
    this.points.renderOrder = 8;
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** The number of dots currently drawn (tests, debug). */
  get count(): number {
    return this.points.visible ? this.points.geometry.drawRange.count : 0;
  }

  /** `goal` null hides the line. */
  update(px: number, pz: number, goal: { x: number; z: number } | null, time: number): void {
    const opacity = goal ? guideOpacity(Math.hypot(goal.x - px, goal.z - pz)) : 0;
    if (!goal || opacity <= 0) {
      this.points.visible = false;
      return;
    }
    const dots = guideDots(px, pz, goal.x, goal.z, time);
    dots.forEach((d, i) => this.position.setXYZ(i, d.x, 0.14, d.z));
    this.position.needsUpdate = true;
    this.points.geometry.setDrawRange(0, dots.length);
    (this.points.material as THREE.PointsMaterial).opacity = opacity * (0.75 + 0.25 * Math.sin(time * 4));
    this.points.visible = dots.length > 0;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
