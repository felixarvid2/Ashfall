import { describe, expect, it } from 'vitest';
import { questRewardSummary } from '../src/ui/onboarding';

describe('first quest reward toast (F025)', () => {
  it('lists XP, gold, the item rarity and crafting materials', () => {
    expect(questRewardSummary({ xp: 420, gold: 90, item: 'rare', dust: 4, shards: 2 })).toBe('420 XP, 90 gold, Rare item, 4 Lumen Dust, 2 Rift Shard');
  });

  it('leaves out what was not paid and names a unique reward', () => {
    expect(questRewardSummary({ xp: 150, gold: 0 })).toBe('150 XP');
    expect(questRewardSummary({ xp: 0, gold: 30, unique: 'governors_crucible' })).toBe("30 gold, Governor's Crucible");
  });
});
