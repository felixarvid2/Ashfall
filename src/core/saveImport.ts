/**
 * B08: look at a save file before it is imported. Returns either what is in it and how it differs from the running
 * character (shown to the player to confirm), or a readable reason why it cannot be used. Never throws.
 */
import { NewerSaveError, SAVE_VERSION, SaveError, parseSaveDetailed, type SaveData } from './save';
import { sanitizeSave } from './saveRefs';

/** Biggest file accepted; a real save is well under 1 MB. */
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export interface ImportSummary {
  name: string;
  classId: string;
  level: number;
  zone: string;
  gold: number;
  /** Items in the grid plus equipped. */
  items: number;
  savedAt: string;
  fromVersion: number;
  /** The file was written by an older build and is upgraded on import. */
  migrated: boolean;
  /** Skills, items or quests an older version knew that this build does not (they are removed on import). */
  dropped: number;
}

export type ImportReasonKey = 'empty' | 'tooBig' | 'notJson' | 'notSave' | 'newer' | 'broken';

/** A failure carries a reason key (lang `saveImport.reasons.<key>`) and the validator's own wording as detail. */
export type ImportCheck = { ok: true; summary: ImportSummary; data: SaveData } | { ok: false; key: ImportReasonKey; detail?: string };

export function checkImport(json: string): ImportCheck {
  const fail = (key: ImportReasonKey, detail?: string): ImportCheck => ({ ok: false, key, ...(detail ? { detail } : {}) });
  if (json.trim() === '') return fail('empty');
  if (json.length > MAX_IMPORT_BYTES) return fail('tooBig');
  let parsed: ReturnType<typeof parseSaveDetailed>;
  try {
    parsed = parseSaveDetailed(json);
  } catch (err) {
    if (err instanceof NewerSaveError) return fail('newer', err.message);
    if (err instanceof SaveError) {
      if (err.message === 'invalid JSON') return fail('notJson');
      if (err.message === 'not an object' || err.message === 'missing version') return fail('notSave', err.message);
      return fail('broken', err.message);
    }
    return fail('broken', String(err));
  }
  const { data, fromVersion } = parsed;
  return { ok: true, summary: summarizeSave(data, fromVersion), data };
}

/** What the confirm sheet shows about a save (`fromVersion` defaults to the current version, for the running character). */
export function summarizeSave(data: SaveData, fromVersion: number = SAVE_VERSION): ImportSummary {
  const inv = data.inventory;
  return {
    name: data.character.name,
    classId: data.character.classId,
    level: data.progression.level,
    zone: data.world.zone,
    gold: inv?.gold ?? 0,
    items: inv ? inv.grid.filter(Boolean).length + Object.keys(inv.equipped).length : 0,
    savedAt: data.savedAt,
    fromVersion,
    migrated: fromVersion < SAVE_VERSION,
    dropped: sanitizeSave(data).dropped.length,
  };
}
