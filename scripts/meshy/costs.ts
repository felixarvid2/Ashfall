/**
 * Credit costs per request, from https://docs.meshy.ai/api/pricing (checked 2026-10-02).
 * Used for estimates and the budget prompt; the API reports actual consumed credits per task.
 */
import type { AssetEntry } from '../../src/data/assetManifest';

export const COSTS = {
  preview: { latest: 20, 'meshy-7.1': 20, 'meshy-6': 20, 'meshy-6-lite': 5 } as Record<string, number>,
  refine2k4k: 10,
  refine8k: 15,
  rigging: 5,
  animationPerAction: 3,
  remesh: 5,
  textToImage: { 'nano-banana': 3, 'nano-banana-2': 6, 'nano-banana-pro': 9 } as Record<string, number>,
};

export type Stage = 'preview' | 'refine' | 'rig';

export function stageCost(entry: AssetEntry, stage: Stage, aiModel: string): number {
  switch (stage) {
    case 'preview':
      return COSTS.preview[aiModel] ?? 20;
    case 'refine':
      return COSTS.refine2k4k;
    case 'rig':
      return entry.rig ? COSTS.rigging + entry.rig.actions.length * COSTS.animationPerAction : 0;
  }
}
