/**
 * Reference checks and transactional apply for loaded saves.
 *
 * The save schema stores content ids (item bases, uniques, aspects, crystals, skill nodes) as plain
 * strings, so a save written before an id was renamed or removed still parses. `sanitizeSave` finds
 * those references and removes them, refunding skill points, so the game never holds an orphan item.
 */
import { SKILL_TREES, SKILLS } from '../data/db';
import { ASPECT_DEFS, BASE_ITEMS, CRYSTAL_DEFS, UNIQUE_DEFS } from '../data/loot/db';
import type { Item } from '../data/loot/schemas';
import type { SaveData } from './save';

/** Which ids exist in the current game data. Injectable so tests can pass a tiny registry. */
export interface SaveRefs {
  base(id: string): boolean;
  unique(id: string): boolean;
  aspect(id: string): boolean;
  crystal(id: string): boolean;
  skillNode(id: string): boolean;
  skill(id: string): boolean;
}

let defaults: SaveRefs | undefined;
export function gameRefs(): SaveRefs {
  defaults ??= {
    base: (id) => BASE_ITEMS.has(id),
    unique: (id) => UNIQUE_DEFS.has(id),
    aspect: (id) => ASPECT_DEFS.has(id),
    crystal: (id) => CRYSTAL_DEFS.has(id),
    skillNode: (() => {
      const nodes = new Set([...SKILL_TREES.values()].flatMap((tree) => tree.nodes.map((n) => n.id)));
      return (id: string) => nodes.has(id);
    })(),
    skill: (id) => SKILLS.has(id),
  };
  return defaults;
}

export interface SanitizedSave {
  data: SaveData;
  /** One entry per removed reference, e.g. `item:removed_base`, `skillNode:n.nope`. */
  dropped: string[];
}

/**
 * Returns a copy of `save` without references to ids the game no longer knows. Items on unknown
 * bases and crystals are removed; unknown uniques, aspects and socketed crystals are cleared from an
 * otherwise valid item; skill ranks on unknown nodes are removed and their points refunded.
 */
export function sanitizeSave(save: SaveData, refs: SaveRefs = gameRefs()): SanitizedSave {
  const data = structuredClone(save);
  const dropped: string[] = [];

  /** Returns the item to keep, or null to remove it. */
  const check = (item: Item): Item | null => {
    if (!refs.base(item.base)) {
      dropped.push(`item:${item.base}`);
      return null;
    }
    if (item.crystal && !refs.crystal(item.crystal.id)) {
      dropped.push(`crystal:${item.crystal.id}`);
      return null;
    }
    if (item.unique !== undefined && !refs.unique(item.unique)) {
      dropped.push(`unique:${item.unique}`);
      delete item.unique;
    }
    if (item.aspect && !refs.aspect(item.aspect.id)) {
      dropped.push(`aspect:${item.aspect.id}`);
      delete item.aspect;
    }
    item.sockets = item.sockets.map((socket) => {
      if (socket && !refs.crystal(socket.crystal)) {
        dropped.push(`crystal:${socket.crystal}`);
        return null;
      }
      return socket;
    });
    return item;
  };

  const inv = data.inventory;
  if (inv) {
    inv.grid = inv.grid.map((item) => (item ? check(item) : item));
    for (const slot of Object.keys(inv.equipped) as (keyof typeof inv.equipped)[]) {
      const item = inv.equipped[slot];
      if (item && !check(item)) delete inv.equipped[slot];
    }
    inv.aspects = inv.aspects.filter((a) => {
      if (refs.aspect(a.id)) return true;
      dropped.push(`aspect:${a.id}`);
      return false;
    });
  }

  for (const [node, rank] of Object.entries(data.skills.ranks)) {
    if (refs.skillNode(node)) continue;
    dropped.push(`skillNode:${node}`);
    delete data.skills.ranks[node];
    data.progression.skillPoints += rank;
  }
  data.skills.slots = data.skills.slots.map((id) => {
    if (id === null || refs.skill(id)) return id;
    dropped.push(`skill:${id}`);
    return null;
  });

  return { data, dropped };
}

/** What `runSaveApply` needs from the game. */
export interface SaveApplier {
  apply(data: SaveData): void;
  /** The current live state, taken before applying so it can be restored; null when nothing is in play yet. */
  snapshot(): SaveData | null;
}

export type SaveApplyResult = { ok: true } | { ok: false; error: unknown; restored: boolean };

/**
 * Applies a save and, if any step throws, puts the previous state back. When there is nothing to
 * restore (or restoring fails too) the result says so and the caller must suppress autosave, so a
 * half-applied world can never be written over the good slot.
 */
export function runSaveApply(target: SaveApplier, data: SaveData): SaveApplyResult {
  let previous: SaveData | null = null;
  try {
    previous = target.snapshot();
  } catch {
    // A world that cannot snapshot cannot be restored either.
  }
  try {
    target.apply(data);
    return { ok: true };
  } catch (error) {
    let restored = false;
    if (previous) {
      try {
        target.apply(previous);
        restored = true;
      } catch {
        // Still broken: stay suppressed.
      }
    }
    return { ok: false, error, restored };
  }
}
