/**
 * NPC barks (round 4, D09): every hub NPC mutters three idle lines when the player walks by, and has two reactions
 * to the player's progress: the first once the region's campaign is finished, the second once the player has
 * reached the region's level cap. Text: lang barks.<npc>.idle.<0-2> and barks.<npc>.react.<0-1>.
 */
export const BARK_NPCS: readonly string[] = [
  'benny', 'hekla', 'pell', 'tomas',
  'mara', 'gus', 'ines', 'tobin',
  'okafor', 'quill', 'brann', 'dace',
  'brask', 'oona', 'gerd', 'nils',
  'maren', 'wren', 'idris', 'hekla_core', 'gus_core', 'dace_core', 'brask_core',
];

export const BARK_IDLE_LINES = 3;
export const BARK_REACT_LINES = 2;

/** The quest that ends each region's campaign. */
export const BARK_CAMPAIGN_END: Readonly<Record<string, string>> = {
  'zone.cinder_flats': 'mq.the_first',
  'zone.refinery_district': 'mq.vire',
  'zone.hydroponic_vaults': 'mq.mother_tree',
  'zone.deep_mines': 'mq.governor',
  'zone.the_core': 'mq.one_who_remembers',
};

export const BARK_RADIUS = 7;
/** Seconds before the same NPC speaks again, and before any NPC does. */
export const BARK_NPC_COOLDOWN = 60;
export const BARK_ANY_COOLDOWN = 12;
