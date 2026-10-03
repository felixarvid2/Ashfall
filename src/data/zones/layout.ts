/** Layout helpers shared by the hand-placed open-world zones. */
import type { PoiDef, PropPlacement, Road } from './zoneTypes';

/** Collision circles spaced along the local x axis, for long props. */
export const line = (length: number, r: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ x: -length / 2 + (length * i) / (count - 1), z: 0, r }));

/** Points every `step` metres along a polyline, with the direction at that point. */
export function alongRoad(points: [number, number][], step: number, start = 0): { x: number; z: number; dx: number; dz: number }[] {
  const out: { x: number; z: number; dx: number; dz: number }[] = [];
  let carry = start;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    let d = carry;
    while (d < len) {
      out.push({ x: ax + dx * d, z: az + dz * d, dx, dz });
      d += step;
    }
    carry = d - len;
  }
  return out;
}

/** Shortest distance from a point to any road centre line. */
export function distanceToRoad(x: number, z: number, roads: Road[]): number {
  let best = Infinity;
  for (const r of roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i]!;
      const [bx, bz] = r.points[i + 1]!;
      const vx = bx - ax;
      const vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
    }
  }
  return best;
}

/** Move points of interest that landed inside a prop's collision out into the open. */
export function clearOfProps(pois: PoiDef[], props: PropPlacement[]): PoiDef[] {
  const circles: { x: number; z: number; r: number }[] = [];
  for (const prop of props) {
    const rot = prop.rot ?? 0;
    const scale = prop.scale ?? 1;
    if (prop.collider) circles.push({ x: prop.x, z: prop.z, r: prop.collider });
    for (const c of prop.colliders ?? []) {
      circles.push({ x: prop.x + (c.x * Math.cos(rot) + c.z * Math.sin(rot)) * scale, z: prop.z + (-c.x * Math.sin(rot) + c.z * Math.cos(rot)) * scale, r: c.r * scale });
    }
  }
  return pois.map((p) => {
    let { x, z } = p;
    for (let i = 0; i < 20; i++) {
      const hit = circles.find((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1);
      if (!hit) break;
      const d = Math.hypot(x - hit.x, z - hit.z) || 1;
      x = hit.x + ((x - hit.x) / d) * (hit.r + 1.5);
      z = hit.z + ((z - hit.z) / d) * (hit.r + 1.5);
      if (d === 1) x += 1.5;
    }
    return { ...p, x, z };
  });
}
