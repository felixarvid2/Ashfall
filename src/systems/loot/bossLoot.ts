/** Boss signature drops (round 4, D13): which unique a boss hands a class, and the rolls that pay them out. */
import { BOSS_SIGNATURES, type BossSignature } from '../../data/loot/bossLoot';
import { BASE_ITEMS, UNIQUE_DEFS } from '../../data/loot/db';
import type { UniqueDef } from '../../data/loot/schemas';
import type { Rng } from '../../core/rng';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Plain uniques a class may find at random: no mythics, no quest rewards. */
function pool(classId: string): UniqueDef[] {
  return [...UNIQUE_DEFS.values()].filter((u) => u.rarity === 'unique' && u.source !== 'quest' && (!u.classes || u.classes.includes(classId)));
}

/** The unique one signature entry resolves to for a class: stable per boss, slot and class. */
export function signatureUnique(bossId: string, sig: BossSignature, classId: string): string | null {
  const all = pool(classId);
  const ofType = all.filter((u) => BASE_ITEMS.get(u.base)?.type === sig.type);
  const from = ofType.length > 0 ? ofType : all;
  if (from.length === 0) return null;
  return from[hash(`${bossId}:${sig.type}`) % from.length]!.id;
}

export function hasSignatures(bossId: string): boolean {
  return bossId in BOSS_SIGNATURES;
}

/** Roll a boss's signature drops: the unique ids that fall this kill (`chanceMul`: the World Tier's rare-drop weight). */
export function rollBossSignatures(rng: Rng, bossId: string, classId: string, chanceMul = 1): string[] {
  const sigs = BOSS_SIGNATURES[bossId];
  if (!sigs) return [];
  const out: string[] = [];
  for (const sig of sigs) {
    if (!rng.chance(Math.min(1, sig.chance * chanceMul))) continue;
    const id = signatureUnique(bossId, sig, classId);
    if (id !== null && !out.includes(id)) out.push(id);
  }
  return out;
}
