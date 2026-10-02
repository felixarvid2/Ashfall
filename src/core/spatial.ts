/**
 * Uniform-grid spatial hash on the xz plane. Rebuilt every tick for moving
 * entities; makes "who is within r metres" queries cheap with 100+ enemies.
 */
import type { Entity } from './ecs';

export class SpatialHash {
  private readonly cells = new Map<number, Entity[]>();
  private readonly positions = new Map<Entity, { x: number; z: number; r: number }>();

  constructor(private readonly cellSize = 4) {}

  clear(): void {
    this.cells.clear();
    this.positions.clear();
  }

  insert(e: Entity, x: number, z: number, radius: number): void {
    this.positions.set(e, { x, z, r: radius });
    const cs = this.cellSize;
    const x0 = Math.floor((x - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const z0 = Math.floor((z - radius) / cs);
    const z1 = Math.floor((z + radius) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = this.key(cx, cz);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(e);
      }
    }
  }

  /** Entities whose circle overlaps the query circle. Each entity appears once. */
  queryCircle(x: number, z: number, radius: number, out: Entity[] = []): Entity[] {
    out.length = 0;
    const cs = this.cellSize;
    const x0 = Math.floor((x - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const z0 = Math.floor((z - radius) / cs);
    const z1 = Math.floor((z + radius) / cs);
    const seen = new Set<Entity>();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const cell = this.cells.get(this.key(cx, cz));
        if (!cell) continue;
        for (const e of cell) {
          if (seen.has(e)) continue;
          seen.add(e);
          const p = this.positions.get(e)!;
          const reach = radius + p.r;
          const dx = p.x - x;
          const dz = p.z - z;
          if (dx * dx + dz * dz <= reach * reach) out.push(e);
        }
      }
    }
    return out;
  }

  private key(cx: number, cz: number): number {
    // Pack two signed 16-bit cell coords into one number.
    return ((cx + 32768) << 16) | ((cz + 32768) & 0xffff);
  }
}
