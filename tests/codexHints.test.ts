/** D06: the Codex tells where each missing aspect comes from. */
import { describe, expect, it } from 'vitest';
import { CODEX_ASPECTS, CODEX_DUNGEON_REGION, codexMissingDungeons } from '../src/data/endgame/crafting';
import en from '../src/data/lang/en.json';
import { ZONES } from '../src/data/zones';
import { codexDungeonLabel } from '../src/ui/servicePanel';

describe('Codex dungeon hints (D06)', () => {
  it('names a region for every dungeon, and it is the region whose map holds that dungeon', () => {
    const zoneOf = new Map<string, string>();
    for (const zone of ZONES.values()) for (const p of zone.pois ?? []) if (p.kind === 'dungeon') zoneOf.set(String(p.data?.dungeon), zone.key);
    for (const dungeon of Object.keys(CODEX_ASPECTS)) {
      expect(CODEX_DUNGEON_REGION[dungeon], dungeon).toBeTruthy();
      expect(zoneOf.get(dungeon), dungeon).toBe(CODEX_DUNGEON_REGION[dungeon]);
      expect((en as unknown as { instances: { names: Record<string, string> } }).instances.names[dungeon], dungeon).toBeTruthy();
    }
  });

  it('lists the dungeons that still hold locked aspects, and drops one once all its aspects are unlocked', () => {
    const all = codexMissingDungeons([]);
    expect(all.map((m) => m.dungeon)).toEqual(Object.keys(CODEX_ASPECTS));
    const part = codexMissingDungeons(['brutality', 'bullet_storm', 'iron_stride']);
    expect(part.find((m) => m.dungeon === 'meridians_hold')?.aspects).toEqual(['mercy']);
    expect(part.some((m) => m.dungeon === 'shaft_13')).toBe(false);
    expect(codexMissingDungeons(Object.values(CODEX_ASPECTS).flat())).toEqual([]);
  });

  it('labels a dungeon with its region', () => {
    expect(codexDungeonLabel('shaft_13')).toMatch(/\(.+\)$/);
    expect(codexDungeonLabel('shaft_13')).toContain('Deep Mines');
  });
});
