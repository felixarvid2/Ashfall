import { describe, expect, it } from 'vitest';
import { AssetEntrySchema, type AssetEntry, type AssetManifest } from '../src/data/assetManifest';
import { applyReview } from '../scripts/meshy/actions';
import { stageCost } from '../scripts/meshy/costs';
import { selectAssets } from '../scripts/meshy/manifest';
import { STYLE_BASE, buildPrompt } from '../scripts/meshy/style';
import { DEFAULT_BUDGET_CREDITS } from '../scripts/meshy/config';

const entry = (over: Partial<AssetEntry> = {}): AssetEntry =>
  AssetEntrySchema.parse({
    id: 'enemy.test_dummy',
    category: 'enemy',
    prompt: 'test dummy',
    targetPolycount: 1000,
    status: 'planned',
    placeholder: { shape: 'box', color: '#000000', size: [1, 1, 1] },
    ...over,
  });

describe('Meshy pipeline helpers', () => {
  it('budget threshold is 800 credits (owner decision)', () => {
    expect(DEFAULT_BUDGET_CREDITS).toBe(800);
  });

  it('estimates per-stage costs from the documented price list', () => {
    const rigged = entry({
      rig: { type: 'biped', heightMeters: 1.8, actions: [{ state: 'idle', actionId: 0 }, { state: 'run', actionId: 1 }] },
    });
    expect(stageCost(rigged, 'preview', 'latest')).toBe(20);
    expect(stageCost(rigged, 'preview', 'meshy-6-lite')).toBe(5);
    expect(stageCost(rigged, 'refine', 'latest')).toBe(10);
    expect(stageCost(rigged, 'rig', 'latest')).toBe(5 + 2 * 3);
    expect(stageCost(entry(), 'rig', 'latest')).toBe(0);
  });

  it('prompts append the shared style and stay within 800 characters', () => {
    expect(buildPrompt(entry())).toBe(`test dummy, ${STYLE_BASE}`);
    expect(buildPrompt(entry({ prompt: 'x, '.repeat(400) })).length).toBeLessThanOrEqual(800);
  });

  it('review actions follow the status flow', () => {
    const a = entry({ status: 'preview', meshy: { previewTaskId: 'p1' } });
    applyReview(a, 'approve-preview');
    expect(a.meshy.previewApproved).toBe(true);
    expect(() => applyReview(a, 'approve')).toThrow();
    a.status = 'refined';
    applyReview(a, 'approve');
    expect(a.status).toBe('approved');
    a.meshy.creditsSpent = 30;
    applyReview(a, 'reject');
    expect(a.status).toBe('planned');
    expect(a.meshy).toEqual({ creditsSpent: 30 });
  });

  it('selects assets by id or prefix and rejects unknown ids', () => {
    const manifest: AssetManifest = {
      version: 1,
      assets: [entry(), entry({ id: 'prop.box_one', category: 'prop' }), entry({ id: 'prop.box_two', category: 'prop' })],
    };
    expect(selectAssets(manifest, ['prop.']).map((a) => a.id)).toEqual(['prop.box_one', 'prop.box_two']);
    expect(selectAssets(manifest, undefined)).toHaveLength(3);
    expect(() => selectAssets(manifest, ['prop.nope'])).toThrow(/Unknown/);
  });
});
