# Content and progression: 25 improvements (C001-C025)

Audit only, no source changed. Evidence comes from loading the data DBs with tsx (counts below), `npm run region:report`, and reading `src/data/`, `src/systems/loot/`, `docs/endgame.md`, `docs/loot.md`, `docs/enemy-roster.md`. Effort S/M/L, priority 1 (high) to 3. "Needs code" marks items where the data change depends on behaviour no system supports yet, so it belongs to the implementer. No item needs new art unless noted.

## Summary

- **Class parity is the biggest gap.** Lightbearer has 0 of 9 aspects in the Codex (Bastion 6/14, Spectre 6/9, Xenomant 6/9). Lightbearer and Xenomant have 0 class aspects for boots, so every legendary boot they find carries another class's aspect. 8 skills across the four classes have no aspect or unique at all.
- **The chase layer is thin.** 12 uniques in total (3/2/2/2 per class plus 2 classless) and one mythic, whose effect only works for Bastion. Armour and jewellery have one base per slot.
- **Endgame tail is flat.** Rift item power caps at level 65 of 100, caches never roll uniques, there are only 3 world bosses, and there is no repeatable quest content after the campaign.
- **Quests are well formed (84/84 have all lang keys) but repetitive:** 5 of 8 Core side quests share one step shape, all 5 mystery quests share another, Deep Mines and the Core have no choice quests, and 32 of 84 quests pay no item.
- **Text is clean structurally** (no missing keys, no doubled words) but mixes British and American spelling.

## Top 5

1. **C001** Lightbearer has no Codex aspects.
2. **C002** Boots (Lightbearer, Xenomant) and pants (Bastion, Lightbearer) have no or one class aspect.
3. **C005** The only mythic is Bastion-only, and the mythic chase has one item.
4. **C004** 2-3 uniques per class, none for gloves, rings or amulets.
5. **C013** No repeatable quest content after the campaign.

---

## Loot, aspects, uniques

### C001 - Lightbearer cannot use the Codex of Power
- **Area:** Loot / crafting (technician)
- **Problem:** `CODEX_ASPECTS` (`src/data/endgame/crafting.ts`, "Codex of Power" block) maps 20 dungeons to 20 aspects. Per class: Bastion 6 of 14, Spectre 6 of 9, Xenomant 6 of 9, **Lightbearer 0 of 9**, classless 2 of 2. 23 of 43 aspects can never be unlocked there, 8 of them Bastion's (momentum, echo, wrecking_ball, vulnerability_matrix, heat_sink, gravity_well, orbital_uplink, cinder_core).
- **Change:** Let a dungeon unlock more than one aspect (`Record<string, string[]>`), then add one Lightbearer aspect to 9 dungeons (for example the four Core dungeons get litany, sentinel, verdict, daybreak). Data-only alternative, weaker: remap the four `core_*` entries to Lightbearer aspects, which takes Bastion, Spectre and Xenomant down to 5 each.
- **Files:** `src/data/endgame/crafting.ts`, `src/systems/endgame/crafting.ts` (`unlockCodexForDungeon`, `codexDungeon`), `tests/endgameCrafting.test.ts`.
- **Verify:** New test: every class has at least 5 aspects reachable through the Codex. `npx vitest run tests/endgameCrafting.test.ts`.
- **Effort / priority:** M (needs code for multi-aspect) / 1

### C002 - Boots and pants have no class aspects for some classes
- **Area:** Loot / aspects
- **Problem:** `pickAspect` (`src/systems/loot/generate.ts`) falls back to every aspect that fits the slot when the class has none. Own-class pool per slot (including the classless `unbroken`): Lightbearer boots **0/4**, Xenomant boots **0/4** (100 % of their legendary boots carry another class's aspect, which does nothing for them). Bastion pants and Lightbearer pants 1/3 (only `unbroken`). Spectre helm has 1/13 (only `predator`).
- **Change:** Add aspects (`src/data/loot/aspects.ts` plus `aspects.<id>` name and desc in `en.json`). Examples, using existing mod ops:
  - Lightbearer boots `processional`: `{skill: Y('sanctuary'), op: mul, field: 'radius', value: '$'}`, min 0.2, max 0.4.
  - Xenomant boots `creeping_mold`: `spore_cocoon` cooldown `-$`.
  - Lightbearer pants `vestments`: `blessing` cooldown `-$`.
  - Bastion pants `iron_stride`: `energy_shield` cooldown `-$`.
  - A Spectre helm aspect on `smoke_cloak`.
- **Files:** `src/data/loot/aspects.ts`, `src/data/lang/en.json`. Skill fields must exist; `validateGameData` checks this via `fieldAccess`.
- **Verify:** `npx vitest run tests/data.test.ts`. Add a coverage test: every class has at least 2 own aspects per armour and jewellery slot.
- **Effort / priority:** S / 1

### C003 - Eight skills have no aspect or unique
- **Area:** Loot / build variety
- **Problem:** Skills with no `skillMod` source: bastion.coolant_flush; spectre.holo_decoy, smoke_cloak, death_mark; xenomant.spore_cocoon, grasping_tendrils; lightbearer.censer_strike (its basic attack) and blessing. Xenomant's basic `spore_dart` has only the unique `mother_of_spores`, no aspect.
- **Change:** Add 8-9 aspects, one per skill, each on 3-4 slot types, using fields those skills already expose (cooldown, radius, duration, count, coefficient). Pair them with C002 to fill the empty slots. Tie `censer_strike` to the Lightbearer weapon and ring slots.
- **Files:** `src/data/loot/aspects.ts`, `src/data/lang/en.json`.
- **Verify:** `tests/data.test.ts`; new test: every class skill is referenced by at least one aspect or unique.
- **Effort / priority:** M / 2

### C004 - Few uniques per class, none for gloves, rings or amulets
- **Area:** Loot / uniques
- **Problem:** `UNIQUES` has 12 entries: Bastion 3, Spectre 2, Xenomant 2, Lightbearer 2, two classless. The unique pool a Lightbearer can roll is 4 (`pickUnique`). Class uniques sit only on weapon, helm, chest and boots (`uniques.ts`), and Spectre and Xenomant each have two on weapon or helm.
- **Change:** Add 2 uniques per class (8 total) on gloves, ring or amulet, each reworking one skill the way `dawnbringer` does:
  - Lightbearer amulet: `lex_aeterna` becomes a pulsing field.
  - Spectre gloves: `death_mark` spreads on kill.
  - Xenomant ring: `corpse_explosion` poisons.
  - Bastion amulet: `heat_vent` becomes a Heat spender.
  Each needs 3 affixes in the same ranges as the existing ones, plus `uniques.<id>.name`, `effect` and `flavor` in `en.json`.
- **Files:** `src/data/loot/uniques.ts`, `src/data/lang/en.json`, and `src/data/artFiles.ts` if a unique icon list is required (reuse the base icon if art is missing).
- **Verify:** `tests/data.test.ts` (checks lang keys and skill fields).
- **Effort / priority:** M / 1

### C005 - The only mythic is Bastion-only in effect
- **Area:** Loot / endgame chase
- **Problem:** One mythic exists, `heart_of_lumen` (`uniques.ts`), classless. Its `overheat` effect needs Bastion's overheat config (`src/data/classes/bastion.ts:31`, `src/systems/resource.ts:16`); no other class has one, so for 3 of 4 classes it is only "+35 % damage" with a dead sentence in its description. Mythic weight is 0.01 against unique 0.3 (`PROGRESSION.rarityWeights`, `tables.ts`).
- **Change:** Set `heart_of_lumen` to `classes: ['bastion']`. Add one mythic per other class, each with 4 greater affixes and a stronger variant of that class's unique: `lightbearer` (Sanctuary follows you), `spectre`, `xenomant`, plus a classless one. Keep the weight, since World Tier 4 already multiplies it by 4.
- **Files:** `src/data/loot/uniques.ts`, `src/data/lang/en.json`.
- **Verify:** `tests/data.test.ts`; new test: each class can roll at least one mythic.
- **Effort / priority:** M / 1

### C006 - The Mother Tree uniques can also drop at random
- **Area:** Loot / quests
- **Problem:** `ashen_heartwood` and `seed_of_accord` (`uniques.ts`, no `classes`) are the exclusive reward of the `mq.mother_tree` choice (`src/data/quests/hydroponicVaults.ts:128-130`). But `pickUnique` filters on rarity only, and the world boss pool (`src/world/worldBoss.ts:157`) filters on rarity and class only, so both can drop from any unique roll. That devalues the choice and shrinks the pool further for classless drops.
- **Change:** Add `source: 'quest'` to `UniqueDefSchema` (optional), set it on both, and exclude it in `pickUnique` and `worldBoss.ts:157`.
- **Files:** `src/data/loot/schemas.ts`, `src/data/loot/uniques.ts`, `src/systems/loot/generate.ts`, `src/world/worldBoss.ts`. **Needs code.**
- **Verify:** New test in `tests/loot.test.ts`: 10,000 unique rolls never return a quest-only unique.
- **Effort / priority:** S / 2

### C007 - One base per armour and jewellery slot
- **Area:** Loot / item variety
- **Problem:** `bases.ts`: helm, chest, gloves, pants, boots, amulet and ring each have exactly one base (`combat_helm`, `plated_vest`, ...), identical for all classes; only weapons and off-hands vary (9 and 4). `minItemPower` and `weight` exist in `BaseItemDefSchema` but no base uses them. Two uniques share `combat_helm`.
- **Change:** Add 2 bases per slot, reusing the existing icon ids, with different implicit profiles:
  - Chest `mesh_vest`: smaller armor plus `resistAll`.
  - Helm `signal_visor`: `resourceGen` implicit.
  - Boots `grip_boots`: `moveSpeed`.
  - Amulet `lumen_locket`: `maxLife`.
  - Ring `signet_band`: `critChance`.
  Gate the second tier with `minItemPower: 150` and give `en.json items.bases.<id>`. A distinct icon would need art; reuse for now.
- **Files:** `src/data/loot/bases.ts`, `src/data/lang/en.json`.
- **Verify:** `tests/loot.test.ts`, `tests/data.test.ts`, `npm run assets:check`.
- **Effort / priority:** M / 2

### C008 - No ranged damage stat; melee-only affix rolls on ranged classes
- **Area:** Loot / affixes
- **Problem:** `STAT_KEYS` (`schemas.ts`) has `meleeDamage` (`src/systems/stats.ts:136`) but no ranged equivalent. Skills declare `delivery: 'ranged'` 7 times in Lightbearer, 4 in Spectre, 5 in Xenomant, 0 in Bastion. The affix `melee_damage` (`affixes.ts`, weapon, gloves and ring, weight 5) is therefore partly dead for three of four classes. There is also no healing-power or minion-damage stat, though Lightbearer and Xenomant are built on those.
- **Change:** Add `rangedDamage` (and optionally `healingPower`, `minionDamage`) to `STAT_KEYS`, `PERCENT_STATS` and `stats.ts`; add matching affixes (`ranged_damage`, weight 5, same slots) and `stats.*` strings. Add a `ranged` option to `temper.offense.fury`.
- **Files:** `src/data/loot/schemas.ts`, `src/data/loot/affixes.ts`, `src/systems/stats.ts`, `src/data/lang/en.json`. **Needs code.**
- **Verify:** `tests/damage.test.ts`, `tests/loot.test.ts`.
- **Effort / priority:** M / 2

### C009 - Attribute affix weights favour Strength for every class
- **Area:** Loot / affixes
- **Problem:** `affixes.ts`: `strength` weight 10, dexterity, intelligence and willpower weight 6. Lightbearer, Xenomant and Spectre have non-Strength primaries (Lightbearer: `intelligence`, `src/data/classes/lightbearer.ts`). Strength on their gear is the most common attribute roll and does nothing for them. The 85 % class rule applies to bases, not affixes.
- **Change:** Smallest data fix: set all four attribute weights to 8. Better: a class-weight table so the class's primary rolls about 1.5x (small code in `rollAffixes`).
- **Files:** `src/data/loot/affixes.ts`, optionally `src/systems/loot/generate.ts`.
- **Verify:** `tests/loot.test.ts` with a distribution test per class.
- **Effort / priority:** S / 2

### C010 - The trader never sells a unique and the stock is a flat 5 % legendary
- **Area:** Drop tables / pacing / gold sink
- **Problem:** `VENDOR` (`src/data/services.ts`): 8 items, rarities magic 62 / rare 33 / legendary 5, no unique. All 5 hubs sell from the same table, and nothing scales with region or World Tier.
- **Change:** Add a per-region legendary weight (CF 3, RD 5, HV 8, DM 10, Core 12) and one reserved "own class legendary" slot. Needs a `region` argument to `rollVendorStock`. **Needs code (small).**
- **Files:** `src/data/services.ts`, `src/systems/hub/services.ts`.
- **Verify:** `tests/services.test.ts`.
- **Effort / priority:** S / 3

### C011 - Deep Rift rewards stop growing at level 65 of 100
- **Area:** Endgame / pacing
- **Problem:** `RIFT_REWARDS.itemPower = {base: 410, perLevel: 2, cap: 540}` (`src/data/endgame/rifts.ts`) hits the cap at level 65, so levels 65-100 give the same item power. Cache legendaries cap at 2 + floor(100/25) = 6. The cache never contains a unique or mythic (`src/systems/endgame/rifts.ts:328`). Tier unlocks end at rift 40 (`tierUnlocks`), so there is no new goal between 40 and 100.
- **Change:** Add `uniqueChance: {base: 0.05, perLevel: 0.004}` and `mythicChance: {from: 60, perLevel: 0.001}` to the cache; raise the cap to 600 or add `greaterBonus` per level above 65. Optionally add milestone caches at 60, 80 and 100.
- **Files:** `src/data/endgame/rifts.ts`, `src/systems/endgame/rifts.ts`. **Needs code (small).**
- **Verify:** `tests/endgameRifts.test.ts`: rewards strictly increase between level 65 and 100.
- **Effort / priority:** M / 1

### C020 - Dungeon caches and chests do not weight uniques
- **Area:** Drop tables / replay value
- **Problem:** `tables.ts`: `dt.rare_elite` has `unique: 2` and `dt.boss` has `unique: 3`, but `dt.dungeon_cache` (`rarityBias {rare:3, legendary:3}`), `dt.locked_chest` and `dt.champion` have no unique bias. There are 20 dungeons and 12 uniques; the dungeon cache is the main reward for repeating them, and the Codex only helps once per dungeon.
- **Change:** `dt.dungeon_cache` and `dt.locked_chest`: add `unique: 1.5`. `dt.event_gold`: `unique: 1.5`. With the base weight of 0.3 this stays rare.
- **Files:** `src/data/loot/tables.ts`.
- **Verify:** `tests/loot.test.ts` (rarity distribution) and `npm run sim` for the legendary count per playthrough (currently 15-22 in region 1).
- **Effort / priority:** S / 2

### C024 - Only three crystal types
- **Area:** Loot / sockets
- **Problem:** `CRYSTALS` has ember, lumen and void (`tables.ts`), mapped onto 5 resistance types. Sockets exist on 40 % of legendaries. Jewelry gets resist values only, so crystals never help a build beyond one stat.
- **Change:** Add `frost` (weapon: `damageVsStunned` 0.08/0.12/0.16, armor: `armor` 12/22/36, jewelry: `resistCold`) and `toxic` crystals, with `en.json` names. They need icons: reuse `icon.crystal_*` with a tint, or generate art later (cost note: needs art for a distinct look).
- **Files:** `src/data/loot/tables.ts`, `src/data/lang/en.json`; also check the `crystalChance` consumers.
- **Verify:** `tests/loot.test.ts` (sockets), `npm run assets:check`.
- **Effort / priority:** M / 3

---

## Quests and dialogue

### C013 - No repeatable quest content after the campaign
- **Area:** Quests / endgame loop
- **Problem:** All 84 quests (30 main, 49 side, 5 mystery) are one-shot. After `mq.one_who_remembers` nothing is offered. Hubs show no new quest at World Tier 2+, so the only loops are rifts, harvest and world bosses (`docs/endgame.md`).
- **Change:** Add a repeatable bounty kind: 3 per region, offered by the existing hub NPCs, using existing step kinds (`kill` with `enemy`, `objective`, `interact`), paying gold, XP times the tier, Rift Shards or Lumen Dust and a guaranteed rare. Reset when the player re-enters the hub. **Needs code** (a `repeatable` flag in `QuestDefSchema`, a reset in `src/systems/quests.ts`), then 15 quests of data plus lang keys.
- **Files:** `src/data/quests/schema.ts`, `src/systems/quests.ts`, new `src/data/quests/bounties.ts`, `src/data/lang/en.json`.
- **Verify:** `tests/quests.test.ts`; `validateGameData` covers giver, enemy and lang keys.
- **Effort / priority:** L / 1

### C014 - Five of eight Core side quests share one structure
- **Area:** Quests / repetition
- **Problem:** `sq.last_watch`, `sq.pyre_song`, `sq.empty_cab`, `sq.last_samples`, `sq.fifth_lamp` are all `reach > kill1* > int1 > talk` (`src/data/quests/theCore.ts`). Core side steps overall: reach 9, kill 5, interact 7, talk 8, objective 4, escort 0, choice 0. Escort appears once in each of the first three regions.
- **Change:** Rewrite three of the five with other shapes, keeping the same lang characters:
  - `sq.empty_cab`: `escort` the cab (`asset` from `vehicle` assets already used).
  - `sq.fifth_lamp`: `interact` x4 lamps, then `kill` a wave.
  - `sq.pyre_song`: `objective` of a dungeon plus `talk`.
  Update the `steps.N` tracker lines.
- **Files:** `src/data/quests/theCore.ts`, `src/data/lang/en.json` (`quests.sq.*.steps`).
- **Verify:** `npx vitest run tests/region5Quests.test.ts tests/quests.test.ts`.
- **Effort / priority:** M / 2

### C015 - Deep Mines and the Core have no choice quests
- **Area:** Quests / replay value
- **Problem:** `choice` steps: Cinder Flats 1, Refinery 1, Vaults 2, Mines 0, Core 0. The one consequence feature (`NpcDef.choice`, only used in `deepMines.ts:35-36`) is used once. Replaying a character to see the other choice is not rewarded beyond one item.
- **Change:** Add one choice side quest in each of Mines and Core (the Core has the Absorbed NPCs `rhee`, `lenn`, `danner` and `halvorsen`, which offer no quests). Options give different rewards (rare item vs unique-less gold/XP, or a class-weighted item); a follow-up greeting through an `NpcDef.choice` NPC.
- **Files:** `src/data/quests/deepMines.ts`, `src/data/quests/theCore.ts`, `src/data/lang/en.json`.
- **Verify:** `tests/region5Quests.test.ts`, `tests/quests.test.ts`, `validateGameData`.
- **Effort / priority:** M / 2

### C016 - All five mystery quests have the same shape
- **Area:** Quests / repetition
- **Problem:** `my.whistle`, `my.fireproof`, `my.gardener`, `my.whisper`, `my.table_light` are all `reach > reach > reach > int1` and all pay a legendary. They differ only in text and place.
- **Change:** Vary: `my.fireproof` gets a `kill` with a spawn near the end, `my.gardener` a `discover`, `my.whisper` a `talk` to a hidden NPC, `my.table_light` a hold-out `objective`. Keep `marker: false` trails.
- **Files:** the five quest files in `src/data/quests/`, `src/data/lang/en.json`.
- **Verify:** `tests/quests.test.ts`.
- **Effort / priority:** M / 3

### C017 - 38 % of quests pay no item
- **Area:** Quests / rewards
- **Problem:** 32 of 84 quests have no `rewards.item` and no choice item; 26 of 54 side and mystery quests. Cinder Flats: 8 of 10 side quests (daughter, water, spices, old_dog, radio, rations, lights, letter). Refinery: 6 of 10 (defector, spare_parts, sabotage, heat_sick, crane_operator, red_hound), at levels 12-17 where a rare is cheap. The Core's 8 side quests all pay a rare or better, so the gradient is inverted.
- **Change:** Set `item: 'magic'` on early (L2-L5) side quests with at least 150 XP, `item: 'rare'` on Refinery and Vaults side quests of level 14 or higher. No schema change.
- **Files:** `src/data/quests/cinderFlats.ts`, `refineryDistrict.ts`, `hydroponicVaults.ts`, `deepMines.ts`.
- **Verify:** `npx vitest run tests/quests.test.ts tests/region2Content.test.ts`; `npm run region:report` to compare legendary counts (currently 15-22 per region 1 run).
- **Effort / priority:** S / 2

### C023 - NPC dialogue never changes
- **Area:** Dialogue / lore
- **Problem:** Each of 32 NPCs has one `greeting` (`npcs.<id>.greeting`, read at `src/game.ts:1532`) that is identical from the first visit to after the credits. Five NPCs offer no quest and no service (danner, rhee, lenn, halvorsen, okafor_tree), so they have only that line.
- **Change:** Add `greetingLate` (after the region boss) and `greetingEnd` (after Lumen) keys for the 15 service NPCs and the 5 silent ones, then choose by progress. **Needs code** in `game.ts` (a lookup with a fallback to `greeting`).
- **Files:** `src/game.ts`, `src/data/lang/en.json`.
- **Verify:** extend `tests/quests.test.ts` or `tests/i18n.test.ts`: every NPC has `greeting`; any `greeting*` key belongs to an existing NPC.
- **Effort / priority:** M / 3

---

## Enemies, endgame, text

### C012 - Only three world bosses, and recipes run out
- **Area:** Endgame / replay value
- **Problem:** `WORLD_BOSSES` (`src/data/endgame/worldBosses.ts`) has 3 bosses on 8 spots. Each kill gives 1-2 recipes, new ones first (`recipes: [1, 2]`), and there are 12 recipes, so after about 8 kills (45 min each, roughly 6 hours of play) the recipe reward is dead; Cinder Flats has a single spot.
- **Change:** Add two world bosses reusing existing enemy ids and scripts as models (for example a `choir_mother` and a `brood_engine` variant in the Lumen look) with their own phases, placed in Deep Mines and the Core, plus one extra Cinder Flats spot. Add `uniqueChance` 0.3 for the new ones.
- **Files:** `src/data/endgame/worldBosses.ts`, `src/data/bosses.ts` (scripts), `src/data/lang/en.json`.
- **Verify:** `npx vitest run tests/endgameWorldBosses.test.ts`.
- **Effort / priority:** L / 2

### C018 - Cinder Flats has the thinnest roster
- **Area:** Enemies / variety
- **Problem:** Distinct enemy types in open-world packs: Cinder Flats **6**, Refinery 10, Vaults 10, Mines 12, Core 16 (`src/data/packs.ts`, zone packs). The first region has 275 packs but only 6 types, and its playtest notes dense road packs. The roster doc lists variants as "later" (`docs/enemy-roster.md`).
- **Change:** Add 2 variants reusing models, as `scorched_walker` did: an Ash Thrower (`infected_colonist` model, `behavior: 'ranged'`) and a Rust Drone variant (a faster `security_drone`), plus drop tables and `enemies.<id>` names. Put them in the `road`, `valley` and `military` templates.
- **Files:** `src/data/enemies.ts`, `src/data/loot/tables.ts`, `src/data/packs.ts`, `src/data/lang/en.json`, `docs/enemy-roster.md`.
- **Verify:** `npx vitest run tests/data.test.ts tests/enemyAI.test.ts`; `npm run region:report` (kill rate and pack count).
- **Effort / priority:** M / 2

### C019 - Elite affixes: Force Wall and Laser Grid are still pending
- **Area:** Enemies / elites
- **Problem:** `src/data/elites.ts` has 10 affixes. `docs/enemy-roster.md` and `PROGRESS.md:498` both say Force Wall and Laser Grid "come later"; nothing was added in regions 2-5.
- **Change:** Spec both as data (cooldown, radius, damage coefficient, telegraph) and hand the behaviour to the implementer. Gate them to Hydroponic Vaults and later in pack `rareChance` so earlier regions are unchanged. **Needs code.**
- **Files:** `src/data/elites.ts`, `src/systems/elites.ts`, `src/data/lang/en.json` (`elites.*`).
- **Verify:** `tests/elites.test.ts`.
- **Effort / priority:** M / 3

### C021 - British and American spelling are mixed
- **Area:** Lore / text quality
- **Problem:** `en.json` mixes both. British: "Centre on me" (`map.locate`), "Colour-blind palette" (`settings.colorblind`), "labelled" (`lore.cmirror.vault.body`), "metres" (`lore.hv.5.body`), "Authorised" (`lore.hv.9.body`), "recognise" (`npcs.nils.greeting`), "Armour Plate" (`enemies.armorPlate`), "Armour and resistance" (`crafting.recipes.temper.defense.ward.desc`). American: "Armored Greaves" (`items.bases.armored_greaves`), "Defense" (`ui.sections.defense`, `crafting.groups.defense`), "Fervor" (`tree.p.fervor.name`). The same item category appears in both spellings. Also a real brand and game names: "Kevlar Weave" (`tree.p.kevlar_weave.name`), "Diablo" (`moveMode.click`), "iPhone" (`touch.fullscreen.needsHomeScreen`).
- **Change:** Use British throughout (it already dominates): Armoured Greaves, Defence, Fervour; rename "Kevlar Weave" to a fictional name (for example "Aramid Weave"); change "(Diablo)" to "(classic)". Do not change ids.
- **Files:** `src/data/lang/en.json`.
- **Verify:** `npx vitest run tests/i18n.test.ts tests/data.test.ts` after C022.
- **Effort / priority:** S / 2

### C022 - No lint for language strings
- **Area:** Text quality / validators
- **Problem:** `validateGameData` (`src/data/validate.ts`) checks that lang keys exist but not their quality. Found by scan: double spaces in `worldBoss.hudShort` and `worldBoss.hudShortRegion`; 12 strings use `...` instead of one ellipsis style (for example `quests.mq.black_box.talk2`, `quests.sq.daughter.offer`); 317 strings use a straight apostrophe and none curly (consistent, keep). No unused-key check: the six extra quest keys `sq.water.escortName`, `sq.deserter.result` etc. are used by code but nothing proves it.
- **Change:** Fix the two double-space strings. Add a test in `tests/i18n.test.ts` that fails on double spaces, leading or trailing spaces, a blacklist of American spellings (`armor`, `defense`, `color`, `center`, `fervor` outside ids), and unbalanced `{placeholders}`.
- **Files:** `src/data/lang/en.json`, `tests/i18n.test.ts`.
- **Verify:** `npx vitest run tests/i18n.test.ts`.
- **Effort / priority:** S / 2

### C025 - Cross-reference gaps in `validateGameData`
- **Area:** Validators / data safety
- **Problem:** `validate.ts` does not check: that every `CODEX_ASPECTS` key is a real dungeon and every value a real aspect; that `choice` options' `unique` ids exist in `UNIQUE_DEFS` (`hydroponicVaults.ts:128-130` is only checked at reward time); that enemies' `dropTable` and the tables they name exist; that every `RECIPES` option is a valid stat. A rename in `aspects.ts` or `uniques.ts` would pass `tests/data.test.ts` and fail in play. There are 59 drop tables and 85 enemies.
- **Change:** Add those four checks plus one coverage rule from C002 (every class has an own aspect for every slot).
- **Files:** `src/data/validate.ts`.
- **Verify:** `npx vitest run tests/data.test.ts`; temporarily rename an aspect and confirm an error.
- **Effort / priority:** S / 2
