/** Affix pools. Values at item power 100; greater affixes roll ×1.5. */
import type { z } from 'zod';
import type { AffixDefSchema } from './schemas';

type Affix = z.input<typeof AffixDefSchema>;

const ARMOR = ['helm', 'chest', 'gloves', 'pants', 'boots'] as const;
const JEWELRY = ['amulet', 'ring'] as const;
const ALL = [...ARMOR, ...JEWELRY, 'weapon', 'offHand'] as const;

export const AFFIXES: Affix[] = [
  // Attributes
  { id: 'strength', stat: 'strength', min: 6, max: 10, scaling: 'linear', types: [...ALL], weight: 10, adjective: 'Mighty' },
  { id: 'dexterity', stat: 'dexterity', min: 6, max: 10, scaling: 'linear', types: [...ALL], weight: 6, adjective: 'Deft' },
  { id: 'intelligence', stat: 'intelligence', min: 6, max: 10, scaling: 'linear', types: [...ALL], weight: 6, adjective: 'Shrewd' },
  { id: 'willpower', stat: 'willpower', min: 6, max: 10, scaling: 'linear', types: [...ALL], weight: 6, adjective: 'Stalwart' },
  { id: 'all_attributes', stat: 'allAttributes', min: 3, max: 5, scaling: 'linear', types: ['amulet'], weight: 4, adjective: 'Exalted' },
  // Defence
  { id: 'max_life', stat: 'maxLife', min: 18, max: 30, scaling: 'linear', types: ['helm', 'chest', 'pants', 'boots', 'amulet', 'offHand'], weight: 10, adjective: 'Hale' },
  { id: 'armor', stat: 'armor', min: 18, max: 30, scaling: 'linear', types: [...ARMOR, 'offHand'], weight: 9, adjective: 'Plated' },
  { id: 'resist_all', stat: 'resistAll', min: 0.03, max: 0.05, scaling: 'sqrt', types: [...ARMOR, ...JEWELRY], weight: 3, adjective: 'Warded' },
  { id: 'resist_heat', stat: 'resistHeat', min: 0.06, max: 0.1, scaling: 'sqrt', types: [...ARMOR, ...JEWELRY], weight: 5, adjective: 'Heatproof' },
  { id: 'resist_cold', stat: 'resistCold', min: 0.06, max: 0.1, scaling: 'sqrt', types: [...ARMOR, ...JEWELRY], weight: 5, adjective: 'Insulated' },
  { id: 'resist_toxic', stat: 'resistToxic', min: 0.06, max: 0.1, scaling: 'sqrt', types: [...ARMOR, ...JEWELRY], weight: 5, adjective: 'Sealed' },
  { id: 'resist_energy', stat: 'resistEnergy', min: 0.06, max: 0.1, scaling: 'sqrt', types: [...ARMOR, ...JEWELRY], weight: 5, adjective: 'Grounded' },
  { id: 'resist_void', stat: 'resistVoid', min: 0.06, max: 0.1, scaling: 'sqrt', types: [...ARMOR, ...JEWELRY], weight: 3, adjective: 'Anchored' },
  { id: 'life_on_kill', stat: 'lifeOnKill', min: 3, max: 6, scaling: 'linear', types: ['weapon', 'gloves', 'ring'], weight: 5, adjective: 'Leeching' },
  { id: 'damage_reduction', stat: 'damageReduction', min: 0.02, max: 0.04, scaling: 'none', types: ['chest', 'pants', 'offHand', 'amulet'], weight: 4, adjective: 'Bulwark' },
  // Offence
  { id: 'crit_chance', stat: 'critChance', min: 0.02, max: 0.04, scaling: 'none', types: ['gloves', 'ring', 'amulet', 'weapon'], weight: 7, adjective: 'Keen' },
  { id: 'crit_damage', stat: 'critDamage', min: 0.08, max: 0.15, scaling: 'sqrt', types: ['weapon', 'ring', 'amulet'], weight: 6, adjective: 'Brutal' },
  { id: 'attack_speed', stat: 'attackSpeed', min: 0.04, max: 0.07, scaling: 'none', types: ['gloves', 'ring', 'weapon', 'amulet'], weight: 6, adjective: 'Rapid' },
  { id: 'damage', stat: 'damage', min: 0.06, max: 0.1, scaling: 'sqrt', types: ['weapon', 'ring', 'amulet', 'offHand'], weight: 7, adjective: 'Savage' },
  { id: 'dmg_vulnerable', stat: 'damageVsVulnerable', min: 0.1, max: 0.16, scaling: 'sqrt', types: ['weapon', 'gloves', 'ring', 'amulet', 'pants'], weight: 6, adjective: 'Exploiting' },
  { id: 'dmg_elite', stat: 'damageVsElite', min: 0.08, max: 0.14, scaling: 'sqrt', types: ['weapon', 'ring', 'amulet', 'helm'], weight: 5, adjective: 'Slayer' },
  { id: 'dmg_stunned', stat: 'damageVsStunned', min: 0.1, max: 0.16, scaling: 'sqrt', types: ['weapon', 'gloves', 'pants'], weight: 5, adjective: 'Crushing' },
  { id: 'dmg_burning', stat: 'damageVsBurning', min: 0.1, max: 0.16, scaling: 'sqrt', types: ['weapon', 'gloves', 'ring'], weight: 5, adjective: 'Searing' },
  { id: 'melee_damage', stat: 'meleeDamage', min: 0.06, max: 0.1, scaling: 'sqrt', types: ['weapon', 'gloves', 'ring'], weight: 5, adjective: 'Pummeling' },
  // Utility
  { id: 'cooldown', stat: 'cooldownReduction', min: 0.03, max: 0.06, scaling: 'none', types: ['helm', 'amulet', 'offHand'], weight: 5, adjective: 'Tireless' },
  { id: 'resource_gen', stat: 'resourceGen', min: 0.05, max: 0.09, scaling: 'none', types: ['helm', 'amulet', 'ring', 'offHand'], weight: 5, adjective: 'Kindled' },
  { id: 'move_speed', stat: 'moveSpeed', min: 0.04, max: 0.08, scaling: 'none', types: ['boots', 'amulet'], weight: 7, adjective: 'Swift' },
  { id: 'barrier_bonus', stat: 'barrierBonus', min: 0.08, max: 0.14, scaling: 'sqrt', types: ['chest', 'offHand', 'amulet'], weight: 4, adjective: 'Shielding' },
  { id: 'potion_healing', stat: 'potionHealing', min: 0.1, max: 0.18, scaling: 'none', types: ['chest', 'pants', 'boots'], weight: 4, adjective: 'Restoring' },
];
