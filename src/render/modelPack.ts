/**
 * Model packs for the artifact build (npm run build:artifact, scripts/artifact/packs.ts). A claude.ai artifact
 * accepts at most 511 files per version, and the Blender parts (public/assets/parts/, blender/) are ~160 tiny GLBs,
 * so the artifact ships the small models of a few folders together: `assets/packs/<name>.json` is
 * `{ "<path under assets/>": "<base64 GLB>" }`, the same payload a `.glb.json` file holds. The first request for a
 * model in a packed folder fetches that folder's pack once (shared by every later and concurrent request); a model
 * the pack does not hold (too big to be packed) is fetched as its own `.glb.json` as before. The standard web build
 * and the Android build never use this.
 *
 * The boss models (~1 MB each, `enemies/<name>.glb.json`) travel in a few packs by home region (BOSS_PACKS): a pack is
 * fetched only when its first boss is wanted (the zone's quiet "later" prefetch, or a boss spawn), never at start.
 */

/** Folder under assets/ → the pack its small models travel in. */
export const PACK_DIRS: Readonly<Record<string, string>> = { parts: 'parts', blender: 'parts', props: 'props', environment: 'environment' };

/** Boss model (file name under enemies/, without `.glb.json`) → the pack it travels in, by the region it belongs to. */
export const BOSS_PACKS: Readonly<Record<string, string>> = {
  brood_mother: 'bosses-flats', mother_of_spores: 'bosses-flats', ashen_colossus: 'bosses-flats',
  pyre_warden: 'bosses-refinery', frozen_welder: 'bosses-refinery',
  brood_warden: 'bosses-vaults-a', the_keeper: 'bosses-vaults-a', vine_matriarch: 'bosses-vaults-a',
  gamma_bloom: 'bosses-vaults-b', warden: 'bosses-vaults-b', mother_root: 'bosses-vaults-b',
  foreman_dray: 'bosses-mines', elder_guardian: 'bosses-mines', the_prism: 'bosses-mines',
  choir_mother: 'bosses-core-a', choir_of_stone: 'bosses-core-a',
  hollow_engine: 'bosses-core-b', echo_engine: 'bosses-core-b',
};

const BOSS_PATH = /^enemies\/([a-z0-9_]+)\.glb\.json$/;

/** Is this model path (under assets/) a boss model that travels in a boss pack? */
export function isBossPackPath(path: string): boolean {
  const name = BOSS_PATH.exec(path)?.[1];
  return !!name && Object.prototype.hasOwnProperty.call(BOSS_PACKS, name);
}

/** The pack a model path (under assets/, e.g. `parts/x.glb.json`) may be in; null when its folder is not packed. */
export function packNameFor(path: string): string | null {
  const name = BOSS_PATH.exec(path)?.[1];
  if (name) return Object.prototype.hasOwnProperty.call(BOSS_PACKS, name) ? BOSS_PACKS[name]! : null;
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
