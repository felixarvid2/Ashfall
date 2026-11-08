/**
 * Boss signature drops (round 4, D13): every boss has two items it is known for. Each entry names an item type
 * and a chance; the unique it resolves to is stable per boss and class (src/systems/loot/bossLoot.ts), so a
 * given boss always hands the same Bastion ring, Spectre glove, and so on. The chance is rolled on top of the
 * boss table, before the World Tier's rare-drop multiplier.
 */
import type { ItemType } from './schemas';

export interface BossSignature {
  /** Item type of the unique it drops (the unique of that type for the player's class; any class unique if none). */
  type: ItemType;
  /** Chance per kill (0..1) before the World Tier multiplier. */
  chance: number;
}

/** First signature: the bigger chance. Every boss uses two different item types. */
const SIG = (a: ItemType, b: ItemType): [BossSignature, BossSignature] => [
  { type: a, chance: 0.1 },
  { type: b, chance: 0.06 },
];

export const BOSS_SIGNATURES: Record<string, [BossSignature, BossSignature]> = {
  // Cinder Flats, the Refinery District and the Caves
  security_chief_holm: SIG('gloves', 'amulet'),
  governor_kade: SIG('chest', 'ring'),
  brood_mother: SIG('helm', 'weapon'),
  commandant_hale: SIG('weapon', 'gloves'),
  the_first: SIG('amulet', 'weapon'),
  brother_ash: SIG('ring', 'chest'),
  pyre_warden: SIG('amulet', 'gloves'),
  frozen_welder: SIG('boots', 'ring'),
  // Hydroponic Vaults
  vire: SIG('weapon', 'helm'),
  the_keeper: SIG('ring', 'weapon'),
  brood_warden: SIG('gloves', 'helm'),
  vine_matriarch: SIG('amulet', 'ring'),
  ilse_varga: SIG('weapon', 'amulet'),
  gamma_bloom: SIG('helm', 'ring'),
  // Deep Mines
  foreman_dray: SIG('gloves', 'weapon'),
  the_prism: SIG('amulet', 'helm'),
  drowned_engine: SIG('chest', 'weapon'),
  archivist: SIG('ring', 'amulet'),
  elder_guardian: SIG('helm', 'chest'),
  warden: SIG('weapon', 'ring'),
  // The Core
  shade_the_first: SIG('ring', 'weapon'),
  choir_mother: SIG('helm', 'amulet'),
  brood_engine: SIG('gloves', 'chest'),
  lumen: SIG('weapon', 'amulet'),
};
