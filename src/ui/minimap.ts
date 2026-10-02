/**
 * Minimap (top right) and full map (M): fog of war, roads, discovered teleporters and points of
 * interest. Clicking a discovered teleporter on the full map travels there.
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

export class MapUi {
  private readonly mini: HTMLCanvasElement;
  private readonly miniCtx: CanvasRenderingContext2D;
  private readonly full: HTMLDivElement;
  private readonly fullCanvas: HTMLCanvasElement;
  private readonly fullCtx: CanvasRenderingContext2D;
  private readonly fullInfo: HTMLDivElement;
  private timer = 0;
  /** Extra markers (quest objectives) drawn on both maps. */
  markers: MapMarker[] = [];

  constructor(
    parent: HTMLElement,
    private readonly zone: () => ZoneRuntime | undefined,
    private readonly player: () => { x: number; z: number; facing: number },
    private readonly travel: (teleporterId: string) => void,
    /** Points of interest the player has found (opened/visited), to show on the map. */
    private readonly found: () => ReadonlySet<string>,
  ) {
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

  private drawMini(zone: ZoneRuntime): void {
    const c = this.miniCtx;
    const p = this.player();
    const scale = MINI_SIZE / (MINI_RANGE * 2);
    // World → minimap: centred on the player, north (+z) up.
    const tx = (x: number) => MINI_SIZE / 2 + (x - p.x) * scale;
    const ty = (z: number) => MINI_SIZE / 2 - (z - p.z) * scale;
    c.clearRect(0, 0, MINI_SIZE, MINI_SIZE);
    c.save();
    c.beginPath();
    c.arc(MINI_SIZE / 2, MINI_SIZE / 2, MINI_SIZE / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(8,7,6,0.85)';
    c.fillRect(0, 0, MINI_SIZE, MINI_SIZE);
    this.drawWorld(c, zone, tx, ty, scale, p.x - MINI_RANGE, p.x + MINI_RANGE, p.z - MINI_RANGE, p.z + MINI_RANGE);
    c.restore();
    // The player arrow.
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
    const half = zone.def.halfSize;
    const scale = MAP_SIZE / (half * 2);
    const tx = (x: number) => (x + half) * scale;
    const ty = (z: number) => MAP_SIZE - (z + half) * scale;
    c.fillStyle = '#080706';
    c.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    this.drawWorld(c, zone, tx, ty, scale, -half, half, -half, half);
    const p = this.player();
    this.arrow(c, tx(p.x), ty(p.z), p.facing, 8);
    this.fullInfo.textContent = `${t('map.explored', { pct: Math.round(revealedFraction(zone) * 100) })} · ${t('map.travel')}`;
  }

  private drawWorld(
    c: CanvasRenderingContext2D,
    zone: ZoneRuntime,
    tx: (x: number) => number,
    ty: (z: number) => number,
    scale: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): void {
    const def = zone.def;
    // Revealed ground.
    const cell = def.mapCell;
    const i0 = Math.max(0, Math.floor((minX + def.halfSize) / cell));
    const i1 = Math.min(zone.cells - 1, Math.floor((maxX + def.halfSize) / cell));
    const j0 = Math.max(0, Math.floor((minZ + def.halfSize) / cell));
    const j1 = Math.min(zone.cells - 1, Math.floor((maxZ + def.halfSize) / cell));
    c.fillStyle = '#2a2622';
    const size = cell * scale + 0.6;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!zone.revealed[j * zone.cells + i]) continue;
        c.fillRect(tx(i * cell - def.halfSize), ty((j + 1) * cell - def.halfSize), size, size);
      }
    }
    const seen = (x: number, z: number) => {
      const i = Math.floor((x + def.halfSize) / cell);
      const j = Math.floor((z + def.halfSize) / cell);
      return i >= 0 && j >= 0 && i < zone.cells && j < zone.cells && zone.revealed[j * zone.cells + i] === 1;
    };
    // Roads (only revealed segments).
    c.strokeStyle = '#7a6a54';
    c.lineCap = 'round';
    for (const road of def.roads) {
      c.lineWidth = Math.max(1.5, road.width * scale * 0.8);
      for (let k = 0; k < road.points.length - 1; k++) {
        const [ax, az] = road.points[k]!;
        const [bx, bz] = road.points[k + 1]!;
        const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / cell);
        for (let s = 0; s < steps; s++) {
          const x0 = ax + ((bx - ax) * s) / steps;
          const z0 = az + ((bz - az) * s) / steps;
          const x1 = ax + ((bx - ax) * (s + 1)) / steps;
          const z1 = az + ((bz - az) * (s + 1)) / steps;
          if (!seen((x0 + x1) / 2, (z0 + z1) / 2)) continue;
          c.beginPath();
          c.moveTo(tx(x0), ty(z0));
          c.lineTo(tx(x1), ty(z1));
          c.stroke();
        }
      }
    }
    // Hubs.
    for (const h of def.hubs) {
      if (!seen(h.x, h.z)) continue;
      c.strokeStyle = '#7dd8a0';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(tx(h.x), ty(h.z), Math.max(4, h.radius * scale), 0, Math.PI * 2);
      c.stroke();
    }
    // Points of interest in revealed cells.
    const found = this.found();
    for (const poi of def.pois) {
      const style = POI_STYLE[poi.kind];
      if (!style || !seen(poi.x, poi.z)) continue;
      if (poi.kind === 'relic' && !found.has(poi.id)) continue; // relics stay hidden until found
      this.mark(c, tx(poi.x), ty(poi.z), style.color, style.r, style.shape);
    }
    // Teleporters: discovered ones glow cyan.
    for (const tp of def.teleporters) {
      if (!zone.discovered.has(tp.id)) continue;
      this.mark(c, tx(tp.x), ty(tp.z), '#5ad2ff', 5, 'diamond');
    }
    for (const m of this.markers) this.mark(c, tx(m.x), ty(m.z), m.color, 5, 'dot');
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
    // facing 0 = +z (north, up on the map); canvas y grows downward.
    c.rotate(facing);
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
    const half = zone.def.halfSize;
    const x = ((e.clientX - rect.left) / rect.width) * half * 2 - half;
    const z = half - ((e.clientY - rect.top) / rect.height) * half * 2;
    let best: string | null = null;
    let bestD = 14;
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
