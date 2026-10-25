# Balance (Phase 4c, refreshed in the 2026-10-25 improvement pass)

Three tools, all using the real combat systems:

- `npm run sim` — DPS of sample builds against a training dummy (armor 30, no resistances). Good for comparing
  raw damage after data changes. Options: `--seconds 60`, `--filter <text>` (build name), `--dummy <enemyId>`
  (default `spore_carrier`, a lumen enemy, so *corrupted*: the Lightbearer's bonus applies; use
  `security_trooper` for a neutral target) and `--pack <n>` (n dummies on a 2.2 m ring, damage summed). The ten
  `L30 (Class) ...` builds are the intended builds of every class at level 30 with a rare weapon and no
  uniques or aspects: `npm run sim -- --filter "L30 (" --dummy security_trooper --pack 5`.
- `npm run play` — a bot plays the test-arena waves from level 1 to 10 with every plan in
  `scripts/sim/plans.ts` (three per class) while enemies fight back. It moves, kites or closes in,
  uses a priority rotation, drinks potions, dodges ~35 % of telegraphed attacks, spends skill points
  along a build order, picks up loot and equips upgrades. Melee plans only fire projectile skills (the
  fallback starter) at targets within 4 m, so they walk up to drones instead of shooting from where they
  stand. Options: `--seeds a,b,c`, `--filter spectre`, `--minutes 40`; `PLAY_TAKEN=1` prints damage taken
  by type, `PLAY_ACTIVITY=1` time spent casting/moving/idle, `PLAY_TRACE=1` a timeline.
- `npm run balance:check` — `BALANCE=1 vitest run tests/balance.test.ts`: every plan, two seeds, level 10 must
  land between 6:30 and 14:00 with at most 5 deaths (the Blades get a 15:30 ceiling, see below). About
  5 minutes, so it is a manual or nightly check. The normal `npx vitest run` runs the same file without the
  flag: the class table in `docs/classes.md` against the data, the balance-pass numbers, and a level 1 to 4
  bot playthrough of every plan (about 12 s).

## Level 1 → 10 results (bot, seeds a / b)

| Build | Time to L10 | Deaths |
|---|---|---|
| Bastion · Seismic Shock | 7:23 / 7:33 | 0 / 0 |
| Bastion · Furnace Cleave | 10:24 / 11:13 | 0 / 0 |
| Bastion · Strike tank | 10:20 / 9:52 | 2 / 1 |
| Spectre · Sniper | 11:03 / 11:45 | 0 / 0 |
| Spectre · Trapper | 12:19 / 11:48 | 2 / 0 |
| Spectre · Blades (melee) | 12:43 / 15:08 | 0 / 0 |
| Xenomant · Minions | 7:01 / 7:22 | 0 / 0 |
| Xenomant · Disease | 6:39 / 7:18 | 0 / 0 |
| Xenomant · Leech (melee) | 13:08 / 10:47 | 0 / 0 |
| Lightbearer · Healer | 12:49 / 11:17 | 0 / 0 |
| Lightbearer · Exorcist | 8:10 / 6:18 | 0 / 0 |
| Lightbearer · Shepherd | 12:51 / 11:45 | 0 / 0 |

Target band: every build reaches level 10 in 6:30–14:00 with at most 5 deaths (`tests/balance.test.ts`). The
Spectre Blades are the one build allowed up to 15:30: it is the high-risk melee line of a ranged class, and the
bot needs 12:40–15:10 for it over the seeds measured. Before the pass the table read (seed a / b): Shock 7:43 /
8:07, Furnace Cleave 11:19 / 12:08, Sniper 12:27 / 10:47, Blades 16:45 / 15:35 with 11 / 7 deaths, Minions
8:08 / 8:14, Disease 7:39 / 7:36, Leech 11:54 / 13:06, Healer 23:26 / 16:16, Shepherd 16:15 / 13:38. The bot is a
weak player (poor dodging, no pathfinding), so real players should die less. The Lightbearer rows come from the
Lightbearer pass (G001-G008) and were measured when this table was refreshed; its exorcist seed b is under the
6:30 floor, which `npm run balance:check` will flag.

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

## Level 30 builds (`npm run sim`, 60 s)
| Build | corrupted dummy | neutral dummy | pack of 5 (neutral) |
|---|---|---|---|
| Bastion shockwave (Shock, Strike, Orbital) | 893 | 893 | 2,802 |
| Spectre sniper (Piercing, Death Mark) | 650 | 650 | 1,629 |
| Spectre trapper (mines, grenade) | 648 | 554 | 1,935 |
| Spectre blades (Vibro, Smoke, Death Mark) | 776 | 776 | 1,599 |
| Xenomant disease (Spore Burst) | 502 | 502 | 2,082 |
| Xenomant minions (Raise Corpse) | 566 | 567 | 701 |
| Xenomant melee (Scalpel, Link) | 658 | 658 | 658 |
| Lightbearer exorcist (Magnus, Lex Aeterna) | 993 | 607 | 2,228 |
| Lightbearer healer (Heal, Sanctuary) | 272 | 102 | 125 |
| Lightbearer shepherd (Guardian Lights, Blessing) | 542 | 416 | 427 |

Read the neutral column for bosses and elites (they have no pack) and the pack column for trash. The melee
Xenomant does not gain from a pack because Scalpel and Parasite Link hit one target; the minion build's pack
number is the minions' own targets. Other L30 reference builds: Reactor Core vent 744, Shockwave Engine with
Fist of Kharos 972, Heart of Lumen 1,101.

## DPS on the training dummy (60 s, seeded, corrupted dummy)
| Build | DPS |
|---|---|
| Bastion L1 / L10 | 30 / 158 |
| Spectre L1 / L10 sniper / trapper / blades | 27 / 125 / 128 / 231 |
| Xenomant L1 / L10 minions / disease / melee | 29 / 125 / 113 / 158 |
| Lightbearer L1 / L10 healer / exorcist / L15 shepherd | 39 / 100 / 165 / 185 |

The dummy does not fight back or move, so area builds (disease, trapper) look weaker on a single dummy
than in the playthroughs, and melee looks stronger; use `--pack 5` to see the area builds.

## 2026-10-25 pass (G009-G017, G025)
- **Percentage passives** (`maxLifePct`, `armorPct`): Reinforced Plating, Kevlar Weave, Thick Hide +4 % armor
  per rank; Vital Systems, Survival Instinct, Cell Division +2.5 % life per rank. At level 30 each rank is worth
  1.5-3 % of the base instead of under 1 %.
- **Spectre Blades**: energy resistance 10 to 20 %, Phase Shift protects 0.4 s (was 0.25). With only the data
  change the bot went from 11 / 7 deaths to 3 / 3 (15:42 / 14:54); once melee plans stopped shooting the
  starter dart from where they stood (the bot would cast Quick Shot at a drone 11 m away for a minute without
  moving), deaths fell to 0 / 0 and the time to 12:43 / 15:08. Drone bolts: 10,658 energy damage taken to 2,648.
- **Bastion**: Piston Jab arc 50 to 90, Furnace Cleave arc 170 to 200 (Cleave 11:19 / 12:08 to 10:24 / 11:13;
  the single-dummy L15 row stays 346). Orbital Strike 9 to 16x weapon damage (3.7 % of the shockwave build to
  8.8 %); Heat Vent 2 + 0.10 x Heat (was 1 + 0.04 x Heat), cooldown 10 s (the vent build 601 to 744).
- **Xenomant**: Symbiote's x1.25 also names Parasite Link (a ranged tether): +10 % to +25 % on the melee build.
  Disease: Spore Dart poison 0.22 to 0.3, Spore Burst hit 0.6 to 1.0 and cloud 0.42 to 0.44, Pandemic x1.3 to
  x1.9 on Poisoned enemies (the key passive carries most of it, so the level 1-10 bot stays at 6:39-7:18).
  Disease single target 390 to 502, pack of 5 1,696 to 2,082 (4.1x).
- **Potions** recharge 0.75 s faster per kill (elite 3 s, boss 8 s).
- **Fast wind-ups**: hounds and swarms wait at least 0.40-0.45 s before they bite, and lunges and flankers show their
  red telegraph 0.15 s before the wind-up (their cooldown is shorter by the same amount, so damage per second is
  unchanged).

## Progression pass (G018-G024, C011)
- **Death toll (G018):** respawning after a campaign death (open world and dungeons; not Rifts or the Endless Shaft,
  which end the run) costs 5 % of carried gold (at most 40 x level) and half the potion charges (rounded down, at
  least 1 if any were left). No durability, no XP loss, nothing lost that a few kills do not return.
- **Kill-XP fall-off (G019):** above the zone's top level a kill gives `max(0.1, 1 - 0.3 x levels over)` of its XP
  (0.7 at +1, 0.4 at +2, 0.1 from +3). Not applied under World Tier 2+ or in Rifts, where monsters follow the
  player. Quest XP is untouched. `killXp(table, level, { playerLevel, zoneMaxLevel })`.
- **Quest XP (G020):** Deep Mines x0.52 (156,800 to 81,550; 80 % of the 102,086 XP the band needs), the Core x0.38
  (312,600 to 118,800; 81 % of 147,525). Relative values between quests kept (rounded to 50).
- **Ranged share (G021):** weighted open-world pack members that shoot: Refinery 0.2 % to 13.6 %, Vaults 0.2 % to
  13.4 %, Mines 2.0 % to 12.6 % (Cinder Flats 9.3 %, Core 20.3 % unchanged). Security drones, governor drones and a few
  troopers join 15 templates (`src/data/packs.ts`); no enemy definitions were changed.
- **Strongholds (G022):** life x(1 + 0.035 x (level - 1)) (was 0.12). Stronghold life against the zone boss at the
  region's top level: Hale 5,995 to 3,790 (0.72 to 0.45 of The First), Brother Ash 18,847 to 9,567 (1.18 to 0.60 of
  Vire), Gamma Bloom 72,451 to 32,587 (2.16 to 0.97 of the Warden), Holm 77,441 to 32,244 (1.61 to 0.67 of Kade).
- **Elites (G023):** rare life x(4 + 0.05 x level) and damage x(1.5 + 0.01 x level); champion life x(2 + 0.02 x level);
  rares get 5 affixes from level 30. A level-45 rare: life x6.25 (was x4), damage x1.95 (was x1.5).
- **Rift damage (G024):** see docs/endgame.md; rift 40 damage x4.0 instead of x10.3.
