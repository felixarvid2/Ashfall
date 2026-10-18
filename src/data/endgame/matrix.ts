/**
 * Neural Matrix data (docs/endgame.md): five boards built from compact ASCII grids, and twelve glyphs.
 *
 * A board is a 9×9 grid. Letters in the grids:
 *   . empty   n normal (+flat attribute)   m magic (+% stat)   r rare (bigger stat + a condition)
 *   L legendary (one effect)   S glyph socket   G gate (edge midpoints; another board attaches there)
 *   @ the start node (starting board only; always owned, costs nothing)
 * Stats and values are not listed per node: each board has a theme (attribute / magic stat / rare lists
 * and a value scale) and a node takes its stat from the theme by position, so the boards stay a few
 * lines of data each. Node ids are `<board>:<x>,<y>` in the board's own (unrotated) grid.
 */
import type { Effect } from '../effects';
import type { StatKey } from '../loot/schemas';
import type { Condition } from '../schemas';

export const BOARD_SIZE = 9;
export const BOARD_CENTER = 4;
/** Matrix points: at most this many are ever earned. */
export const MATRIX_MAX_POINTS = 200;
/** Cost of the first point as a share of the last campaign level's XP requirement; each point adds `step` of it. */
export const MATRIX_COST = { base: 0.6, step: 0.02 };
/** Gold per allocated node to refund them all. */
export const MATRIX_RESPEC_GOLD = { base: 250, perNode: 60 };
export const GLYPH_MAX_LEVEL = 21;
/** Glyphs scale nodes within this many grid cells (Euclidean, same board). */
export const GLYPH_RADIUS = 3;
/** Each glyph level adds this much to the scaled node values (0.08 → +8 % per level). */
export const GLYPH_LEVEL_SCALE = 0.08;
/** Rift level divided by this is the glyph level up to which an upgrade always succeeds. */
export const GLYPH_RIFT_DIVISOR = 5;
/** Success chance lost per glyph level above rift level / divisor, and the floor. */
export const GLYPH_UPGRADE_FALLOFF = 0.25;
export const GLYPH_UPGRADE_FLOOR = 0.05;

export type NodeKind = 'start' | 'normal' | 'magic' | 'rare' | 'legendary' | 'socket' | 'gate';

export interface MatrixNodeDef {
  /** `<board>:<x>,<y>` */
  id: string;
  board: string;
  x: number;
  y: number;
  kind: NodeKind;
  /** What the node grants; for normal and magic nodes a single stat effect that glyphs may scale. */
  effects: Effect[];
  /** Conditions the node's damage effects need (shown in the tooltip). */
  conditions: Condition[];
  /** Gates only: which edge (0 north, 1 east, 2 south, 3 west) in the unrotated board. */
  side?: number;
}

export interface BoardDef {
  id: string;
  nodes: MatrixNodeDef[];
}

export const BOARD_IDS = ['start', 'ash', 'forge', 'bloom', 'deep'] as const;

const GRIDS: Record<string, readonly string[]> = {
  start: [
    '....G....',
    '..mnnnm..',
    '.rnmLmnr.',
    '..mnnnm..',
    'Gnnn@nnnG',
    '..mnnnm..',
    '.rnmSmnr.',
    '..mnnnm..',
    '....G....',
  ],
  ash: [
    '....G....',
    '..nnmnn..',
    '.nrnnmnn.',
    '.mn.n.rn.',
    'GnmnSnmnG',
    '.nrnnnnm.',
    '.mn.L.rn.',
    '..nnmnn..',
    '....G....',
  ],
  forge: [
    '....G....',
    '..nmnmn..',
    '.nn.r.nn.',
    '.mnnrnnm.',
    'Gnr.S.rnG',
    '.mnnnnnm.',
    '.nn.L.nn.',
    '.nnmnmnn.',
    '....G....',
  ],
  bloom: [
    '....G....',
    '...mnm...',
    '.nmrnrmn.',
    '.nnnnnnn.',
    'Gnmn.nmnG',
    '.nnnnnnn.',
    '.nmrSrmn.',
    '.n.mLm.n.',
    '....G....',
  ],
  deep: [
    '....G....',
    '..mnnnm..',
    '.nr.n.rn.',
    '.nnmnmnn.',
    'GmnnLnnmG',
    '.nnmnmnn.',
    '.nr.S.rn.',
    '..mnnnm..',
    '....G....',
  ],
};

/** Gate cells by side: north, east, south, west. */
export const GATE_CELLS: readonly (readonly [number, number])[] = [
  [4, 0],
  [8, 4],
  [4, 8],
  [0, 4],
];

/** Magic node value per stat at scale 1. */
const MAGIC_BASE: Partial<Record<StatKey, number>> = {
  damage: 0.02,
  critChance: 0.008,
  critDamage: 0.05,
  attackSpeed: 0.015,
  cooldownReduction: 0.008,
  moveSpeed: 0.01,
  damageReduction: 0.008,
  resistAll: 0.012,
  barrierBonus: 0.03,
  potionHealing: 0.04,
  resourceGen: 0.02,
  meleeDamage: 0.02,
  damageVsElite: 0.03,
  damageVsVulnerable: 0.03,
};
const NORMAL_BASE = 4;

interface RareTemplate {
  stat: StatKey;
  /** Stat value at scale 1 (about 2.5 magic nodes). */
  value: number;
  when: Condition | 'highLife';
  /** Conditional damage at scale 1. */
  damage: number;
}

/** Rare nodes: a bigger stat plus damage while a condition holds. */
export const RARE_TEMPLATES: Record<string, RareTemplate> = {
  vigor: { stat: 'critChance', value: 0.02, when: 'highLife', damage: 0.08 },
  ward: { stat: 'damageReduction', value: 0.02, when: 'hasBarrier', damage: 0.1 },
  hunter: { stat: 'attackSpeed', value: 0.035, when: 'elite', damage: 0.1 },
  breaker: { stat: 'cooldownReduction', value: 0.02, when: 'vulnerable', damage: 0.1 },
  surge: { stat: 'resourceGen', value: 0.05, when: 'highResource', damage: 0.1 },
  cinder: { stat: 'damage', value: 0.04, when: 'burning', damage: 0.12 },
  brawler: { stat: 'moveSpeed', value: 0.025, when: 'melee', damage: 0.1 },
  marksman: { stat: 'critDamage', value: 0.12, when: 'ranged', damage: 0.1 },
  shatter: { stat: 'damageVsElite', value: 0.06, when: 'stunned', damage: 0.12 },
  frost: { stat: 'resistAll', value: 0.03, when: 'chilled', damage: 0.1 },
  venom: { stat: 'potionHealing', value: 0.1, when: 'poisoned', damage: 0.1 },
};

interface BoardTheme {
  /** Attributes for normal nodes (picked by position). */
  attrs: StatKey[];
  magic: StatKey[];
  rare: string[];
  scale: number;
  legendary: Effect[];
  legendaryConditions: Condition[];
}

const THEMES: Record<string, BoardTheme> = {
  start: {
    attrs: ['strength', 'dexterity', 'intelligence', 'willpower'],
    magic: ['damage', 'critChance', 'attackSpeed', 'cooldownReduction', 'damageReduction', 'resistAll', 'moveSpeed', 'resourceGen'],
    rare: ['vigor', 'ward', 'hunter', 'surge'],
    scale: 1,
    legendary: [
      { kind: 'damage', value: 0.12, multiplicative: true },
      { kind: 'stat', stat: 'cooldownReduction', value: 0.05 },
    ],
    legendaryConditions: [],
  },
  ash: {
    attrs: ['strength', 'willpower', 'strength', 'dexterity'],
    magic: ['damage', 'damageReduction', 'meleeDamage', 'resistAll', 'critDamage', 'potionHealing'],
    rare: ['cinder', 'brawler', 'ward', 'vigor'],
    scale: 1.2,
    legendary: [
      { kind: 'damage', value: 0.2, multiplicative: true, when: 'burning' },
      { kind: 'stat', stat: 'maxLife', value: 300 },
    ],
    legendaryConditions: ['burning'],
  },
  forge: {
    attrs: ['strength', 'dexterity', 'strength', 'intelligence'],
    magic: ['meleeDamage', 'attackSpeed', 'critChance', 'critDamage', 'damageVsElite', 'damage'],
    rare: ['brawler', 'hunter', 'breaker', 'shatter'],
    scale: 1.4,
    legendary: [
      { kind: 'damage', value: 0.25, multiplicative: true, when: 'melee' },
      { kind: 'overheat', graceDelta: 0.5, damageMul: 1 },
    ],
    legendaryConditions: ['melee'],
  },
  bloom: {
    attrs: ['willpower', 'intelligence', 'willpower', 'dexterity'],
    magic: ['potionHealing', 'resourceGen', 'barrierBonus', 'resistAll', 'cooldownReduction', 'damageVsVulnerable'],
    rare: ['venom', 'frost', 'surge', 'ward'],
    scale: 1.6,
    legendary: [
      { kind: 'stat', stat: 'lifeOnKill', value: 30 },
      { kind: 'stat', stat: 'potionHealing', value: 0.4 },
      { kind: 'damage', value: 0.1, multiplicative: true, when: 'poisoned' },
    ],
    legendaryConditions: ['poisoned'],
  },
  deep: {
    attrs: ['intelligence', 'dexterity', 'strength', 'willpower'],
    magic: ['damage', 'critDamage', 'damageVsElite', 'damageVsVulnerable', 'cooldownReduction', 'attackSpeed', 'damage'],
    rare: ['marksman', 'shatter', 'hunter', 'breaker'],
    scale: 1.8,
    legendary: [
      { kind: 'damage', value: 0.3, multiplicative: true, when: 'elite' },
      { kind: 'stat', stat: 'critDamage', value: 0.3 },
    ],
    legendaryConditions: ['elite'],
  },
};

/** Round to 3 decimals (percent values) or whole numbers (flat). */
function round(value: number, flat: boolean): number {
  return flat ? Math.round(value) : Math.round(value * 1000) / 1000;
}

function buildBoard(id: string): BoardDef {
  const grid = GRIDS[id]!;
  const theme = THEMES[id]!;
  const nodes: MatrixNodeDef[] = [];
  let rares = 0;
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const base = { id: `${id}:${x},${y}`, board: id, x, y, conditions: [] as Condition[] };
      switch (ch) {
        case '@':
          nodes.push({ ...base, kind: 'start', effects: [] });
          break;
        case 'n': {
          const stat = theme.attrs[(x + y) % theme.attrs.length]!;
          nodes.push({ ...base, kind: 'normal', effects: [{ kind: 'stat', stat, value: round(NORMAL_BASE * theme.scale, true) }] });
          break;
        }
        case 'm': {
          const stat = theme.magic[(x + 2 * y) % theme.magic.length]!;
          nodes.push({ ...base, kind: 'magic', effects: [{ kind: 'stat', stat, value: round((MAGIC_BASE[stat] ?? 0.01) * theme.scale, false) }] });
          break;
        }
        case 'r': {
          const tpl = RARE_TEMPLATES[theme.rare[rares++ % theme.rare.length]!]!;
          const effects: Effect[] = [{ kind: 'stat', stat: tpl.stat, value: round(tpl.value * theme.scale, false) }];
          const conditions: Condition[] = [];
          // "highLife" (attacker above 80 % life) is its own condition in the damage model.
          effects.push({ kind: 'damage', value: round(tpl.damage * theme.scale, false), multiplicative: false, when: tpl.when as Condition });
          conditions.push(tpl.when as Condition);
          nodes.push({ ...base, kind: 'rare', effects, conditions });
          break;
        }
        case 'L':
          nodes.push({ ...base, kind: 'legendary', effects: theme.legendary, conditions: theme.legendaryConditions });
          break;
        case 'S':
          nodes.push({ ...base, kind: 'socket', effects: [] });
          break;
        case 'G': {
          const side = GATE_CELLS.findIndex(([gx, gy]) => gx === x && gy === y);
          nodes.push({ ...base, kind: 'gate', side, effects: [{ kind: 'stat', stat: 'allAttributes', value: round(3 * theme.scale, true) }] });
          break;
        }
        default:
          throw new Error(`matrix board ${id}: unknown cell "${ch}" at ${x},${y}`);
      }
    });
  });
  return { id, nodes };
}

export const BOARDS: ReadonlyMap<string, BoardDef> = new Map(BOARD_IDS.map((id) => [id, buildBoard(id)]));
export const MATRIX_NODES: ReadonlyMap<string, MatrixNodeDef> = new Map(
  [...BOARDS.values()].flatMap((b) => b.nodes.map((n) => [n.id, n] as const)),
);
/** The node every path starts from. */
export const START_NODE = 'start:4,4';

export function gateId(board: string, side: number): string {
  const [x, y] = GATE_CELLS[((side % 4) + 4) % 4]!;
  return `${board}:${x},${y}`;
}

// ---- Glyphs ------------------------------------------------------------------

export type MatrixAttribute = 'strength' | 'dexterity' | 'intelligence' | 'willpower';

export interface GlyphDef {
  id: string;
  /** The attribute whose normal nodes inside the radius count towards the bonus. */
  attribute: MatrixAttribute;
  /** Normal and magic nodes inside the radius with one of these stats are scaled by the glyph level. */
  family: StatKey[];
  /** Attribute points inside the radius needed for the bonus. */
  threshold: number;
  bonus: Effect[];
}

/**
 * The first three are given to every character when it reaches level 50. Thresholds are attribute points
 * of normal nodes inside the radius (a normal node gives 4–7; a socket reaches 7–48 of one attribute
 * depending on the board).
 */
export const GLYPHS: readonly GlyphDef[] = [
  { id: 'brawn', attribute: 'strength', family: ['strength', 'meleeDamage', 'damage'], threshold: 8, bonus: [{ kind: 'stat', stat: 'meleeDamage', value: 0.08 }] },
  { id: 'precision', attribute: 'dexterity', family: ['dexterity', 'critChance', 'critDamage'], threshold: 8, bonus: [{ kind: 'stat', stat: 'critChance', value: 0.03 }] },
  { id: 'insight', attribute: 'intelligence', family: ['intelligence', 'cooldownReduction', 'resourceGen'], threshold: 8, bonus: [{ kind: 'stat', stat: 'cooldownReduction', value: 0.04 }] },
  { id: 'resolve', attribute: 'willpower', family: ['willpower', 'damageReduction', 'potionHealing'], threshold: 8, bonus: [{ kind: 'stat', stat: 'damageReduction', value: 0.04 }] },
  { id: 'bulwark', attribute: 'strength', family: ['strength', 'damageReduction', 'resistAll'], threshold: 16, bonus: [{ kind: 'stat', stat: 'armor', value: 150 }] },
  { id: 'warcry', attribute: 'strength', family: ['strength', 'damageVsElite', 'critDamage'], threshold: 16, bonus: [{ kind: 'stat', stat: 'damageVsElite', value: 0.1 }] },
  { id: 'swiftness', attribute: 'dexterity', family: ['dexterity', 'attackSpeed', 'moveSpeed'], threshold: 16, bonus: [{ kind: 'stat', stat: 'attackSpeed', value: 0.05 }] },
  { id: 'predator', attribute: 'dexterity', family: ['dexterity', 'damage', 'damageVsVulnerable'], threshold: 16, bonus: [{ kind: 'stat', stat: 'damageVsVulnerable', value: 0.12 }] },
  { id: 'aegis', attribute: 'intelligence', family: ['intelligence', 'barrierBonus', 'resistAll'], threshold: 16, bonus: [{ kind: 'stat', stat: 'resistAll', value: 0.05 }] },
  { id: 'voltage', attribute: 'intelligence', family: ['intelligence', 'damage', 'critDamage'], threshold: 16, bonus: [{ kind: 'stat', stat: 'damage', value: 0.06 }] },
  { id: 'focus', attribute: 'willpower', family: ['willpower', 'resourceGen', 'cooldownReduction'], threshold: 16, bonus: [{ kind: 'stat', stat: 'resourceGen', value: 0.1 }] },
  { id: 'wellspring', attribute: 'willpower', family: ['willpower', 'potionHealing', 'barrierBonus'], threshold: 16, bonus: [{ kind: 'stat', stat: 'lifeOnKill', value: 20 }] },
];
export const GLYPH_DEFS: ReadonlyMap<string, GlyphDef> = new Map(GLYPHS.map((g) => [g.id, g]));
export const STARTER_GLYPHS: readonly string[] = GLYPHS.slice(0, 3).map((g) => g.id);
