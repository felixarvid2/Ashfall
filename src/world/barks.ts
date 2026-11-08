/** NPC barks (round 4, D09): idle lines near a hub NPC, and reactions to the player's progress. */
import { PlayerControlled, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import {
  BARK_ANY_COOLDOWN,
  BARK_CAMPAIGN_END,
  BARK_IDLE_LINES,
  BARK_NPCS,
  BARK_NPC_COOLDOWN,
  BARK_RADIUS,
  BARK_REACT_LINES,
} from '../data/barks';
import { NPCS } from '../data/quests/db';
import { Progression } from '../core/components';

interface BarkState {
  last: Map<string, number>;
  lastAny: number;
  idle: Map<string, number>;
  heard: Set<string>;
}

const STATES = new WeakMap<GameContext, BarkState>();

function stateOf(ctx: GameContext): BarkState {
  let st = STATES.get(ctx);
  if (!st) STATES.set(ctx, (st = { last: new Map(), lastAny: -Infinity, idle: new Map(), heard: new Set() }));
  return st;
}

/** The language key of the bark `npc` says now, given what the player has done (pure: no state change). */
export function nextBarkKey(npc: string, campaignDone: boolean, atCap: boolean, heard: ReadonlySet<string>, idleIndex: number): string {
  if (campaignDone && !heard.has(`${npc}:0`)) return `barks.${npc}.react.0`;
  if (atCap && !heard.has(`${npc}:1`)) return `barks.${npc}.react.1`;
  return `barks.${npc}.idle.${idleIndex % BARK_IDLE_LINES}`;
}

export function barkSystem(world: World, _dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone) return;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return;
  const st = stateOf(ctx);
  if (ctx.time - st.lastAny < BARK_ANY_COOLDOWN) return;
  const ptr = world.req(player, Transform);
  const level = world.get(player, Progression)?.level ?? 1;
  for (const id of BARK_NPCS) {
    const npc = NPCS.get(id);
    if (!npc || npc.zone !== zone.def.id || npc.questOnly) continue;
    if (Math.hypot(npc.x - ptr.x, npc.z - ptr.z) > BARK_RADIUS) continue;
    if (ctx.time - (st.last.get(id) ?? -Infinity) < BARK_NPC_COOLDOWN) continue;
    const endQuest = BARK_CAMPAIGN_END[npc.zone];
    const done = endQuest !== undefined && (ctx.quests?.done.has(endQuest) ?? false);
    const idle = st.idle.get(id) ?? 0;
    const key = nextBarkKey(id, done, level >= ctx.zoneLevels[1], st.heard, idle);
    if (key.includes('.react.')) st.heard.add(`${id}:${key.endsWith('0') ? 0 : 1}`);
    else st.idle.set(id, idle + 1);
    st.last.set(id, ctx.time);
    st.lastAny = ctx.time;
    ctx.events.push({ type: 'bark', npc: id, key });
    return;
  }
}

export const BARK_LINE_COUNTS = { idle: BARK_IDLE_LINES, react: BARK_REACT_LINES };
