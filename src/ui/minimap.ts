/**
 * Minimap (top right) and full map (M): fog of war, roads, discovered teleporters and points of
 * interest, rotated to match the camera. Clicking a discovered teleporter on the full map travels there;
 * tabs switch between the regions you have visited.
 */
import { t, touchText } from '../data/i18n';
import type { PoiKind } from '../data/zones/zoneTypes';
import { revealedFraction, type ZoneRuntime } from '../world/zone';
import { extraHubs } from '../world/setPieces';
import type { HarvestView } from '../world/harvest';
import { artUrl } from './art';
import { bridgeCellsOf, caveGrid } from '../data/zones/caves';
import { confirmSheet } from './confirmSheet';
import { haptic } from './haptics';

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

/** A tap on the full map snaps to a discovered teleporter within this many CSS px (P077). */
export const PICK_RADIUS_PX = 28;
export const MAP_MAX_ZOOM = 4;
/** `openAt`: how far the map zooms in on the spot, and how long its ring pulses. */
const FOCUS_ZOOM = 2.5;
const FOCUS_MS = 4000;

/** The id of the point nearest to (x, y) within `radius`, or null. Units are whatever the caller uses (canvas px). */
export function pickNearest(points: { id: string; x: number; y: number }[], x: number, y: number, radius: number): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/** Pan and zoom of the full map: the canvas (side `size` CSS px) is drawn at `translate(tx, ty) scale(z)`. */
export interface MapZoom {
  z: number;
  tx: number;
  ty: number;
}

/** Keeps the zoomed canvas covering its viewport. */
export function clampZoom(s: MapZoom, size: number): MapZoom {
  const z = Math.min(MAP_MAX_ZOOM, Math.max(1, s.z));
  const min = size - size * z;
  return { z, tx: Math.min(0, Math.max(min, s.tx)), ty: Math.min(0, Math.max(min, s.ty)) };
}

/** Zooms to `z` keeping the point under (cx, cy) (viewport px) where it is. */
export function zoomAround(s: MapZoom, z: number, cx: number, cy: number, size: number): MapZoom {
  const nz = Math.min(MAP_MAX_ZOOM, Math.max(1, z));
  const px = (cx - s.tx) / s.z;
  const py = (cy - s.ty) / s.z;
  return clampZoom({ z: nz, tx: cx - px * nz, ty: cy - py * nz }, size);
}

/** Pans/zooms so the canvas point (px, py) (unzoomed CSS px) sits in the middle of the viewport. */
export function centerOn(s: MapZoom, px: number, py: number, size: number): MapZoom {
  return clampZoom({ z: s.z, tx: size / 2 - px * s.z, ty: size / 2 - py * s.z }, size);
}

/** The zoom `MapUi.openAt` starts from: FOCUS_ZOOM, with the canvas point (px, py) (unzoomed CSS px) in the middle. */
export function focusZoom(px: number, py: number, size: number): MapZoom {
  return centerOn({ z: FOCUS_ZOOM, tx: 0, ty: 0 }, px, py, size);
}

export interface MapMarker {
  x: number;
  z: number;
  color: string;
  /** Default: a dot. */
  shape?: 'dot' | 'square' | 'diamond';
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
  /** Fog of war per zone, one pixel per map cell, scaled up when drawn. */
  private readonly fog = new Map<string, { canvas: HTMLCanvasElement; dirty: number; version: number }>();
  /** Painted region maps (FLUX.2 Turbo), shown only where you have explored. */
  private readonly painted = new Map<string, { image: CanvasImageSource; ready: boolean; masked: HTMLCanvasElement; version: number } | null>();
  private readonly tabs: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly locateBtn: HTMLButtonElement;
  private readonly legend: HTMLDivElement;
  /** Zone shown on the full map (null = the one you are in). */
  private viewing: string | null = null;
  /** The region last viewed this session, kept while you stay in the zone you opened it in (P079). */
  private static remembered: { viewing: string; current: string } | null = null;
  /** The teleporter picked on the full map, waiting for "Travel" (P076). */
  private selected: string | null = null;
  private zoom: MapZoom = { z: 1, tx: 0, ty: 0 };
  /** Canvas units per CSS px, so markers keep a readable size on a small screen (minimap, full map). */
  private miniK = 1;
  private fullK = 1;
  private footerKey = '';
  /** A spot the map was opened on (quest log, world boss row): zoomed to and ringed until `until`. */
  private focus: { x: number; z: number; zone: string; until: number } | null = null;
  /** Tapping the minimap (touch) opens the full map. */
  onMiniTap: () => void = () => {
    if (!this.instance()) this.toggle();
  };
  private timer = 0;
  private readonly cos: number;
  private readonly sin: number;
  /** Extra markers (quest objectives) drawn on both maps. */
  markers: MapMarker[] = [];
  /** The region under the Ash Harvest and its closed caches: tinted and marked (null before World Tier 2). */
  harvest: HarvestView | null = null;
  /** Extra line under the full map (Region Restoration). */
  extraInfo: (zone: ZoneRuntime) => string = () => '';

  constructor(
    parent: HTMLElement,
    private readonly zone: () => ZoneRuntime | undefined,
    private readonly player: () => { x: number; z: number; facing: number },
    private readonly travel: (teleporterId: string) => void,
    /** Every zone visited, for the region tabs on the full map. */
    private readonly zones: () => ZoneRuntime[],
    /** Camera yaw (radians): both maps are rotated so their "up" is the screen's up. */
    private readonly yaw = Math.PI / 4,
    /** Inside a dungeon: its rooms (centre, explored, kind), drawn instead of the zone. */
    private readonly instance: () => { rooms: { x: number; z: number; size: number; explored: boolean; kind: string }[] } | undefined = () => undefined,
  ) {
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    this.mini = document.createElement('canvas');
    this.mini.className = 'minimap';
    this.mini.width = this.mini.height = MINI_SIZE;
    this.mini.setAttribute('aria-label', t('map.title'));
    this.mini.addEventListener('click', () => this.onMiniTap());
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
    this.fullInfo.className = 'map-info';
    this.tabs = document.createElement('div');
    this.tabs.className = 'map-tabs';
    this.tabs.addEventListener('scroll', () => this.tabFades(), { passive: true });
    this.viewport = document.createElement('div');
    this.viewport.className = 'map-viewport';
    this.locateBtn = document.createElement('button');
    this.locateBtn.type = 'button';
    this.locateBtn.className = 'map-locate';
    this.locateBtn.textContent = '\u25CE';
    this.locateBtn.title = this.locateBtn.ariaLabel = t('map.locate');
    this.locateBtn.addEventListener('click', () => this.locate());
    this.viewport.append(this.fullCanvas, this.locateBtn);
    this.legend = this.buildLegend();
    this.full.append(title, this.tabs, this.viewport, this.legend, this.fullInfo);
    this.installGestures();
    parent.append(this.mini, this.full);
  }

  /** The full-map panel (for the panel stack). */
  get panel(): HTMLElement {
    return this.full;
  }

  /** Chip row under the map: what the markers mean. */
  private buildLegend(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'map-legend';
    const entries: [string, string, string][] = [
      ['teleporter', '#5ad2ff', '\u25C6'],
      ['quest', '#ffd23a', '\u25CF'],
      ['boss', '#ff2a2a', '\u25C6'],
      ['you', '#ffd27a', '\u25B2'],
    ];
    for (const [key, color, glyph] of entries) {
      const chip = document.createElement('span');
      chip.className = 'map-legend-chip';
      const mark = Object.assign(document.createElement('i'), { textContent: glyph });
      mark.style.color = color;
      chip.append(mark, t(`map.legend.${key}`));
      row.append(chip);
    }
    return row;
  }

  get open(): boolean {
    return !this.full.hidden;
  }

  toggle(): void {
    this.full.hidden = !this.full.hidden;
    this.selected = null;
    this.focus = null;
    this.resetZoom();
    const current = this.zone()?.def.id ?? '';
    const last = MapUi.remembered;
    // Reopening shows the region you looked at last, until you travel to another one.
    this.viewing = last && last.current === current && this.zones().some((z) => z.def.id === last.viewing) ? last.viewing : null;
    if (this.open) {
      this.buildTabs();
      this.drawFull();
      this.tabFades();
    }
  }

  /**
   * Opens the full map (or re-aims it when open) on a world point: zoomed in, centred, with a ring that pulses for a
   * few seconds. `zone` is the region the point is in (default: the current one). Does nothing inside a dungeon.
   */
  openAt(x: number, z: number, zone?: string): void {
    if (this.instance()) return;
    const current = this.zone()?.def.id ?? '';
    const target = zone ?? current;
    if (!this.open) this.toggle();
    this.viewing = target === current ? null : target;
    MapUi.remembered = { viewing: target, current };
    this.selected = null;
    this.focus = { x, z, zone: target, until: performance.now() + FOCUS_MS };
    this.buildTabs();
    this.focusNow();
    // The panel stack may still be re-flowing the screen (closing the panel this one replaces): centre again once it has.
    requestAnimationFrame(() => this.focusNow());
  }

  private focusNow(): void {
    const f = this.focus;
    const zone = this.shown();
    if (!f || !this.open || !zone || zone.def.id !== f.zone) return;
    const [sx, sy] = project(this.fullView(zone), f.x, f.z);
    const size = this.viewSize();
    const k = size / MAP_SIZE;
    this.zoom = focusZoom(sx * k, sy * k, size);
    this.applyZoom();
    this.drawFull();
  }

  /** The ring around the spot the map was opened on. */
  private drawFocus(c: CanvasRenderingContext2D, zone: ZoneRuntime, v: View): void {
    const f = this.focus;
    if (!f) return;
    if (performance.now() > f.until) {
      this.focus = null;
      return;
    }
    if (f.zone !== zone.def.id) return;
    const k = this.fullK;
    const [sx, sy] = project(v, f.x, f.z);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
    c.strokeStyle = '#fff';
    c.lineWidth = 2.5 * k;
    c.beginPath();
    c.arc(sx, sy, (15 + 5 * pulse) * k, 0, Math.PI * 2);
    c.stroke();
  }

  /** The zone the full map shows. */
  private shown(): ZoneRuntime | undefined {
    const current = this.zone();
    if (this.viewing === null || this.viewing === current?.def.id) return current;
    return this.zones().find((z) => z.def.id === this.viewing) ?? current;
  }

  private buildTabs(): void {
    const zones = [...this.zones()].sort((a, b) => a.def.region - b.def.region);
    this.tabs.replaceChildren();
    this.tabs.hidden = zones.length < 2;
    const shown = this.shown()?.def.id;
    for (const z of zones) {
      const b = document.createElement('button');
      b.className = `map-tab${z.def.id === shown ? ' active' : ''}${z.def.id === this.harvest?.active.zoneId ? ' harvest' : ''}`;
      b.textContent = t(`zones.${z.def.key}.name`);
      b.addEventListener('click', () => {
        this.viewing = z.def.id;
        MapUi.remembered = { viewing: z.def.id, current: this.zone()?.def.id ?? '' };
        this.selected = null;
        this.resetZoom();
        this.buildTabs();
        this.drawFull();
      });
      this.tabs.append(b);
    }
    // Keep the active tab in view (the row scrolls with many regions); only this row, not the page.
    const active = this.tabs.querySelector<HTMLElement>('.map-tab.active');
    if (active) {
      const left = active.offsetLeft - (this.tabs.clientWidth - active.offsetWidth) / 2;
      this.tabs.scrollLeft = Math.max(0, left);
    }
    this.tabFades();
  }

  /** Edge fades on the tab row show that it scrolls. */
  private tabFades(): void {
    const el = this.tabs;
    el.classList.toggle('fade-l', el.scrollLeft > 4);
    el.classList.toggle('fade-r', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  update(dt: number): void {
    const zone = this.zone();
    this.mini.hidden = !zone;
    if (!zone) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.15;
    const cssW = this.mini.clientWidth;
    this.miniK = cssW > 0 ? 1 / Math.max(0.75, Math.min(1, cssW / MINI_SIZE)) : 1;
    const inst = this.instance();
    if (inst) {
      this.drawInstance(inst.rooms);
      if (this.open) this.toggle();
      return;
    }
    this.drawMini(zone);
    if (this.open) this.drawFull();
  }

  /** Dungeon minimap: explored rooms around the player. */
  private drawInstance(rooms: { x: number; z: number; size: number; explored: boolean; kind: string }[]): void {
    const c = this.miniCtx;
    const p = this.player();
    const v: View = { cx: MINI_SIZE / 2, cy: MINI_SIZE / 2, px: p.x, pz: p.z, scale: MINI_SIZE / 130, cos: this.cos, sin: this.sin };
    c.clearRect(0, 0, MINI_SIZE, MINI_SIZE);
    c.save();
    c.beginPath();
    c.arc(MINI_SIZE / 2, MINI_SIZE / 2, MINI_SIZE / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(8,7,6,0.85)';
    c.fillRect(0, 0, MINI_SIZE, MINI_SIZE);
    const a = v.scale * v.cos;
    const b = v.scale * v.sin;
    c.setTransform(a, b, -b, a, v.cx - (a * v.px - b * v.pz), v.cy - (b * v.px + a * v.pz));
    for (const r of rooms) {
      if (!r.explored) continue;
      c.fillStyle = r.kind === 'boss' ? '#4a2622' : '#2e2a26';
      c.fillRect(r.x - r.size / 2 + 1, r.z - r.size / 2 + 1, r.size - 2, r.size - 2);
    }
    c.restore();
    for (const m of this.markers) this.rimMark(c, v, ...project(v, m.x, m.z), m.color, 5 * this.miniK, m.shape ?? 'dot');
    this.arrow(c, MINI_SIZE / 2, MINI_SIZE / 2, p.facing, 7);
    this.miniRing(c);
  }

  /** The minimap rim: a light stroke with a dark edge so it reads on bright ground (the Core), and an "N" tick. */
  private miniRing(c: CanvasRenderingContext2D): void {
    const r = MINI_SIZE / 2 - 2;
    c.beginPath();
    c.arc(MINI_SIZE / 2, MINI_SIZE / 2, r, 0, Math.PI * 2);
    c.strokeStyle = '#000';
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = '#c8b28a';
    c.lineWidth = 2;
    c.stroke();
    // North (world -z) rotates with the map; the letter stays upright.
    const nx = MINI_SIZE / 2 + this.sin * (r - 12 * this.miniK);
    const ny = MINI_SIZE / 2 - this.cos * (r - 12 * this.miniK);
    c.font = `bold ${Math.round(12 * this.miniK)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 3;
    c.strokeStyle = '#000';
    c.strokeText('N', nx, ny);
    c.fillStyle = '#ffd27a';
    c.fillText('N', nx, ny);
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
    this.miniRing(c);
  }

  private drawFull(): void {
    const zone = this.shown();
    if (!zone) return;
    const here = zone === this.zone();
    const c = this.fullCtx;
    const v = this.fullView(zone);
    // Markers keep their on-screen size when the canvas is scaled down to a phone or zoomed in.
    this.fullK = MAP_SIZE / ((this.fullCanvas.offsetWidth || MAP_SIZE) * this.zoom.z);
    const k = this.fullK;
    c.fillStyle = '#080706';
    c.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    this.drawWorld(c, zone, v, Infinity, here);
    if (here) {
      const p = this.player();
      const [sx, sy] = project(v, p.x, p.z);
      this.arrow(c, sx, sy, p.facing, 9 * k);
    }
    this.drawSelected(c, zone, v);
    this.drawFocus(c, zone, v);
    const chips = [t('map.explored', { pct: Math.round(revealedFraction(zone) * 100) }), this.extraInfo(zone), this.harvest?.active.zoneId === zone.def.id ? t('harvest.mapRegion') : ''].filter(Boolean);
    this.updateFooter(chips, touchText('map.travel'));
  }

  /** Footer: a chip each for exploration, restoration tier and the Ash Harvest, then a one-line hint (P078). */
  private updateFooter(chips: string[], hint: string): void {
    const key = `${chips.join('|')}#${hint}`;
    if (key === this.footerKey) return;
    this.footerKey = key;
    const row = document.createElement('div');
    row.className = 'map-chips';
    for (const text of chips) row.append(Object.assign(document.createElement('span'), { className: 'map-chip', textContent: text }));
    this.fullInfo.replaceChildren(row, Object.assign(document.createElement('div'), { className: 'map-hint', textContent: hint }));
  }

  /** The picked teleporter gets a ring and its name. */
  private drawSelected(c: CanvasRenderingContext2D, zone: ZoneRuntime, v: View): void {
    const tp = this.selected ? zone.def.teleporters.find((x) => x.id === this.selected) : undefined;
    if (!tp) return;
    const k = this.fullK;
    const [sx, sy] = project(v, tp.x, tp.z);
    c.strokeStyle = '#fff';
    c.lineWidth = 2.5 * k;
    c.beginPath();
    c.arc(sx, sy, 13 * k, 0, Math.PI * 2);
    c.stroke();
    const name = t(`zones.teleporters.${tp.id}`);
    c.font = `bold ${Math.round(14 * k)}px ${getComputedStyle(this.full).fontFamily || 'sans-serif'}`;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    const half = c.measureText(name).width / 2 + 4 * k;
    const x = Math.min(MAP_SIZE - half, Math.max(half, sx));
    const y = sy - 18 * k < 16 * k ? sy + 34 * k : sy - 16 * k;
    c.lineWidth = 4 * k;
    c.strokeStyle = '#000';
    c.lineJoin = 'round';
    c.strokeText(name, x, y);
    c.fillStyle = '#fff';
    c.fillText(name, x, y);
  }

  private fogCanvas(zone: ZoneRuntime): HTMLCanvasElement {
    const n = zone.cells;
    let fog = this.fog.get(zone.def.id);
    if (!fog) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = n;
      this.fog.set(zone.def.id, (fog = { canvas, dirty: 0, version: 0 }));
    }
    // Repaint at most every ~0.6 s (the reveal is coarse anyway).
    if (fog.dirty-- <= 0) {
      fog.dirty = 3;
      const fc = fog.canvas.getContext('2d')!;
      const img = fc.createImageData(n, n);
      for (let i = 0; i < n * n; i++) {
        if (!zone.revealed[i]) continue;
        img.data[i * 4] = 0x2a;
        img.data[i * 4 + 1] = 0x26;
        img.data[i * 4 + 2] = 0x22;
        img.data[i * 4 + 3] = 255;
      }
      fc.putImageData(img, 0, 0);
      fog.version++;
    }
    return fog.canvas;
  }

  /** The painted map cut to the explored area (redrawn when the fog changes), or null. */
  private paintedMap(zone: ZoneRuntime, fogCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
    const id = zone.def.id;
    let p = this.painted.get(id);
    if (p === undefined) {
      const url = artUrl(`maps/${id.replace(/^zone\./, '')}`);
      if (url) {
        const image = new Image();
        const masked = document.createElement('canvas');
        masked.width = masked.height = 512;
        p = { image, ready: false, masked, version: -1 };
        const entry = p;
        image.onload = () => (entry.ready = true);
        image.src = url;
      } else {
        const drawn = proceduralMap(zone);
        p = drawn ? { image: drawn, ready: true, masked: Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), version: -1 } : null;
      }
      this.painted.set(id, p);
    }
    if (!p || !p.ready) return null;
    const version = this.fog.get(id)?.version ?? 0;
    if (p.version !== version) {
      p.version = version;
      const c = p.masked.getContext('2d')!;
      const size = p.masked.width;
      // The painting covers the zone's square; the fog grid may reach a little past it.
      const span = (zone.def.halfSize * 2) / (zone.cells * zone.def.mapCell);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, size, size);
      c.globalAlpha = 0.9;
      c.drawImage(p.image, 0, 0, size * span, size * span);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'destination-in';
      c.imageSmoothingEnabled = true;
      c.drawImage(fogCanvas, 0, 0, size, size);
      c.globalCompositeOperation = 'source-over';
    }
    return p.masked;
  }

  private drawWorld(c: CanvasRenderingContext2D, zone: ZoneRuntime, v: View, range: number, here = true): void {
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
    const fog = this.fogCanvas(zone);
    const painted = this.paintedMap(zone, fog);
    if (painted) {
      c.imageSmoothingEnabled = true;
      c.drawImage(painted, -half, -half, zone.cells * cell, zone.cells * cell);
      c.imageSmoothingEnabled = false;
    } else c.drawImage(fog, -half, -half, zone.cells * cell, zone.cells * cell);
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
    for (const h of [...def.hubs, ...extraHubs(zone)]) {
      if (!seen(h.x, h.z)) continue;
      c.beginPath();
      c.arc(h.x, h.z, Math.max(4 / v.scale, h.radius), 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();

    // Ash Harvest: the active region is tinted (the full map also gets an ember border).
    const harvest = this.harvest?.active.zoneId === def.id ? this.harvest : null;
    if (harvest) {
      c.fillStyle = 'rgba(255, 110, 30, 0.1)';
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      if (range === Infinity) {
        c.strokeStyle = 'rgba(255, 138, 58, 0.85)';
        c.lineWidth = 4;
        c.strokeRect(2, 2, c.canvas.width - 4, c.canvas.height - 4);
      }
    }

    // Markers in screen space so they stay upright. `k` converts CSS px to canvas px.
    const full = range === Infinity;
    const k = full ? this.fullK : this.miniK;
    const found = zone.found;
    for (const poi of def.pois) {
      const style = POI_STYLE[poi.kind];
      if (!style || !near(poi.x, poi.z) || !seen(poi.x, poi.z)) continue;
      if (poi.kind === 'relic' && !found.has(poi.id)) continue; // relics stay hidden until found
      // On the full map every marker is at least ~5 px (CSS) in radius.
      const r = full ? Math.max(style.r, 5) * k : style.r * k;
      if (found.has(poi.id) && (poi.kind === 'event' || poi.kind === 'signalTower')) this.mark(c, ...project(v, poi.x, poi.z), '#5a5a5a', r, style.shape);
      else this.mark(c, ...project(v, poi.x, poi.z), style.color, r, style.shape);
    }
    // Teleporters: 14 px across on the full map so a thumb can find them (P077).
    for (const tp of def.teleporters) {
      if (!zone.discovered.has(tp.id) || !near(tp.x, tp.z)) continue;
      this.mark(c, ...project(v, tp.x, tp.z), '#5ad2ff', (full ? 7 : 5) * k, 'diamond');
    }
    for (const cache of harvest?.caches ?? []) {
      if (near(cache.x, cache.z)) this.mark(c, ...project(v, cache.x, cache.z), '#ff8a3a', (full ? 6 : 5) * k, 'diamond');
    }
    // Border crossings to other regions.
    for (const g of def.gates) {
      if (!near(g.x, g.z) || !seen(g.x, g.z)) continue;
      this.mark(c, ...project(v, g.x, g.z), '#e8e0d0', (full ? 6 : 5) * k, 'square');
    }
    if (!here) return;
    for (const m of this.markers) {
      const [sx, sy] = project(v, m.x, m.z);
      // On the minimap, markers outside the circle are pinned to the rim as a triangle pointing at them.
      if (!full) this.rimMark(c, v, sx, sy, m.color, (m.shape ? 6 : 5) * k, m.shape ?? 'dot');
      else this.mark(c, sx, sy, m.color, (m.shape ? 7 : 6) * k, m.shape ?? 'dot');
    }
  }

  /** A minimap marker; outside the circle it becomes a triangle on the rim that points outward. */
  private rimMark(c: CanvasRenderingContext2D, v: View, sx: number, sy: number, color: string, r: number, shape: 'dot' | 'square' | 'diamond'): void {
    const dx = sx - v.cx;
    const dy = sy - v.cy;
    const d = Math.hypot(dx, dy);
    const max = v.cx - 6 * this.miniK - 4;
    if (d <= max) {
      this.mark(c, sx, sy, color, r, shape);
      return;
    }
    c.save();
    c.translate(v.cx + (dx / d) * max, v.cy + (dy / d) * max);
    c.rotate(Math.atan2(dy, dx));
    const s = 6 * this.miniK;
    c.fillStyle = color;
    c.strokeStyle = '#000';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(s, 0);
    c.lineTo(-s * 0.7, s * 0.85);
    c.lineTo(-s * 0.7, -s * 0.85);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  private mark(c: CanvasRenderingContext2D, x: number, y: number, color: string, r: number, shape: 'dot' | 'square' | 'diamond'): void {
    c.fillStyle = color;
    c.strokeStyle = '#000';
    c.lineWidth = Math.max(1, r / 5);
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

  private resetZoom(): void {
    this.zoom = { z: 1, tx: 0, ty: 0 };
    this.applyZoom();
  }

  private applyZoom(): void {
    const { z, tx, ty } = this.zoom;
    this.fullCanvas.style.transformOrigin = '0 0';
    this.fullCanvas.style.transform = z === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${z})`;
    this.timer = 0; // redraw soon: markers are drawn at a constant on-screen size
  }

  /** Side of the map viewport in CSS px (unzoomed). */
  private viewSize(): number {
    return this.fullCanvas.offsetWidth || MAP_SIZE;
  }

  /** Drag to pan, pinch or wheel to zoom, double-tap to zoom in or out; a short tap selects a teleporter. */
  private installGestures(): void {
    const vp = this.viewport;
    vp.style.touchAction = 'none';
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = false;
    let downAt = 0;
    let down = { x: 0, y: 0 };
    let lastTap = { t: 0, x: 0, y: 0 };
    const rel = (x: number, y: number) => {
      const r = vp.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };
    const pair = () => {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    vp.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.map-locate')) return;
      try {
        vp.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events have no active pointer to capture.
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        moved = false;
        downAt = e.timeStamp;
        down = { x: e.clientX, y: e.clientY };
      } else moved = true;
    });
    vp.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const size = this.viewSize();
      if (pointers.size >= 2) {
        const before = pair();
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const after = pair();
        const m = rel(after.mx, after.my);
        let next = zoomAround(this.zoom, this.zoom.z * (after.d / Math.max(1, before.d)), m.x, m.y, size);
        next = clampZoom({ ...next, tx: next.tx + (after.mx - before.mx), ty: next.ty + (after.my - before.my) }, size);
        this.zoom = next;
        this.applyZoom();
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) moved = true;
      if (moved && this.zoom.z > 1) {
        this.zoom = clampZoom({ ...this.zoom, tx: this.zoom.tx + (e.clientX - prev.x), ty: this.zoom.ty + (e.clientY - prev.y) }, size);
        this.applyZoom();
      }
    });
    // A short, still touch is a tap; it is handled on the `click` that follows, so a sheet it opens cannot
    // receive that same click (the confirm sheet's scrim closes on tap-outside).
    let clean = false;
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      clean = pointers.size === 0 && !moved && e.type === 'pointerup' && e.timeStamp - downAt <= 600;
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);
    vp.addEventListener('click', (e) => {
      if (!clean || (e.target as HTMLElement).closest('.map-locate')) return;
      clean = false;
      if (this.pickAt(e.clientX, e.clientY)) {
        lastTap = { t: 0, x: 0, y: 0 };
        return;
      }
      // Two taps on empty ground zoom in (or back out).
      if (e.timeStamp - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        const m = rel(e.clientX, e.clientY);
        this.zoom = this.zoom.z > 1.05 ? { z: 1, tx: 0, ty: 0 } : zoomAround(this.zoom, 2.5, m.x, m.y, this.viewSize());
        this.applyZoom();
        lastTap = { t: 0, x: 0, y: 0 };
      } else lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    });
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const m = rel(e.clientX, e.clientY);
        this.zoom = zoomAround(this.zoom, this.zoom.z * (e.deltaY < 0 ? 1.25 : 0.8), m.x, m.y, this.viewSize());
        this.applyZoom();
      },
      { passive: false },
    );
  }

  /** Centres the map on the player, zoomed in (the "locate" button). */
  private locate(): void {
    const zone = this.shown();
    if (!zone || zone !== this.zone()) return;
    const p = this.player();
    const [sx, sy] = project(this.fullView(zone), p.x, p.z);
    const size = this.viewSize();
    const k = size / MAP_SIZE;
    this.zoom = centerOn({ ...this.zoom, z: Math.max(2, this.zoom.z) }, sx * k, sy * k, size);
    this.applyZoom();
    haptic('tap');
  }

  /** The discovered teleporter nearest to a tap (within PICK_RADIUS_PX CSS px), or null. */
  private teleporterAt(clientX: number, clientY: number): string | null {
    const zone = this.shown();
    if (!zone) return null;
    const rect = this.fullCanvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    const sx = ((clientX - rect.left) / rect.width) * MAP_SIZE;
    const sy = ((clientY - rect.top) / rect.height) * MAP_SIZE;
    const v = this.fullView(zone);
    const points = zone.def.teleporters.filter((tp) => zone.discovered.has(tp.id)).map((tp) => {
      const [x, y] = project(v, tp.x, tp.z);
      return { id: tp.id, x, y };
    });
    return pickNearest(points, sx, sy, (PICK_RADIUS_PX * MAP_SIZE) / rect.width);
  }

  /** A tap on the map: selects a teleporter and asks before travelling. True when it hit one. */
  private pickAt(clientX: number, clientY: number): boolean {
    const id = this.teleporterAt(clientX, clientY);
    if (!id) return false;
    void this.askTravel(id);
    return true;
  }

  private async askTravel(id: string): Promise<void> {
    const zone = this.shown();
    if (!zone) return;
    const tp = zone.def.teleporters.find((x) => x.id === id);
    if (!tp) return;
    this.selected = id;
    this.timer = 0;
    haptic('select');
    this.drawFull();
    const here = zone === this.zone();
    const p = this.player();
    const body = here ? t('map.travelDistance', { m: Math.round(Math.hypot(tp.x - p.x, tp.z - p.z)) }) : t('map.travelRegion', { region: t(`zones.${zone.def.key}.name`) });
    const ok = await confirmSheet({ title: t('map.travelTitle', { name: t(`zones.teleporters.${id}`) }), body, confirmLabel: t('map.travelButton') });
    this.selected = null;
    this.timer = 0;
    if (!ok) return;
    this.travel(id);
    if (this.open) this.toggle();
  }
}

/**
 * A map drawn from the walkable grid, for a zone with no painting yet (The Core): ground, the drop under
 * the Hanging Gardens, and the energy bridges as light.
 */
function proceduralMap(zone: ZoneRuntime): HTMLCanvasElement | null {
  const grid = caveGrid(zone.def);
  if (!grid) return null;
  const size = 512;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const c = canvas.getContext('2d');
  if (!c) return null;
  const img = c.createImageData(size, size);
  const bridge = bridgeCellsOf(grid);
  const paint = (rgb: number[], px: number) => {
    img.data[px * 4] = rgb[0]!;
    img.data[px * 4 + 1] = rgb[1]!;
    img.data[px * 4 + 2] = rgb[2]!;
    img.data[px * 4 + 3] = 255;
  };
  for (let y = 0; y < size; y++) {
    const j = Math.min(grid.n - 1, Math.floor((y / size) * grid.n));
    for (let x = 0; x < size; x++) {
      const k = j * grid.n + Math.min(grid.n - 1, Math.floor((x / size) * grid.n));
      paint(bridge.has(k) ? [255, 230, 176] : grid.data[k] ? [92, 76, 128] : grid.air?.[k] ? [26, 15, 51] : [12, 10, 20], y * size + x);
    }
  }
  c.putImageData(img, 0, 0);
  return canvas;
}
