/**
 * The painted effects: fire, smoke, explosions, spores, frost, lightning, dust and the rest, built
 * from the generated sprites (src/render/particles.ts). VfxSystem calls these for one-shot events
 * (an explosion, a slam, a hit) and every frame for things that last (burning ground, a burning
 * enemy, a spore cloud), passing dt so the emission rate doesn't depend on the frame rate.
 *
 * Randomness here is visual only (Math.random), like the hit sparks: it never touches game state.
 */
import * as THREE from 'three';
import { ParticleField, ParticleRenderer, type ParticleSpawn } from './particles';
import type { SpriteKey } from './vfxAtlas';

const R = Math.random;
const rr = (a: number, b: number) => a + R() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)]!;
const TAU = Math.PI * 2;

const FLAMES: SpriteKey[] = ['flame_0', 'flame_1', 'flame_2', 'flame_3'];
const SMOKES: SpriteKey[] = ['smoke_0', 'smoke_1', 'smoke_2', 'smoke_3'];
const BLASTS: SpriteKey[] = ['explosion_0', 'explosion_1', 'explosion_3'];
const SPORES: SpriteKey[] = ['spore_cloud_0', 'spore_cloud_1', 'spore_cloud_2'];
const DUSTS: SpriteKey[] = ['dust_0', 'dust_1', 'dust_2'];
const ARCS: SpriteKey[] = ['arc_0', 'arc_1', 'arc_2'];

/** Particle caps per graphics setting. */
const CAP = { low: 900, medium: 2200, high: 4000 } as const;

export type Quality = keyof typeof CAP;

export class SpriteFx {
  readonly field = new ParticleField(CAP.high);
  readonly renderer: ParticleRenderer;
  /** Fractional particles carried between frames, per continuous emitter. */
  private readonly carry = new Map<string, number>();
  /** Emitters that ran this frame (the others are forgotten in update()). */
  private readonly touched = new Set<string>();
  /** Emission scale for the graphics setting (low graphics spawns fewer). */
  private density = 1;

  constructor(atlasUrl: string) {
    this.renderer = new ParticleRenderer(this.field, atlasUrl);
  }

  get mesh(): THREE.Mesh {
    return this.renderer.mesh;
  }

  setQuality(q: Quality): void {
    this.field.limit = CAP[q];
    this.density = q === 'low' ? 0.5 : q === 'medium' ? 0.8 : 1;
  }

  update(dt: number): void {
    for (const k of this.carry.keys()) if (!this.touched.has(k)) this.carry.delete(k);
    this.touched.clear();
    this.field.update(dt);
    this.renderer.sync();
  }

  private spawn(p: ParticleSpawn): void {
    this.field.spawn(p);
  }

  /** How many particles a continuous emitter owes this frame at `rate` per second. */
  private due(key: string, rate: number, dt: number): number {
    this.touched.add(key);
    const acc = (this.carry.get(key) ?? 0) + rate * this.density * dt;
    const n = Math.floor(acc);
    this.carry.set(key, acc - n);
    return n;
  }

  // ---- Fire -------------------------------------------------------------------------------------

  private flame(x: number, y: number, z: number, size: number, rise = 1.6, life = 0.6): void {
    // Now and then a bushy clump instead of a single tongue, so a fire has body.
    const clump = R() < 0.3;
    this.spawn({
      sprite: clump ? 'fire_core_1' : pick(FLAMES), x, y, z, vx: rr(-0.2, 0.2), vy: rise, vz: rr(-0.2, 0.2),
      life: rr(life * 0.75, life * 1.25), size: size * rr(0.85, 1.15), size1: size * 0.45, aspect: clump ? 1.2 : 0.9,
      rot: rr(-0.2, 0.2), spin: rr(-0.5, 0.5), color: '#ffe8c0', color1: '#ff4010', fadeIn: 0.12, fadeOut: 0.45,
      gravity: -1.2,
    });
  }

  private smoke(x: number, y: number, z: number, size: number, dark = '#2a2622', alpha = 0.55, life = 1.8): void {
    this.spawn({
      sprite: pick(SMOKES), x, y, z, vx: rr(-0.3, 0.3), vy: rr(0.6, 1.1), vz: rr(-0.3, 0.3),
      life: rr(life * 0.8, life * 1.2), size, size1: size * 2.2, rot: rr(0, TAU), spin: rr(-0.4, 0.4),
      color: dark, alpha, fadeIn: 0.15, fadeOut: 0.4, additive: 0, drag: 0.6, gravity: -0.15,
    });
  }

  private embers(x: number, y: number, z: number, n: number, speed: number, tint = '#ffffff'): void {
    for (let i = 0; i < n; i++) {
      const a = rr(0, TAU);
      const s = speed * rr(0.3, 1);
      this.spawn({
        sprite: 'embers_0', x, y, z, vx: Math.cos(a) * s, vy: rr(1, 3), vz: Math.sin(a) * s,
        life: rr(0.5, 1.1), size: rr(0.25, 0.5), size1: 0.1, rot: rr(0, TAU), color: tint, color1: '#ff3a0a',
        fadeIn: 0.05, fadeOut: 0.5, drag: 1.2, gravity: -0.6,
      });
    }
  }

  /** A fireball: flash, blast, embers, a rising smoke column, a heat ring and a glowing scorch. */
  explosion(x: number, z: number, r: number, opts: { scorch?: boolean; tint?: string } = {}): void {
    const tint = opts.tint ?? '#ffffff';
    this.spawn({ sprite: 'energy_glow_0', x, y: 0.8, z, life: 0.16, size: r * 1.5, size1: r * 2, color: tint, alpha: 0.7, fadeIn: 0.05, fadeOut: 0.2 });
    for (let i = 0; i < 2; i++) {
      this.spawn({
        sprite: pick(BLASTS), x: x + rr(-0.3, 0.3) * r, y: 0.6 + r * 0.3, z: z + rr(-0.3, 0.3) * r,
        life: rr(0.45, 0.6), size: r * 1.3, size1: r * 2.4, rot: rr(0, TAU), spin: rr(-0.8, 0.8), color: tint,
        color1: '#ff4a10', fadeIn: 0.04, fadeOut: 0.35, gravity: -1.5,
      });
    }
    this.spawn({ sprite: 'heat_ring_0', x, y: 0.08, z, life: 0.45, size: r * 0.5, size1: r * 2.3, flat: true, rot: rr(0, TAU), color: tint, fadeIn: 0.02, fadeOut: 0.3 });
    this.embers(x, 0.5, z, Math.round(10 * this.density + r * 2), 3 + r);
    for (let i = 0; i < Math.round(4 * this.density + r); i++) {
      this.smoke(x + rr(-0.5, 0.5) * r, 0.6 + rr(0, 0.6) * r, z + rr(-0.5, 0.5) * r, r * rr(0.7, 1.1), '#2a2420', 0.6, rr(1.4, 2.2));
    }
    if (opts.scorch ?? true) this.scorch(x, z, r * 1.1);
  }

  /** Glowing cracks and dark soot left on the ground, cooling from orange to nothing. */
  scorch(x: number, z: number, r: number, life = 4): void {
    this.spawn({ sprite: 'smoke_0', x, y: 0.035, z, life, size: r * 2.4, flat: true, rot: rr(0, TAU), color: '#050403', alpha: 0.55, additive: 0, fadeIn: 0.03, fadeOut: 0.6 });
    this.spawn({ sprite: pick(['scorch_0', 'scorch_1'] as const), x, y: 0.04, z, life, size: r * 2, flat: true, rot: rr(0, TAU), color: '#ffd0a0', color1: '#601000', fadeIn: 0.02, fadeOut: 0.3 });
  }

  /** Burning ground (fire hazards): flames all over the patch, embers and smoke. */
  fireField(key: string, x: number, z: number, r: number, dt: number, strength = 1): void {
    const area = Math.min(50, r * r * 4.5) * strength;
    for (let i = this.due(`${key}:f`, 6 + area, dt); i > 0; i--) {
      const a = rr(0, TAU);
      const d = Math.sqrt(R()) * r * 0.9;
      this.flame(x + Math.cos(a) * d, 0.45, z + Math.sin(a) * d, rr(1, 1.7) * Math.min(1.8, 0.8 + r * 0.3));
    }
    for (let i = this.due(`${key}:s`, 1 + area * 0.08, dt); i > 0; i--) this.smoke(x + rr(-r, r) * 0.6, 1.2, z + rr(-r, r) * 0.6, rr(0.8, 1.4), '#1e1a17', 0.4);
    for (let i = this.due(`${key}:e`, 2 + area * 0.15, dt); i > 0; i--) this.embers(x + rr(-r, r) * 0.7, 0.4, z + rr(-r, r) * 0.7, 1, 0.6);
    if (this.due(`${key}:g`, 0.8, dt) > 0) this.scorch(x, z, r * 0.95, 2.6);
  }

  /** Something on fire: flames licking up its body, embers and a trail of smoke. */
  burning(key: string, x: number, y: number, z: number, radius: number, dt: number): void {
    const s = Math.max(0.8, radius * 1.6);
    for (let i = this.due(`${key}:f`, 18, dt); i > 0; i--) {
      this.flame(x + rr(-0.6, 0.6) * radius, y + rr(0.3, 1.2) * s, z + rr(-0.6, 0.6) * radius, rr(0.8, 1.2) * s, 1.4, 0.5);
    }
    for (let i = this.due(`${key}:s`, 3, dt); i > 0; i--) this.smoke(x, y + 1.6 * s, z, 0.6 * s, '#24201c', 0.4, 1.3);
    if (this.due(`${key}:e`, 3, dt) > 0) this.embers(x, y + s, z, 1, 0.8);
  }

  /** Flamethrower: tongues of fire rushing along the cone, smoke rolling off the end. */
  flameCone(x: number, z: number, r: number, facing: number, arcDeg: number): void {
    const half = (arcDeg * Math.PI) / 360;
    for (let i = 0; i < Math.round(12 * this.density); i++) {
      const a = facing + rr(-half, half) * 0.8;
      const sp = r / rr(0.3, 0.45);
      this.spawn({
        sprite: pick(['fire_core_0', 'explosion_0', 'flame_3'] as const), x: x + Math.sin(a) * 0.6, y: 0.9, z: z + Math.cos(a) * 0.6,
        vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rr(0, 0.6), life: rr(0.3, 0.42), size: 0.5, size1: 1.2 + r * 0.25,
        rot: rr(0, TAU), spin: rr(-3, 3), color: '#fff2c0', color1: '#ff3a0a', fadeIn: 0.05, fadeOut: 0.5, drag: 1.5,
      });
    }
    const d = r * 0.9;
    this.smoke(x + Math.sin(facing) * d, 1.2, z + Math.cos(facing) * d, 0.9, '#2a2420', 0.35, 1.2);
  }

  /** A fire vent blasting: a column of flame, a shock of heat, smoke. */
  fireVent(x: number, z: number, r: number): void {
    for (let i = 0; i < Math.round(18 * this.density); i++) {
      const a = rr(0, TAU);
      const d = Math.sqrt(R()) * r * 0.6;
      this.flame(x + Math.cos(a) * d, 0.3, z + Math.sin(a) * d, rr(1.2, 2.2), rr(5, 9), rr(0.5, 0.8));
    }
    this.explosion(x, z, r * 0.6, { scorch: true });
  }

  // ---- Toxic ------------------------------------------------------------------------------------

  /** A lingering gas cloud (spore hazards): slow puffs and drifting spores. Player clouds are paler. */
  sporeField(key: string, x: number, z: number, r: number, dt: number, mine: boolean, color?: string): void {
    const tint = color ?? (mine ? '#d8ffa0' : '#9aff7a');
    const area = Math.min(30, r * r * 1.4);
    for (let i = this.due(`${key}:c`, 1.2 + area * 0.35, dt); i > 0; i--) {
      const a = rr(0, TAU);
      const d = Math.sqrt(R()) * r * 0.75;
      this.spawn({
        sprite: pick(SPORES), x: x + Math.cos(a) * d, y: rr(0.3, 1.1), z: z + Math.sin(a) * d, vx: rr(-0.25, 0.25), vy: rr(0.05, 0.25), vz: rr(-0.25, 0.25),
        life: rr(2, 3), size: r * rr(0.45, 0.7), size1: r * rr(0.8, 1.1), rot: rr(0, TAU), spin: rr(-0.2, 0.2),
        color: tint, alpha: mine ? 0.22 : 0.32, fadeIn: 0.3, fadeOut: 0.55, additive: 0.75, drag: 0.4,
      });
    }
    for (let i = this.due(`${key}:p`, 1 + area * 0.12, dt); i > 0; i--) {
      this.spawn({ sprite: 'spores_0', x: x + rr(-r, r) * 0.7, y: rr(0.4, 1.8), z: z + rr(-r, r) * 0.7, vy: rr(0.1, 0.4), life: rr(1.5, 2.5), size: rr(0.8, 1.4), rot: rr(0, TAU), spin: rr(-0.5, 0.5), color: tint, alpha: 0.7, fadeIn: 0.3 });
    }
  }

  /** Poisoned: toxic bubbles popping off the body. */
  poisoned(key: string, x: number, y: number, z: number, radius: number, dt: number): void {
    for (let i = this.due(key, 4, dt); i > 0; i--) {
      this.spawn({ sprite: 'bubbles_0', x: x + rr(-0.4, 0.4) * radius, y: y + rr(0.5, 1.4), z: z + rr(-0.4, 0.4) * radius, vy: rr(0.4, 0.9), life: rr(0.6, 0.9), size: rr(0.3, 0.5), size1: 0.55, rot: rr(0, TAU), color: '#c8ff9a', alpha: 0.9 });
    }
  }

  /** A burst of spores (pulses, a raised corpse, a spore slam). */
  sporeBurst(x: number, z: number, r: number, color = '#9aff7a'): void {
    for (let i = 0; i < Math.round(8 * this.density); i++) {
      const a = (i / 8) * TAU + rr(-0.3, 0.3);
      const sp = r * rr(1.2, 2);
      this.spawn({ sprite: pick(SPORES), x, y: 0.6, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rr(0, 0.4), life: rr(0.7, 1.1), size: r * 0.4, size1: r * 0.9, rot: rr(0, TAU), color, alpha: 0.45, additive: 0.8, drag: 2.2, fadeOut: 0.4 });
    }
    this.spawn({ sprite: 'spores_0', x, y: 1, z, life: 0.9, size: r * 1.2, size1: r * 2, color, alpha: 0.8 });
  }

  /** Something bursts open: a splat on the ground, acid, a puff of spores. */
  corpseBurst(x: number, z: number, r: number): void {
    this.spawn({ sprite: 'splat_0', x, y: 0.045, z, life: 5, size: r * 1.4, flat: true, rot: rr(0, TAU), color: '#3a0a06', alpha: 0.85, additive: 0, fadeIn: 0.02, fadeOut: 0.7 });
    this.spawn({ sprite: 'toxic_splat_0', x, y: 0.05, z, life: 2.4, size: r * 1.2, flat: true, rot: rr(0, TAU), color: '#c8ff9a', alpha: 0.8, fadeIn: 0.02, fadeOut: 0.4 });
    this.sporeBurst(x, z, r * 0.8);
  }

  // ---- Cold -------------------------------------------------------------------------------------

  /** Coolant, steam and frost vents: a cold flash, ice crystals flying, steam rolling out. */
  frostBurst(x: number, z: number, r: number, steamy = true): void {
    this.spawn({ sprite: pick(['frost_burst_0', 'frost_burst_1'] as const), x, y: 0.9, z, life: 0.4, size: r * 0.8, size1: r * 2, rot: rr(0, TAU), color: '#e8faff', fadeIn: 0.05, fadeOut: 0.3 });
    this.spawn({ sprite: 'frost_ground_0', x, y: 0.05, z, life: 2.2, size: r * 1.8, flat: true, rot: rr(0, TAU), color: '#bfe8ff', alpha: 0.7, fadeIn: 0.05, fadeOut: 0.5 });
    for (let i = 0; i < Math.round(8 * this.density); i++) {
      const a = rr(0, TAU);
      const sp = rr(2, 5);
      this.spawn({ sprite: pick(['ice_shard_0', 'ice_shard_1'] as const), x, y: 0.8, z, vx: Math.cos(a) * sp, vy: rr(2, 4), vz: Math.sin(a) * sp, life: rr(0.5, 0.8), size: rr(0.3, 0.55), rot: rr(0, TAU), spin: rr(-6, 6), color: '#dff6ff', gravity: 9, fadeOut: 0.6 });
    }
    if (!steamy) return;
    for (let i = 0; i < Math.round(6 * this.density); i++) {
      this.spawn({ sprite: pick(['steam_0', 'steam_1'] as const), x: x + rr(-0.5, 0.5) * r, y: 0.6, z: z + rr(-0.5, 0.5) * r, vx: rr(-0.6, 0.6), vy: rr(1, 2), vz: rr(-0.6, 0.6), life: rr(1.2, 1.8), size: r * 0.6, size1: r * 1.4, rot: rr(0, TAU), spin: rr(-0.3, 0.3), color: '#dfeaf2', alpha: 0.5, additive: 0.25, drag: 0.8, fadeIn: 0.1, fadeOut: 0.4 });
    }
  }

  /** Chilled or frozen: frost glints and drifting cold vapour. */
  chilled(key: string, x: number, y: number, z: number, radius: number, dt: number, frozen: boolean): void {
    for (let i = this.due(key, frozen ? 6 : 3, dt); i > 0; i--) {
      this.spawn({ sprite: frozen ? pick(['ice_shard_0', 'ice_shard_1'] as const) : 'hit_spark_1', x: x + rr(-0.5, 0.5) * radius, y: y + rr(0.3, 1.6), z: z + rr(-0.5, 0.5) * radius, vy: frozen ? 0 : rr(-0.2, 0.2), life: rr(0.4, 0.8), size: frozen ? rr(0.35, 0.6) : rr(0.3, 0.5), rot: rr(0, TAU), color: '#cfefff', fadeIn: 0.2 });
    }
  }

  // ---- Energy -----------------------------------------------------------------------------------

  /** A small impact: a star of sparks in the given colour. */
  hit(x: number, y: number, z: number, color: string, size = 0.9): void {
    this.spawn({ sprite: pick(['hit_spark_0', 'hit_spark_1'] as const), x, y, z, life: 0.14, size, size1: size * 1.4, rot: rr(0, TAU), color, fadeIn: 0.02, fadeOut: 0.3 });
  }

  /** A soft glow that follows nothing: muzzle flashes, projectile trails, flare light. */
  glow(x: number, y: number, z: number, size: number, color: string, life = 0.15, alpha = 1): void {
    this.spawn({ sprite: 'energy_glow_0', x, y, z, life, size, size1: size * 0.6, color, alpha, fadeIn: 0.02, fadeOut: 0.2 });
  }

  /** Projectile trail: called every frame per projectile. */
  trail(key: string, x: number, y: number, z: number, color: string, dt: number, size = 0.55): void {
    for (let i = this.due(key, 45, dt); i > 0; i--) this.glow(x, y, z, size, color, 0.16, 0.8);
  }

  /** Crackling lightning between two points (a pull, a shocked target). */
  arc(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color = '#cfe0ff'): void {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 0.2) return;
    // A camera-facing quad can't follow an arbitrary line exactly; lying flat along the ground it reads well.
    this.spawn({ sprite: pick(ARCS), x: (ax + bx) / 2, y: Math.max(0.3, (ay + by) / 2), z: (az + bz) / 2, life: 0.18, size: len * 0.3, aspect: 3.3, flat: true, rot: Math.atan2(-(bz - az), bx - ax), color, fadeIn: 0.05, fadeOut: 0.4 });
  }

  /** The orbital strike: a white-blue blast and a ring of light. */
  orbital(x: number, z: number, r: number): void {
    this.spawn({ sprite: 'energy_glow_1', x, y: 1.2, z, life: 0.5, size: r * 3, size1: r * 4, color: '#ffffff', fadeIn: 0.03, fadeOut: 0.3 });
    this.explosion(x, z, r * 0.9, { tint: '#d8f0ff' });
    this.spawn({ sprite: 'hex_shield_0', x, y: 0.08, z, life: 0.6, size: r * 1.2, size1: r * 2.6, flat: true, color: '#9fd8ff', fadeOut: 0.3 });
  }

  /** A crystal shatters: a blinding white-cyan flash. */
  flash(x: number, z: number, r: number): void {
    this.spawn({ sprite: 'energy_glow_1', x, y: 1.2, z, life: 0.45, size: r * 1.6, size1: r * 2.4, color: '#ffffff', fadeIn: 0.03, fadeOut: 0.2 });
    this.spawn({ sprite: 'frost_burst_1', x, y: 1.2, z, life: 0.4, size: r * 0.6, size1: r * 1.6, rot: rr(0, TAU), color: '#e8ffff', fadeOut: 0.3 });
  }

  shield(x: number, z: number): void {
    this.spawn({ sprite: 'hex_shield_0', x, y: 1.1, z, life: 0.4, size: 2.2, size1: 2.8, color: '#9fd8ff', alpha: 0.9, fadeIn: 0.1, fadeOut: 0.4 });
  }

  // ---- Physical ---------------------------------------------------------------------------------

  /** Dust billowing out in a ring (slams, landings, dodges). */
  dustRing(x: number, z: number, r: number, color = '#8a7a64', n = 10): void {
    const count = Math.round(n * this.density);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rr(-0.2, 0.2);
      const sp = r * rr(1.2, 2.2);
      this.spawn({ sprite: pick(DUSTS), x: x + Math.cos(a) * r * 0.3, y: 0.4, z: z + Math.sin(a) * r * 0.3, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rr(0.2, 0.8), life: rr(0.8, 1.3), size: 0.8 + r * 0.25, size1: 1.4 + r * 0.5, rot: rr(0, TAU), spin: rr(-0.5, 0.5), color, alpha: 0.6, additive: 0, drag: 2.4, fadeIn: 0.05, fadeOut: 0.35 });
    }
  }

  /** Cracks in the ground (heavy slams). */
  cracks(x: number, z: number, r: number, color = '#ffb070', life = 1.6): void {
    this.spawn({ sprite: pick(['crack_0', 'crack_1'] as const), x, y: 0.05, z, life, size: r * 1.8, flat: true, rot: rr(0, TAU), color, alpha: 0.85, fadeIn: 0.02, fadeOut: 0.4 });
  }

  /** A sweeping blade: a crescent lying in the swing's plane, in front of the attacker. */
  slash(x: number, z: number, r: number, facing: number, color: string): void {
    const d = r * 0.45;
    this.spawn({ sprite: pick(['slash_0', 'slash_1'] as const), x: x + Math.sin(facing) * d, y: 0.95, z: z + Math.cos(facing) * d, life: 0.18, size: r * 1.5, size1: r * 1.75, flat: true, rot: facing + Math.PI / 2, color, fadeIn: 0.05, fadeOut: 0.35 });
  }

  /** Grit trickling from the roof before a cave-in. */
  fallingDust(x: number, z: number, r: number): void {
    for (let i = 0; i < Math.round(12 * this.density); i++) {
      this.spawn({ sprite: pick(DUSTS), x: x + rr(-r, r) * 0.8, y: rr(3, 5), z: z + rr(-r, r) * 0.8, vy: rr(-2.5, -1), life: rr(1, 1.6), size: rr(0.7, 1.3), size1: 1.8, rot: rr(0, TAU), color: '#9a8a70', alpha: 0.5, additive: 0, fadeIn: 0.2 });
    }
  }

  /** A smoke screen (Smoke Cloak). */
  smokeScreen(x: number, z: number, r: number): void {
    for (let i = 0; i < Math.round(14 * this.density); i++) {
      const a = rr(0, TAU);
      const d = Math.sqrt(R()) * r;
      this.smoke(x + Math.cos(a) * d, 0.6, z + Math.sin(a) * d, rr(1.6, 2.6), '#5a6472', 0.75, rr(2, 3));
    }
  }

  // ---- Other ------------------------------------------------------------------------------------

  heal(x: number, z: number): void {
    this.spawn({ sprite: 'heal_0', x, y: 1.2, z, life: 0.7, size: 2.4, size1: 2.8, aspect: 0.6, color: '#ffffff', fadeIn: 0.15, fadeOut: 0.5 });
    this.spawn({ sprite: 'heal_1', x, y: 1.2, z, vy: 0.8, life: 0.9, size: 2, color: '#ffffff', fadeIn: 0.1 });
  }

  blink(x: number, z: number, r: number): void {
    this.spawn({ sprite: 'blink_0', x, y: 1, z, life: 0.45, size: r * 1.2, size1: r * 2, spin: 8, color: '#ffffff', fadeIn: 0.05, fadeOut: 0.4 });
  }

  /** A glyph on the ground (traps, marks). */
  rune(sprite: SpriteKey, x: number, z: number, r: number, life = 0.6, y = 0.06): void {
    this.spawn({ sprite, x, y, z, life, size: r * 0.4, size1: r * 2, flat: true, spin: 1.2, color: '#ffffff', fadeIn: 0.1, fadeOut: 0.5 });
  }

  /** Spirit wisps rising (a corpse raised). */
  wisps(x: number, z: number, r: number): void {
    for (let i = 0; i < Math.round(5 * this.density); i++) {
      this.spawn({ sprite: pick(['wisp_0', 'wisp_1'] as const), x: x + rr(-r, r) * 0.5, y: 0.4, z: z + rr(-r, r) * 0.5, vy: rr(1.5, 2.6), life: rr(0.8, 1.2), size: rr(0.9, 1.4), size1: 0.5, aspect: 0.6, color: '#ffffff', fadeIn: 0.15 });
    }
  }

  /** A flare catching: embers and a red glow. */
  flare(x: number, z: number): void {
    this.glow(x, 0.6, z, 3, '#ff6a4a', 0.6, 0.9);
    this.embers(x, 0.4, z, Math.round(12 * this.density), 2.5, '#ffd0c0');
  }

  /** Embers rising off molten metal near the camera. */
  moltenEmbers(key: string, x: number, z: number, r: number, dt: number): void {
    for (let i = this.due(key, Math.min(8, 1 + r * 0.4), dt); i > 0; i--) {
      const a = rr(0, TAU);
      const d = Math.sqrt(R()) * r * 0.9;
      this.spawn({ sprite: 'embers_0', x: x + Math.cos(a) * d, y: 0.2, z: z + Math.sin(a) * d, vx: rr(-0.3, 0.3), vy: rr(1, 2.2), vz: rr(-0.3, 0.3), life: rr(1, 1.8), size: rr(0.3, 0.6), size1: 0.1, rot: rr(0, TAU), color: '#ffe0b0', color1: '#ff3a0a', fadeIn: 0.1, gravity: -0.3, drag: 0.5 });
    }
  }
}
