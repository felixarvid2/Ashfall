/**
 * Region Restoration (docs/world-and-gameplay.md §3.2): points for teleporters, side quests,
 * dungeons and bunkers, the stronghold, the region boss, world events, Echo Relics and the
 * revealed map fill a 5-tier meter. Rewards apply to every character on the account.
 */
import { AccountBonuses, PlayerControlled, Progression } from '../core/components';
import type { AccountData } from '../core/account';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { revealedFraction } from '../world/zone';

export type RestorationReward = 'skillPoint' | 'potion' | 'goldFind' | 'stash';

export const RESTORATION = {
  /** Points needed for each tier. */
  tiers: [5, 12, 20, 28, 36],
  rewards: ['skillPoint', 'potion', 'goldFind', 'skillPoint', 'stash'] as RestorationReward[],
  goldFind: 0.1,
  stashSlots: 20,
  /** Map reveal thresholds that give a point each. */
  map: [0.25, 0.5, 0.75],
};

export function tierFor(points: number): number {
  return RESTORATION.tiers.filter((t) => points >= t).length;
}

/** Totals of every reward earned across all regions. */
export function restorationBonuses(account: AccountData): { skillPoints: number; potionCharges: number; goldFind: number; stashSlots: number } {
  const out = { skillPoints: 0, potionCharges: 0, goldFind: 0, stashSlots: 0 };
  for (const entry of Object.values(account.restoration)) {
    for (let i = 0; i < entry.tiers; i++) {
      const r = RESTORATION.rewards[i];
      if (r === 'skillPoint') out.skillPoints++;
      else if (r === 'potion') out.potionCharges++;
      else if (r === 'goldFind') out.goldFind += RESTORATION.goldFind;
      else if (r === 'stash') out.stashSlots += RESTORATION.stashSlots;
    }
  }
  return out;
}

/** Give this character the account's Restoration skill points it hasn't had yet. */
export function grantRestorationPoints(world: World, account: AccountData): void {
  const player = world.first(PlayerControlled, Progression);
  if (player === undefined) return;
  const prog = world.req(player, Progression);
  const owed = restorationBonuses(account).skillPoints - (prog.restorationGranted ?? 0);
  if (owed > 0) {
    prog.skillPoints += owed;
    prog.restorationGranted = (prog.restorationGranted ?? 0) + owed;
  }
}

let timer = 0;

export function restorationSystem(world: World, dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  const account = ctx.account;
  if (!zone || !account) return;
  timer -= dt;
  if (timer > 0) return;
  timer = 1;
  const entry = (account.restoration[zone.def.id] ??= { points: [], tiers: 0 });
  const add = (k: string) => {
    if (!entry.points.includes(k)) entry.points.push(k);
  };
  for (const tp of zone.def.teleporters) if (!tp.hub && zone.discovered.has(tp.id)) add(`tp:${tp.id}`);
  for (const id of Object.keys(account.relics)) if (zone.def.pois.some((p) => p.id === id)) add(`relic:${id}`);
  const revealed = revealedFraction(zone);
  for (const m of RESTORATION.map) if (revealed >= m) add(`map:${m}`);

  const tier = tierFor(entry.points.length);
  if (tier <= entry.tiers) return;
  for (let i = entry.tiers; i < tier; i++) {
    ctx.events.push({ type: 'banner', key: 'restoration.tier', params: { tier: i + 1 }, seconds: 3 });
    ctx.events.push({ type: 'interact', kind: 'restoration', id: RESTORATION.rewards[i]! });
  }
  entry.tiers = tier;
  const player = world.first(PlayerControlled);
  if (player !== undefined) {
    const b = restorationBonuses(account);
    const ab = world.get(player, AccountBonuses);
    if (ab) {
      ab.potionCharges = b.potionCharges;
      ab.goldFind = b.goldFind;
    }
    grantRestorationPoints(world, account);
  }
}
