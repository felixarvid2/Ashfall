import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../src/data/db';
import { NPCS as NPC_DEFS } from '../src/data/quests/db';
import { RIG_JOINTS, VARIANTS, VARIANT_PREFIX, isVariantId } from '../src/data/variants';

interface Entry { id: string; category: string; file?: string; rig?: unknown; meshy?: { clips?: Record<string, string> } }
const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as { assets: Entry[] };
const byId = new Map(manifest.assets.map((a) => [a.id, a]));
const onDisk = (rel: string) => existsSync(new URL(`../public/assets/${rel}`, import.meta.url));

/** B20: every variant resolves, its files exist, its bones are rig joints and its base can animate its enemies. */
describe('variant integrity (round 4 B20)', () => {
  it('ids are prefixed, unique and never clash with a manifest id', () => {
    for (const [key, def] of VARIANTS) {
      expect(key).toBe(def.id);
      expect(def.id.startsWith(VARIANT_PREFIX), def.id).toBe(true);
      expect(byId.has(def.id), def.id).toBe(false);
      expect(isVariantId(def.id)).toBe(true);
    }
  });

  it('every base and part resolves to a manifest entry with a file on disk', () => {
    for (const def of VARIANTS.values()) {
      const base = byId.get(def.base);
      expect(base, `${def.id} base ${def.base}`).toBeTruthy();
      expect(base!.category).not.toBe('part');
      expect(onDisk(base!.file!), `${def.id}: ${base!.file}`).toBe(true);
      for (const p of def.parts) {
        const part = byId.get(p.asset);
        expect(part?.category, `${def.id} part ${p.asset}`).toBe('part');
        expect(onDisk(part!.file!), `${def.id}: ${part!.file}`).toBe(true);
      }
    }
  });

  it('every bone name is a RIG_JOINTS joint and only on a rigged base', () => {
    for (const def of VARIANTS.values()) {
      for (const p of def.parts) {
        if (!p.bone) continue;
        expect(RIG_JOINTS, `${def.id}: ${p.bone}`).toContain(p.bone);
        expect(byId.get(def.base)!.rig, `${def.id}: ${def.base} is rigged`).toBeTruthy();
      }
    }
  });

  it('every variant used by an enemy or NPC has an idle clip on its base when the base is animated', () => {
    const users = [
      ...[...ENEMY_DEFS.values()].map((e) => ({ who: `enemy ${e.id}`, asset: e.assetId })),
      ...[...NPC_DEFS.values()].map((n) => ({ who: `npc ${n.id}`, asset: n.asset })),
    ].filter((u) => u.asset && isVariantId(u.asset));
    expect(users.length).toBeGreaterThan(20);
    for (const u of users) {
      const def = VARIANTS.get(u.asset!)!;
      const clips = byId.get(def.base)!.meshy?.clips;
      // An unrigged base has no clips by design (code-driven motion); a rigged one must at least idle.
      if (byId.get(def.base)!.rig) expect(clips?.idle, `${u.who} (${def.id}) base ${def.base}`).toBeTruthy();
    }
  });

  it('every melee or caster enemy on a variant of a clipped base has an attack clip', () => {
    for (const e of ENEMY_DEFS.values()) {
      if (!e.assetId || !isVariantId(e.assetId) || !e.attack) continue;
      const clips = byId.get(VARIANTS.get(e.assetId)!.base)!.meshy?.clips;
      if (!clips || Object.keys(clips).length <= 1) continue;
      expect(clips.attack ?? clips.cast, `${e.id} -> ${e.assetId}`).toBeTruthy();
    }
  });
});
