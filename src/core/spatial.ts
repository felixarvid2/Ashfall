/**
 * Uniform-grid spatial hash on the xz plane. Two layers share the grid: a static layer that is built once
 * and patched (crates, posts, props never move) and a dynamic layer that is refilled every tick for moving
 * entities. A query reads both, so "who is within r metres" stays cheap with thousands of props and 100+
 * enemies. Entities that sit in several cells are reported once without a scratch set (see queryCircle).
 */
import type { Entity } from './ecs';

/** An indexed circle plus the cell range it covers. `tr`/`col` let the static layer notice a prop that moved. */
interface Rec {
  e: Entity;
  x: number;
  z: number;
  r: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  tr: { x: number; z: number } | null;
  col: { radius: number } | null;
  /** Index in `staticList` (static layer only). */
  idx: number;
}

type Cells = Map<number, Rec[]>;

export class SpatialHash {
  private readonly staticCells: Cells = new Map();
  private readonly staticById = new Map<Entity, Rec>();
  private readonly staticList: Rec[] = [];
  private readonly dynCells: Cells = new Map();
  /** Dynamic cells that currently hold records, so clearDynamic() only touches those. */
  private readonly dynUsed: Rec[][] = [];
  /** Recycled dynamic records: `dynPool[0..dynCount)` are live this tick. */
  private readonly dynPool: Rec[] = [];
  private dynCount = 0;

  /** Hides static entries for which this returns true (Dead props); set by the collision system. */
  isHidden: ((e: Entity) => boolean) | null = null;

  constructor(private readonly cellSize = 4) {}

  /** Empty both layers. */
  clear(): void {
    this.clearDynamic();
    this.clearStatics();
  }

  /** Empty the per-tick layer. Keeps the cell arrays and records for reuse. */
  clearDynamic(): void {
    for (const cell of this.dynUsed) cell.length = 0;
    this.dynUsed.length = 0;
    this.dynCount = 0;
  }

  clearStatics(): void {
    this.staticCells.clear();
    this.staticById.clear();
    this.staticList.length = 0;
  }

  /** Add a moving entity to the per-tick layer. */
  insert(e: Entity, x: number, z: number, radius: number): void {
    let rec = this.dynPool[this.dynCount];
    if (!rec) {
      rec = { e, x, z, r: radius, x0: 0, x1: 0, z0: 0, z1: 0, tr: null, col: null, idx: -1 };
      this.dynPool.push(rec);
    }
    this.dynCount++;
    this.place(rec, e, x, z, radius);
    this.link(rec, this.dynCells, this.dynUsed);
  }

  /**
   * Add (or re-add) an entity to the static layer. Pass the live Transform/Collider objects as `tr`/`col` and
   * refreshStatics() re-indexes the entity if either changes.
   */
  insertStatic(
    e: Entity,
    x: number,
    z: number,
    radius: number,
    tr: { x: number; z: number } | null = null,
    col: { radius: number } | null = null,
  ): void {
    this.removeStatic(e);
    const rec: Rec = { e, x, z, r: radius, x0: 0, x1: 0, z0: 0, z1: 0, tr, col, idx: this.staticList.length };
    this.place(rec, e, x, z, radius);
    this.link(rec, this.staticCells, null);
    this.staticList.push(rec);
    this.staticById.set(e, rec);
  }

  hasStatic(e: Entity): boolean {
    return this.staticById.has(e);
  }

  get staticCount(): number {
    return this.staticList.length;
  }

  removeStatic(e: Entity): void {
    const rec = this.staticById.get(e);
    if (!rec) return;
    this.staticById.delete(e);
    this.unlink(rec);
    const last = this.staticList.pop()!;
    if (last !== rec) {
      this.staticList[rec.idx] = last;
      last.idx = rec.idx;
    }
  }

  /** Re-index statics whose Transform or Collider changed since they were inserted (rare; a cheap scan). */
  refreshStatics(): void {
    const list = this.staticList;
    for (let i = 0; i < list.length; i++) {
      const rec = list[i]!;
      const tr = rec.tr;
      const col = rec.col;
      if ((tr === null || (tr.x === rec.x && tr.z === rec.z)) && (col === null || col.radius === rec.r)) continue;
      this.unlink(rec);
      this.place(rec, rec.e, tr ? tr.x : rec.x, tr ? tr.z : rec.z, col ? col.radius : rec.r);
      this.link(rec, this.staticCells, null);
    }
  }

  /**
   * Entities whose circle overlaps the query circle. Each entity appears once: a record that spans several
   * cells is only emitted from the first cell of its range that the query also covers. Static entries come
   * before dynamic ones within a cell; hidden statics are skipped.
   */
  queryCircle(x: number, z: number, radius: number, out: Entity[] = []): Entity[] {
    out.length = 0;
    const cs = this.cellSize;
    const qx0 = Math.floor((x - radius) / cs);
    const qx1 = Math.floor((x + radius) / cs);
    const qz0 = Math.floor((z - radius) / cs);
    const qz1 = Math.floor((z + radius) / cs);
    const hidden = this.isHidden;
    for (let cx = qx0; cx <= qx1; cx++) {
      for (let cz = qz0; cz <= qz1; cz++) {
        const key = this.key(cx, cz);
        const stat = this.staticCells.get(key);
        if (stat) {
          for (let i = 0; i < stat.length; i++) {
            const p = stat[i]!;
            if (cx !== (p.x0 > qx0 ? p.x0 : qx0) || cz !== (p.z0 > qz0 ? p.z0 : qz0)) continue;
            const reach = radius + p.r;
            const dx = p.x - x;
            const dz = p.z - z;
            if (dx * dx + dz * dz <= reach * reach && !(hidden !== null && hidden(p.e))) out.push(p.e);
          }
        }
        const dyn = this.dynCells.get(key);
        if (dyn) {
          for (let i = 0; i < dyn.length; i++) {
            const p = dyn[i]!;
            if (cx !== (p.x0 > qx0 ? p.x0 : qx0) || cz !== (p.z0 > qz0 ? p.z0 : qz0)) continue;
            const reach = radius + p.r;
            const dx = p.x - x;
            const dz = p.z - z;
            if (dx * dx + dz * dz <= reach * reach) out.push(p.e);
          }
        }
      }
    }
    return out;
  }

  private place(rec: Rec, e: Entity, x: number, z: number, radius: number): void {
    const cs = this.cellSize;
    rec.e = e;
    rec.x = x;
    rec.z = z;
    rec.r = radius;
    rec.x0 = Math.floor((x - radius) / cs);
    rec.x1 = Math.floor((x + radius) / cs);
    rec.z0 = Math.floor((z - radius) / cs);
    rec.z1 = Math.floor((z + radius) / cs);
  }

  private link(rec: Rec, cells: Cells, used: Rec[][] | null): void {
    for (let cx = rec.x0; cx <= rec.x1; cx++) {
      for (let cz = rec.z0; cz <= rec.z1; cz++) {
        const key = this.key(cx, cz);
        let cell = cells.get(key);
        if (!cell) {
          cell = [];
          cells.set(key, cell);
        }
        if (used && cell.length === 0) used.push(cell);
        cell.push(rec);
      }
    }
  }

  private unlink(rec: Rec): void {
    for (let cx = rec.x0; cx <= rec.x1; cx++) {
      for (let cz = rec.z0; cz <= rec.z1; cz++) {
        const key = this.key(cx, cz);
        const cell = this.staticCells.get(key);
        if (!cell) continue;
        const i = cell.indexOf(rec);
        if (i >= 0) cell.splice(i, 1);
        if (cell.length === 0) this.staticCells.delete(key);
      }
    }
  }

  private key(cx: number, cz: number): number {
    // Pack two signed 16-bit cell coords into one number.
    return ((cx + 32768) << 16) | ((cz + 32768) & 0xffff);
  }
}
