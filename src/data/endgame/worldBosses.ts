/**
 * World bosses (docs/endgame.md): one every `interval` seconds of play time at a fixed spot, announced
 * `warning` seconds ahead and gone `lifetime` seconds after it appears. Five bosses (three from the start,
 * the Choir of Stone and the Echo Engine added in C012), each with three phases built from the boss script primitives (src/data/bosses.ts). Names, banners and
 * HUD text: lang/en.json → worldBoss.*, enemies.<id>.
 */
import type { z } from 'zod';
import type { EnemyDefSchema } from '../schemas';
import type { EliteAffix } from '../elites';
import type { BossPhase } from '../bosses';

type EnemyInput = z.input<typeof EnemyDefSchema>;

export const WORLD_BOSS = {
  /** Seconds of play time between two world bosses (the brief says three hours; shortened for a browser game). */
  interval: 45 * 60,
  /** The countdown, the toast and the map marker start this long before it appears. */
  warning: 5 * 60,
  /** It despawns this long after it appears. */
  lifetime: 15 * 60,
  /** Monster level: the campaign's last level, so health and damage follow the level-50 curve. */
  level: 50,
  /** World bosses start with this World Tier (the account's highest unlocked tier). */
  minTier: 2,
  /** The chest's table (XP, gold and loot), paid by the system (src/world/worldBoss.ts) when the boss dies. */
  dropTable: 'dt.boss',
  /** The body pays nothing by itself, so the chest is the one reward (and no boss portrait is required). */
  bodyTable: 'dt.shade_echo',
} as const;

export interface WorldBossSpot {
  /** Zone id (src/data/zones). */
  zone: string;
  x: number;
  z: number;
  /** Fight arena radius (spore fields, blinks and the drill sweep stay inside it). */
  radius: number;
}

export interface WorldBossRewards {
  /** Chance of one unique for the player's class before the World Tier's `rareDrops` multiplier. */
  uniqueChance: number;
  /** Recipes taught per kill (new ones first). */
  recipes: [number, number];
  /** Lumen Dust per kill. */
  dust: [number, number];
}

export interface WorldBossDef {
  id: string;
  /** Enemy definition (WORLD_BOSS_ENEMIES below). */
  enemy: string;
  /** Phase script (WORLD_BOSS_SCRIPTS below). */
  script: string;
  /** Life multiplier on the enemy's life at the monster level, before the World Tier's. */
  lifeMul: number;
  damageMul: number;
  affixes: EliteAffix[];
  /** Painted portrait to reuse (public/assets/art/bosses/<portrait>.webp); none = no intro card. */
  portrait?: string;
  rewards: WorldBossRewards;
  /** Fixed spots, spread over the regions on open ground away from the hubs. */
  spots: WorldBossSpot[];
}

const CF = 'zone.cinder_flats';
const RD = 'zone.refinery_district';
const HV = 'zone.hydroponic_vaults';
const DM = 'zone.deep_mines';
const CORE = 'zone.the_core';

export const WORLD_BOSSES: readonly WorldBossDef[] = [
  {
    // A hijacked cargo loader grown to a colossus: fire, thrown plates and burning ground.
    id: 'ashen_colossus',
    enemy: 'world_ashen_colossus',
    script: 'world_ashen_colossus',
    lifeMul: 4,
    damageMul: 1,
    affixes: [],
    rewards: { uniqueChance: 0.2, recipes: [1, 2], dust: [8, 14] },
    spots: [
      { zone: CF, x: -440, z: -480, radius: 26 },
      { zone: RD, x: 60, z: -280, radius: 26 },
      { zone: RD, x: 360, z: 580, radius: 26 },
      // A second Cinder Flats spot, on the open eastern flats.
      { zone: CF, x: 352, z: 312, radius: 26 },
    ],
  },
  {
    // The brood's oldest mother: spore clouds, spore beams and a swarm that never stops coming.
    id: 'mother_of_spores',
    enemy: 'world_mother_of_spores',
    script: 'world_mother_of_spores',
    lifeMul: 4,
    damageMul: 1,
    affixes: [],
    portrait: 'brood_mother',
    rewards: { uniqueChance: 0.25, recipes: [1, 2], dust: [8, 14] },
    spots: [
      { zone: HV, x: 320, z: 320, radius: 26 },
      { zone: HV, x: -100, z: -280, radius: 26 },
      { zone: CF, x: -220, z: 460, radius: 26 },
    ],
  },
  {
    // A Core Guardian grown over a drill: beams, a turning drill head and blinks.
    id: 'hollow_engine',
    enemy: 'world_hollow_engine',
    script: 'world_hollow_engine',
    lifeMul: 4.5,
    damageMul: 1,
    affixes: [],
    portrait: 'brood_engine',
    rewards: { uniqueChance: 0.25, recipes: [1, 2], dust: [10, 16] },
    spots: [
      { zone: DM, x: -60, z: 510, radius: 22 },
      { zone: CORE, x: 220, z: 100, radius: 26 },
      { zone: CORE, x: -140, z: 280, radius: 26 },
    ],
  },
  {
    // A singer grown huge in the crystal: ranged bursts, motes and a blink. Reuses the Choir Mother portrait (C012).
    id: 'choir_of_stone',
    enemy: 'world_choir_of_stone',
    script: 'world_choir_of_stone',
    lifeMul: 4,
    damageMul: 1,
    affixes: [],
    portrait: 'choir_mother',
    rewards: { uniqueChance: 0.3, recipes: [1, 2], dust: [10, 16] },
    spots: [
      { zone: DM, x: 452, z: 212, radius: 26 },
      { zone: DM, x: 472, z: 52, radius: 26 },
      { zone: CORE, x: -168, z: 532, radius: 26 },
    ],
  },
  {
    // The Brood Engine's echo: a second machine grown over the Core's floor, with plates, light and a sweep.
    id: 'echo_engine',
    enemy: 'world_echo_engine',
    script: 'world_echo_engine',
    lifeMul: 5,
    damageMul: 1,
    affixes: [],
    portrait: 'brood_engine',
    rewards: { uniqueChance: 0.3, recipes: [1, 2], dust: [12, 18] },
    spots: [
      { zone: CORE, x: 372, z: 252, radius: 26 },
      { zone: CORE, x: -208, z: 12, radius: 26 },
    ],
  },
];

/** The enemy bodies: existing large models, scaled up (the boss spawn adds another ×1.3). */
export const WORLD_BOSS_ENEMIES: EnemyInput[] = [
  {
    // enemy.cargo_loader × 3: heavy claw slams, a throw every third swing, burning ground behind it.
    id: 'world_ashen_colossus',
    assetId: 'enemy.cargo_loader',
    family: 'machine',
    behavior: 'tank',
    life: 4200,
    armor: 340,
    resist: { heat: 0.6, physical: 0.1 },
    damage: 58,
    moveSpeed: 2.1,
    turnRate: 2.2,
    aggroRange: 30,
    scale: 2.3,
    glow: '#ff7a2a',
    collider: { radius: 3.2, mass: 400 },
    dropTable: WORLD_BOSS.bodyTable,
    attack: { kind: 'melee', range: 6, arcDeg: 160, windup: 1.4, recovery: 1.0, cooldown: 2.2, damageType: 'heat', knockback: 4, grabEvery: 3, throwDistance: 9 },
    trail: { every: 0.7, radius: 2.6, duration: 5, applies: [{ status: 'burning', duration: 1.5, coefficient: 0.12 }], color: '#ff6a1a' },
  },
  {
    // enemy.spore_carrier × 3: a swollen mother that slams in a wide arc and births the brood.
    id: 'world_mother_of_spores',
    assetId: 'enemy.spore_carrier',
    family: 'infected',
    behavior: 'tank',
    life: 4000,
    armor: 140,
    resist: { toxic: 0.7 },
    damage: 46,
    moveSpeed: 2.0,
    turnRate: 2.4,
    aggroRange: 30,
    scale: 2.3,
    glow: '#9ac040',
    collider: { radius: 3, mass: 300 },
    dropTable: WORLD_BOSS.bodyTable,
    attack: { kind: 'melee', range: 5.5, arcDeg: 180, windup: 1.2, recovery: 0.9, cooldown: 1.9, damageType: 'toxic', knockback: 3 },
  },
  {
    // enemy.core_guardian × 2.5, Lumen look: slow and stately, wards the adds it brings.
    id: 'world_hollow_engine',
    assetId: 'enemy.core_guardian',
    family: 'machine',
    behavior: 'tank',
    look: 'lumen',
    life: 5000,
    armor: 380,
    resist: { energy: 0.4, physical: 0.1 },
    damage: 68,
    moveSpeed: 1.9,
    turnRate: 2.2,
    aggroRange: 30,
    scale: 1.06,
    collider: { radius: 3, mass: 400 },
    dropTable: WORLD_BOSS.bodyTable,
    attack: { kind: 'melee', range: 6, arcDeg: 220, windup: 1.3, recovery: 1.0, cooldown: 2.0, damageType: 'physical', knockback: 4 },
    shieldAlly: { every: 8, radius: 14, duration: 4, count: 3 },
  },
  {
    // enemy.choir_singer × 2.4, Lumen look: walks, keeps its distance and fires three-shot bursts.
    id: 'world_choir_of_stone',
    assetId: 'enemy.choir_singer',
    family: 'light',
    behavior: 'ranged',
    look: 'lumen',
    life: 4600,
    armor: 220,
    resist: { energy: 0.4, toxic: 0.4 },
    damage: 40,
    moveSpeed: 1.7,
    turnRate: 2.6,
    aggroRange: 30,
    preferredRange: [8, 16],
    scale: 2.4,
    glow: '#8ad8ff',
    collider: { radius: 1.6, mass: 250 },
    dropTable: WORLD_BOSS.bodyTable,
    attack: { kind: 'projectile', windup: 1.0, cooldown: 2.4, speed: 10, radius: 0.45, maxRange: 22, damageType: 'energy', burst: 3, burstInterval: 0.25, spreadDeg: 14 },
  },
  {
    // enemy.core_guardian × 1.1, Lumen look: the Hollow Engine's cousin, heavier and bluer.
    id: 'world_echo_engine',
    assetId: 'enemy.core_guardian',
    family: 'machine',
    behavior: 'tank',
    look: 'lumen',
    life: 5600,
    armor: 420,
    resist: { energy: 0.4, physical: 0.15 },
    damage: 72,
    moveSpeed: 1.9,
    turnRate: 2.2,
    aggroRange: 30,
    scale: 1.12,
    glow: '#8ad8ff',
    collider: { radius: 3.1, mass: 420 },
    dropTable: WORLD_BOSS.bodyTable,
    attack: { kind: 'melee', range: 6, arcDeg: 220, windup: 1.3, recovery: 1.0, cooldown: 2.0, damageType: 'physical', knockback: 4 },
    shieldAlly: { every: 8, radius: 14, duration: 4, count: 3 },
  },
];

export const WORLD_BOSS_SCRIPTS: Record<string, BossPhase[]> = {
  world_ashen_colossus: [
    { below: 1, adds: { enemy: 'flame_drone', count: 2, every: 18 }, fireballs: { every: 6, count: 2, radius: 3, warning: 1.4, damageOfWeapon: 1.3, color: '#ff7a1a', vfx: 'explosion' } },
    {
      below: 0.65,
      banner: 'worldBoss.ashen_colossus.phase2',
      tempo: 1.2,
      adds: { enemy: 'scorched_walker', count: 3, every: 16 },
      plates: { every: 9, radius: 3, warning: 1.3, damageOfWeapon: 1.4 },
      sporeFields: { every: 8, count: 3, radius: 3.5, duration: 8, dpsOfWeapon: 0.35, status: 'burning', color: '#ff6a1a' },
    },
    {
      below: 0.3,
      banner: 'worldBoss.ashen_colossus.phase3',
      speedMul: 1.4,
      tempo: 1.4,
      transform: { scale: 1.25, glow: '#ff4a1a' },
      adds: { enemy: 'slag_hound', count: 3, every: 14 },
      fireballs: { every: 4, count: 3, radius: 3, warning: 1.2, damageOfWeapon: 1.4, color: '#ff5a1a', vfx: 'explosion' },
      sporeFields: { every: 6, count: 4, radius: 3.5, duration: 8, dpsOfWeapon: 0.4, status: 'burning', color: '#ff4a1a' },
    },
  ],
  world_mother_of_spores: [
    {
      below: 1,
      adds: { enemy: 'bloater', count: 3, every: 12 },
      sporeFields: { every: 8, count: 3, radius: 3.5, duration: 9, dpsOfWeapon: 0.3, status: 'poisoned', color: '#7dff5a' },
    },
    {
      below: 0.65,
      banner: 'worldBoss.mother_of_spores.phase2',
      tempo: 1.2,
      adds: { enemy: 'spore_swarm', count: 4, every: 10 },
      beams: { every: 8, length: 28, width: 2.4, warning: 1.3, damageOfWeapon: 1.3, color: '#7dff5a' },
      sporeFields: { every: 7, count: 3, radius: 3.5, duration: 9, dpsOfWeapon: 0.35, status: 'poisoned', color: '#7dff5a' },
    },
    {
      below: 0.3,
      banner: 'worldBoss.mother_of_spores.phase3',
      speedMul: 1.3,
      tempo: 1.3,
      transform: { scale: 1.2, glow: '#c8ff3a' },
      adds: { enemy: 'spore_hound', count: 3, every: 12 },
      tentacles: { enemy: 'lumen_tentacle', count: 2, every: 11 },
      beams: { every: 6, length: 28, width: 2.4, warning: 1.2, damageOfWeapon: 1.4, color: '#c8ff3a' },
      sporeFields: { every: 6, count: 4, radius: 3.5, duration: 9, dpsOfWeapon: 0.4, status: 'poisoned', color: '#c8ff3a' },
    },
  ],
  world_hollow_engine: [
    {
      below: 1,
      adds: { enemy: 'light_being', count: 2, every: 16 },
      beams: { every: 7, length: 30, width: 2.6, warning: 1.2, damageOfWeapon: 1.3, color: '#fff0c8' },
    },
    {
      below: 0.65,
      banner: 'worldBoss.hollow_engine.phase2',
      tempo: 1.2,
      adds: { enemy: 'guardian_lancer', count: 1, every: 22 },
      beams: { every: 9, length: 30, width: 2.6, warning: 1.2, damageOfWeapon: 1.3, color: '#fff0c8' },
      sweep: { length: 20, width: 2.6, speed: 0.4, dpsOfWeapon: 0.9, color: '#ffb23a' },
    },
    {
      below: 0.3,
      banner: 'worldBoss.hollow_engine.phase3',
      speedMul: 1.3,
      tempo: 1.3,
      adds: { enemy: 'light_being', count: 3, every: 14 },
      beams: { every: 6, length: 30, width: 2.6, warning: 1.1, damageOfWeapon: 1.4, color: '#fff0c8' },
      sweep: { length: 20, width: 2.6, speed: 0.65, dpsOfWeapon: 1.0, color: '#ffb23a' },
      teleport: { every: 10, radius: 3.2, warning: 1.2, damageOfWeapon: 1.4, color: '#fff0c8' },
    },
  ],
  world_choir_of_stone: [
    {
      below: 1,
      adds: { enemy: 'light_mote', count: 5, every: 14 },
      beams: { every: 8, length: 26, width: 2.2, warning: 1.3, damageOfWeapon: 1.3, color: '#8ad8ff' },
    },
    {
      below: 0.65,
      banner: 'worldBoss.choir_of_stone.phase2',
      tempo: 1.2,
      adds: { enemy: 'crystal_sentinel', count: 2, every: 20 },
      beams: { every: 7, length: 26, width: 2.2, warning: 1.2, damageOfWeapon: 1.3, color: '#8ad8ff' },
      fireballs: { every: 7, count: 3, radius: 3, warning: 1.3, damageOfWeapon: 1.2, color: '#8ad8ff', vfx: 'explosion' },
    },
    {
      below: 0.3,
      banner: 'worldBoss.choir_of_stone.phase3',
      speedMul: 1.3,
      tempo: 1.3,
      transform: { scale: 1.2, glow: '#e8f8ff' },
      adds: { enemy: 'light_being', count: 2, every: 14 },
      beams: { every: 5, length: 26, width: 2.2, warning: 1.1, damageOfWeapon: 1.4, color: '#e8f8ff' },
      teleport: { every: 11, radius: 3.2, warning: 1.2, damageOfWeapon: 1.4, color: '#8ad8ff' },
    },
  ],
  world_echo_engine: [
    {
      below: 1,
      adds: { enemy: 'shade_drone', count: 2, every: 16 },
      plates: { every: 9, radius: 3, warning: 1.3, damageOfWeapon: 1.4 },
    },
    {
      below: 0.65,
      banner: 'worldBoss.echo_engine.phase2',
      tempo: 1.2,
      adds: { enemy: 'guardian_lancer', count: 1, every: 22 },
      beams: { every: 8, length: 30, width: 2.6, warning: 1.2, damageOfWeapon: 1.3, color: '#8ad8ff' },
      fireballs: { every: 7, count: 3, radius: 3, warning: 1.3, damageOfWeapon: 1.3, color: '#8ad8ff', vfx: 'explosion' },
    },
    {
      below: 0.3,
      banner: 'worldBoss.echo_engine.phase3',
      speedMul: 1.3,
      tempo: 1.3,
      adds: { enemy: 'shade_walker', count: 3, every: 14 },
      sweep: { length: 20, width: 2.6, speed: 0.6, dpsOfWeapon: 1.0, color: '#8ad8ff' },
      beams: { every: 6, length: 30, width: 2.6, warning: 1.1, damageOfWeapon: 1.4, color: '#8ad8ff' },
      teleport: { every: 10, radius: 3.2, warning: 1.2, damageOfWeapon: 1.4, color: '#8ad8ff' },
    },
  ],
};

/** The portrait a world boss enemy reuses (public/assets/art/bosses/<portrait>.webp), if any. */
export function worldBossPortrait(enemyId: string): string | undefined {
  return WORLD_BOSSES.find((b) => b.enemy === enemyId)?.portrait;
}
