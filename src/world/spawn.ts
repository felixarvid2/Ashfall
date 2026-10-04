/** Entity factories: player and enemies, built from class/enemy data. */
import {
  Collider,
  CombatStats,
  EnemyAI,
  Faction,
  Health,
  Inventory,
  Level,
  NO_EXTRA_STATS,
  Progression,
  Mover,
  PlayerControlled,
  Renderable,
  Resource,
  SkillUser,
  StatusEffects,
  Transform,
  WaveMember,
  makeTransform,
} from '../core/components';
import type { Entity, World } from '../core/ecs';
import { classDef, enemyDef } from '../data/db';
import { PROGRESSION } from '../data/loot/db';
import { emptyInventory } from '../systems/loot/inventory';
import { recomputePlayer } from '../systems/stats';
import { newTreeState, tree } from '../systems/skillTree';

export function spawnPlayer(world: World, classId: string, x: number, z: number): Entity {
  const cls = classDef(classId);
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, Math.PI));
  world.add(e, Mover, { speed: cls.moveSpeed, speedMul: 1, turnRate: 14, vx: 0, vz: 0 });
  world.add(e, PlayerControlled, {});
  world.add(e, Renderable, { assetId: cls.assetId });
  world.add(e, Faction, { team: 'player' });
  world.add(e, Health, { current: cls.life, max: cls.life });
  world.add(e, Collider, { radius: cls.collider.radius, mass: cls.collider.mass, layer: 'ground', isStatic: false });
  world.add(e, CombatStats, {
    level: 1,
    weaponDamage: cls.weaponDamage,
    mainStat: cls.attributes.base[cls.attributes.primary],
    critChance: cls.critChance,
    critDamage: cls.critDamage,
    armor: cls.armor,
    resist: { ...cls.resist },
    additive: [],
    multiplicative: [],
    tags: [],
    ...NO_EXTRA_STATS,
  });
  world.add(e, Progression, { level: 1, xp: 0, skillPoints: 0 });
  world.add(e, Inventory, emptyInventory(PROGRESSION.inventorySize));
  world.add(e, StatusEffects, { list: [], canAct: true, dotTimer: 0 });
  world.add(e, Resource, {
    kind: cls.resource.id,
    current: cls.resource.start,
    max: cls.resource.max,
    sinceCombat: 999,
    atMaxFor: 0,
    overheatTick: 0,
    config: cls.resource,
  });
  world.add(e, SkillUser, {
    classId,
    slots: [...cls.actionBar],
    tree: newTreeState(tree(classId)),
    compiled: {},
    cooldowns: {},
    cast: null,
    request: null,
    dodgeCooldown: 0,
    dodgeRequested: null,
    potionCharges: cls.potion.charges,
    potionRecharge: cls.potion.recharge,
    potionRequested: false,
  });
  recomputePlayer(world, e);
  return e;
}

export interface EnemySpawnOptions {
  lifeMul?: number;
  aggro?: boolean;
  wave?: number;
  level?: number;
}

export function spawnEnemy(world: World, defId: string, x: number, z: number, opts: EnemySpawnOptions = {}): Entity {
  const def = enemyDef(defId);
  const level = Math.max(1, opts.level ?? 1);
  const life = def.life * (opts.lifeMul ?? 1) * (1 + PROGRESSION.enemyLifePerLevel * (level - 1));
  const damage = def.damage * (1 + PROGRESSION.enemyDamagePerLevel * (level - 1));
  const e = world.create();
  world.add(e, Transform, makeTransform(x, def.hover, z, 0));
  world.add(e, Mover, { speed: def.moveSpeed, speedMul: 1, turnRate: def.turnRate, vx: 0, vz: 0 });
  world.add(e, Renderable, { assetId: def.assetId, scale: def.scale, ...(def.glow ? { glow: def.glow } : {}), ...(def.hologram ? { hologram: true } : {}) });
  world.add(e, Faction, { team: 'enemy' });
  world.add(e, Health, { current: life, max: life });
  world.add(e, Collider, {
    radius: def.collider.radius,
    mass: def.collider.mass,
    layer: def.hover > 0 ? 'air' : 'ground',
    isStatic: false,
  });
  world.add(e, CombatStats, {
    level,
    weaponDamage: damage,
    mainStat: 0,
    critChance: 0,
    critDamage: 0.5,
    armor: def.armor,
    resist: { ...def.resist },
    additive: [],
    multiplicative: [],
    tags: [def.family],
    ...NO_EXTRA_STATS,
  });
  world.add(e, Level, { value: level });
  world.add(e, StatusEffects, { list: [], canAct: true, dotTimer: 0 });
  world.add(e, EnemyAI, {
    defId,
    state: 'idle',
    timer: 0,
    cooldown: 0.5,
    aggro: opts.aggro ?? false,
    aimX: 0,
    aimZ: 0,
    strafeDir: 1,
    strafeTimer: 0,
    wanderX: x,
    wanderZ: z,
    attackSeq: 0,
  });
  if (opts.wave !== undefined) world.add(e, WaveMember, { wave: opts.wave });
  return e;
}
