/**
 * Stages for the level 10 to 50 bot (round 4 B05): one per region, with that region's level range and its own enemies.
 * The fight happens in the small test arena (the bot steers by straight lines, a 1500 m open world would only measure
 * its pathing), but the monsters are the zone's: the enemies of the packs it places, at the zone's levels, in waves
 * that grow from five to fourteen. Time to level in a stage is therefore "kill the region's monsters until the next
 * level", which is what the XP curve and the monster levels decide.
 */
import { enemyDef } from '../../src/data/db';
import type { Encounter } from '../../src/data/schemas';
import { PACK_TEMPLATES } from '../../src/data/packs';
import { ZONES } from '../../src/data/zones';
import type { ZoneDef } from '../../src/data/zones/zoneTypes';

export interface PlayStage {
  id: string;
  label: string;
  /** Monster level range, the zone's. */
  levels: [number, number];
  /** Rank-and-file enemies of the region, in the order its packs first use them. */
  roster: string[];
  /** The wave encounter the bot fights. */
  encounter: Encounter;
}

/** Region id -> label for the report. */
export const STAGE_ZONES: { zone: string; label: string }[] = [
  { zone: 'zone.refinery_district', label: 'Refinery District (10-20)' },
  { zone: 'zone.hydroponic_vaults', label: 'Hydroponic Vaults (20-30)' },
  { zone: 'zone.deep_mines', label: 'Deep Mines (30-40)' },
  { zone: 'zone.the_core', label: 'The Core (40-50)' },
];

/** Enemies of a zone's packs (deduplicated), without the ones that only work with their zone's machinery. */
export function zoneRoster(zone: ZoneDef): string[] {
  const out: string[] = [];
  for (const spawn of zone.packs) {
    const template = PACK_TEMPLATES.find((t) => t.id === spawn.template);
    for (const m of template?.members ?? []) {
      try {
        enemyDef(m.enemy);
      } catch {
        continue;
      }
      if (!out.includes(m.enemy)) out.push(m.enemy);
    }
  }
  return out;
}

/** Five waves from the roster: a fodder group, a second kind and a few of a third; counts grow wave by wave. */
export function stageEncounter(id: string, roster: readonly string[]): Encounter {
  const waves = Array.from({ length: 5 }, (_, k) => ({
    groups: [
      { enemy: roster[k % roster.length]!, count: 6 + 2 * k },
      { enemy: roster[(k + 1) % roster.length]!, count: 3 + k },
      { enemy: roster[(k + 2) % roster.length]!, count: 1 + k },
    ],
  }));
  return { id, spawnRing: [13, 20], groupSpread: 3, intermission: 3, endlessLifeScale: 0.15, waves } as Encounter;
}

export function buildStages(): PlayStage[] {
  return STAGE_ZONES.map(({ zone, label }) => {
    const def = ZONES.find((z) => z.id === zone);
    if (!def) throw new Error(`Unknown zone ${zone}`);
    const roster = zoneRoster(def);
    const id = `encounter.stage_${zone.replace(/^zone\./, '')}`;
    return { id: zone.replace(/^zone\./, ''), label, levels: def.levels, roster, encounter: stageEncounter(id, roster) };
  });
}

export const STAGES: PlayStage[] = buildStages();
