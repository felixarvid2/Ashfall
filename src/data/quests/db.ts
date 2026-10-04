/** Parsed quests and NPCs (all regions). */
import { CINDER_FLATS_NPCS, CINDER_FLATS_QUESTS } from './cinderFlats';
import { REFINERY_NPCS, REFINERY_QUESTS } from './refineryDistrict';
import { VAULTS_NPCS, VAULTS_QUESTS } from './hydroponicVaults';
import { MINES_NPCS, MINES_QUESTS } from './deepMines';
import { NpcDefSchema, QuestDefSchema, type NpcDef, type QuestDef } from './schema';

function byId<T extends { id: string }>(items: T[], what: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`Duplicate ${what} id: ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

export const QUESTS: ReadonlyMap<string, QuestDef> = byId([...CINDER_FLATS_QUESTS, ...REFINERY_QUESTS, ...VAULTS_QUESTS, ...MINES_QUESTS].map((q) => QuestDefSchema.parse(q)), 'quest');
export const NPCS: ReadonlyMap<string, NpcDef> = byId([...CINDER_FLATS_NPCS, ...REFINERY_NPCS, ...VAULTS_NPCS, ...MINES_NPCS].map((n) => NpcDefSchema.parse(n)), 'npc');

export function questDef(id: string): QuestDef {
  const q = QUESTS.get(id);
  if (!q) throw new Error(`Unknown quest: ${id}`);
  return q;
}
