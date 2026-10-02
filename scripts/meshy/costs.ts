/**
 * Credit costs per request, from https://docs.meshy.ai/api/pricing (checked 2026-10-02).
 * Used for estimates and the budget prompt; the API reports actual consumed credits per task.
 */
import type { AssetEntry } from '../../src/data/assetManifest';

export const COSTS = {
  preview: { latest: 20, 'meshy-7.1': 20, 'meshy-6': 20, 'meshy-6-lite': 5 } as Record<string, number>,
  refine2k4k: 10,
  /** Image to 3D with 2K/4K textures (meshy-7.1 / meshy-6). */
  imageTo3dTextured: 30,
  refine8k: 15,
  rigging: 5,
  animationPerAction: 3,
  remesh: 5,
  textToImage: { 'nano-banana': 3, 'nano-banana-2': 6, 'nano-banana-pro': 9 } as Record<string, number>,
};

export type Stage = 'preview' | 'refine' | 'rig';

export const CONCEPT_IMAGE_MODEL = 'nano-banana-2';

export function stageCost(entry: AssetEntry, stage: Stage, aiModel: string): number {
  const image = entry.source === 'image';
  switch (stage) {
    case 'preview':
      return image ? (COSTS.textToImage[CONCEPT_IMAGE_MODEL] ?? 6) : (COSTS.preview[aiModel] ?? 20);
    case 'refine':
      return image ? COSTS.imageTo3dTextured : COSTS.refine2k4k;
    case 'rig':
      return entry.rig ? COSTS.rigging + entry.rig.actions.length * COSTS.animationPerAction : 0;
  }
}
