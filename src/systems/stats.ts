/**
 * Player stat aggregation: class base + level growth + equipped items → CombatStats,
 * max life, movement speed and the numbers shown in the character panel.
 * Formulas are documented in docs/damage-formula.md ("Attributes and item stats").
 */
import {
  CombatStats,
  DerivedStats,
  Health,
  Inventory,
  Mover,
  Progression,
  SkillUser,
  type Attributes,
} from '../core/components';
import type { Entity, World } from '../core/ecs';
import { classDef } from '../data/db';
import type { Item, Slot, StatKey } from '../data/loot/schemas';
import type { Bonus, ClassDef } from '../data/schemas';
import { itemStats } from './loot/generate';

/** Attribute effects (besides the primary attribute's +0.1 % damage per point). */
export const ATTRIBUTE_RULES = {
  /** Dexterity: crit chance per point. */
  critPerDex: 0.0002,
  /** Intelligence: all resistances per point. */
  resistPerInt: 0.0005,
  /** Willpower: resource generation per point. */
  resourceGenPerWill: 0.001,
  /** Strength when it is not the primary attribute: armor per point. */
  armorPerStr: 0.5,
};

export const CAPS = { cooldownReduction: 0.5, damageReduction: 0.5, moveSpeed: 0.5, critChance: 0.8 };

export function sumItemStats(items: Iterable<Item>): Map<StatKey, number> {
  const totals = new Map<StatKey, number>();
  for (const item of items) {
    for (const s of itemStats(item)) totals.set(s.stat, (totals.get(s.stat) ?? 0) + s.value);
  }
  return totals;
}

export interface PlayerStats {
  combat: Omit<CombatStats, 'level' | 'tags'>;
  maxLife: number;
  attributes: Attributes;
  moveSpeedBonus: number;
  damageEstimate: number;
}

export function computePlayerStats(cls: ClassDef, level: number, equipped: Partial<Record<Slot, Item>>): PlayerStats {
  const t = sumItemStats(Object.values(equipped).filter((i): i is Item => !!i));
  const get = (k: StatKey) => t.get(k) ?? 0;
  const lv = level - 1;
  const all = get('allAttributes');
  const attributes: Attributes = {
    strength: cls.attributes.base.strength + cls.attributes.perLevel.strength * lv + get('strength') + all,
    dexterity: cls.attributes.base.dexterity + cls.attributes.perLevel.dexterity * lv + get('dexterity') + all,
    intelligence: cls.attributes.base.intelligence + cls.attributes.perLevel.intelligence * lv + get('intelligence') + all,
    willpower: cls.attributes.base.willpower + cls.attributes.perLevel.willpower * lv + get('willpower') + all,
  };
  const primary = cls.attributes.primary;
  const mainStat = attributes[primary];

  const resistAll = get('resistAll') + attributes.intelligence * ATTRIBUTE_RULES.resistPerInt;
  const res = (base: number | undefined, k: StatKey) => (base ?? 0) + resistAll + get(k);
  const resist = {
    physical: 0,
    heat: res(cls.resist.heat, 'resistHeat'),
    cold: res(cls.resist.cold, 'resistCold'),
    toxic: res(cls.resist.toxic, 'resistToxic'),
    energy: res(cls.resist.energy, 'resistEnergy'),
    void: res(cls.resist.void, 'resistVoid'),
  };

  const additive: Bonus[] = [];
  const add = (k: StatKey, when?: Bonus['when']) => {
    const v = get(k);
    if (v !== 0) additive.push({ value: v, ...(when ? { when } : {}), source: k });
  };
  add('damage');
  add('damageVsVulnerable', 'vulnerable');
  add('damageVsElite', 'elite');
  add('damageVsStunned', 'stunned');
  add('damageVsBurning', 'burning');
  add('meleeDamage', 'melee');

  const weaponDamage = get('weaponDamage') > 0 ? get('weaponDamage') : cls.weaponDamage;
  const critChance = Math.min(CAPS.critChance, cls.critChance + get('critChance') + attributes.dexterity * ATTRIBUTE_RULES.critPerDex);
  const critDamage = cls.critDamage + get('critDamage');
  const attackSpeed = get('attackSpeed');
  const armor =
    cls.armor + get('armor') + (primary === 'strength' ? 0 : attributes.strength * ATTRIBUTE_RULES.armorPerStr);

  const combat: PlayerStats['combat'] = {
    weaponDamage,
    mainStat,
    critChance,
    critDamage,
    armor,
    resist,
    additive,
    multiplicative: [],
    attackSpeed,
    cooldownReduction: Math.min(CAPS.cooldownReduction, get('cooldownReduction')),
    resourceGen: get('resourceGen') + attributes.willpower * ATTRIBUTE_RULES.resourceGenPerWill,
    barrierBonus: get('barrierBonus'),
    potionHealing: get('potionHealing'),
    damageReduction: Math.min(CAPS.damageReduction, get('damageReduction')),
    lifeOnKill: get('lifeOnKill'),
  };

  // Unconditional damage per second-ish estimate, for item comparisons and the stats panel.
  const unconditional = additive.filter((b) => !b.when).reduce((s, b) => s + b.value, 0);
  const damageEstimate =
    weaponDamage * (1 + mainStat * 0.001) * (1 + unconditional + get('meleeDamage')) * (1 + critChance * critDamage) * (1 + attackSpeed);

  return {
    combat,
    maxLife: Math.round(cls.life + cls.lifePerLevel * lv + get('maxLife')),
    attributes,
    moveSpeedBonus: Math.min(CAPS.moveSpeed, get('moveSpeed')),
    damageEstimate,
  };
}

/** Apply computed stats to the player entity (after equipping, levelling up, loading). */
export function recomputePlayer(world: World, e: Entity): PlayerStats | null {
  const user = world.get(e, SkillUser);
  const prog = world.get(e, Progression);
  const inv = world.get(e, Inventory);
  if (!user || !prog || !inv) return null;
  const cls = classDef(user.classId);
  const stats = computePlayerStats(cls, prog.level, inv.equipped);

  const combat = world.get(e, CombatStats);
  if (combat) Object.assign(combat, stats.combat, { level: prog.level });
  const health = world.get(e, Health);
  if (health) {
    // Keep the same fraction of life when max life changes.
    const ratio = health.max > 0 ? health.current / health.max : 1;
    health.max = stats.maxLife;
    health.current = Math.min(stats.maxLife, Math.max(health.current > 0 ? 1 : 0, Math.round(ratio * stats.maxLife)));
  }
  const mover = world.get(e, Mover);
  if (mover) mover.speed = cls.moveSpeed * (1 + stats.moveSpeedBonus);
  const derived = world.get(e, DerivedStats);
  const next = { attributes: stats.attributes, moveSpeedBonus: stats.moveSpeedBonus, damageEstimate: stats.damageEstimate };
  if (derived) Object.assign(derived, next);
  else world.add(e, DerivedStats, next);
  return stats;
}
