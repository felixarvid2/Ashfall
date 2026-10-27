/**
 * The artifact build packs small models (scripts/artifact/packs.ts) and the runtime reads them back
 * (src/render/modelPack.ts): which paths are packed, one fetch per pack, fallbacks, and the file budget guard.
 */
import { describe, expect, it, vi } from 'vitest';
import { ModelPacks, packNameFor, type Pack } from '../src/render/modelPack';
import { MAX_ARTIFACT_FILES, MAX_PACKED_BYTES, assertFileBudget, buildPacks, isPacked } from '../scripts/artifact/packs';

const url = (path: string, base = './') => `${base}assets/${path}`;

describe('packNameFor', () => {
  it('maps parts and blender to one pack and props / environment to their own', () => {
    expect(packNameFor('parts/a.glb.json')).toBe('parts');
    expect(packNameFor('blender/keycard.glb.json')).toBe('parts');
    expect(packNameFor('props/vent.glb.json')).toBe('props');
    expect(packNameFor('environment/rock.glb.json')).toBe('environment');
  });

  it('leaves other folders and odd names alone', () => {
    expect(packNameFor('enemies/vire.glb.json')).toBeNull();
    expect(packNameFor('characters/cook.glb.json')).toBeNull();
    expect(packNameFor('toString/x.glb.json')).toBeNull();
    expect(packNameFor('parts')).toBeNull();
  });
});

describe('buildPacks / isPacked', () => {
  it('packs every part and blender model, props and environment only up to the size limit', () => {
    const big = 'x'.repeat(MAX_PACKED_BYTES + 1);
    expect(isPacked('parts/a.glb.json', big)).toBe(true);
    expect(isPacked('blender/a.glb.json', big)).toBe(true);
    expect(isPacked('props/a.glb.json', 'x'.repeat(MAX_PACKED_BYTES))).toBe(true);
    expect(isPacked('props/a.glb.json', big)).toBe(false);
    expect(isPacked('environment/a.glb.json', big)).toBe(false);
    expect(isPacked('enemies/a.glb.json', 'x')).toBe(false);
  });

  it('groups models by pack, sorted by path', () => {
    const packs = buildPacks(new Map([['parts/b.glb.json', 'B'], ['blender/k.glb.json', 'K'], ['parts/a.glb.json', 'A'], ['props/v.glb.json', 'V']]));
    expect([...packs.keys()].sort()).toEqual(['parts', 'props']);
    expect(Object.keys(packs.get('parts')!)).toEqual(['blender/k.glb.json', 'parts/a.glb.json', 'parts/b.glb.json']);
    expect(packs.get('props')).toEqual({ 'props/v.glb.json': 'V' });
  });
});

describe('ModelPacks', () => {
  const parts: Pack = { 'parts/a.glb.json': 'AAA', 'blender/k.glb.json': 'KKK' };

  it('resolves a packed path from one fetch of its pack, however many are asked for', async () => {
    const fetchPack = vi.fn(async () => parts);
    const packs = new ModelPacks(fetchPack);
    const got = await Promise.all([packs.get(url('parts/a.glb.json')), packs.get(url('blender/k.glb.json')), packs.get(url('parts/a.glb.json'))]);
    expect(got).toEqual(['AAA', 'KKK', 'AAA']);
    expect(fetchPack).toHaveBeenCalledTimes(1);
    expect(fetchPack).toHaveBeenCalledWith('./assets/packs/parts.json');
  });

  it('takes the pack URL from the model URL (any base)', async () => {
    const fetchPack = vi.fn(async () => parts);
    await new ModelPacks(fetchPack).get(url('parts/a.glb.json', '/game/'));
    expect(fetchPack).toHaveBeenCalledWith('/game/assets/packs/parts.json');
  });

  it('answers null without a fetch for unpacked folders, and null for a model the pack lacks', async () => {
    const fetchPack = vi.fn(async () => parts);
    const packs = new ModelPacks(fetchPack);
    expect(await packs.get(url('enemies/vire.glb.json'))).toBeNull();
    expect(await packs.get('something-else.glb.json')).toBeNull();
    expect(fetchPack).not.toHaveBeenCalled();
    expect(await packs.get(url('parts/missing.glb.json'))).toBeNull();
    expect(fetchPack).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failed pack fetch', async () => {
    const fetchPack = vi.fn<(u: string) => Promise<Pack>>().mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValue(parts);
    const packs = new ModelPacks(fetchPack);
    await expect(packs.get(url('parts/a.glb.json'))).rejects.toThrow('HTTP 503');
    expect(await packs.get(url('parts/a.glb.json'))).toBe('AAA');
    expect(fetchPack).toHaveBeenCalledTimes(2);
  });
});

describe('assertFileBudget', () => {
  const files = (n: number) => Array.from({ length: n }, (_, i) => `assets/parts/${i}.glb.json`);

  it('passes up to the limit and fails above it with the count and the biggest folder', () => {
    expect(() => assertFileBudget(files(MAX_ARTIFACT_FILES))).not.toThrow();
    expect(() => assertFileBudget(files(MAX_ARTIFACT_FILES + 1))).toThrow(new RegExp(`${MAX_ARTIFACT_FILES + 1} files.*assets/parts \\(${MAX_ARTIFACT_FILES + 1}\\)`));
  });

  it('stays under the 511 files an artifact version may hold', () => {
    expect(MAX_ARTIFACT_FILES).toBeLessThan(511);
  });
});
