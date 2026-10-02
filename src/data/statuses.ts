/** Status effect definitions. Magnitudes and durations come from whatever applies them. */
import type { z } from 'zod';
import type { StatusDefSchema, StatusId } from './schemas';

export const STATUSES: Record<StatusId, z.input<typeof StatusDefSchema>> = {
  burning: { kind: 'dot', damageType: 'heat', stacking: 'refresh', color: '#ff7a1a' },
  poisoned: { kind: 'dot', damageType: 'toxic', stacking: 'stack', maxStacks: 5, color: '#7dff5a' },
  chilled: { kind: 'slow', slow: 0.35, color: '#7ec8ff' },
  frozen: { kind: 'disable', color: '#bfe8ff' },
  stunned: { kind: 'disable', color: '#ffe066' },
  vulnerable: { kind: 'vulnerable', damageTakenMultiplier: 1.2, color: '#c77dff' },
  barrier: { kind: 'barrier', color: '#9fd8ff' },
  marked: { kind: 'mark', damageTakenMultiplier: 1.25, refund: 15, color: '#ff4a6a' },
  stealth: { kind: 'buff', color: '#5a6a80' },
  evasive: { kind: 'buff', color: '#c9c2b6' },
};
