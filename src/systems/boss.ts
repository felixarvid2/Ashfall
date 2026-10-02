/**
 * Boss behaviour on top of the basic enemy AI (docs/world-and-gameplay.md §9): phases by life,
 * summoned adds, thrown plates that stay as cover and spore fields. Bosses reset when the player
 * dies during the fight.
 */
import {
  Blast,
  Boss,
  Collider,
  CombatStats,
  Dead,
  DisplayName,
  EnemyAI,
  Hazard,
  Health,
  Mover,
  PlayerControlled,
  Renderable,
  StatusEffects,
  Transform,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { Rng } from '../core/rng';
import { BOSS_SCRIPTS, type BossPhase } from '../data/bosses';
import type { EliteAffix } from '../data/elites';
import { applyAffixes } from './elites';
import { spawnEnemy } from '../world/spawn';

export interface BossSpec {
  enemy: string;
  name: string;
  level: number;
  lifeMul: number;
  damageMul: number;
  affixes: EliteAffix[];
  script?: string | undefined;
  arena: { x: number; z: number; radius: number };
}

export function spawnBoss(world: World, x: number, z: number, spec: BossSpec): Entity {
  const e = spawnEnemy(world, spec.enemy, x, z, { level: spec.level });
  const h = world.req(e, Health);
  h.max *= spec.lifeMul;
  h.current = h.max;
  const stats = world.req(e, CombatStats);
  stats.weaponDamage *= spec.damageMul;
  stats.tags.push('elite', 'boss');
  world.add(e, DisplayName, { key: spec.name });
  applyAffixes(world, e, 'named', spec.affixes, new Rng(`boss-${spec.enemy}`));
  const r = world.get(e, Renderable);
  if (r && spec.enemy !== 'the_first') r.scale = (r.scale ?? 1) * 1.3;
  world.add(e, Boss, {
    script: spec.script ?? null,
    phase: 0,
    timers: { adds: 6, plates: 4, spores: 3 },
    engaged: false,
    arena: spec.arena,
    adds: [],
    plates: [],
    pending: [],
    baseSpeed: world.req(e, Mover).speed,
  });
  return e;
}

function phases(boss: Boss): BossPhase[] {
  return boss.script ? (BOSS_SCRIPTS[boss.script] ?? []) : [];
}

export function bossSystem(world: World, dt: number, ctx: GameContext): void {
  const player = world.first(PlayerControlled, Transform);
  const ptr = player !== undefined ? world.req(player, Transform) : undefined;
  for (const e of world.query(Boss, EnemyAI, Transform)) {
    const boss = world.req(e, Boss);
    if (world.has(e, Dead)) {
      // Thrown plates crumble when the boss dies.
      for (const p of boss.plates) world.destroyDeferred(p);
      boss.plates = [];
      continue;
    }
    const ai = world.req(e, EnemyAI);
    const tr = world.req(e, Transform);
    const health = world.req(e, Health);
    const level = world.get(e, CombatStats)?.level ?? 1;
    const weapon = world.get(e, CombatStats)?.weaponDamage ?? 20;
    if (!boss.engaged && ai.aggro) boss.engaged = true;
    if (!boss.engaged || ptr === undefined) continue;

    // Phase changes.
    const list = phases(boss);
    const frac = health.current / health.max;
    let next = boss.phase;
    while (next + 1 < list.length && frac <= list[next + 1]!.below) next++;
    if (next !== boss.phase) {
      boss.phase = next;
      const ph = list[next]!;
      world.req(e, Mover).speed = boss.baseSpeed * (ph.speedMul ?? 1);
      ai.tempo = ph.tempo ?? 1;
      if (ph.banner) ctx.events.push({ type: 'banner', key: ph.banner, seconds: 2.5 });
      ctx.events.push({ type: 'shake', trauma: 0.5 });
      boss.timers.plates = 1.5;
      boss.timers.spores = 1;
    }
    const ph = list[boss.phase];
    if (!ph) continue;

    boss.adds = boss.adds.filter((a) => world.isAlive(a) && !world.has(a, Dead));
    if (ph.adds && (boss.timers.adds -= dt) <= 0) {
      boss.timers.adds = ph.adds.every;
      for (let i = 0; i < ph.adds.count && boss.adds.length < 8; i++) {
        const a = ctx.rng.range(0, Math.PI * 2);
        const add = spawnEnemy(world, ph.adds.enemy, tr.x + Math.sin(a) * 4, tr.z + Math.cos(a) * 4, { level });
        world.req(add, EnemyAI).aggro = true;
        boss.adds.push(add);
      }
      ctx.events.push({ type: 'vfx', kind: 'sporePulse', x: tr.x, z: tr.z, radius: 4, facing: 0 });
    }
    if (ph.plates && (boss.timers.plates -= dt) <= 0) {
      boss.timers.plates = ph.plates.every;
      boss.pending.push({ x: ptr.x, z: ptr.z, t: ph.plates.warning });
      ctx.events.push({ type: 'telegraph', owner: e, x: ptr.x, z: ptr.z, shape: { kind: 'circle', radius: ph.plates.radius }, duration: ph.plates.warning, color: '#ff3a2a' });
    }
    for (const p of boss.pending) p.t -= dt;
    for (const p of boss.pending.filter((q) => q.t <= 0)) {
      const plates = ph.plates ?? list.find((x) => x.plates)?.plates;
      if (!plates) continue;
      const blast = world.create();
      world.add(blast, Transform, makeTransform(p.x, 0, p.z));
      world.add(blast, Blast, { fuse: 0, radius: plates.radius, owner: null, coefficient: 0, flat: 0, hurtsEnemies: false, player: { fraction: 0, damage: weapon * plates.damageOfWeapon, level } });
      // The plate stays where it landed: cover from the boss's next throws.
      const plate = world.create();
      world.add(plate, Transform, makeTransform(p.x, 0, p.z, ctx.rng.range(0, Math.PI)));
      world.add(plate, Renderable, { assetId: 'prop.barricade', scale: 1.3 });
      world.add(plate, Collider, { radius: 1.1, mass: Infinity, layer: 'ground', isStatic: true });
      boss.plates.push(plate);
    }
    boss.pending = boss.pending.filter((q) => q.t > 0);
    if (ph.sporeFields && (boss.timers.spores -= dt) <= 0) {
      const s = ph.sporeFields;
      boss.timers.spores = s.every;
      for (let i = 0; i < s.count; i++) {
        const a = ctx.rng.range(0, Math.PI * 2);
        const d = ctx.rng.range(0, boss.arena.radius - 4);
        const hz = world.create();
        world.add(hz, Transform, makeTransform(boss.arena.x + Math.sin(a) * d, 0, boss.arena.z + Math.cos(a) * d));
        world.add(hz, Hazard, {
          team: 'enemy',
          radius: s.radius,
          remaining: s.duration,
          duration: s.duration,
          tickTimer: 0.6,
          applies: [{ status: 'poisoned', duration: 1.5, dps: weapon * s.dpsOfWeapon }],
          attackerLevel: level,
        });
      }
    }
  }
}

/** Put a boss back as it was before the fight (the player died). */
export function resetBoss(world: World, e: Entity): void {
  const boss = world.get(e, Boss);
  if (!boss || world.has(e, Dead)) return;
  for (const a of boss.adds) if (world.isAlive(a)) world.destroyDeferred(a);
  for (const p of boss.plates) world.destroyDeferred(p);
  boss.adds = [];
  boss.plates = [];
  boss.pending = [];
  boss.phase = 0;
  boss.engaged = false;
  boss.timers = { adds: 6, plates: 4, spores: 3 };
  const h = world.req(e, Health);
  h.current = h.max;
  const ai = world.req(e, EnemyAI);
  ai.aggro = false;
  ai.state = 'idle';
  ai.tempo = 1;
  world.req(e, Mover).speed = boss.baseSpeed;
  const fx = world.get(e, StatusEffects);
  if (fx) fx.list = [];
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = boss.arena.x;
  tr.z = tr.prevZ = boss.arena.z;
}
