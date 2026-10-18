/**
 * The atmospheres of Lumen's phase 2 (docs/regions/the-core.md): the Heart turns into a memory of an earlier
 * region by taking that region's fog, light, colour grade and lamp. Pure data; the renderer applies it.
 */
import type { BossMemory } from '../data/bosses';
import { zoneDef } from '../data/zones';
import type { ArenaDef } from '../data/zones/testArena';
import { STORM } from '../world/storm';

export type Atmosphere = Pick<ArenaDef, 'fog' | 'ambient' | 'playerLight'> & Partial<Pick<ArenaDef, 'hemisphere' | 'grade' | 'dark'>>;

const SOURCE: Record<BossMemory['look'], string> = {
  ash: 'zone.cinder_flats',
  fire: 'zone.refinery_district',
  jungle: 'zone.hydroponic_vaults',
  dark: 'zone.deep_mines',
};

/** The atmosphere of a memory: the source region's own, with the ash storm's thick brown fog for the ash fields. */
export function memoryAtmosphere(look: BossMemory['look']): Atmosphere {
  const d = zoneDef(SOURCE[look]);
  const base: Atmosphere = { fog: d.fog, ambient: d.ambient, playerLight: d.playerLight, hemisphere: d.hemisphere, grade: d.grade, dark: d.dark };
  if (look === 'ash') return { ...base, fog: { color: '#2a2219', density: d.fog.density + STORM.fog } };
  return base;
}
