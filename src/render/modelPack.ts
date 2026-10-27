/**
 * Model packs for the artifact build (npm run build:artifact, scripts/artifact/packs.ts). A claude.ai artifact
 * accepts at most 511 files per version, and the Blender parts (public/assets/parts/, blender/) are ~160 tiny GLBs,
 * so the artifact ships the small models of a few folders together: `assets/packs/<name>.json` is
 * `{ "<path under assets/>": "<base64 GLB>" }`, the same payload a `.glb.json` file holds. The first request for a
 * model in a packed folder fetches that folder's pack once (shared by every later and concurrent request); a model
 * the pack does not hold (too big to be packed) is fetched as its own `.glb.json` as before. The standard web build
 * and the Android build never use this.
 */

/** Folder under assets/ → the pack its small models travel in. */
export const PACK_DIRS: Readonly<Record<string, string>> = { parts: 'parts', blender: 'parts', props: 'props', environment: 'environment' };

/** The pack a model path (under assets/, e.g. `parts/x.glb.json`) may be in; null when its folder is not packed. */
export function packNameFor(path: string): string | null {
  const dir = path.slice(0, path.indexOf('/'));
  return Object.prototype.hasOwnProperty.call(PACK_DIRS, dir) ? PACK_DIRS[dir]! : null;
}

/** A pack as fetched: model path → base64 GLB. */
export type Pack = Readonly<Record<string, string>>;

export class ModelPacks {
  private readonly packs = new Map<string, Promise<Pack>>();

  constructor(private readonly fetchPack: (url: string) => Promise<Pack>) {}

  /**
   * The base64 GLB for a model URL (`<base>assets/<path>`) when it is in its folder's pack, else null (not a packed
   * folder, or not in the pack). A pack that cannot be fetched throws and is not remembered, so the caller's retry
   * fetches it again.
   */
  async get(url: string): Promise<string | null> {
    const at = url.indexOf('assets/');
    if (at < 0) return null;
    const path = url.slice(at + 'assets/'.length);
    const name = packNameFor(path);
    if (!name) return null;
    let pack = this.packs.get(name);
    if (!pack) {
      pack = this.fetchPack(`${url.slice(0, at)}assets/packs/${name}.json`);
      this.packs.set(name, pack);
      pack.catch(() => this.packs.delete(name));
    }
    return (await pack)[path] ?? null;
  }
}
