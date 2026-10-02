/** Contact sheet of all asset thumbnails (preview or refined) for quick review. */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import type { AssetManifest } from '../../src/data/assetManifest';
import { SOURCE_DIR } from './manifest';

export async function contactSheet(manifest: AssetManifest, stage: 'preview' | 'refined'): Promise<string> {
  const cols = 5;
  const cell = 300;
  const label = 40;
  const ids = manifest.assets.map((a) => a.id);
  const rows = Math.ceil(ids.length / cols);
  const composites: OverlayOptions[] = [];
  for (const [i, id] of ids.entries()) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + label);
    const thumb = resolve(SOURCE_DIR, id, `${stage}.png`);
    if (existsSync(thumb)) {
      const img = await sharp(thumb)
        .resize(cell - 10, cell - 10, { fit: 'contain', background: '#e8e6e3' })
        .flatten({ background: '#e8e6e3' })
        .png()
        .toBuffer();
      composites.push({ input: img, left: x + 5, top: y + 5 });
    }
    const svg = `<svg width="${cell}" height="${label}" xmlns="http://www.w3.org/2000/svg"><text x="8" y="26" font-family="DejaVu Sans, sans-serif" font-size="17" fill="#e6c8a0">${i + 1}. ${id}</text></svg>`;
    composites.push({ input: Buffer.from(svg), left: x, top: y + cell });
  }
  const out = resolve(SOURCE_DIR, `contact-${stage}.png`);
  await sharp({ create: { width: cols * cell, height: rows * (cell + label), channels: 3, background: '#18161a' } })
    .composite(composites)
    .png()
    .toFile(out);
  return out;
}
