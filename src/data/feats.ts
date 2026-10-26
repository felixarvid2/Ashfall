/**
 * Feats (D12): about twenty local achievements. Each is a goal on one account-wide counter (kills, uniques,
 * rift clears and so on); the counters live in `account.feats.stats` and are fed by `systems/feats.ts`.
 * A feat with `title: true` also grants a cosmetic title (D13), shown under the hero's name on character select.
 * Names, descriptions and titles: lang/en.json → feats.<id>. Icons are existing files in public/assets/icons.
 */

/** The counters feats are measured on. `riftBest`, `classesAt10` and `level` are derived or maxima, the rest only go up. */
export type FeatStat = 'kills' | 'elites' | 'bosses' | 'uniques' | 'mythics' | 'riftsCleared' | 'riftBest' | 'dailyRifts' | 'level' | 'classesAt10' | 'quests';

export interface FeatDef {
  id: string;
  stat: FeatStat;
  goal: number;
  /** File name (without extension) in public/assets/icons. */
  icon: string;
  /** Grants a cosmetic title called `feats.<id>.title`. */
  title?: boolean;
}

export const FEATS: readonly FeatDef[] = [
  { id: 'first_blood', stat: 'kills', goal: 100, icon: 'vibroblade' },
  { id: 'exterminator', stat: 'kills', goal: 1000, icon: 'hydraulic_hammer' },
  { id: 'ashwalker', stat: 'kills', goal: 10000, icon: 'skill_wrath_of_lumen', title: true },
  { id: 'elite_hunter', stat: 'elites', goal: 25, icon: 'skill_death_mark' },
  { id: 'elite_bane', stat: 'elites', goal: 250, icon: 'skill_piercing_shot', title: true },
  { id: 'boss_slayer', stat: 'bosses', goal: 1, icon: 'skill_orbital_strike' },
  { id: 'boss_hunter', stat: 'bosses', goal: 5, icon: 'power_sword' },
  { id: 'boss_bane', stat: 'bosses', goal: 20, icon: 'skill_seismic_shock', title: true },
  { id: 'lucky_find', stat: 'uniques', goal: 1, icon: 'crystal_ember' },
  { id: 'collector', stat: 'uniques', goal: 10, icon: 'crystal_void', title: true },
  { id: 'mythic_find', stat: 'mythics', goal: 1, icon: 'crystal_lumen', title: true },
  { id: 'rift_runner', stat: 'riftsCleared', goal: 1, icon: 'skill_phase_shift' },
  { id: 'rift_veteran', stat: 'riftsCleared', goal: 10, icon: 'skill_rocket_leap' },
  { id: 'rift_master', stat: 'riftsCleared', goal: 50, icon: 'skill_holy_light', title: true },
  { id: 'deep_diver', stat: 'riftBest', goal: 20, icon: 'skill_magnetic_pull' },
  { id: 'abyss_walker', stat: 'riftBest', goal: 50, icon: 'skill_sanctuary', title: true },
  { id: 'daily_grind', stat: 'dailyRifts', goal: 1, icon: 'lore_log' },
  { id: 'veteran', stat: 'level', goal: 30, icon: 'combat_helm' },
  { id: 'four_paths', stat: 'classesAt10', goal: 4, icon: 'echo_relic', title: true },
  { id: 'errand_runner', stat: 'quests', goal: 10, icon: 'keycard' },
  { id: 'wasteland_hand', stat: 'quests', goal: 50, icon: 'signal_pendant', title: true },
];

export const FEAT_DEFS: ReadonlyMap<string, FeatDef> = new Map(FEATS.map((f) => [f.id, f]));
