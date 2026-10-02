/**
 * Minimap (top right) and full map (M): fog of war, roads, discovered teleporters and points of
 * interest, rotated to match the camera. Clicking a discovered teleporter on the full map travels there.
 */
import { t } from '../data/i18n';
import type { PoiKind } from '../data/zones/zoneTypes';
import { revealedFraction, type ZoneRuntime } from '../world/zone';

const MINI_SIZE = 180;
/** Metres shown from the centre of the minimap to its edge. */
const MINI_RANGE = 85;
const MAP_SIZE = 640;

const POI_STYLE: Partial<Record<PoiKind, { color: string; r: number; shape: 'dot' | 'square' | 'diamond' }>> = {
  dungeon: { color: '#ff8a3a', r: 5, shape: 'square' },
  bunker: { color: '#c8a060', r: 4, shape: 'square' },
  stronghold: { color: '#ff4a3a', r: 6, shape: 'square' },
  boss: { color: '#ff2a2a', r: 6, shape: 'diamond' },
  event: { color: '#ffd23a', r: 4, shape: 'diamond' },
  relic: { color: '#9fb8ff', r: 3, shape: 'diamond' },
  signalTower: { color: '#8ad2ff', r: 3, shape: 'dot' },
};

export interface MapMarker {
  x: number;
  z: number;
  color: string;
}

/** A 2-D view transform: world (x, z) → canvas pixels, rotated so "up" matches the camera. */
interface View {
  cx: number;
  cy: number;
  /** World point at the canvas centre. */
  px: number;
  pz: number;
  scale: number;
  cos: number;
  sin: number;
}

function project(v: View, x: number, z: number): [number, number] {
  const dx = x - v.px;
  const dz = z - v.pz;
  // Screen right is world (cos yaw, −sin yaw); screen down (towards the camera) is (sin yaw, cos yaw).
  return [v.cx + (dx * v.cos - dz * v.sin) * v.scale, v.cy + (dx * v.sin + dz * v.cos) * v.scale];
}

function unproject(v: View, sx: number, sy: number): [number, number] {
  const a = (sx - v.cx) / v.scale;
  const b = (sy - v.cy) / v.scale;
  return [v.px + a * v.cos + b * v.sin, v.pz - a * v.sin + b * v.cos];
}

export class MapUi {
  private readonly mini: HTMLCanvasElement;
  private readonly miniCtx: CanvasRenderingContext2D;
  private readonly full: HTMLDivElement;
  private readonly fullCanvas: HTMLCanvasElement;
  private readonly fullCtx: CanvasRenderingContext2D;
  private readonly fullInfo: HTMLDivElement;
  /** Fog of war as one pixel per map cell, scaled up when drawn. */
  private fog: HTMLCanvasElement | null = null;
  private fogDirty = 0;
  private timer = 0;
  private readonly cos: number;
  private readonly sin: number;
  /** Extra markers (quest objectives) drawn on both maps. */
  markers: MapMarker[] = [];

  constructor(
    parent: HTMLElement,
    private readonly zone: () => ZoneRuntime | undefined,
    private readonly player: () => { x: number; z: number; facing: number },
    private readonly travel: (teleporterId: string) => void,
    /** Points of interest the player has found (opened/visited), to show on the map. */
    private readonly found: () => ReadonlySet<string>,
    /** Camera yaw (radians): both maps are rotated so their "up" is the screen's up. */
    private readonly yaw = Math.PI / 4,
  ) {
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    this.mini = document.createElement('canvas');
    this.mini.className = 'minimap';
    this.mini.width = this.mini.height = MINI_SIZE;
    this.miniCtx = this.mini.getContext('2d')!;

    this.full = document.createElement('div');
    this.full.className = 'map-panel panel';
    this.full.hidden = true;
    const title = document.createElement('h2');
    title.textContent = t('map.title');
    this.fullCanvas = document.createElement('canvas');
    this.fullCanvas.width = this.fullCanvas.height = MAP_SIZE;
    this.fullCanvas.className = 'map-canvas';
    this.fullCtx = this.fullCanvas.getContext('2d')!;
    this.fullInfo = document.createElement('div');
    this.fullInfo.className = 'inv-hint';
    this.full.append(title, this.fullCanvas, this.fullInfo);
    this.fullCanvas.addEventListener('click', (e) => this.onMapClick(e));
    parent.append(this.mini, this.full);
  }

  get open(): boolean {
    return !this.full.hidden;
  }

  toggle(): void {
    this.full.hidden = !this.full.hidden;
    if (this.open) this.drawFull();
  }

  update(dt: number): void {
    const zone = this.zone();
    this.mini.hidden = !zone;
    if (!zone) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.15;
    this.drawMini(zone);
    if (this.open) this.drawFull();
  }

  private fullView(zone: ZoneRuntime): View {
    const half = zone.def.halfSize;
    // The rotated square must fit: its diagonal spans the canvas.
    const scale = MAP_SIZE / (half * 2 * (Math.abs(this.cos) + Math.abs(this.sin)));
    return { cx: MAP_SIZE / 2, cy: MAP_SIZE / 2, px: 0, pz: 0, scale, cos: this.cos, sin: this.sin };
  }

  private drawMini(zone: ZoneRuntime): void {
    const c = this.miniCtx;
    const p = this.player();
    const v: View = { cx: MINI_SIZE / 2, cy: MINI_SIZE / 2, px: p.x, pz: p.z, scale: MINI_SIZE / (MINI_RANGE * 2), cos: this.cos, sin: this.sin };
    c.clearRect(0, 0, MINI_SIZE, MINI_SIZE);
    c.save();
    c.beginPath();
    c.arc(MINI_SIZE / 2, MINI_SIZE / 2, MINI_SIZE / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(8,7,6,0.85)';
    c.fillRect(0, 0, MINI_SIZE, MINI_SIZE);
    this.drawWorld(c, zone, v, MINI_RANGE * 1.5);
    c.restore();
    this.arrow(c, MINI_SIZE / 2, MINI_SIZE / 2, p.facing, 7);
    c.strokeStyle = '#6a5a44';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(MINI_SIZE / 2, MINI_SIZE / 2, MINI_SIZE / 2 - 2, 0, Math.PI * 2);
    c.stroke();
  }

  private drawFull(): void {
    const zone = this.zone();
    if (!zone) return;
    const c = this.fullCtx;
    const v = this.fullView(zone);
    c.fillStyle = '#080706';
    c.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    this.drawWorld(c, zone, v, Infinity);
    const p = this.player();
    const [sx, sy] = project(v, p.x, p.z);
    this.arrow(c, sx, sy, p.facing, 8);
    this.fullInfo.textContent = `${t('map.explored', { pct: Math.round(revealedFraction(zone) * 100) })} · ${t('map.travel')}`;
  }

  private fogCanvas(zone: ZoneRuntime): HTMLCanvasElement {
    const n = zone.cells;
    if (!this.fog) {
      this.fog = document.createElement('canvas');
      this.fog.width = this.fog.height = n;
    }
    // Repaint at most every ~0.6 s (the reveal is coarse anyway).
    if (this.fogDirty-- <= 0) {
      this.fogDirty = 3;
      const fc = this.fog.getContext('2d')!;
      const img = fc.createImageData(n, n);
      for (let i = 0; i < n * n; i++) {
        if (!zone.revealed[i]) continue;
        img.data[i * 4] = 0x2a;
        img.data[i * 4 + 1] = 0x26;
        img.data[i * 4 + 2] = 0x22;
        img.data[i * 4 + 3] = 255;
      }
      fc.putImageData(img, 0, 0);
    }
    return this.fog;
  }

  private drawWorld(c: CanvasRenderingContext2D, zone: ZoneRuntime, v: View, range: number): void {
    const def = zone.def;
    const cell = def.mapCell;
    const half = def.halfSize;
    const near = (x: number, z: number) => Math.abs(x - v.px) < range && Math.abs(z - v.pz) < range;
    const seen = (x: number, z: number) => {
      const i = Math.floor((x + half) / cell);
      const j = Math.floor((z + half) / cell);
      return i >= 0 && j >= 0 && i < zone.cells && j < zone.cells && zone.revealed[j * zone.cells + i] === 1;
    };
    // World-space drawing: canvas (x, y) = world (x, z).
    c.save();
    const a = v.scale * v.cos;
    const b = v.scale * v.sin;
    c.setTransform(a, b, -b, a, v.cx - (a * v.px - b * v.pz), v.cy - (b * v.px + a * v.pz));
    c.imageSmoothingEnabled = false;
    // Fog image row j is world z = −half + j·cell, which is canvas y: no flip needed.
    c.drawImage(this.fogCanvas(zone), -half, -half, zone.cells * cell, zone.cells * cell);
    // Roads (only revealed segments).
    c.strokeStyle = '#7a6a54';
    c.lineCap = 'round';
    for (const road of def.roads) {
      c.lineWidth = Math.max(1.5 / v.scale, road.width * 0.8);
      for (let k = 0; k < road.points.length - 1; k++) {
        const [ax, az] = road.points[k]!;
        const [bx, bz] = road.points[k + 1]!;
        const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / cell);
        for (let s = 0; s < steps; s++) {
          const x0 = ax + ((bx - ax) * s) / steps;
          const z0 = az + ((bz - az) * s) / steps;
          const x1 = ax + ((bx - ax) * (s + 1)) / steps;
          const z1 = az + ((bz - az) * (s + 1)) / steps;
          if (!near(x0, z0) || !seen((x0 + x1) / 2, (z0 + z1) / 2)) continue;
          c.beginPath();
          c.moveTo(x0, z0);
          c.lineTo(x1, z1);
          c.stroke();
        }
      }
    }
    // Hubs.
    c.strokeStyle = '#7dd8a0';
    c.lineWidth = 1.5 / v.scale;
    for (const h of def.hubs) {
      if (!seen(h.x, h.z)) continue;
      c.beginPath();
      c.arc(h.x, h.z, Math.max(4 / v.scale, h.radius), 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();

    // Markers in screen space so they stay upright.
    const found = this.found();
    for (const poi of def.pois) {
      const style = POI_STYLE[poi.kind];
      if (!style || !near(poi.x, poi.z) || !seen(poi.x, poi.z)) continue;
      if (poi.kind === 'relic' && !found.has(poi.id)) continue; // relics stay hidden until found
      if (found.has(poi.id) && (poi.kind === 'event' || poi.kind === 'signalTower')) this.mark(c, ...project(v, poi.x, poi.z), '#5a5a5a', style.r, style.shape);
      else this.mark(c, ...project(v, poi.x, poi.z), style.color, style.r, style.shape);
    }
    for (const tp of def.teleporters) {
      if (!zone.discovered.has(tp.id) || !near(tp.x, tp.z)) continue;
      this.mark(c, ...project(v, tp.x, tp.z), '#5ad2ff', 5, 'diamond');
    }
    for (const m of this.markers) {
      let [sx, sy] = project(v, m.x, m.z);
      // On the minimap, off-range quest markers are pinned to the rim.
      if (range !== Infinity) {
        const dx = sx - v.cx;
        const dy = sy - v.cy;
        const d = Math.hypot(dx, dy);
        const max = v.cx - 8;
        if (d > max) {
          sx = v.cx + (dx / d) * max;
          sy = v.cy + (dy / d) * max;
        }
      }
      this.mark(c, sx, sy, m.color, 5, 'dot');
    }
  }

  private mark(c: CanvasRenderingContext2D, x: number, y: number, color: string, r: number, shape: 'dot' | 'square' | 'diamond'): void {
    c.fillStyle = color;
    c.strokeStyle = '#000';
    c.lineWidth = 1;
    c.beginPath();
    if (shape === 'dot') c.arc(x, y, r, 0, Math.PI * 2);
    else if (shape === 'square') c.rect(x - r, y - r, r * 2, r * 2);
    else {
      c.moveTo(x, y - r);
      c.lineTo(x + r, y);
      c.lineTo(x, y + r);
      c.lineTo(x - r, y);
      c.closePath();
    }
    c.fill();
    c.stroke();
  }

  private arrow(c: CanvasRenderingContext2D, x: number, y: number, facing: number, size: number): void {
    c.save();
    c.translate(x, y);
    // facing f points along world (sin f, cos f); on screen that is (sin(f − yaw), cos(f − yaw)).
    c.rotate(Math.PI - facing + this.yaw);
    c.fillStyle = '#ffd27a';
    c.strokeStyle = '#000';
    c.beginPath();
    c.moveTo(0, -size);
    c.lineTo(size * 0.6, size * 0.7);
    c.lineTo(0, size * 0.35);
    c.lineTo(-size * 0.6, size * 0.7);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  private onMapClick(e: MouseEvent): void {
    const zone = this.zone();
    if (!zone) return;
    const rect = this.fullCanvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * MAP_SIZE;
    const sy = ((e.clientY - rect.top) / rect.height) * MAP_SIZE;
    const [x, z] = unproject(this.fullView(zone), sx, sy);
    let best: string | null = null;
    let bestD = 16;
    for (const tp of zone.def.teleporters) {
      if (!zone.discovered.has(tp.id)) continue;
      const d = Math.hypot(tp.x - x, tp.z - z);
      if (d < bestD) {
        bestD = d;
        best = tp.id;
      }
    }
    if (best) {
      this.travel(best);
      this.toggle();
    }
  }
}
