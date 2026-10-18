/**
 * Lumen, The One Who Remembers: the final fight in the Heart (docs/regions/the-core.md).
 * The arena is sealed by a ring of light columns while it lasts. The phases (attacks, the memories of phase 2, the
 * beat of phase 3 and the exposed core of phase 4) live in the boss script `lumen` (src/data/bosses.ts) and run in
 * src/systems/boss.ts; this file starts and ends the fight, and takes the player's choice.
 */
import { Boss, Collider, Dead, EnemyAI, Renderable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { LUMEN_CHOICE_FLAGS, lumenChoiceOf, type LumenChoice } from '../data/lumen';
import { LAST_CAMP, LUMEN_HEART, THE_CORE } from '../data/zones/theCore';
import { endBeat, inBeat, resetBoss, spawnBoss } from '../systems/boss';
import { monsterLevel } from '../systems/encounter';
import { unlockTier } from '../systems/endgame/tiers';
import { signal } from '../systems/quests';
import type { ZoneRuntime } from './zone';

export const LUMEN_ZONE_ID = THE_CORE.id;
export const LUMEN_TUNING = {
  /** Stepping this far inside the arena starts the fight. */
  trigger: LUMEN_HEART.radius - 8,
  /** The ring of columns that seals the arena: radius, spacing and the collider that closes the gaps. */
  ring: LUMEN_HEART.radius - 2,
  spacing: 3.6,
  collider: 2,
  lifeMul: 2,
  /** Away this long after a win and the Heart can be fought again. */
  rearm: 600,
  /**
   * The camera leans toward Lumen while it is fought (the arena is 80 m across, the camera shows about 25): half the
   * way to it, but never more than this many metres off the player (further and the player slides under the hotbar or off the top).
   */
  frameLean: 0.5,
  frameMax: 5,
};

export interface LumenState {
  state: 'idle' | 'fight' | 'defeated';
  boss: Entity | null;
  gates: Entity[];
  leftAt: number;
}

export function createLumenState(): LumenState {
  return { state: 'idle', boss: null, gates: [], leftAt: 0 };
}

/** After loading: a defeated Lumen stays defeated. */
export function syncLumen(world: World, zone: ZoneRuntime): LumenState {
  const old = zone.setPieces.lumen;
  if (old) {
    for (const e of [...old.gates, ...(old.boss !== null ? [old.boss] : [])]) if (world.isAlive(e)) world.destroyDeferred(e);
  }
  const st = createLumenState();
  if (zone.found.has(LUMEN_HEART.id)) st.state = 'defeated';
  return st;
}

function restorationPoint(ctx: GameContext, key: string): void {
  if (!ctx.account || !ctx.zone) return;
  const entry = (ctx.account.restoration[ctx.zone.def.id] ??= { points: [], tiers: 0 });
  if (!entry.points.includes(key)) entry.points.push(key);
}

/** Where the ring's columns stand. */
export function lumenGateSpots(): { x: number; z: number }[] {
  const n = Math.round((Math.PI * 2 * LUMEN_TUNING.ring) / LUMEN_TUNING.spacing);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: LUMEN_HEART.x + Math.sin(a) * LUMEN_TUNING.ring, z: LUMEN_HEART.z + Math.cos(a) * LUMEN_TUNING.ring };
  });
}

/**
 * Where the camera should look during the fight: a lean from the player toward Lumen so the boss (a tall structure)
 * stays on screen at the ranges the arena is fought from. The player's own position when there is no fight.
 */
export function lumenCameraFocus(world: World, zone: ZoneRuntime, px: number, pz: number): { x: number; z: number } {
  const st = zone.setPieces.lumen;
  if (!st || st.state !== 'fight' || st.boss === null || !world.isAlive(st.boss)) return { x: px, z: pz };
  const bt = world.get(st.boss, Transform);
  if (!bt) return { x: px, z: pz };
  const dx = bt.x - px;
  const dz = bt.z - pz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return { x: px, z: pz };
  const lean = Math.min(d * LUMEN_TUNING.frameLean, LUMEN_TUNING.frameMax);
  return { x: px + (dx / d) * lean, z: pz + (dz / d) * lean };
}

function closeArena(world: World, st: LumenState): void {
  st.gates = lumenGateSpots().map((p, i) => {
    const g = world.create();
    world.add(g, Transform, makeTransform(p.x, 0, p.z, i));
    world.add(g, Renderable, { assetId: 'prop.core_column', scale: 1.1, glow: i % 2 ? '#c8a4ff' : '#ffd88a', look: 'lumen' });
    world.add(g, Collider, { radius: LUMEN_TUNING.collider, mass: Infinity, layer: 'ground', isStatic: true });
    return g;
  });
}

function openArena(world: World, st: LumenState): void {
  for (const g of st.gates) if (world.isAlive(g)) world.destroyDeferred(g);
  st.gates = [];
}

export function lumenSystem(world: World, ctx: GameContext, zone: ZoneRuntime, ptr: Transform): void {
  const st = (zone.setPieces.lumen ??= createLumenState());
  const H = LUMEN_HEART;
  const d = Math.hypot(ptr.x - H.x, ptr.z - H.z);
  const level = Math.max(monsterLevel(world, ctx), ctx.zoneLevels[1]);
  if (st.state === 'defeated' && d > H.radius + 60 && st.leftAt === 0) st.leftAt = ctx.time;
  if (st.state === 'defeated' && st.leftAt > 0 && ctx.time - st.leftAt > LUMEN_TUNING.rearm) {
    st.state = 'idle';
    st.leftAt = 0;
  }
  if (st.state === 'idle' && d < LUMEN_TUNING.trigger) {
    st.state = 'fight';
    if (st.boss === null || !world.isAlive(st.boss) || world.has(st.boss, Dead)) {
      st.boss = spawnBoss(world, H.x, H.z, {
        enemy: 'lumen',
        name: 'enemies.named.lumen',
        level,
        lifeMul: LUMEN_TUNING.lifeMul,
        damageMul: 1,
        affixes: [],
        script: 'lumen',
        arena: { x: H.x, z: H.z, radius: H.radius - 4 },
      });
    }
    world.req(st.boss, EnemyAI).aggro = true;
    closeArena(world, st);
    ctx.events.push({ type: 'banner', key: 'bosses.lumen.intro', seconds: 3.2 });
    ctx.events.push({ type: 'shake', trauma: 0.7 });
  }
  if (st.state === 'fight' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'defeated';
    st.leftAt = 0;
    openArena(world, st);
    const boss = world.req(st.boss, Boss);
    // Whatever Lumen had summoned goes with it.
    for (const a of boss.adds) if (world.isAlive(a)) world.destroyDeferred(a);
    boss.adds = [];
    const first = !zone.found.has(H.id);
    zone.found.add(H.id);
    signal(ctx, { type: 'objective', id: H.id });
    restorationPoint(ctx, `boss:${H.id}`);
    // The ending carries the player to the Last Camp, so the loot lands where they arrive.
    const camp = THE_CORE.teleporters.find((tp) => tp.id === 'tp.camp') ?? LAST_CAMP;
    const x = camp.x + 3;
    const z = camp.z + 3;
    ctx.rewards.push({ table: 'dt.boss', level, x, z, xp: true, ...(first ? { rarity: 'legendary' as const } : {}) });
    ctx.rewards.push({ table: 'dt.boss', level, x, z, xp: false });
    ctx.events.push({ type: 'banner', key: 'setPieces.lumen.defeated', seconds: 3 });
    // Defeating Lumen opens the endgame: World Tier 2 for the whole account (docs/endgame.md).
    if ((ctx.account?.endgame.tierUnlocked ?? 2) < 2) {
      unlockTier(ctx, 2);
      ctx.events.push({ type: 'interact', kind: 'tierUnlock', id: '2' });
    }
    ctx.events.push({ type: 'shake', trauma: 0.8 });
    ctx.events.push({ type: 'epilogue', choice: lumenChoiceOf(zone.found) });
  }
}

/** The player died: the fight resets with the arena open. */
export function lumenOnDeath(world: World, zone: ZoneRuntime): void {
  const st = zone.setPieces.lumen;
  if (!st || st.state !== 'fight') return;
  openArena(world, st);
  st.state = 'idle';
  if (st.boss !== null) resetBoss(world, st.boss);
}

/**
 * The player's answer in Lumen's beat. Saves the choice (the latest one counts) and lets the fight go on to phase 4.
 * False when Lumen is not waiting for one.
 */
export function chooseLumen(world: World, zone: ZoneRuntime, choice: LumenChoice): boolean {
  const boss = world.query(Boss).find((e) => inBeat(world, e));
  if (boss === undefined) return false;
  for (const c of Object.keys(LUMEN_CHOICE_FLAGS) as LumenChoice[]) zone.found.delete(LUMEN_CHOICE_FLAGS[c]);
  zone.found.add(LUMEN_CHOICE_FLAGS[choice]);
  endBeat(world, boss);
  return true;
}
