/**
 * Boss phase scripts (docs/world-and-gameplay.md §9): each phase starts below a share of life and
 * changes tempo, summons adds, throws plates that stay as cover, or covers the arena in spores.
 */
import { WORLD_BOSS_SCRIPTS } from './endgame/worldBosses';

export interface BossPhase {
  /** Starts when life drops to this fraction (the first phase uses 1). */
  below: number;
  /** Language key for the phase banner. */
  banner?: string;
  /** Movement speed multiplier and attack tempo (wind-ups and cooldowns). */
  speedMul?: number;
  tempo?: number;
  adds?: { enemy: string; count: number; every: number };
  /** Metal plates: warned impacts at the player that leave cover behind. */
  plates?: { every: number; radius: number; warning: number; damageOfWeapon: number };
  /** Spore fields around the arena (burning spore fields in the Cathedral). */
  sporeFields?: { every: number; count: number; radius: number; duration: number; dpsOfWeapon: number; status?: 'poisoned' | 'burning'; color?: string };
  /** Warned fireballs at and around the player (no cover left behind); root slams are green ones. */
  fireballs?: { every: number; count: number; radius: number; warning: number; damageOfWeapon: number; color?: string; vfx?: 'vent' | 'slam' | 'explosion' };
  /** A telegraphed spore beam: a line from the boss toward the player, hitting all along it. */
  beams?: { every: number; length: number; width: number; warning: number; damageOfWeapon: number; color?: string };
  /** Armour plates: separate targets on the boss; until all are broken it takes `reduction` less damage. */
  armor?: { plates: number; reduction: number; plateLife: number };
  /** It takes root and cannot be hurt or move until `nodes` Root Nodes around the arena are destroyed; vines slow the floor. */
  rooted?: {
    nodes: number;
    nodeLife: number;
    ring: number;
    vines: number;
    vineRadius: number;
    /** Look and name of the nodes (default: Root Nodes) and the banner when they are gone. */
    asset?: string;
    glow?: string;
    name?: string;
    freed?: string;
  };
  /** A slow beam turning around the arena centre (the Main Drill's head); everyone it crosses is hit. */
  sweep?: { length: number; width: number; speed: number; dpsOfWeapon: number; color?: string };
  /** Blinks to a spot near the player every `every` s and sends out a pulse where it lands. */
  teleport?: { every: number; radius: number; warning: number; damageOfWeapon: number; color?: string };
  /** The floor collapses from the edge inward: each step leaves a safe circle of this fraction of the arena. */
  shrink?: { steps: number[]; every: number; warning: number; dpsOfWeapon: number };
  /** Spawned once when the phase starts (bodyguards). */
  guards?: { enemy: string; count: number };
  /** Stationary enemies that rise near the player. */
  tentacles?: { enemy: string; count: number; every: number };
  /** A new form: bigger and glowing. */
  transform?: { scale: number; glow: string };
  /**
   * Lumen's phase 2: the arena becomes a memory of each earlier region in turn (looping), `seconds` each. A memory
   * overlays its own hazards and attacks on the phase, and its `shades` rise when it begins.
   */
  memories?: BossMemory[];
  /**
   * A scripted beat: the boss cannot be hurt or attack, and the phase holds until the game calls `endBeat`
   * (Lumen's dialogue choice). `form` is the ally it takes the shape of: a harmless model beside the boss.
   */
  beat?: { id: string; form: { asset: string; glow: string; scale: number; name: string } };
  /** The boss takes this much more damage in the phase (Lumen's exposed core). */
  vulnerable?: number;
}

/** One memory of Lumen's phase 2. `look` is a renderer atmosphere (src/render/memoryLook.ts). */
export interface BossMemory extends Pick<BossPhase, 'adds' | 'fireballs' | 'sporeFields' | 'beams' | 'tentacles'> {
  id: string;
  seconds: number;
  look: 'ash' | 'fire' | 'jungle' | 'dark';
  banner: string;
  shades: { enemy: string; count: number }[];
}

/** Attack fields a memory can overlay on its phase. */
export const MEMORY_ATTACKS = ['adds', 'fireballs', 'sporeFields', 'beams', 'tentacles'] as const;

export const BOSS_SCRIPTS: Record<string, BossPhase[]> = {
  ...WORLD_BOSS_SCRIPTS,
  brood_mother: [
    { below: 1, adds: { enemy: 'bloater', count: 2, every: 12 } },
    { below: 0.5, banner: 'bosses.brood_mother.phase2', speedMul: 1.2, adds: { enemy: 'bloater', count: 3, every: 8 } },
  ],
  hale: [
    { below: 1, adds: { enemy: 'infected_colonist', count: 3, every: 16 } },
    { below: 0.5, banner: 'bosses.hale.phase2', speedMul: 1.5, tempo: 1.6 },
  ],
  the_first: [
    { below: 1, adds: { enemy: 'infected_colonist', count: 3, every: 15 } },
    {
      below: 0.6,
      banner: 'bosses.the_first.phase2',
      adds: { enemy: 'infected_colonist', count: 2, every: 20 },
      plates: { every: 6, radius: 2.6, warning: 1.3, damageOfWeapon: 1.4 },
    },
    {
      below: 0.25,
      banner: 'bosses.the_first.phase3',
      speedMul: 1.6,
      tempo: 1.4,
      plates: { every: 9, radius: 2.6, warning: 1.2, damageOfWeapon: 1.4 },
      sporeFields: { every: 7, count: 3, radius: 3.5, duration: 9, dpsOfWeapon: 0.35 },
    },
  ],
  // ---- Region 2 ----
  krell: [
    { below: 1, adds: { enemy: 'welder', count: 2, every: 18 } },
    { below: 0.5, banner: 'bosses.krell.phase2', speedMul: 1.3, tempo: 1.3, adds: { enemy: 'flame_drone', count: 2, every: 14 } },
  ],
  slag_heart: [
    { below: 1, adds: { enemy: 'slag_hound', count: 3, every: 16 } },
    { below: 0.5, banner: 'bosses.slag_heart.phase2', speedMul: 1.3, sporeFields: { every: 6, count: 3, radius: 3, duration: 7, dpsOfWeapon: 0.3, status: 'burning', color: '#ff6a1a' } },
  ],
  pyre_warden: [
    { below: 1, guards: { enemy: 'smelter', count: 2 }, adds: { enemy: 'scorched_walker', count: 2, every: 15 } },
    { below: 0.5, banner: 'bosses.pyre_warden.phase2', tempo: 1.4, fireballs: { every: 5, count: 2, radius: 2.6, warning: 1.2, damageOfWeapon: 1.3 } },
  ],
  frozen_welder: [
    { below: 1, adds: { enemy: 'welder', count: 1, every: 20 } },
    { below: 0.5, banner: 'bosses.frozen_welder.phase2', speedMul: 1.4, tempo: 1.5 },
  ],
  brother_ash: [
    { below: 1, guards: { enemy: 'smelter', count: 2 } },
    { below: 0.5, banner: 'bosses.brother_ash.phase2', tempo: 1.3, guards: { enemy: 'welder', count: 2 }, fireballs: { every: 6, count: 2, radius: 2.6, warning: 1.3, damageOfWeapon: 1.2 } },
  ],
  vire: [
    // Phase 1: three guards and fireballs; she keeps them between herself and the player.
    { below: 1, guards: { enemy: 'smelter', count: 3 }, fireballs: { every: 4.5, count: 2, radius: 2.8, warning: 1.3, damageOfWeapon: 1.3 } },
    // Phase 2: she sets the cathedral on fire; the floor collapses into molten metal in three steps.
    {
      below: 0.6,
      banner: 'bosses.vire.phase2',
      fireballs: { every: 5.5, count: 2, radius: 2.8, warning: 1.3, damageOfWeapon: 1.3 },
      shrink: { steps: [0.78, 0.6, 0.45], every: 14, warning: 2.5, dpsOfWeapon: 0.8 },
      adds: { enemy: 'smelter', count: 2, every: 18 },
    },
    // Phase 3: her infected form. Tentacles, burning spore fields and Scorched Walkers.
    {
      below: 0.25,
      banner: 'bosses.vire.phase3',
      speedMul: 1.3,
      tempo: 1.3,
      transform: { scale: 1.35, glow: '#7dff5a' },
      tentacles: { enemy: 'lumen_tentacle', count: 2, every: 11 },
      adds: { enemy: 'scorched_walker', count: 3, every: 14 },
      sporeFields: { every: 7, count: 3, radius: 3.2, duration: 8, dpsOfWeapon: 0.4, status: 'burning', color: '#c8ff3a' },
    },
  ],
  // ---- Region 3 ----
  keeper: [
    { below: 1, adds: { enemy: 'overgrown_walker', count: 2, every: 16 } },
    { below: 0.5, banner: 'bosses.keeper.phase2', speedMul: 1.3, tempo: 1.2, adds: { enemy: 'spore_swarm', count: 3, every: 12 } },
  ],
  brood_warden: [
    { below: 1, adds: { enemy: 'spore_swarm', count: 3, every: 12 } },
    { below: 0.5, banner: 'bosses.brood_warden.phase2', tempo: 1.3, adds: { enemy: 'swarm_bloater', count: 2, every: 12 } },
  ],
  vine_matriarch: [
    { below: 1, adds: { enemy: 'vine_weaver', count: 1, every: 18 } },
    { below: 0.5, banner: 'bosses.vine_matriarch.phase2', tentacles: { enemy: 'mother_root', count: 2, every: 12 } },
  ],
  ilse_varga: [
    { below: 1, guards: { enemy: 'mutated_botanist', count: 2 } },
    {
      below: 0.5,
      banner: 'bosses.ilse_varga.phase2',
      adds: { enemy: 'overgrown_walker', count: 2, every: 14 },
      sporeFields: { every: 6, count: 3, radius: 3.2, duration: 8, dpsOfWeapon: 0.35 },
    },
  ],
  gamma_bloom: [
    { below: 1, adds: { enemy: 'overgrown_walker', count: 3, every: 16 } },
    {
      below: 0.5,
      banner: 'bosses.gamma_bloom.phase2',
      speedMul: 1.3,
      adds: { enemy: 'cocoon_warden', count: 1, every: 20 },
      sporeFields: { every: 7, count: 3, radius: 3.5, duration: 9, dpsOfWeapon: 0.35 },
    },
  ],
  // ---- Region 4 ----
  dray: [
    { below: 1, adds: { enemy: 'infected_miner', count: 2, every: 16 } },
    { below: 0.5, banner: 'bosses.dray.phase2', tempo: 1.25, fireballs: { every: 5, count: 3, radius: 2.8, warning: 1.3, damageOfWeapon: 1.3, color: '#ffb23a', vfx: 'explosion' } },
  ],
  prism: [
    { below: 1, adds: { enemy: 'crystal_walker', count: 2, every: 15 } },
    { below: 0.5, banner: 'bosses.prism.phase2', beams: { every: 4.5, length: 22, width: 2, warning: 1, damageOfWeapon: 1.3, color: '#bfffff' } },
  ],
  drowned_engine: [
    { below: 1, adds: { enemy: 'burrower', count: 2, every: 16 } },
    { below: 0.5, banner: 'bosses.drowned_engine.phase2', tempo: 1.2, sweep: { length: 24, width: 2.6, speed: 0.6, dpsOfWeapon: 0.8, color: '#ffb23a' } },
  ],
  archivist: [
    { below: 1, adds: { enemy: 'echo', count: 2, every: 14 } },
    { below: 0.5, banner: 'bosses.archivist.phase2', teleport: { every: 5, radius: 3.5, warning: 1, damageOfWeapon: 1.3 }, adds: { enemy: 'echo', count: 3, every: 12 } },
  ],
  elder_guardian: [
    { below: 1, adds: { enemy: 'crystal_sentinel', count: 1, every: 20 }, beams: { every: 6, length: 24, width: 2.4, warning: 1.1, damageOfWeapon: 1.4, color: '#6ad8ff' } },
    { below: 0.6, banner: 'bosses.elder_guardian.phase2', teleport: { every: 6, radius: 4, warning: 1.1, damageOfWeapon: 1.5 }, adds: { enemy: 'echo', count: 3, every: 14 } },
    {
      below: 0.3,
      banner: 'bosses.elder_guardian.phase3',
      speedMul: 1.2,
      tempo: 1.25,
      transform: { scale: 1.2, glow: '#bfffff' },
      sweep: { length: 26, width: 2.6, speed: 0.5, dpsOfWeapon: 0.9, color: '#6ad8ff' },
      fireballs: { every: 5, count: 3, radius: 3, warning: 1.2, damageOfWeapon: 1.4, color: '#6ad8ff', vfx: 'slam' },
    },
  ],
  holm: [
    { below: 1, guards: { enemy: 'security_trooper', count: 2 } },
    { below: 0.5, banner: 'bosses.holm.phase2', adds: { enemy: 'governor_drone', count: 2, every: 14 }, fireballs: { every: 5, count: 3, radius: 2.6, warning: 1.2, damageOfWeapon: 1.3, color: '#ffd23a', vfx: 'explosion' } },
  ],
  kade: [
    // Phase 1: the control room. A frontal shield, his drones and a telegraphed energy cannon.
    { below: 1, adds: { enemy: 'governor_drone', count: 2, every: 14 }, beams: { every: 5, length: 26, width: 2.4, warning: 1.2, damageOfWeapon: 1.5, color: '#ffd23a' } },
    // Phase 2: he plugs into the Main Drill (immune) while its head sweeps the room; cut the four conduits.
    {
      below: 0.6,
      banner: 'bosses.kade.phase2',
      rooted: { nodes: 4, nodeLife: 900, ring: 0.7, vines: 0, vineRadius: 1, asset: 'prop.generator', glow: '#ffb23a', name: 'enemies.conduit', freed: 'bosses.kade.freed' },
      sweep: { length: 30, width: 3, speed: 0.45, dpsOfWeapon: 0.9, color: '#ffb23a' },
    },
    // Phase 3: Lumen takes him. He blinks around the room; Echoes join.
    {
      below: 0.3,
      banner: 'bosses.kade.phase3',
      speedMul: 1.25,
      tempo: 1.25,
      transform: { scale: 1.3, glow: '#6ad8ff' },
      teleport: { every: 6, radius: 4, warning: 1, damageOfWeapon: 1.5 },
      adds: { enemy: 'echo', count: 3, every: 12 },
      beams: { every: 8, length: 26, width: 2.4, warning: 1.1, damageOfWeapon: 1.5, color: '#6ad8ff' },
    },
  ],
  warden: [
    // Phase 1: it walks the arena firing spore beams; three armour plates keep its weak points covered.
    { below: 1, armor: { plates: 3, reduction: 0.8, plateLife: 900 }, beams: { every: 5, length: 24, width: 2.4, warning: 1.2, damageOfWeapon: 1.4, color: '#7dff5a' } },
    // Phase 2: it takes root; destroy the Root Nodes to free it while Overgrown Walkers climb out of the vines.
    {
      below: 0.6,
      banner: 'bosses.warden.phase2',
      rooted: { nodes: 4, nodeLife: 800, ring: 0.62, vines: 5, vineRadius: 4 },
      adds: { enemy: 'overgrown_walker', count: 3, every: 12 },
    },
    // Phase 3: the Mother Tree joins; its roots slam down near the player and burst up as stationary enemies.
    {
      below: 0.3,
      banner: 'bosses.warden.phase3',
      speedMul: 1.2,
      tempo: 1.2,
      beams: { every: 7, length: 24, width: 2.4, warning: 1.1, damageOfWeapon: 1.4, color: '#7dff5a' },
      fireballs: { every: 4, count: 3, radius: 3.2, warning: 1.4, damageOfWeapon: 1.5, color: '#5dff6a', vfx: 'slam' },
      tentacles: { enemy: 'mother_root', count: 2, every: 14 },
    },
  ],
  // ---- Region 5 ----
  lumen: [
    // Phase 1: the earlier bosses' attacks in new combinations: Vire's warned fireballs, The First's plates (which
    // leave cover from the Warden's beams) and Light Beings.
    {
      below: 1,
      adds: { enemy: 'light_being', count: 2, every: 16 },
      fireballs: { every: 4.5, count: 3, radius: 2.8, warning: 1.3, damageOfWeapon: 1.2, color: '#ffd88a', vfx: 'explosion' },
      plates: { every: 11, radius: 2.8, warning: 1.3, damageOfWeapon: 1.3 },
      beams: { every: 8, length: 32, width: 2.4, warning: 1.2, damageOfWeapon: 1.3, color: '#fff0c8' },
    },
    // Phase 2: the arena remembers the earlier regions, about 15 s each: ash, fire, jungle, darkness.
    {
      below: 0.7,
      banner: 'bosses.lumen.phase2',
      memories: [
        {
          id: 'ash',
          seconds: 15,
          look: 'ash',
          banner: 'bosses.lumen.memory.ash',
          shades: [
            { enemy: 'shade_walker', count: 3 },
            { enemy: 'shade_echo', count: 2 },
          ],
          adds: { enemy: 'shade_walker', count: 1, every: 7 },
          fireballs: { every: 5, count: 2, radius: 2.4, warning: 1.4, damageOfWeapon: 1, color: '#b8b2aa', vfx: 'slam' },
        },
        {
          id: 'fire',
          seconds: 15,
          look: 'fire',
          banner: 'bosses.lumen.memory.fire',
          shades: [
            { enemy: 'shade_smelter', count: 2 },
            { enemy: 'shade_hound', count: 2 },
          ],
          fireballs: { every: 3.5, count: 3, radius: 2.8, warning: 1.2, damageOfWeapon: 1.2, color: '#ff7a1a', vfx: 'vent' },
          sporeFields: { every: 5, count: 3, radius: 3, duration: 7, dpsOfWeapon: 0.3, status: 'burning', color: '#ff6a1a' },
        },
        {
          id: 'jungle',
          seconds: 15,
          look: 'jungle',
          banner: 'bosses.lumen.memory.jungle',
          shades: [
            { enemy: 'shade_weaver', count: 2 },
            { enemy: 'shade_hound', count: 2 },
          ],
          sporeFields: { every: 4, count: 4, radius: 3.4, duration: 8, dpsOfWeapon: 0.35 },
          tentacles: { enemy: 'mother_root', count: 1, every: 9 },
        },
        {
          id: 'dark',
          seconds: 15,
          look: 'dark',
          banner: 'bosses.lumen.memory.dark',
          shades: [
            { enemy: 'shade_sentinel', count: 1 },
            { enemy: 'shade_drone', count: 3 },
          ],
          beams: { every: 4.5, length: 32, width: 2.4, warning: 1.1, damageOfWeapon: 1.4, color: '#6ad8ff' },
        },
      ],
    },
    // Phase 3: Lumen takes an ally's shape and asks the player to stop. A dialogue choice; both lead on.
    {
      below: 0.4,
      banner: 'bosses.lumen.phase3',
      tempo: 0,
      transform: { scale: 0.35, glow: '#fff0c8' },
      beat: { id: 'lumen.choice', form: { asset: 'npc.technician', glow: '#fff0c8', scale: 1.2, name: 'npcs.okafor.name' } },
    },
    // Phase 4: the core is exposed. Short and intense: Kade's drill sweep with every other attack at once.
    {
      below: 0.4,
      banner: 'bosses.lumen.phase4',
      tempo: 1.5,
      vulnerable: 1.5,
      transform: { scale: 1.3, glow: '#ffffff' },
      sweep: { length: 44, width: 2.8, speed: 0.55, dpsOfWeapon: 0.9, color: '#fff0c8' },
      fireballs: { every: 3.5, count: 4, radius: 2.8, warning: 1.1, damageOfWeapon: 1.4, color: '#ffd88a', vfx: 'explosion' },
      beams: { every: 5, length: 32, width: 2.4, warning: 1, damageOfWeapon: 1.5, color: '#fff0c8' },
      tentacles: { enemy: 'lumen_tentacle', count: 2, every: 12 },
    },
  ],
  // ---- Region 5 (docs/regions/the-core.md): dungeon bosses and the Elevator Base's Memory Shades ----
  shade_the_first: [
    // The First's script, plus the twist: a memory is never quite where it was, so from phase 2 it blinks to you.
    { below: 1, adds: { enemy: 'shade_walker', count: 3, every: 15 } },
    {
      below: 0.6,
      banner: 'bosses.shade_the_first.phase2',
      adds: { enemy: 'shade_walker', count: 2, every: 20 },
      plates: { every: 6, radius: 2.6, warning: 1.3, damageOfWeapon: 1.4 },
      teleport: { every: 9, radius: 3.5, warning: 1.1, damageOfWeapon: 1.4, color: '#b48cff' },
    },
    {
      below: 0.25,
      banner: 'bosses.shade_the_first.phase3',
      speedMul: 1.6,
      tempo: 1.4,
      plates: { every: 9, radius: 2.6, warning: 1.2, damageOfWeapon: 1.4 },
      sporeFields: { every: 7, count: 3, radius: 3.5, duration: 9, dpsOfWeapon: 0.35 },
      teleport: { every: 6, radius: 3.5, warning: 1, damageOfWeapon: 1.5, color: '#b48cff' },
    },
  ],
  first_choir: [
    // Four singers ring the Choir Mother (empowering everything within 14 m while any lives); her songs arrive as waves.
    { below: 1, guards: { enemy: 'choir_singer', count: 4 }, adds: { enemy: 'light_mote', count: 4, every: 15 }, beams: { every: 7, length: 26, width: 2.4, warning: 1.3, damageOfWeapon: 1.4, color: '#ffe39a' } },
    {
      below: 0.6,
      banner: 'bosses.first_choir.phase2',
      tempo: 1.3,
      adds: { enemy: 'light_being', count: 2, every: 16 },
      beams: { every: 6, length: 26, width: 2.4, warning: 1.2, damageOfWeapon: 1.4, color: '#ffe39a' },
      fireballs: { every: 5, count: 3, radius: 3.2, warning: 1.3, damageOfWeapon: 1.4, color: '#ffe39a', vfx: 'slam' },
    },
    {
      below: 0.3,
      banner: 'bosses.first_choir.phase3',
      tempo: 1.3,
      transform: { scale: 1.15, glow: '#fff0c8' },
      adds: { enemy: 'light_mote', count: 4, every: 12 },
      sweep: { length: 28, width: 2.6, speed: 0.5, dpsOfWeapon: 0.9, color: '#ffe39a' },
      fireballs: { every: 6, count: 3, radius: 3.2, warning: 1.3, damageOfWeapon: 1.5, color: '#ffe39a', vfx: 'slam' },
    },
  ],
  brood_engine: [
    // Each phase opens a hatch to one earlier region: Ash, the Refinery, the Vaults, the Mines.
    { below: 1, adds: { enemy: 'shade_walker', count: 2, every: 12 } },
    { below: 0.75, banner: 'bosses.brood_engine.phase2', adds: { enemy: 'shade_smelter', count: 2, every: 14 }, fireballs: { every: 6, count: 2, radius: 2.8, warning: 1.3, damageOfWeapon: 1.3, color: '#ffb040', vfx: 'explosion' } },
    { below: 0.5, banner: 'bosses.brood_engine.phase3', tempo: 1.2, adds: { enemy: 'shade_weaver', count: 2, every: 14 }, sporeFields: { every: 8, count: 3, radius: 3.2, duration: 8, dpsOfWeapon: 0.35 } },
    {
      below: 0.25,
      banner: 'bosses.brood_engine.phase4',
      speedMul: 1.3,
      tempo: 1.3,
      transform: { scale: 1.15, glow: '#fff0c8' },
      adds: { enemy: 'crystal_walker', count: 3, every: 10 },
      beams: { every: 6, length: 24, width: 2.4, warning: 1.1, damageOfWeapon: 1.5, color: '#6ad8ff' },
    },
  ],
  shade_vire: [
    { below: 1, guards: { enemy: 'shade_smelter', count: 2 }, fireballs: { every: 5, count: 2, radius: 2.8, warning: 1.3, damageOfWeapon: 1.2, color: '#c8a4ff' } },
    { below: 0.5, banner: 'bosses.shade_vire.phase2', adds: { enemy: 'shade_smelter', count: 1, every: 18 }, fireballs: { every: 4, count: 3, radius: 2.8, warning: 1.3, damageOfWeapon: 1.3, color: '#c8a4ff' } },
  ],
  shade_warden: [
    { below: 1, armor: { plates: 3, reduction: 0.8, plateLife: 500 }, beams: { every: 6, length: 24, width: 2.4, warning: 1.2, damageOfWeapon: 1.3, color: '#b48cff' } },
    { below: 0.5, banner: 'bosses.shade_warden.phase2', adds: { enemy: 'shade_walker', count: 2, every: 12 }, beams: { every: 5, length: 24, width: 2.4, warning: 1.1, damageOfWeapon: 1.4, color: '#b48cff' } },
  ],
  shade_kade: [
    { below: 1, adds: { enemy: 'shade_drone', count: 2, every: 14 }, beams: { every: 6, length: 26, width: 2.4, warning: 1.2, damageOfWeapon: 1.4, color: '#c8a4ff' } },
    { below: 0.5, banner: 'bosses.shade_kade.phase2', speedMul: 1.2, tempo: 1.2, teleport: { every: 7, radius: 3.5, warning: 1, damageOfWeapon: 1.4, color: '#c8a4ff' }, adds: { enemy: 'shade_drone', count: 2, every: 12 } },
  ],
};

/**
 * Life multiplier of a region's stronghold boss (Hale, Brother Ash, Gamma Bloom, Holm) by monster level (G022).
 * Gentler than the old 0.12 per level: the mid-boss is 0.45-0.95x the zone boss in every region (docs/enemy-roster.md).
 */
export function strongholdLifeMul(level: number): number {
  return 1 + 0.035 * (level - 1);
}
