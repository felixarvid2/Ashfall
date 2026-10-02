/**
 * Deterministic, seedable random number generator (sfc32).
 *
 * Every random decision that affects gameplay (loot rolls, dungeon layouts,
 * affix picks) must go through an Rng so a bug can be reproduced from a seed.
 * Never use Math.random() for gameplay logic.
 */

export type RngState = readonly [number, number, number, number];

/** cyrb128 string hash → four 32-bit seeds. */
function hashSeed(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  readonly seed: string;

  constructor(seed: string | number) {
    this.seed = String(seed);
    [this.a, this.b, this.c, this.d] = hashSeed(this.seed);
    // Warm up so similar seeds diverge quickly.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  /** Uniform 32-bit unsigned integer. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the given probability (0..1). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Pick an item by relative weight. Items with weight <= 0 are never chosen. */
  weighted<T>(items: readonly { item: T; weight: number }[]): T {
    let total = 0;
    for (const entry of items) if (entry.weight > 0) total += entry.weight;
    if (total <= 0) throw new Error('Rng.weighted: no positive weights');
    let roll = this.next() * total;
    for (const entry of items) {
      if (entry.weight <= 0) continue;
      roll -= entry.weight;
      if (roll < 0) return entry.item;
    }
    // Floating point edge case: fall back to the last positive entry.
    for (let i = items.length - 1; i >= 0; i--) {
      const entry = items[i]!;
      if (entry.weight > 0) return entry.item;
    }
    throw new Error('unreachable');
  }

  /**
   * Derive an independent child stream, e.g. `rng.fork('loot')`.
   * Lets subsystems consume randomness without shifting each other's sequences.
   */
  fork(label: string): Rng {
    return new Rng(`${this.seed}/${label}`);
  }

  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  setState(state: RngState): void {
    [this.a, this.b, this.c, this.d] = state;
  }
}

/** Short random seed for new games (only place Math.random is acceptable). */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(36)
    .padStart(7, '0');
}
