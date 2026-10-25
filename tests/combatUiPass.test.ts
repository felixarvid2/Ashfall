import { describe, expect, it } from 'vitest';
import type { HitSource } from '../src/core/components';
import { RIFT_REWARDS } from '../src/data/endgame/rifts';
import { ELITE_AFFIXES } from '../src/data/elites';
import { t } from '../src/data/i18n';
import { BEAM, beamLook } from '../src/render/lootVisuals';
import { riftCacheYield } from '../src/systems/endgame/rifts';
import { deathCauseLine } from '../src/ui/deathCause';
import { DESKTOP_MAX, damageScale, elementClass, formatDamage, popScale, POP_CRIT, POP_NORMAL } from '../src/ui/damageNumbers';
import { DESKTOP_MAX_LABELS, avoidRect, chooseLabels, passesLootFilter, rarityRank } from '../src/ui/lootLabels';
import { groupQuests, isTrivialQuest } from '../src/ui/questUi';

describe('damage numbers (A026-A031)', () => {
  it('abbreviates big hits', () => {
    expect(formatDamage(842.4)).toBe('842');
    expect(formatDamage(9999)).toBe('9999');
    expect(formatDamage(12345)).toBe('12.3k');
    expect(formatDamage(999_960)).toBe('1.00M');
    expect(formatDamage(1_234_567)).toBe('1.23M');
  });
  it('scales by share of target life, 0.9 to 1.4', () => {
    expect(damageScale(1, 1000)).toBeCloseTo(0.9, 1);
    expect(damageScale(250, 1000)).toBeCloseTo(1.4);
    expect(damageScale(900, 1000)).toBeCloseTo(1.4);
    expect(damageScale(50, 0)).toBe(1);
  });
  it('pops crits harder and settles to 1', () => {
    expect(popScale(0, POP_NORMAL)).toBeCloseTo(1.15);
    expect(popScale(0, POP_CRIT)).toBeCloseTo(1.7);
    expect(popScale(0.06, POP_CRIT)).toBeCloseTo(1.35);
    expect(popScale(0.5, POP_CRIT)).toBe(1);
  });
  it('maps damage types to element classes', () => {
    expect(elementClass('heat')).toBe('dmg-el-fire');
    expect(elementClass('energy')).toBe('dmg-el-shock');
    expect(elementClass('toxic')).toBe('dmg-el-toxin');
    expect(elementClass('physical')).toBe('');
    expect(DESKTOP_MAX).toBe(40);
  });
});

describe('ground loot labels (A035-A037, B046)', () => {
  const cand = (key: number, dist: number, rarity: string) => ({ key, dist, always: rarityRank(rarity) >= 3, rank: rarityRank(rarity) });
  it('caps at 14 by rarity then distance and keeps legendary+', () => {
    const cands = [
      ...Array.from({ length: 20 }, (_, i) => cand(i, i + 1, i % 2 ? 'magic' : 'common')),
      cand(100, 30, 'legendary'),
      cand(101, 25, 'rare'),
    ];
    const { shown, hidden } = chooseLabels(cands, DESKTOP_MAX_LABELS);
    expect(shown.size).toBe(DESKTOP_MAX_LABELS);
    expect(shown.has(100)).toBe(true);
    expect(shown.has(101)).toBe(true);
    expect(hidden.length).toBe(22 - DESKTOP_MAX_LABELS);
    // Commons go first: no hidden label is better than a shown one.
    const worstShown = Math.min(...[...shown].map((k) => cands.find((c) => c.key === k)!.rank!));
    expect(Math.max(...hidden.map((h) => h.rank!))).toBeLessThanOrEqual(worstShown);
  });
  it('applies the loot label filter', () => {
    expect(passesLootFilter('magic', false, 'rare')).toBe(false);
    expect(passesLootFilter('rare', false, 'rare')).toBe(true);
    expect(passesLootFilter('rare', false, 'legendary')).toBe(false);
    expect(passesLootFilter('mythic', false, 'legendary')).toBe(true);
    expect(passesLootFilter('common', true, 'legendary')).toBe(true);
    expect(passesLootFilter('common', false, 'legendary', true)).toBe(true);
    expect(passesLootFilter('common', false, 'magic', false, 3)).toBe(true);
    expect(passesLootFilter('common', false, 'magic', false, 9)).toBe(false);
    expect(passesLootFilter('common', false, 'all', false, 20)).toBe(true);
  });
  it('moves labels off the action bar', () => {
    const rect = { left: 247, top: 596, right: 1033, bottom: 706 };
    const ys = avoidRect(
      [
        { x: 640, y: 650, w: 92 },
        { x: 100, y: 650, w: 92 },
        { x: 640, y: 400, w: 92 },
      ],
      rect,
      19,
    );
    expect(ys).toEqual([590, 650, 400]);
    expect(avoidRect([{ x: 640, y: 650, w: 92 }], null, 19)).toEqual([650]);
  });
});

describe('loot beams (A038)', () => {
  it('is dim and short for magic and rare, strong for legendary+', () => {
    const far = beamLook('rare', 2.4, 20, false);
    expect(far.height).toBeCloseTo(2.4 * BEAM.shortHeight);
    expect(far.opacity).toBeCloseTo(BEAM.alpha);
    const leg = beamLook('legendary', 5, 20, false);
    expect(leg.height).toBe(5);
    expect(leg.opacity).toBeCloseTo(BEAM.alphaHigh);
  });
  it('fades near the hero and in combat', () => {
    expect(beamLook('legendary', 5, 2, false).opacity).toBeCloseTo(BEAM.alphaHigh * BEAM.nearFactor);
    expect(beamLook('magic', 1.2, 20, true).opacity).toBeCloseTo(BEAM.alpha * BEAM.nearFactor);
    expect(beamLook('magic', 1.2, 4, false).opacity).toBeGreaterThan(BEAM.alpha * BEAM.nearFactor);
  });
});

describe('quest log grouping (B040)', () => {
  it('puts main quests first and marks trivial ones', () => {
    const groups = groupQuests([
      { id: 'a', kind: 'side' as const },
      { id: 'b', kind: 'main' as const },
      { id: 'c', kind: 'mystery' as const },
    ]);
    expect(groups.map((g) => g.group)).toEqual(['main', 'side']);
    expect(groups[1]!.items.map((q) => q.id)).toEqual(['a', 'c']);
    expect(groupQuests([{ kind: 'side' as const }]).map((g) => g.group)).toEqual(['side']);
    expect(isTrivialQuest(3, 50)).toBe(true);
    expect(isTrivialQuest(31, 50)).toBe(false);
    expect(isTrivialQuest(30, 50)).toBe(true);
  });
});

describe('rift reward preview (B050)', () => {
  it('shard and legendary yield follow the level', () => {
    expect(riftCacheYield(1)).toEqual({ legendaries: RIFT_REWARDS.legendaries.base, shards: Math.round(RIFT_REWARDS.shards.base + RIFT_REWARDS.shards.perLevel) });
    expect(riftCacheYield(80).shards).toBeGreaterThan(riftCacheYield(8).shards);
    expect(riftCacheYield(50).legendaries).toBe(RIFT_REWARDS.legendaries.base + 2);
  });
});

describe('death cause line (A046)', () => {
  const known: Record<string, string> = { 'elites.affixes.burning': 'Burning', 'elites.affixes.sporeSpreader': 'Spore Spreader' };
  const tr = (key: string, p?: Record<string, string | number>) => (p ? `${key}:${Object.values(p).join('|')}` : (known[key] ?? key));
  const base: HitSource = { defId: 'ash_walker', at: 100 };
  it('names the last attacker, champion and affixes', () => {
    expect(deathCauseLine(base, 105, tr)).toBe('hud.slainBy:enemies.ash_walker');
    expect(deathCauseLine({ ...base, elite: 'champion', affixes: ['burning'] }, 105, tr)).toBe('hud.slainByAffix:elites.champion enemies.ash_walker|Burning');
    expect(deathCauseLine({ ...base, displayKey: 'Kaal the Hollow', literal: true, elite: 'rare' }, 105, tr)).toBe('hud.slainBy:Kaal the Hollow');
  });
  it('prettifies an affix id with no translation instead of showing the raw key', () => {
    expect(deathCauseLine({ ...base, affixes: ['molten'] }, 105, tr)).toBe('hud.slainByAffix:enemies.ash_walker|Molten');
    expect(deathCauseLine({ ...base, affixes: ['burning', 'frostBiter'] }, 105, tr)).toBe('hud.slainByAffix:enemies.ash_walker|Burning, Frost Biter');
  });
  it('real elite affix ids all have names', () => {
    for (const id of ELITE_AFFIXES) expect(t(`elites.affixes.${id}`)).not.toBe(`elites.affixes.${id}`);
  });
  it('says nothing for no or stale hits', () => {
    expect(deathCauseLine(undefined, 105, tr)).toBe('');
    expect(deathCauseLine(base, 200, tr)).toBe('');
  });
});
