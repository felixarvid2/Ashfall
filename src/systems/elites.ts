/**
 * Elite enemies (docs/world-and-gameplay.md §8.3): rolling affixes and names, and running the
 * affixes each tick (fire trails, teleports, snares, spore clouds, shields, mirror copies).
 * Vampiric and Freezing hook into hits (combat.ts); Explodes on Death into kill().
 */
import {
  Blast,
  CombatStats,
  Dead,
  DisplayName,
  Elite,
  EnemyAI,
  Hazard,
  Health,
  Mover,
  PendingHazard,
  PlayerControlled,
  Renderable,
  Transform,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { Rng } from '../core/rng';
import { AFFIX_TUNING, ELITE_AFFIXES, EXCLUSIVE_AFFIXES, rareAffixCount, type EliteAffix } from '../data/elites';
import { t } from '../data/i18n';
import { applyStatus } from './combat';
import { spawnEnemy } from '../world/spawn';

/** Roll `count` affixes that may appear together. */
export function rollAffixes(rng: Rng, count: number): EliteAffix[] {
  const out: EliteAffix[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 100) {
    const a = rng.pick(ELITE_AFFIXES);
    if (out.includes(a)) continue;
    if (EXCLUSIVE_AFFIXES.some(([x, y]) => (x === a && out.includes(y)) || (y === a && out.includes(x)))) continue;
    out.push(a);
  }
  return out;
}

/** "Kaal the Rotting, Warden of Ash". */
export function rareName(rng: Rng): string {
  const pool = (key: string) => t(`elites.names.${key}`).split('|');
  return t('elites.named', { first: rng.pick(pool('first')), epithet: rng.pick(pool('epithet')), title: rng.pick(pool('title')) });
}

export function championAffixes(rng: Rng): EliteAffix[] {
  return rollAffixes(rng, rng.chance(0.5) ? 2 : 1);
}

export function rareAffixes(rng: Rng, level: number): EliteAffix[] {
  return rollAffixes(rng, rareAffixCount(level));
}

/** Give an enemy its elite affixes (stats and glow come from makeElite). */
export function applyAffixes(world: World, e: Entity, kind: 'champion' | 'rare' | 'named', affixes: EliteAffix[], rng: Rng): void {
  world.add(e, Elite, { kind, affixes, timers: {}, shieldUsed: false, mirrored: false, copy: false });
  if (affixes.includes('fast')) {
    const m = world.get(e, Mover);
    if (m) m.speed *= AFFIX_TUNING.fast;
  }
  if (kind === 'rare' && !world.has(e, DisplayName)) world.add(e, DisplayName, { key: rareName(rng), literal: true });
}

export function hasAffix(world: World, e: Entity, affix: EliteAffix): boolean {
  return world.get(e, Elite)?.affixes.includes(affix) ?? false;
}

const range = (rng: Rng, [a, b]: [number, number]) => rng.range(a, b);

export function eliteSystem(world: World, dt: number, ctx: GameContext): void {
  // Snares that finished their warning become real.
  for (const e of world.query(PendingHazard, Transform)) {
    const p = world.req(e, PendingHazard);
    p.fuse -= dt;
    if (p.fuse > 0) continue;
    world.remove(e, PendingHazard);
    world.add(e, Hazard, p.hazard);
  }

  const player = world.first(PlayerControlled, Transform);
  const ptr = player !== undefined ? world.req(player, Transform) : undefined;
  const rng = ctx.rng;

  for (const e of world.query(Elite, EnemyAI, Transform)) {
    if (world.has(e, Dead)) continue;
    const el = world.req(e, Elite);
    const ai = world.req(e, EnemyAI);
    const tr = world.req(e, Transform);
    const stats = world.get(e, CombatStats);
    const health = world.get(e, Health);
    const dmg = stats?.weaponDamage ?? 10;
    const level = stats?.level ?? 1;
    const tick = (a: EliteAffix, cd: number | [number, number]): boolean => {
      const left = (el.timers[a] ?? (typeof cd === 'number' ? cd : range(rng, cd))) - dt;
      if (left > 0) {
        el.timers[a] = left;
        return false;
      }
      el.timers[a] = typeof cd === 'number' ? cd : range(rng, cd);
      return true;
    };

    // Shielded: a barrier the first time it is hurt.
    if (el.affixes.includes('shielded') && !el.shieldUsed && health && health.current < health.max) {
      el.shieldUsed = true;
      applyStatus(world, ctx, e, { status: 'barrier', duration: AFFIX_TUNING.shieldDuration, amount: health.max * AFFIX_TUNING.shieldFraction }, { team: 'enemy', level });
      ctx.events.push({ type: 'vfx', kind: 'shield', x: tr.x, z: tr.z, radius: 1.4, facing: 0 });
    }
    // Mirroring: at half life, copies split off.
    if (el.affixes.includes('mirroring') && !el.mirrored && !el.copy && health && health.current <= health.max * 0.5) {
      el.mirrored = true;
      spawnMirrors(world, ctx, e);
    }
    if (!ai.aggro || ptr === undefined) continue;

    const moving = Math.hypot(tr.x - tr.prevX, tr.z - tr.prevZ) > 0.001;
    if (el.affixes.includes('burning') && moving && tick('burning', AFFIX_TUNING.burning.interval)) {
      const b = AFFIX_TUNING.burning;
      hazard(world, tr.x, tr.z, { radius: b.radius, duration: b.duration, status: 'burning', dps: dmg * b.dpsOfDamage, level, color: '#ff7a1a' });
    }
    if (el.affixes.includes('sporeSpreader') && tick('sporeSpreader', AFFIX_TUNING.sporeSpreader.cooldown)) {
      const s = AFFIX_TUNING.sporeSpreader;
      hazard(world, tr.x, tr.z, { radius: s.radius, duration: s.duration, status: 'poisoned', dps: dmg * s.dpsOfDamage, level });
      ctx.events.push({ type: 'vfx', kind: 'sporePulse', x: tr.x, z: tr.z, radius: s.radius, facing: 0 });
    }
    const dist = Math.hypot(ptr.x - tr.x, ptr.z - tr.z);
    if (el.affixes.includes('teleporting') && tick('teleporting', AFFIX_TUNING.teleporting.cooldown) && dist > AFFIX_TUNING.teleporting.minDistance) {
      ctx.events.push({ type: 'vfx', kind: 'blink', x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
      const a = rng.range(0, Math.PI * 2);
      tr.x = tr.prevX = ptr.x + Math.sin(a) * 2.5;
      tr.z = tr.prevZ = ptr.z + Math.cos(a) * 2.5;
      ctx.events.push({ type: 'vfx', kind: 'blink', x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
    }
    if (el.affixes.includes('snaring') && tick('snaring', AFFIX_TUNING.snaring.cooldown) && dist < 20) {
      const s = AFFIX_TUNING.snaring;
      const z = world.create();
      world.add(z, Transform, makeTransform(ptr.x, 0, ptr.z));
      world.add(z, PendingHazard, {
        fuse: s.warning,
        hazard: { team: 'enemy', radius: s.radius, remaining: 0.5, duration: 0.5, tickTimer: 0, applies: [{ status: 'rooted', duration: s.root }], attackerLevel: level, color: '#b06aff' },
      });
      ctx.events.push({ type: 'telegraph', owner: e, x: ptr.x, z: ptr.z, shape: { kind: 'circle', radius: s.radius }, duration: s.warning, color: '#b06aff' });
    }
  }
}

function hazard(
  world: World,
  x: number,
  z: number,
  o: { radius: number; duration: number; status: 'burning' | 'poisoned'; dps: number; level: number; color?: string },
): void {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z));
  world.add(e, Hazard, {
    team: 'enemy',
    radius: o.radius,
    remaining: o.duration,
    duration: o.duration,
    tickTimer: 0,
    applies: [{ status: o.status, duration: 1.5, dps: o.dps }],
    attackerLevel: o.level,
    ...(o.color ? { color: o.color } : {}),
  });
}

function spawnMirrors(world: World, ctx: GameContext, source: Entity): void {
  const tr = world.req(source, Transform);
  const ai = world.req(source, EnemyAI);
  const health = world.req(source, Health);
  const el = world.req(source, Elite);
  const { copies, lifeFraction } = AFFIX_TUNING.mirroring;
  for (let i = 0; i < copies; i++) {
    const a = (i / copies) * Math.PI * 2 + 0.7;
    const e = spawnEnemy(world, ai.defId, tr.x + Math.sin(a) * 2, tr.z + Math.cos(a) * 2, { level: world.get(source, CombatStats)?.level ?? 1 });
    const h = world.req(e, Health);
    h.max = h.current = health.max * lifeFraction;
    world.req(e, EnemyAI).aggro = true;
    world.add(e, Elite, { kind: el.kind, affixes: el.affixes.filter((x) => x !== 'mirroring' && x !== 'explodesOnDeath'), timers: {}, shieldUsed: true, mirrored: true, copy: true });
    const r = world.get(e, Renderable);
    const sr = world.get(source, Renderable);
    if (r && sr) {
      r.scale = (sr.scale ?? 1) * 0.85;
      r.hologram = true;
    }
    ctx.events.push({ type: 'vfx', kind: 'blink', x: world.req(e, Transform).x, z: world.req(e, Transform).z, radius: 1, facing: 0 });
  }
}

/** Vampiric and Freezing: what an elite's hit does beyond damage. */
export function onEliteHit(world: World, ctx: GameContext, attacker: Entity, target: Entity, dealt: number): void {
  const el = world.get(attacker, Elite);
  if (!el || dealt <= 0) return;
  if (el.affixes.includes('vampiric')) {
    const h = world.get(attacker, Health);
    if (h && !world.has(attacker, Dead)) h.current = Math.min(h.max, h.current + dealt * AFFIX_TUNING.vampiric);
  }
  if (el.affixes.includes('freezing')) {
    const f = AFFIX_TUNING.freezing;
    const level = world.get(attacker, CombatStats)?.level ?? 1;
    applyStatus(world, ctx, target, { status: 'chilled', duration: f.chill }, { team: 'enemy', level });
    if (ctx.rng.chance(f.freezeChance)) applyStatus(world, ctx, target, { status: 'frozen', duration: f.freeze }, { team: 'enemy', level });
  }
}

/** Explodes on Death: a warned blast where it fell. */
export function eliteDeath(world: World, ctx: GameContext, e: Entity): void {
  const el = world.get(e, Elite);
  const tr = world.get(e, Transform);
  if (!el || !tr || !el.affixes.includes('explodesOnDeath')) return;
  const x = AFFIX_TUNING.explodesOnDeath;
  const stats = world.get(e, CombatStats);
  const b = world.create();
  world.add(b, Transform, makeTransform(tr.x, 0, tr.z));
  world.add(b, Blast, {
    fuse: x.warning,
    radius: x.radius,
    owner: null,
    coefficient: 0,
    flat: 0,
    hurtsEnemies: false,
    player: { fraction: 0, damage: (stats?.weaponDamage ?? 10) * x.damageOfWeapon, level: stats?.level ?? 1 },
  });
  ctx.events.push({ type: 'telegraph', owner: b, x: tr.x, z: tr.z, shape: { kind: 'circle', radius: x.radius }, duration: x.warning, color: '#ff3a2a' });
}
