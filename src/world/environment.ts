/**
 * Zone mechanics (docs/regions/refinery-district.md): conveyor belts carry everything standing on
 * them, molten metal burns everyone in it (enemies step out when they can), and vents blast on a
 * timer after a 1.5 s warning, hurting enemies as well as the player.
 * Hydroponic Vaults (docs/regions/hydroponic-vaults.md): spore fields build up poison in the player
 * until an air filter clears them, and shallow water slows everyone wading through it.
 */
import { Boss, Collider, Dead, Elite, EnemyAI, Health, Mover, PlayerControlled, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { EnvFeature } from '../data/zones/zoneTypes';
import { applyDamage, applyStatus } from '../systems/combat';
import { monsterLevel } from '../systems/encounter';
import { hubAt, type ZoneRuntime } from './zone';

export const ENV_TUNING = {
  /** Molten metal: share of max life per second (elites and bosses take far less). */
  moltenPct: 0.09,
  moltenTick: 0.5,
  /** Enemies are pushed out of molten metal at this speed (m/s). */
  moltenAvoid: 5,
  /** Vent blast: share of max life, then burning or chilled. */
  ventPct: 0.2,
  ventWarning: 1.5,
  /** Vents further than this from the player stay quiet (nobody would see the warning). */
  ventRange: 70,
  /** Spore exposure (0..1): seconds to fill and to clear, and share of max life per second at full. */
  sporeFill: 8,
  sporeClear: 4,
  sporePct: 0.03,
};

type Molten = Extract<EnvFeature, { kind: 'molten' }>;
type Vent = Extract<EnvFeature, { kind: 'vent' }>;
type Belt = Extract<EnvFeature, { kind: 'conveyor' }>;
type Spores = Extract<EnvFeature, { kind: 'spores' }>;

/** The player's spore exposure, 0..1 (shown on the HUD). */
let exposure = 0;
export function sporeExposure(): number {
  return exposure;
}

/**
 * Is this spore field still there? Gone once its set piece is done (Dome Gamma reclaimed) or an air
 * filter that covers it has been switched on.
 */
export function sporesActive(zone: ZoneRuntime, f: Spores): boolean {
  if (f.clearedBy) return !zone.found.has(f.clearedBy);
  for (const p of zone.def.pois) {
    if (p.kind !== 'feature' || p.data?.feature !== 'airFilter' || !zone.found.has(p.id)) continue;
    if (Math.hypot(p.x - f.x, p.z - f.z) <= Number(p.data.radius ?? 0)) return false;
  }
  return true;
}

/** Which blast cycle each vent last fired or warned for. */
const ventState = new Map<string, { warned: number; fired: number }>();
let moltenTimer = 0;

/** Local belt coordinates: `along` the direction of travel and `across` it. */
function onBelt(b: Belt, x: number, z: number): boolean {
  const dx = x - b.x;
  const dz = z - b.z;
  const s = Math.sin(b.dir);
  const c = Math.cos(b.dir);
  const along = dx * s + dz * c;
  const across = dx * c - dz * s;
  return Math.abs(along) <= b.length / 2 && Math.abs(across) <= b.width / 2;
}

export function inMolten(features: readonly EnvFeature[] | undefined, x: number, z: number, pad = 0): Molten | null {
  if (!features) return null;
  for (const f of features) if (f.kind === 'molten' && Math.hypot(x - f.x, z - f.z) < f.radius + pad) return f;
  return null;
}

/** Share of max life an environmental hit takes from this entity. */
function share(world: World, e: Entity, pct: number): number {
  if (world.has(e, Boss)) return pct * 0.1;
  if (world.has(e, Elite)) return pct * 0.35;
  return pct;
}

function hurt(world: World, ctx: GameContext, e: Entity, pct: number, damageType: 'heat' | 'cold' | 'toxic', dot: boolean): void {
  const health = world.req(e, Health);
  const isPlayer = world.has(e, PlayerControlled);
  applyDamage(world, ctx, e, health.max * share(world, e, pct), { crit: false, damageType, dot, sourceTeam: isPlayer ? 'enemy' : 'player' });
}

export function environmentSystem(world: World, dt: number, ctx: GameContext): void {
  // Inside a dungeon only its own features count (the Cold Hall's frost vents).
  const env = ctx.instance ? ctx.instance.extra.env : ctx.zone?.def.env;
  if (!env) return;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return;
  const ptr = world.req(player, Transform);

  // Creatures near the player (belts and molten far away do not matter).
  const bodies: Entity[] = [];
  for (const e of world.query(Mover, Transform, Health)) {
    if (world.has(e, Dead)) continue;
    if (world.get(e, Collider)?.layer === 'air') continue;
    const tr = world.req(e, Transform);
    if (Math.abs(tr.x - ptr.x) > 90 || Math.abs(tr.z - ptr.z) > 90) continue;
    bodies.push(e);
  }

  moltenTimer -= dt;
  const moltenTick = moltenTimer <= 0;
  if (moltenTick) moltenTimer = ENV_TUNING.moltenTick;

  // Spores: only the player breathes them; clean air in hubs and around switched-on filters.
  if (ctx.zone && !ctx.instance && !world.has(player, Dead)) {
    const zone = ctx.zone;
    const inSpores = !hubAt(zone, ptr.x, ptr.z) && env.some((f) => f.kind === 'spores' && Math.hypot(ptr.x - f.x, ptr.z - f.z) < f.radius && sporesActive(zone, f));
    exposure = inSpores ? Math.min(1, exposure + dt / ENV_TUNING.sporeFill) : Math.max(0, exposure - dt / ENV_TUNING.sporeClear);
    if (exposure > 0 && moltenTick) {
      hurt(world, ctx, player, ENV_TUNING.sporePct * exposure * ENV_TUNING.moltenTick, 'toxic', true);
      if (inSpores) applyStatus(world, ctx, player, { status: 'poisoned', duration: 0.6 }, { team: 'enemy', level: monsterLevel(world, ctx) });
    }
  } else exposure = 0;

  for (const e of bodies) {
    const tr = world.req(e, Transform);
    for (const f of env) {
      if (f.kind === 'water') {
        // Drained (Irrigation System levers) water is gone.
        if (ctx.instance?.extra.drained?.has(f.id)) continue;
        if (Math.hypot(tr.x - f.x, tr.z - f.z) < f.radius) applyStatus(world, ctx, e, { status: 'wading', duration: 0.3 }, { team: 'enemy', level: 1 });
        continue;
      }
      if (f.kind === 'conveyor') {
        if (onBelt(f, tr.x, tr.z)) {
          tr.x += Math.sin(f.dir) * f.speed * dt;
          tr.z += Math.cos(f.dir) * f.speed * dt;
        }
      } else if (f.kind === 'molten') {
        if ((ctx.zone?.cooled.get(f.id) ?? 0) > ctx.time) continue;
        const d = Math.hypot(tr.x - f.x, tr.z - f.z);
        if (d >= f.radius) continue;
        // Enemies step back out to the shore; the player decides for themself.
        if (world.has(e, EnemyAI) && d > 0.01) {
          const push = Math.min(ENV_TUNING.moltenAvoid * dt, f.radius - d + 0.1);
          tr.x += ((tr.x - f.x) / d) * push;
          tr.z += ((tr.z - f.z) / d) * push;
        }
        if (moltenTick) hurt(world, ctx, e, ENV_TUNING.moltenPct * ENV_TUNING.moltenTick, 'heat', true);
      }
    }
  }

  // Vents: warn, then blast, on each one's own cycle.
  const level = monsterLevel(world, ctx);
  for (const f of env) {
    if (f.kind !== 'vent') continue;
    if (Math.hypot(f.x - ptr.x, f.z - ptr.z) > ENV_TUNING.ventRange) continue;
    ventCycle(world, ctx, f, bodies, level);
  }
}

function ventCycle(world: World, ctx: GameContext, f: Vent, bodies: Entity[], level: number): void {
  const t = ctx.time + f.offset;
  const cycle = Math.floor(t / f.period);
  const phase = t - cycle * f.period;
  let st = ventState.get(f.id);
  if (!st) ventState.set(f.id, (st = { warned: cycle - 1, fired: cycle }));
  // The blast lands as the next cycle begins, only after a warning was shown.
  if (cycle > st.fired) {
    const warned = st.warned === cycle - 1;
    st.fired = cycle;
    if (warned) blast(world, ctx, f, bodies, level);
  }
  if (phase >= f.period - ENV_TUNING.ventWarning && st.warned < cycle) {
    st.warned = cycle;
    const color = f.element === 'fire' ? '#ff6a1a' : f.element === 'steam' ? '#e8f4ff' : '#7ec8ff';
    ctx.events.push({ type: 'telegraph', owner: null, x: f.x, z: f.z, shape: { kind: 'circle', radius: f.radius }, duration: f.period - phase, color });
  }
}

function blast(world: World, ctx: GameContext, f: Vent, bodies: Entity[], level: number): void {
  ctx.events.push({ type: 'vfx', kind: f.element === 'fire' ? 'vent' : 'coolant', x: f.x, z: f.z, radius: f.radius, facing: 0 });
  for (const e of bodies) {
    const tr = world.req(e, Transform);
    if (Math.hypot(tr.x - f.x, tr.z - f.z) > f.radius) continue;
    const source = { team: world.has(e, PlayerControlled) ? ('enemy' as const) : ('player' as const), level };
    if (f.element === 'fire') {
      hurt(world, ctx, e, ENV_TUNING.ventPct, 'heat', false);
      applyStatus(world, ctx, e, { status: 'burning', duration: 3, dps: world.req(e, Health).max * share(world, e, 0.02) }, source);
    } else {
      hurt(world, ctx, e, ENV_TUNING.ventPct * 0.6, 'cold', false);
      applyStatus(world, ctx, e, { status: 'chilled', duration: 2.5 }, source);
      // Frost freezes solid for a moment (enemies too: lure them in).
      if (f.element === 'frost') applyStatus(world, ctx, e, { status: 'stunned', duration: 1.4 }, source);
    }
  }
}

/** Forget vent cycles (tests, zone changes). */
export function resetEnvironment(): void {
  ventState.clear();
  moltenTimer = 0;
  exposure = 0;
}
