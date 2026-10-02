/** Phase 1 test arena waves. After the last wave it repeats with more life (endless). */
import type { z } from 'zod';
import type { EncounterSchema } from './schemas';

export const TEST_ARENA_WAVES: z.input<typeof EncounterSchema> = {
  id: 'encounter.test_arena',
  spawnRing: [13, 20],
  groupSpread: 3,
  intermission: 3,
  endlessLifeScale: 0.15,
  waves: [
    { groups: [{ enemy: 'infected_colonist', count: 6 }] },
    { groups: [{ enemy: 'infected_colonist', count: 6 }, { enemy: 'security_drone', count: 3 }] },
    {
      groups: [
        { enemy: 'infected_colonist', count: 8 },
        { enemy: 'security_drone', count: 2 },
        { enemy: 'spore_carrier', count: 1 },
      ],
    },
    {
      groups: [
        { enemy: 'infected_colonist', count: 10 },
        { enemy: 'security_drone', count: 4 },
        { enemy: 'spore_carrier', count: 2 },
      ],
    },
    {
      groups: [
        { enemy: 'infected_colonist', count: 14 },
        { enemy: 'security_drone', count: 6 },
        { enemy: 'spore_carrier', count: 3 },
      ],
    },
  ],
};
