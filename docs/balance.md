# Balance (Phase 4c)

Two tools, both using the real combat systems:

- `npm run sim` — DPS of sample builds against a neutral training dummy (armor 30, no resistances).
  Good for comparing raw damage after data changes.
- `npm run play` — a bot plays the test-arena waves from level 1 to 10 with every plan in
  `scripts/sim/plans.ts` (three per class) while enemies fight back. It moves, kites or closes in,
  uses a priority rotation, drinks potions, dodges ~35 % of telegraphed attacks, spends skill points
  along a build order, picks up loot and equips upgrades. Options: `--seeds a,b,c`, `--filter spectre`,
  `--minutes 40`; `PLAY_TAKEN=1` prints damage taken by type, `PLAY_ACTIVITY=1` time spent
  casting/moving/idle, `PLAY_TRACE=1` a timeline.

## Level 1 → 10 results (3 seeds each)

| Build | Time to L10 | Deaths |
|---|---|---|
| Bastion · Seismic Shock | 9:23–9:40 | 0 |
| Bastion · Furnace Cleave | 9:47–10:24 | 0 |
| Bastion · Strike tank | 9:13–11:21 | 1–2 |
| Spectre · Sniper | 7:59–9:30 | 0–1 |
| Spectre · Trapper | 11:55–12:28 | 0 |
| Spectre · Blades (melee) | 12:20–13:14 | 4–9 |
| Xenomant · Minions | 7:13–8:53 | 0–1 |
| Xenomant · Disease | 7:06–8:46 | 0 |
| Xenomant · Leech (melee) | 12:08–12:47 | 2–5 |

Target band: every build reaches level 10 in roughly 7–13 minutes. The two melee builds of the
ranged classes are the high-risk/high-reward options; Bastion is the safe melee class. The bot is a
weak player (poor dodging, no pathfinding), so real players should die less.

## What the playthroughs found and what changed
- **Knockback hurt melee**: Seismic Shock threw enemies 5 m away, so Bastion spent 60 % of fights
  walking back. Knockback halved on Bastion's damage skills (strike 0.8, shock 2.5, cleave 1).
- **Drones out-ranged ranged classes**: drone bolts were ~90 % of the damage ranged builds took
  (they stand in the drones' 7–11 m band). Drones now back away at half speed and deal 10 (was 12).
- **Bastion** was slowest: +damage (strike 1.05, shock 2.7, cleave 2.7) and move speed 5.8.
- **Spectre** was fragile: life 205 (+14/level), armor 45, dodge cooldown 1.6 s, Smoke Cloak heals
  10 % with a 12 s cooldown, Vibro Slash 0.95, Pistol Barrage 0.65 in a 40° fan.
- **Xenomant** ranged builds were twice as fast as everything else: Spore Dart 0.42 (+0.22 poison),
  Spore Burst costs 30 and poisons for 0.42× per second, minions 0.6×. Melee: Scalpel Slash 1.0,
  Parasite Link 0.6 per tick.

## DPS on the training dummy (60 s, seeded)
| Build | DPS |
|---|---|
| Bastion L1 / L10 | 30 / 158 |
| Spectre L1 / L10 sniper / trapper / blades | 26 / 124 / 125 / 227 |
| Xenomant L1 / L10 minions / disease / melee | 26 / 120 / 100 / 158 |

The dummy does not fight back or move, so area builds (disease, trapper) look weaker here than in
the playthroughs, and melee looks stronger.
