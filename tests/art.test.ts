import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ART_FILES } from '../src/data/artFiles';
import { ENEMIES } from '../src/data/enemies';
import { ASPECTS } from '../src/data/loot/aspects';
import { BASE_ITEMS, UNIQUE_DEFS } from '../src/data/loot/db';
import { RARITIES } from '../src/data/loot/schemas';
import { ZONES } from '../src/data/zones';
import { ART } from '../scripts/art/catalog';
import { SPRITE } from '../src/render/vfxAtlas';
import { itemArtUrl, rarityFrameUrl } from '../src/ui/art';

describe('painted art', () => {
  it('every processed picture in the catalog is on disk and listed', () => {
    for (const a of ART) {
      if (a.kind === 'vfx' || a.kind === 'texture') continue;
      expect(ART_FILES.has(a.key), a.key).toBe(true);
      expect(existsSync(new URL(`../public/assets/art/${a.key}.webp`, import.meta.url)), a.key).toBe(true);
    }
  });

  it('covers every item base in three looks, every unique, rarity, aspect, boss and region', () => {
    for (const b of BASE_ITEMS.values()) {
      if (b.type === 'crystal') continue;
      for (const t of [1, 2, 3]) expect(ART_FILES.has(`items/${b.id}_${t}`), `${b.id}_${t}`).toBe(true);
    }
    for (const id of UNIQUE_DEFS.keys()) expect(ART_FILES.has(`items/unique_${id}`), id).toBe(true);
    for (const r of RARITIES) expect(ART_FILES.has(`frames/${r}`), r).toBe(true);
    for (const a of ASPECTS) expect(ART_FILES.has(`aspects/${a.id}`), a.id).toBe(true);
    for (const e of ENEMIES) if (e.dropTable === 'dt.boss') expect(ART_FILES.has(`bosses/${e.id}`), e.id).toBe(true);
    for (const z of ZONES) {
      const slug = z.id.replace(/^zone\./, '');
      expect(ART_FILES.has(`regions/${slug}`), slug).toBe(true);
      expect(ART_FILES.has(`maps/${slug}`), slug).toBe(true);
    }
    expect(existsSync(new URL('../public/assets/textures/ground/mine_rock.webp', import.meta.url))).toBe(true);
  });

  it('picks the icon by rarity look, and a unique its own', () => {
    const item = { base: 'hydraulic_hammer', rarity: 'common', crystal: undefined, unique: undefined } as never;
    expect(itemArtUrl(item)).toContain('items/hydraulic_hammer_1');
    expect(itemArtUrl({ ...(item as object), rarity: 'legendary' } as never)).toContain('items/hydraulic_hammer_2');
    expect(itemArtUrl({ ...(item as object), rarity: 'mythic' } as never)).toContain('items/hydraulic_hammer_3');
    expect(itemArtUrl({ ...(item as object), rarity: 'unique', unique: 'widowmaker' } as never)).toContain('items/unique_widowmaker');
    expect(rarityFrameUrl({ ...(item as object), rarity: 'rare' } as never)).toContain('frames/rare');
  });

  it('the extra effect sprites are in the particle atlas', () => {
    for (const a of ART.filter((x) => x.kind === 'vfx')) expect(a.key.replace('vfx/', '') in SPRITE, a.key).toBe(true);
  });
});
