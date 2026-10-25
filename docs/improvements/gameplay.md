# Gameplay and balance: 25 improvements (G001-G025)

Audit only; no source was edited. Every change is data or logic, needs no paid art and no UI, and has a test or a sim command with an expected result.

## Summary

The four classes are close on paper, but the new Lightbearer sits at both ends of the scale. Its exorcist line has two uncapped stacking paths (pulse interval and overlapping sigils) that turn a 1,111 DPS L30 build into 3,056 DPS (3.6x Bastion), and its Benediction can keep "cannot die" up for roughly 89 % of the time. Its healer and shepherd lines are the opposite: 16-23 minutes to level 10 against a 7-13 minute target, and 71-101 DPS on a non-corrupted target. Almost every published Lightbearer number includes a corrupted-enemy bonus, because the sim dummy is a Lumen spore carrier.

Outside the Lightbearer the biggest problems are the leveling and difficulty curve: a full clear of Cinder Flats ends at level 23 (the zone caps at 10), the Deep Mines and Core quest XP is 154 % and 212 % of the XP the region's levels need, strongholds outlast the zone boss in regions 3-4, and Deep Rift damage grows 4x faster than World Tier 4 damage at rift 40. Death costs nothing in the campaign, although `docs/world-and-gameplay.md` section 13 specifies durability damage.

Top 5 (value per effort): G001, G002, G006, G019, G024. Next: G005, G010, G011, G012.

Coverage: skills, classes, potions, death, levelling, bosses, elites, endgame scaling and enemy data are covered. Enemy AI is covered through data and wind-up timing only (G021, G025): I read the melee and elite code and found no behaviour defect, but did not step through the other AI states. Region 2-5 difficulty is estimated from enemy data and gear tables, because the bot only plays levels 1-10 (G010/G011 propose how to extend it).

## How the numbers were produced (and what is not committed)

- Existing tools, run as is: `npm run sim` (dummy DPS), `npm run play -- --seeds a,b` (bot playthrough L1 to L10, 24 runs, about 5 min), `PLAY_TAKEN=1 PLAY_ACTIVITY=1` for damage taken and time use. `npm run region:report` was only read: it prints layout estimates and reuses the same bot kill rate, it has no per-level balance data. `tests/sim.test.ts` and `tests/playthrough.test.ts` only assert "damage grows with level" and "each class reaches level 3", so nothing in CI guards the balance.
- Temporary harness (scratchpad, **not in the repo**; G010 proposes to upstream it): a copy of `scripts/sim/sim.ts` with two options, `dummy` (any enemy id; `sim.ts:140` hard-codes `spore_carrier`, family `lumen`, which counts as corrupted) and `pack` (N stationary dummies on a 2.2 m ring). With it I built one L30 build per intended build of every class (25-29 skill points, a rare weapon at item power 250, no aspects unless stated) and ablated single nodes. Neutral target = `security_trooper` (human), armor 30, no resists.
- Gear, enemy and XP tables were computed with small scripts that import `src/data/*` (zone packs, `ENEMY_DEFS`, `dropTable`, `xpToNext`, `killXp`). "Ref DPS" for boss time-to-kill is the Bastion L10/L30 sim (158 / 859) interpolated and extended by 32 per level, so boss TTK values are relative, not absolute.

### L30 DPS per build (60 s, single target unless stated)

| Build | corrupted dummy | neutral dummy | pack of 5 (neutral) | key passive worth (neutral) |
|---|---|---|---|---|
| Bastion shockwave (Shock, Strike, Orbital) | 859 | 859 | 2,627 | +29 % |
| Spectre sniper (Piercing, Death Mark) | 715 | 715 | 707 | +33 % |
| Spectre trapper (mines, grenade) | 649 | 645 | 2,148 | +23 % |
| Spectre blades (Vibro, Phase, Smoke) | 892 | 891 | 1,321 | +14 % |
| Xenomant disease (Spore Burst) | 390 | 390 | 1,696 | +21 % |
| Xenomant minions (Raise Corpse) | 509 | 509 | 635 | +26 % |
| Xenomant melee (Scalpel, Link) | 622 | 622 | 876 | +11 % |
| Lightbearer exorcist (Magnus, zealot) | **979** | **456** | 1,842 | +30 % |
| Lightbearer healer (Heal, Sanctuary, devout) | 326 | **71** | 101 | 0 % |
| Lightbearer shepherd (2 lights, Blessing) | 365 | 227 | 239 | +44 % |

### Bot playthrough now (seeds a / b, L5 and L10 time, deaths) against `docs/balance.md`

| Plan | now | balance.md |
|---|---|---|
| Bastion Seismic Shock | 7:43 / 8:07, 0 | 9:23-9:40, 0 |
| Bastion Furnace Cleave | 11:19 / 12:08, 0 | 9:47-10:24, 0 |
| Bastion Strike tank | 10:43 / 9:41, 2 / 2 | 9:13-11:21, 1-2 |
| Spectre Sniper | 12:27 / 10:47, 0 / 2 | 7:59-9:30, 0-1 |
| Spectre Trapper | 12:23 / 12:47, 2 / 2 | 11:55-12:28, 0 |
| Spectre Blades | 16:45 / 15:35, **11 / 7** | 12:20-13:14, 4-9 |
| Xenomant Minions | 8:08 / 8:14, 1 / 0 | 7:13-8:53 |
| Xenomant Disease | 7:39 / 7:36, 0 | 7:06-8:46 |
| Xenomant Leech | 11:54 / 13:06, 0 | 12:08-12:47, 2-5 |
| Lightbearer Healer | **23:26 / 16:16**, 0 | not listed |
| Lightbearer Exorcist | 8:33 / 9:03, 0 / 1 | not listed |
| Lightbearer Shepherd | **16:15 / 13:38**, 0 | not listed |

Target band (docs/balance.md): every build reaches L10 in 7-13 minutes. 7 of 24 runs are outside it; the spread is 7:36 to 23:26.

## Lightbearer

### G001 - Magnus Exorcismus has no pulse floor and its sigils stack [measured], P1, M
- **Area:** Class balance (Lightbearer exorcist).
- **Problem:** `interval` modifiers from the key passive, a node and aspects are summed into one multiplier (`skillCompile.ts:158`), and `pulsesLeft = round(duration / interval)` (`lightbearer.ts:108`). Each cast also creates a new Sanctum entity (`lightbearer.ts:96-111`), and with 2 s cooldown and 4.8 s duration two or three sigils overlap. Measured on the L30 exorcist (corrupted dummy): `k.zealot` 743 DPS, plus `rapid` 1,111 (+49 % for one node), plus a Radiant aspect 1,333, plus a Litany aspect (-0.3) **3,056** (neutral dummy: 1,383). That is 3.6x the aspect-less Bastion build (859), or about 3x the geared Bastion builds in `builds.ts` (928-1,049), and the interval is `0.8 x (1 - 0.2 - 0.3 - 0.3)` = 0.16 s, 30 pulses per sigil. The content note that `rapid` gives about 8.6 pulses is this effect seen from one node. The other content note, `k.zealot` stacking with the Radiant aspect and `p.sacred_flame`, is **not** a defect: they sit in separate multiplicative buckets by design (`damage-formula.md`), and Radiant added exactly its face value (1,111 to 1,333, +20 %); cap ranged multipliers only if the owner wants that as a separate decision.
- **Change:** (a) Clamp the `interval` of a sanctum to at least 0.35 s after all mods (`fieldAccess` for `interval`, or `Math.max` in `castSanctum`). (b) At most two live Magnus sigils per owner: a third cast removes the oldest. (c) Litany range 0.15-0.30 to 0.08-0.15. Target: the same build with Litany and Radiant at or under 1.6x the aspect-less Bastion shockwave build (about 1,370), and `rapid` still worth about +25 %.
- **Files:** `src/systems/lightbearer.ts`, `src/systems/skillCompile.ts`, `src/data/loot/aspects.ts:95`, `tests/lightbearer.test.ts`.
- **Verify:** new tests: compile Magnus with mods -0.2, -0.3, -0.3 and assert interval >= 0.35; cast Magnus four times in 3 s and assert at most two `Sanctum` entities of that skill; the harness build above reports <= 1,400 DPS on the corrupted dummy.

### G002 - Benediction can keep "cannot die" up almost permanently [code + arithmetic], P1, S
- **Area:** Class balance / survivability.
- **Problem:** the ultimate applies `benediction` for 8 s (`skills/lightbearer.ts:212`; `cheatDeath` in `statuses.ts:28`, enforced at `combat.ts:339`) on a 60 s cooldown (`skills/lightbearer.ts:204`). Cooldown mods are one additive sum: Enhancement -0.2 (`skillTree/lightbearer.ts:103`), Afterglow -0.2 (`:107`), Daybreak aspect up to -0.3 (`aspects.ts:105`) gives `60 x 0.3` = 18 s, and the 50 % cooldown-reduction cap (`stats.ts:40`, applied at `skills.ts:176`) gives **9 s against an 8 s duration**, about 89 % uptime. Without the aspect it is 18 s (44 %). The status also takes 20 % less damage (`damageTakenMul` 0.8). No other class has a comparable reset.
- **Change:** make the cheat-death a single save: the first lethal blow it stops removes the status and grants 1.5 s of `Invulnerable`; add a skill-level cooldown floor (`minCooldown: 30`) honoured after all reductions. Keep the heal, cleanse and stun.
- **Files:** `src/systems/combat.ts:339,373`, `src/data/statuses.ts`, `src/data/skills/lightbearer.ts`, `src/systems/skills.ts:176`, `src/data/schemas.ts` (skill field).
- **Verify:** extend `tests/lightbearer.test.ts` (case at line 228): after one stopped blow the second lethal blow kills; compile Benediction with the full reductions and CDR 0.5 and assert the effective cooldown >= 30 s.

### G003 - Sanctuary casts stack, and the Halo uptime is 47 % before other sources [code + arithmetic], P2, S
- **Area:** Class balance.
- **Problem:** `halo_of_the_penitent` doubles duration and adds 40 % radius at +50 % cooldown (`uniques.ts:190-212`): 14 s of a 30 s cooldown = 47 % (the content note). The duration mods are additive: Halo +1.0, `e.sanctuary` +0.3, a Hallowed aspect +0.2-0.4 gives 7 x 2.7 = 18.9 s, and with the CDR cap the cooldown is 15 s: more than 100 % uptime, and every cast is a separate `Sanctum` entity, so two zones heal 4 % x 1.35 per second each and hit enemies twice. Sanctuary heals every ally every second, so the stack is a flat doubling of the strongest sustain in the kit.
- **Change:** recasting Sanctuary refreshes the owner's existing zone instead of adding one (same rule as G001's cap, `maxConcurrent: 1` in the skill data); cap total duration scaling at x2.5. Leave Halo's 47 % base uptime.
- **Files:** `src/systems/lightbearer.ts` (`castSanctum`), `src/data/skills/lightbearer.ts`, `src/data/schemas.ts`.
- **Verify:** `tests/lightbearer.test.ts`: two casts leave one `Sanctum` and ally healing per second equals one zone's; compile with all three duration sources and assert duration <= 17.5 s.

### G004 - Lex Aeterna lowers the exorcist's DPS and its modifier does nothing [measured], P2, S
- **Area:** Skill weakness.
- **Problem:** the mark doubles the next hit on each marked enemy once (`statuses.ts:29`, consumed on hit). In the L30 exorcist that next hit is a 0.45 Holy Light or a Magnus pulse (0.65). Measured, same build: with Lex in the rotation 1,111 DPS, without 1,188 (-6.5 %; neutral dummy 513 against 546); replacing it with Blessing gives 577 against 533 (+8 %). `m.lex_aeterna.judgment` (burst coefficient x2, 0.3 to 0.6, `skillTree/lightbearer.ts:83`) moves the build from 1,111 to 1,116. It is a class-defining tactical slot that is a net loss to cast.
- **Change:** make Lex a non-consuming "Judged" debuff: +35 % damage taken for 6 s from every source (like Marked's 1.25), burst coefficient 0.3 to 0.8; Judgment becomes +4 s duration and +1.5 m radius; Swift stays.
- **Files:** `src/data/statuses.ts:29`, `src/data/skills/lightbearer.ts:159-176`, `src/data/skillTree/lightbearer.ts:80-85`, `src/systems/combat.ts` (consume path), `tests/lightbearer.test.ts:181-195`.
- **Verify:** harness exorcist with Lex >= 8 % above the same rotation without it; the test at line 181 becomes "takes 1.35x for 6 s and is not used up".

### G005 - Lightbearer damage depends on a 1.5-2.2x corrupted bonus the sim dummy always grants [measured], P1, M
- **Area:** Class balance across enemy mix.
- **Problem:** `corruptedMul` is 1.25 (Censer), 1.5 (Holy Light, guardian bolt), 1.8 (Magnus), 2.0 (Sanctuary), plus `k.zealot` x1.25 (`skills/lightbearer.ts`, `skillTree/lightbearer.ts:121`). The L30 exorcist does 979 on a corrupted target and 456 on a human one (x2.15); the healer 326 against 71 (x4.6). `npm run sim` and `docs/balance.md` always use the corrupted dummy (`sim.ts:140`), so the published "Lightbearer L10 exorcist 190.6 against Bastion 158.1" is the best case. Open-world spawns that are corrupted (infected or lumen, weighted by pack templates): Cinder 77 %, Refinery 56 %, Vaults 57 %, Mines 78 %, Core 67 % (the Core's `light` family, 22 % of spawns, is not corrupted). The class is therefore strong in regions 1 and 4, mediocre in 2 and 3, and the damage floor on machines and humans is too low to solo.
- **Change:** pull the multipliers in and move the budget to base damage: Censer 1.25 to 1.2, Holy Light 1.5 to 1.3, Magnus 1.8 to 1.5 (coefficient 0.65 to 0.78), Sanctuary 2.0 to 1.6, guardian bolt 1.5 to 1.3, zealot corrupted bonus 0.25 to 0.15. Optional, owner's call: add `light` to `CORRUPTED_FAMILIES` (`schemas.ts:461`) since Light Beings and the Choir are Lumen constructs. Target: neutral/corrupted DPS ratio >= 0.58 for exorcist (now 0.47) and >= 0.4 for healer (now 0.22).
- **Files:** `src/data/skills/lightbearer.ts`, `src/data/skillTree/lightbearer.ts:121`, `src/data/schemas.ts:461`, `docs/classes.md`.
- **Verify:** with G010 (`npm run sim -- --dummy security_trooper`) the ratios above; `tests/lightbearer.test.ts:434` (multiplies damage against infected and lumen only) updated to the new values.

### G006 - Holy Light is weaker than any other basic, and the healer and shepherd lines level too slowly [measured], P1, S
- **Area:** Leveling speed / skill weakness.
- **Problem:** coefficient per second of cast time (cast + recovery): Holy Light **1.50** (0.45 / 0.30 s), Censer Strike 3.33, Quick Shot 2.71, Spore Dart 1.62 (plus poison), Scalpel 4.00, Hydraulic Strike 3.09. The Lightbearer's own melee basic is 2.2x its ranged one: at L30 "censer only" is 202 DPS, "Holy Light only" 111 (neutral dummy). Bot, level 10: Healer 23:26 / 16:16 (L5 at 5:25 / 4:11 against 1:41-3:04 for most plans), Shepherd 16:15 / 13:38, kill rate 0.20-0.29 kills/s against 0.55-0.61 (Seismic, Minions, Exorcist). The slow plans take the most damage (Healer 16,256 over the run, 11.6 per second) because fights last longer.
- **Change:** Holy Light coefficient 0.45 to 0.65 and `recovery` 0.18 to 0.14 (about 2.5 coefficient per second, still under Quick Shot); keep homing. Pair with G005 (lower multipliers) and G007 (less self-sustain) so the class gets more kills and less safety rather than just more of both.
- **Files:** `src/data/skills/lightbearer.ts:32-53`, `docs/classes.md`, `docs/balance.md`.
- **Verify:** `npm run sim` row "Lightbearer L10 healer" from 94.6 to >= 135; `npm run play -- --filter lightbearer --seeds a,b`: Healer and Shepherd L10 <= 13:00, deaths <= 1.

### G007 - Heal out-heals potions 9 to 1 and Devotion never runs short [measured], P2, S
- **Area:** Resource economy / sustain.
- **Problem:** Heal costs 25 Devotion on a 1.5 s cooldown (`skills/lightbearer.ts:56-78`) and heals 15 % of max life per rank-1 cast, 26.7 % at rank 5 with Devout (0.15 x 1.35 x 1.32). The L30 healer casts it 42 times in 60 s: **18.7 % of max life per second to itself**, against the potion's 1.9 % per second (35 % every 18 s). From the enemy table, one attacking enemy deals roughly 2-3.5 % of the player's max life per second after mitigation. Devotion average is 85 of 100 in the L30 healer sim (72 at L10): each basic adds 5-6 (`resourceGain`; about 9 per second in the sim rotation, 16 if only basics were cast), idle adds +3 per second, and every Heal refunds 7-13 more, which together pay the 25 cost on every cooldown. Bot: Healer 0 deaths with the highest average life (79-81 %) of any plan.
- **Change:** Heal cost 25 to 35, cooldown 1.5 to 2.5 s, Holy Light gain 5 to 3 and Censer 6 to 4; keep the 0.5 Devotion per 1 % healed refund. Target about 9 % of max life per second sustained.
- **Files:** `src/data/skills/lightbearer.ts`, `src/data/classes/lightbearer.ts:28-30`.
- **Verify:** harness healer: average Devotion <= 60 and Heal casts <= 28 per 60 s; `npm run play -- --filter healer`: deaths <= 2, average life 65-75 % (only valid with G006 in place).

### G008 - Guardian Light is worth less than one Holy Light [measured], P2, S
- **Area:** Skill weakness / shepherd build.
- **Problem:** a light fires 0.4 coefficient every 0.9 s (`skills/lightbearer.ts:192-193`) = 0.44 per second, two lights 0.89, which is below Holy Light alone (1.50) while each cast costs 20 Devotion and the light must be re-summoned every 25 s. L30 shepherd: 220 single target and 239 in a pack of 5 (x1.08; the bolts hit one target), against Bastion 836 and 2,627. The shepherd key passive is worth +44 % and the build is still last. Level 15 sim row: "shepherd (Guardian Light + Blessing)" 118 DPS.
- **Change:** bolt coefficient 0.4 to 0.7, `attackCooldown` 0.9 to 0.8, bolts splash 1.5 m (`explodeRadius`), so a light is about 0.9 per second and clips small groups. The shepherd keeps the third light.
- **Files:** `src/data/skills/lightbearer.ts:179-197`, `tests/lightbearer.test.ts:351`.
- **Verify:** harness shepherd >= 400 single target and >= 700 in the pack of 5; sim row "L15 shepherd" >= 200.

### G009 - Flat-value passives are worth under 1 % at the levels they are taken [arithmetic], P3, S
- **Area:** Skill-tree nodes that are weak.
- **Problem:** `p.sacred_oath` is +4 Intelligence (`skillTree/lightbearer.ts:98`), which is +0.4 % damage (0.1 % per point, `damage-formula.md`) and +0.2 % resistance, in the Mastery branch (14 points deep). `p.vigil` +12 life (`:33`) is 1.8 % of the L30 Lightbearer's 652; `p.consecrated_mail` +15 armor (`:69`) moves 414 to 429, about +1 point of armor reduction; Bastion `p.reinforced_plating` +20 armor and `p.vital_systems` +15 life (`skillTree/bastion.ts:67-68`) are the same size. A Bastion in a full rare kit has armor 148 at L1 and 551 at L40, life 252 to 944, so flat numbers that suit level 5 are noise at level 30. The percentage passives (`p.fervor` +4 % damage, `p.sacred_flame` +5 % ranged) are fine.
- **Change:** express them as percentages (needs `armorPct` and `maxLifePct` in `stats.ts`, a few lines): vigil +2 % life, vital_systems +2.5 % life, reinforced_plating and consecrated_mail +4 % armor; sacred_oath becomes +4 % damage against corrupted (a `damage` effect `when: 'corrupted'`).
- **Files:** `src/data/skillTree/lightbearer.ts`, `src/data/skillTree/bastion.ts`, `src/systems/stats.ts`, `src/data/loot/schemas.ts` (stat keys), `src/data/lang/en.json`.
- **Verify:** `tests/skillTree.test.ts`: at L30 each of these nodes at rank 1 changes its stat by at least 1.5 % of the base value.

## Other classes, skills and the bot

### G010 - The balance tools cannot measure packs or non-corrupted targets [tooling], P1, S
- **Area:** Balance tooling.
- **Problem:** `scripts/sim/sim.ts:140` always spawns one `spore_carrier` (lumen), and `cli.ts:8-9` only knows `--seconds`. `BUILDS` has Bastion up to L30 but Spectre, Xenomant and Lightbearer only L10-15 (`builds.ts`), and nothing is run on a group. With a pack of five, Xenomant disease goes from 390 to 1,696 (x4.3), the exorcist x4.1, Bastion shock x3.1 and trapper x3.4, but the sniper only x1.1 and the shepherd x1.1. `docs/balance.md` itself says "area builds look weaker here". The Deep Mines and Core also need L30+ numbers that do not exist.
- **Change:** add `dummy?: string` and `pack?: number` to `Build`/`simulate` (extra dummies on a 2.2 m ring, damage summed) and `--dummy <enemyId>`, `--pack <n>` to `cli.ts`; add the ten L30 builds from the table at the top of this file to `BUILDS`.
- **Files:** `scripts/sim/sim.ts`, `scripts/sim/cli.ts`, `scripts/sim/builds.ts`, `docs/balance.md`, `tests/sim.test.ts`.
- **Verify:** `npm run sim -- --dummy security_trooper --pack 5` runs, Lightbearer exorcist neutral < corrupted; `tests/sim.test.ts` asserts pack DPS >= single-target DPS for every build and that a dummy of a non-corrupted family removes `corruptedMul`.

### G011 - No test guards the L1-10 balance band, and the doc is out of date [measured], P1, M
- **Area:** Balance regression.
- **Problem:** see the playthrough table above: Spectre Sniper is 3 minutes slower than `docs/balance.md` records (10:47-12:27 against 7:59-9:30), Blades 3 minutes slower with more deaths (7-11 against 4-9), Furnace Cleave 1.5 minutes slower, Seismic Shock 1.5 minutes faster, and three Lightbearer plans are missing from the doc. Something changed the pace and nothing flagged it; `tests/playthrough.test.ts` only plays to level 3.
- **Change:** add `npm run balance:check` (the 12 plans x 2 seeds, 5 minutes) that fails when any plan's L10 time is outside 6:30-14:00 or deaths exceed 5, and run it in a nightly or manual CI job (vitest `describe.skipIf(!process.env.BALANCE)` is enough locally). Refresh the table in `docs/balance.md` from the run, and fix `docs/classes.md`, which still has the pre-Phase 4c numbers: Spectre life 170 (+11) and armor 30 (`classes.md:9`) against 205 (+14) and 45 in `classes/spectre.ts:8-9`; Vibro Slash 0.6 (data 0.95), Pistol Barrage 5 x 0.55 (0.65), Smoke Cloak cooldown 15 (12), Spore Dart 0.55 (0.42), Scalpel 0.75 (1.0). Add a test that compares the class table's life, armor and speed with the data.
- **Files:** `package.json`, `tests/balance.test.ts` (new), `tests/data.test.ts`, `docs/balance.md`, `docs/classes.md`.
- **Verify:** `BALANCE=1 npx vitest run tests/balance.test.ts` fails today on Blades, Healer and Shepherd and passes after G006/G007/G008/G012.

### G012 - Spectre Blades dies 7-11 times to energy damage the class cannot resist [measured], P1, S
- **Area:** Class balance / difficulty.
- **Problem:** Blades L10 takes 11,254 damage over the run, **10,658 of it energy** (drone bolts); 11 and 7 deaths, 16:45 / 15:35, kill rate 0.28 per second (half of the others), average life 60 %. Base energy resistance: Spectre 0.10 (`classes/spectre.ts:10`), Bastion 0.10, Xenomant 0.05, Lightbearer **0.20** (`classes/lightbearer.ts:10`), and Intelligence adds 0.05 % per point on top for INT classes. The dummy sim shows Blades as the highest-DPS L10 build (226), so the bottleneck is survival, not damage. `docs/decisions.md` (2026-10-02) already found drone bolts to be about 90 % of ranged damage.
- **Change:** Spectre energy resist 0.10 to 0.20; Phase Shift invulnerable window 0.25 to 0.4 s (`skills/spectre.ts:145`).
- **Files:** `src/data/classes/spectre.ts`, `src/data/skills/spectre.ts`, `docs/classes.md`.
- **Verify:** `npm run play -- --filter blades --seeds a,b`: deaths <= 4 and L10 <= 14:30; Sniper and Trapper do not slow by more than 5 %.

### G013 - The Furnace Cleave Bastion is 45 % slower than the Seismic Shock one [measured], P2, S
- **Area:** Build balance (Bastion).
- **Problem:** same class, same bot: Seismic Shock 7:43 / 8:07 at 0.61 kills/s, Furnace Cleave 11:19 / 12:08 at 0.42, Strike tank 10:43 / 9:41 at 0.44. On the dummy the cleave line is stronger (L15 sim: Jab + Cleave 346 against Strike + Shock 283). The difference is coverage: Shock is a 4.2 m circle (`skills/bastion.ts`, `nova`), Cleave a 170 degree, 3.4 m arc (`:126`) and its partner Piston Jab a 50 degree arc (`:104`), so packs surround it.
- **Change:** Piston Jab arc 50 to 90 degrees, Furnace Cleave arc 170 to 200 degrees, keep the 360 degree Molten modifier at its penalty.
- **Files:** `src/data/skills/bastion.ts:93-135`.
- **Verify:** `npm run play -- --filter cleave --seeds a,b` L10 <= 10:30; `npm run sim` row "L15 Jab + Furnace Cleave" stays within +10 %.

### G014 - Orbital Strike adds 3.7 % to a build, Heat Vent is a dead mastery [measured], P3, S
- **Area:** Skills that are weak.
- **Problem:** L30 shockwave build with the ultimate 859 DPS, without 828: **3.7 %**. Orbital is coefficient 9 on a 50 s cooldown (`skills/bastion.ts:197-210`), which is 1.7 s of normal output. Death Mark is worth 20 % (sniper) and 7 % (blades), Wrath of Lumen 9-14 %. Heat Vent is `1 + 0.04 x Heat` (about 5 at full heat) every 12 s, 0.4 coefficient per second against Strike's 3.1; the vent-based L30 sim build ("Reactor Core vent build") does 601 against 928 and 1,049 for the other two L30 Bastion builds.
- **Change:** Orbital coefficient 9 to 16, Vent `perResource` 0.04 to 0.08 and cooldown 12 to 10 s.
- **Files:** `src/data/skills/bastion.ts:175-210`.
- **Verify:** the ultimate-share ablation >= 8 % for the shockwave build; `npm run sim` "L30 Reactor Core vent build" >= 800.

### G015 - Symbiote promises +25 % melee and delivers +10 % [measured], P3, S
- **Area:** Key passive.
- **Problem:** `k.symbiote` is `damage x1.25 when melee` (`skillTree/xenomant.ts:123`), but Parasite Link, the build's core spender, is `delivery: 'ranged'` (`skills/xenomant.ts:94`). Measured on the L30 melee build: +10-11 % (574 against 523 in the Chitin-first rotation, 622 against 563 in the Link-first one), against +21 to +33 % for the other keys (table above).
- **Change:** add `{ kind: 'skillMod', skill: 'xenomant.parasite_link', mods: [{ op: 'damage', value: 0.25, multiplicative: true }] }` to the key passive.
- **Files:** `src/data/skillTree/xenomant.ts:121-126`.
- **Verify:** harness key-value ablation for the melee build >= +20 %; `tests/xenomant.test.ts` adds a Link hit with and without the key.

### G016 - Xenomant disease is last in single-target DPS in its class [measured], P3, S
- **Area:** Class balance (bosses and elites).
- **Problem:** L30 single target: disease 390 (46 % of Bastion), minions 509, melee 622; the pack of 5 gives 1,696, so the build excels on trash and is weak on a boss (a boss has no pack). Stationary single targets include every named elite and boss. Core and Mines bosses take 40-120 s of reference DPS (G022), so a 390 DPS build spends minutes on them.
- **Change:** Spore Dart poison coefficient 0.22 to 0.34 (stacks to 10 and applies on the basic, so it lifts single target the most) and Spore Burst hit 0.6 to 0.9. Keep the cloud.
- **Files:** `src/data/skills/xenomant.ts:10-30,57-80`.
- **Verify:** harness disease single target >= 500 (target 60 % of Bastion) and pack of 5 <= 4.3x single; `npm run play -- --filter disease` L10 stays <= 8:30.

### G017 - Potions are class-blind and the supply is binding for four builds [measured], P2, S
- **Area:** Potion and resource economy.
- **Problem:** every class has `potion: { charges: 4, heal: 0.35, recharge: 18 }` (`classes/*.ts`). Supply at full use is 3.33 potions per minute. Bot potions per minute: Minions 3.57, Exorcist 3.28, Blades 3.16, Trapper 3.07, Disease 2.75, Strike tank 2.61 (so six builds are at 78-107 % of supply, the first four above 90 %), against 0.91 for Seismic Shock, 0.13 for the Healer and 0 for the Shepherd. A flat 18 s timer rewards slow, safe play and starves fast clears.
- **Change:** each kill shortens the current recharge by 0.75 s (elite 3 s, boss 8 s). Stats, restoration charges and `potionHealing` are unchanged.
- **Files:** `src/systems/skills.ts:60-85`, `src/systems/loot/rewards.ts` (kill reward path).
- **Verify:** `tests/skills.test.ts`: a kill advances `potionRecharge` by 0.75 (elite 3, boss 8); effective supply at 0.5 kills/s is >= 4.5 per minute; `npm run play` deaths do not rise for the four binding builds.

### G018 - Dying has no cost in the campaign [code], P2, M
- **Area:** Death penalty.
- **Problem:** `docs/world-and-gameplay.md:500` specifies durability damage repaired at the blacksmith (and a hardcore mode at `:503`); `grep -ri durabil src` finds nothing. `respawn()` (`game.ts:2031-2069`) restores life and resource, clears statuses, resets bosses and teleports to the nearest teleporter; potion charges and cooldowns are kept. The only penalty is half the Ash Shards (`harvest.ts:121-130`). Bot runs die 0-11 times per ten levels with no consequence beyond a walk.
- **Change:** a small, recoverable toll in a new `applyDeathPenalty(world, ctx)` in `src/systems/death.ts`, called from `respawn()` for open-world deaths only (not Rifts or the Endless Shaft, which already end): lose 5 % of carried gold (capped at 40 x level) and drop potion charges to half (rounded down, minimum 1). Confirm with the owner first; it is a design change, not a bug.
- **Files:** `src/systems/death.ts`, `src/game.ts:2031`, `src/data/lang/en.json`, `docs/decisions.md`.
- **Verify:** `tests/death.test.ts` (new): gold, cap and potion rounding; rift and shaft deaths unchanged.

## Leveling, enemies, bosses and endgame

### G019 - Kill XP does not fall off above the zone's level cap [computed], P1, S
- **Area:** Levelling speed.
- **Problem:** monsters are clamped to the zone's range (`encounter.ts:74-80`) and `killXp` uses the monster level only (`generate.ts:289-291`), so a character above the cap keeps full XP from level-10 enemies. XP from all open-world pack kills at the zone's mid level is 538 % of the XP its level band needs in Cinder Flats, 222 % in the Refinery, 122 % Vaults, 115 % Mines, 181 % Core. Simulating a full clear plus all quests: Cinder Flats from level 1 ends at **level 23** (zone cap 10); a Refinery full clear from level 10 ends at **31** (cap 20), so the Vaults (20-30) and Mines (30-40) arrive trivial. Completionists are punished by the difficulty curve, while players who only follow the story are unaffected.
- **Change:** in `rewardSystem` multiply kill XP by `max(0.1, 1 - 0.3 x (playerLevel - zoneMaxLevel))` when the player is above the zone's cap (not under World Tier 2+ or in Rifts, where monsters follow the player). Re-simulated with the same model: the Cinder Flats full clear ends at level 14 (was 23) and the Refinery one at 23 (was 31).
- **Files:** `src/systems/loot/rewards.ts:105`, `src/systems/loot/generate.ts` (`killXp` signature), `src/data/loot/tables.ts:124`.
- **Verify:** `tests/loot.test.ts`: `killXp` at player level 14 in a zone capped at 10 is 0.1x; at the cap it is 1x; World Tier 2 is unaffected.

### G020 - Deep Mines and Core quest XP exceed the XP their levels need [measured], P2, S
- **Area:** Levelling speed / quest data.
- **Problem:** quest XP per region against the XP needed to cross its level band (`xpToNext`): Cinder 4,690 of 6,075 (77 %), Refinery 23,500 of 29,355 (80 %), Vaults 57,700 of 62,286 (93 %), Mines **156,800 of 102,086 (154 %)**, Core **312,600 of 147,525 (212 %)** (the Core's main quests alone, 208,500, are 141 %). A player reaches level 50 about halfway through the Core story and everything after feeds the Matrix.
- **Change:** scale quest XP in the two data files to about 80 % of the band: Mines x0.52 (about 82,000), Core x0.38 (about 118,000). Keep the ratio between quests.
- **Files:** `src/data/quests/deepMines.ts`, `src/data/quests/theCore.ts`, `docs/regions/the-core-playtest.md`.
- **Verify:** `tests/quests.test.ts` (new case): per zone the sum of quest XP is between 60 % and 100 % of the band's `xpToNext` sum.

### G021 - Regions 2-4 have almost no ranged enemies [measured], P2, M
- **Area:** Enemy AI variety / difficulty curve.
- **Problem:** share of open-world spawns (weighted pack members) whose attack is a projectile: Cinder 9 %, Refinery **0 %**, Vaults **0 %**, Mines 2 %, Core 20 %. Melee is 83 / 63 / 90 / 80 / 62 %. Vaults is 45 % overgrown walkers (the colonist's stats: windup 0.5, cooldown 1.0, damage 17 against 14) and 36 % hounds and swarms, so levels 10-40 are the same melee ring fight with larger numbers, and Spectre's kiting and Xenomant's minions never meet a drone-like threat after region 1. Projectile enemies exist (security trooper, shield officer, governor drone) but only in a few templates.
- **Change:** add ranged or caster members to open-world templates for regions 2-4 until the share reaches 10-18 %: one or two `ranged`-behaviour members in four to six of the larger templates per region (use `security_drone`/`governor_drone` re-skins, the Refinery welder as a bolt thrower and the Vaults botanist with a projectile attack instead of its short cone).
- **Files:** `src/data/packs.ts`, `src/data/enemies.ts`.
- **Verify:** `tests/region3Content.test.ts` style check per region: projectile share of weighted members in 0.10-0.20 for regions 2-4.

### G022 - Strongholds outlast the zone boss in regions 3 and 4 [computed], P2, S
- **Area:** Boss difficulty curve.
- **Problem:** the stronghold bosses get `lifeMul = 1 + 0.12 x (level - 1)` (`districtSetPieces.ts:137`, `vaultSetPieces.ts:152`, `mineSetPieces.ts:147`, `setPieces.ts:166`), the zone bosses 1. Effective life and time to kill at reference DPS: R1 Hale 5,995 (38 s) and The First 8,384 (53 s); R2 Brother Ash 18,847 (37 s) and Vire 15,912 (31 s); R3 Gamma Bloom **72,451 (84 s)** and Warden 33,588 (39 s); R4 Holm **77,441 (66 s)** and Kade 48,120 (41 s); R5 Lumen 176,760 (118 s). From region 2 on the mid-boss is as long or longer than the zone's boss, so the story's high point is shorter than its warm-up. (Reference DPS is the Bastion sim extended; compare ratios, not seconds.)
- **Change:** stronghold `lifeMul = 1 + 0.035 x (level - 1)`: R1 about 3,800, R2 9,600, R3 32,300, R4 31,700, so the mid-boss is 0.45-0.95x the zone boss in every region. Leave zone bosses.
- **Files:** `src/world/setPieces.ts:166`, `districtSetPieces.ts:137`, `vaultSetPieces.ts:152`, `mineSetPieces.ts:147`, `docs/enemy-roster.md`.
- **Verify:** `tests/setPieces.test.ts`: for each region stronghold life / zone-boss life at the region's top level is between 0.4 and 1.0; existing boss-script tests still pass.

### G023 - Elite strength is flat across fifty levels [code], P3, S
- **Area:** Elites.
- **Problem:** `makeElite` gives champions x2 life and x1.25 damage and rares x4 life and x1.5 damage whatever the region (`world/zone.ts:228-231`); `rareAffixCount` is 2, then 3 at level 5, then **4 from level 9** to level 50 (`data/elites.ts:52-54`); champion and rare chances are 0.03-0.14 per pack for all five regions (`packs.ts`). A rare at level 45 is about 6,400 life and dies in roughly 5 seconds at 1,200 DPS, against about 3 seconds at level 5 (300 life, 100 DPS). New affixes (Force Wall, Laser Grid) are tracked in `content.md` C019; this item is about scaling.
- **Change:** rare life x(4 + 0.05 x level) and damage x(1.5 + 0.01 x level); champion life x(2 + 0.02 x level); `rareAffixCount` 5 from level 30.
- **Files:** `src/world/zone.ts:228`, `src/data/elites.ts:52`.
- **Verify:** `tests/elites.test.ts`: rare life multiplier at level 45 is >= 6.0; affix count 5 at level 30; Rift and World Tier tests unchanged.

### G024 - Deep Rift damage scales as fast as life, 4x more than World Tier 4 at rift 40 [computed], P1, S
- **Area:** Endgame difficulty.
- **Problem:** `riftScale(level) = 1.06^level` multiplies both life and damage (`systems/endgame/rifts.ts:71-73,104,149-151,183-184`; data `endgame/rifts.ts:18`). Rift 20 = x3.2, rift 40 = **x10.3**, rift 60 = x33, rift 100 = x339. The World Tiers use unequal factors: Tier 3 life 3.0 / damage 1.75, Tier 4 life 6.0 / damage 2.5 (`tiers.ts:27-28`). Rift 40 is the clear that unlocks Tier 4, yet its monsters hit x10.3: a Core average hit of 131 raw becomes about 740 after mitigation against a Bastion with 1,030-1,120 life (66 % of life per hit), and a rift 60 average hit one-shots. Rift 40 is therefore a wall that has nothing to do with the tier it unlocks.
- **Change:** split the exponent: life x1.06^level, damage x1.035^level (rift 20 x2.0, rift 40 x4.0, rift 100 x31). Add `damagePerLevel` to `RIFT` and a `riftDamageScale(level)`.
- **Files:** `src/data/endgame/rifts.ts:18`, `src/systems/endgame/rifts.ts:71,149-151,183-184`, `docs/endgame.md`, `tests/endgameRifts.test.ts`.
- **Verify:** unit test: `riftDamageScale(40)` between 3.5 and 4.5, `riftScale(40)` still 10.3; an enemy spawned in a level-40 rift deals 4x the base damage, not 10x.

### G025 - Fast enemy wind-ups are shorter than the dodge can answer [code + measured], P2, S
- **Area:** Combat feel / dodge timing / enemy AI.
- **Problem:** the dodge grants `Invulnerable` for `duration + 0.05` = 0.27 s (0.25 s for Spectre) on a 2.5 s cooldown (1.6 s Spectre) (`skills.ts:108`, `classes/*.ts`), and an attack is only telegraphed from the start of its wind-up. Wind-ups: Spore Hound 0.35 s and Spore Swarm 0.30 s (`enemies.ts`), against a typical human reaction of 0.2-0.25 s plus input and frame latency, so these two cannot be answered, only guessed. Share of open-world spawns with wind-up under 0.4 s: Cinder 14 %, Refinery 11 %, **Vaults 36 %**, Mines 18 %, Core 14 %; average wind-up 0.50-0.61 s everywhere. The bot only dodges inside the last 0.25 s of a wind-up with a 35 % chance (`playthrough.ts:130,348`), so the sim cannot see this problem either. Hounds also flank, so several lunge from the side at once.
- **Change:** a floor of 0.45 s for every melee wind-up of a pack-size enemy (hound 0.35 to 0.45, swarm 0.30 to 0.40 with a 0.3 s shorter recovery so DPS is unchanged); lunge and flank attacks get a 0.15 s longer red telegraph that starts before the wind-up, not during it. Flag any intentionally quick enemy with `quick: true` so the test below can allow it.
- **Files:** `src/data/enemies.ts`, `src/data/schemas.ts` (`quick` flag), `src/systems/enemyAI.ts` (telegraph lead for `lunge`), `tests/enemyAI.test.ts`.
- **Verify:** data test: every melee, cone and lunge attack has `windup >= 0.4` unless `quick`; share of spawns under 0.4 s is under 15 % in every region; `npm run play` deaths and level times change by less than 5 % (the damage per second of the enemies is unchanged).
