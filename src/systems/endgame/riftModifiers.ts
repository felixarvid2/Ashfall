/**
 * Rift modifiers (round 4, A20): a Deep Rift of level 5 and up may carry one twist. The roll is seeded by the rift's own seed,
 * so the daily rift has the same one all day. Each has an icon from existing art and a line in lang/en.json (rifts.modifiers.*).
 * - Volatile Dead: a slain enemy may burst a second later (a warned blast that hurts the player only).
 * - Shrinking Arena: in the guardian fight a ring of burning light closes in from the walls.
 * - Elite Storm: a share of every pack is born a champion.
 * - Lumen Surges: every half a minute the rift flares and its enemies hit harder for a few seconds.
 */
import { Blast, CombatStats, Dead, Elite, EnemyAI, Hazard, Transform, makeTransform } from '../../core/components';
import type { GameContext } from '../../core/context';
import type { Entity, World } from '../../core/ecs';
import type { Rng } from '../../core/rng';
import { enemyDef } from '../../data/db';
import { applyStatus } from '../combat';
import { makeElite } from '../../world/zone';

export const RIFT_MODIFIER_IDS = ['volatileDead', 'shrinkingArena', 'eliteStorm', 'lumenSurges'] as const;
export type RiftModifierId = (typeof RIFT_MODIFIER_IDS)[number];

export const RIFT_MODIFIERS: Record<RiftModifierId, { icon: string; color: string }> = {
  volatileDead: { icon: 'icon.skill_minefield', color: '#ff7a3a' },
  shrinkingArena: { icon: 'icon.crystal_void', color: '#b48cff' },
  eliteStorm: { icon: 'icon.skill_death_mark', color: '#ffd23a' },
  lumenSurges: { icon: 'icon.crystal_lumen', color: '#fff0c8' },
};

export const RIFT_MODIFIER_TUNING = {
  /** Rifts from this level may carry a modifier, with this chance. */
  minLevel: 5,
  chance: 0.7,
  volatileDead: { chance: 0.3, warning: 1.1, radius: 3.4, damageOfWeapon: 1.6 },
  /** The guardian arena's wall ring: starts at the wall, ends at `to` of its radius after `time` seconds; burns for `dpsOfDamage` x the guardian's weapon damage. */
  shrinkingArena: { start: 12, time: 90, to: 0.4, dpsOfDamage: 0.35, warmup: 8 },
  eliteStorm: { chance: 0.3 },
  lumenSurges: { every: 35, warning: 2, duration: 8, radius: 60 },
};

/** The modifier a rift of this level rolls (null: none). */
export function rollRiftModifier(rng: Rng, level: number): RiftModifierId | null {
  const T = RIFT_MODIFIER_TUNING;
  if (level < T.minLevel || !rng.chance(T.chance)) return null;
  return rng.pick([...RIFT_MODIFIER_IDS]);
}

export interface ModifierState {
  /** The closing ring of the Shrinking Arena, once the guardian is up. */
  ring: Entity | null;
  ringRadius: number;
  ringStart: number;
  /** Lumen Surges: time to the next surge, and the surge's phase. */
  surgeIn: number;
  surgeWarnLeft: number;
}

export const newModifierState = (): ModifierState => ({ ring: null, ringRadius: 0, ringStart: 0, surgeIn: RIFT_MODIFIER_TUNING.lumenSurges.every, surgeWarnLeft: 0 });

interface RiftLike {
  modifier: RiftModifierId | null;
  mod: ModifierState;
  elapsed: number;
}

const plain = (world: World, e: Entity): boolean => {
  const ai = world.get(e, EnemyAI);
  if (!ai) return false;
  const d = enemyDef(ai.defId);
  return !d.named && !d.choir && !d.rooted && d.lifespan === undefined && !world.has(e, Elite);
};

/** Elite Storm: called once for every enemy the rift sees for the first time. */
export function modifierOnEnemy(world: World, ctx: GameContext, r: RiftLike, e: Entity): void {
  if (r.modifier !== 'eliteStorm' || !plain(world, e) || !ctx.rng.chance(RIFT_MODIFIER_TUNING.eliteStorm.chance)) return;
  makeElite(world, e, 'champion', ctx.rng);
}

/** Volatile Dead: called once for every enemy the rift counts as killed. */
export function modifierOnKill(world: World, ctx: GameContext, r: RiftLike, e: Entity): void {
  if (r.modifier !== 'volatileDead') return;
  const T = RIFT_MODIFIER_TUNING.volatileDead;
  if (!ctx.rng.chance(T.chance)) return;
  const tr = world.get(e, Transform);
  if (!tr) return;
  const b = world.create();
  world.add(b, Transform, makeTransform(tr.x, 0, tr.z));
  world.add(b, Blast, {
    fuse: T.warning,
    radius: T.radius,
    owner: null,
    coefficient: 0,
    flat: 0,
    hurtsEnemies: false,
    player: { fraction: 0, damage: (world.get(e, CombatStats)?.weaponDamage ?? 10) * T.damageOfWeapon, level: world.get(e, CombatStats)?.level ?? 1 },
  });
  ctx.events.push({ type: 'telegraph', owner: b, x: tr.x, z: tr.z, shape: { kind: 'circle', radius: T.radius }, duration: T.warning, color: '#ff7a3a' });
}

/** Shrinking Arena: the guardian is up; lay the ring along the arena wall. */
export function modifierOnGuardian(world: World, r: RiftLike, boss: Entity, centre: { x: number; z: number }, radius: number): void {
  if (r.modifier !== 'shrinkingArena') return;
  const T = RIFT_MODIFIER_TUNING.shrinkingArena;
  const dps = (world.get(boss, CombatStats)?.weaponDamage ?? 20) * T.dpsOfDamage;
  const e = world.create();
  world.add(e, Transform, makeTransform(centre.x, 0, centre.z));
  world.add(e, Hazard, {
    team: 'enemy',
    radius: radius + 12,
    inner: radius,
    remaining: 1e9,
    duration: 1e9,
    tickTimer: 0.5,
    color: '#b48cff',
    applies: [{ status: 'burning', duration: 1.2, dps }],
    attackerLevel: world.get(boss, CombatStats)?.level ?? 1,
  });
  r.mod.ring = e;
  r.mod.ringRadius = radius;
  r.mod.ringStart = r.elapsed;
}

/** The inner radius of the closing ring `t` seconds into the guardian fight. */
export function ringInnerAt(start: number, t: number): number {
  const T = RIFT_MODIFIER_TUNING.shrinkingArena;
  if (t <= T.warmup) return start;
  const k = Math.min(1, (t - T.warmup) / T.time);
  return start * (1 - (1 - T.to) * k);
}

/** One tick of the modifier's own work (surges, the closing ring). */
export function tickModifier(world: World, dt: number, ctx: GameContext, r: RiftLike): void {
  if (r.modifier === 'shrinkingArena' && r.mod.ring !== null) {
    if (!world.isAlive(r.mod.ring)) r.mod.ring = null;
    else {
      const hz = world.req(r.mod.ring, Hazard);
      hz.inner = ringInnerAt(r.mod.ringRadius, r.elapsed - r.mod.ringStart);
      hz.radius = r.mod.ringRadius + 12;
    }
  }
  if (r.modifier === 'lumenSurges') {
    const T = RIFT_MODIFIER_TUNING.lumenSurges;
    if (r.mod.surgeWarnLeft > 0) {
      r.mod.surgeWarnLeft -= dt;
      if (r.mod.surgeWarnLeft <= 0) {
        // The flare: every living enemy of the rift hits harder for a few seconds.
        for (const e of world.query(EnemyAI, Transform)) {
          if (world.has(e, Dead)) continue;
          applyStatus(world, ctx, e, { status: 'overcharge', duration: T.duration }, { team: 'enemy', level: 1 });
        }
        ctx.events.push({ type: 'shake', trauma: 0.3 });
      }
    } else if ((r.mod.surgeIn -= dt) <= 0) {
      r.mod.surgeIn = T.every;
      r.mod.surgeWarnLeft = T.warning;
      ctx.events.push({ type: 'banner', key: 'rifts.modifiers.lumenSurges.flare', seconds: 2 });
    }
  }
}

