/** Manifest status changes shared by the CLI and the dev-server asset viewer. */
import type { AssetEntry } from '../../src/data/assetManifest';

export type ReviewAction = 'approve-preview' | 'approve' | 'reject';

/** Apply a review action. Returns a human-readable result or throws if not allowed. */
export function applyReview(entry: AssetEntry, action: ReviewAction): string {
  switch (action) {
    case 'approve-preview':
      if (entry.status !== 'preview') throw new Error(`${entry.id}: not a preview (status ${entry.status})`);
      entry.meshy.previewApproved = true;
      return `${entry.id}: preview approved — will be textured by "npm run meshy -- refine"`;
    case 'approve':
      if (entry.status !== 'refined' && entry.status !== 'optimized') {
        throw new Error(`${entry.id}: nothing to approve (status ${entry.status})`);
      }
      if (entry.status === 'refined') entry.status = 'approved';
      entry.meshy.lastError = undefined;
      return `${entry.id}: approved`;
    case 'reject':
      entry.status = 'planned';
      entry.meshy = { creditsSpent: entry.meshy.creditsSpent };
      entry.file = undefined;
      entry.lods = undefined;
      entry.stats = undefined;
      return `${entry.id}: rejected — reset to planned and will be regenerated`;
  }
}
