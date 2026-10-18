# Endgame plan (design brief Phase 7 – "Slutspel")

Source: docs/design-brief.md §7 and Phase 7, docs/world-and-gameplay.md (World Tiers, Ash Harvest, world
bosses, the Core after the campaign). Done when there is a meaningful goal to chase after the story.

## What starts the endgame

Defeating Lumen with any character unlocks **World Tier 2** for the whole account. From then on every
character can switch tiers at a **Tier Beacon** in each hub, and the systems below switch on. Characters at
level 50 earn **Neural Matrix** points instead of nothing.

## Shared state (already in the save format)

- Character save `endgame`: `matrixXp`, `matrixPoints`, `nodes`, `boards`, `glyphs`, `ashShards`, `recipes`,
  `materials` (src/core/save.ts). Lives on `ctx.endgame` during play.
- Account `endgame`: `tierUnlocked`, `tier`, `codex`, `riftBest`, `playtime` (src/core/account.ts).
- Items: `tempered` (up to two tempered affixes) and `masterwork` (rank 0–12) (src/data/loot/schemas.ts).
- Entry points other systems call: `tierMods` / `unlockTier` (src/systems/endgame/tiers.ts),
  `grantGlyph` / `upgradeGlyph` (src/systems/endgame/matrix.ts), `grantRecipe` / `grantMaterial`
  (src/systems/endgame/crafting.ts).

## World Tiers

| Tier | Name | Unlock | Monster level | Enemy life | Enemy damage | XP | Gold | Item power | Greater affix chance | Unique/mythic weight |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Survivor | start | zone range | ×1 | ×1 | ×1 | ×1 | +0 | +0 | ×1 |
| 2 | Veteran | defeat Lumen | player level everywhere | ×1.5 | ×1.25 | ×1.5 | ×1.5 | +40 | +10 % | ×1.5 |
| 3 | Nightmare | clear Deep Rift 20 | player level | ×3 | ×1.75 | ×2.5 | ×2 | +80 | +25 % | ×2.5 |
| 4 | Apocalypse | clear Deep Rift 40 | player level | ×6 | ×2.5 | ×4 | ×3 | +120 | +45 % | ×4 |

- From tier 2, every zone scales to the player's level (never below its own range), so all five regions and
  every boss become endgame content again, the Core included.
- The tier is chosen at a Tier Beacon (every hub) out of combat, and shown on the HUD.

## Neural Matrix and glyphs

- After level 50, experience fills a Matrix level instead; each Matrix level gives one point, up to 200.
  The cost per point starts at 60 % of the last campaign level and rises 2 % per point.
- Boards: a starting board and four more (Ash, Forge, Bloom, Deep). A board is unlocked by reaching its
  gate node and attached there (rotatable). Each board has about 45 nodes: normal (+flat stat), magic
  (+% stat), rare (larger, with a condition), one legendary node with an effect, and one glyph socket.
- Nodes are taken one at a time along connected paths from the start.
- Glyphs (12): socketed, they boost the normal and magic nodes within radius 3, and give a bonus when enough
  of a stat lies inside the radius. Levels 1–21; Deep Rifts upgrade them.
- Panel: zoomable and pannable, mouse and touch (drag, pinch).

## Deep Rifts

- A Rift Obelisk in the Last Camp and in Outpost Ember. Levels 1–100; the next level opens when the last
  one is cleared (two levels when cleared with more than half the time left).
- A rift mixes rooms and enemies from every region. Kills fill a progress bar (elites more); at 100 % the
  Rift Guardian spawns, an earlier boss in the Lumen look. 10 minutes to kill it.
- Enemy life and damage ×1.06 per level on top of level 50 (world tiers don't apply inside a rift).
- Cleared in time: three glyph upgrade attempts (chance falls as the glyph's level passes the rift's level
  / 5), a reward cache, item power up to +2 per level (cap 540), and the account's best level.
  Out of time: the rift collapses, no upgrades.
- Rift 20 unlocks World Tier 3, rift 40 World Tier 4.

## World bosses

- One every 45 minutes of play time (the brief says three hours; shortened for a browser game, data value).
  Announced five minutes ahead with a toast, a map marker and a HUD countdown; despawns 15 minutes after it
  appears.
- Three bosses at fixed spots spread over the five regions, each with several phases and a large health
  pool scaled by the World Tier: the Ashen Colossus, the Mother of Spores, the Hollow Engine (existing
  large models in the Lumen look).
- Reward: a chest with a guaranteed legendary, a chance at a unique, tempering recipes and materials.

## Ash Harvest

- From World Tier 2, one region at a time is under the Harvest for 20 minutes of play time, rotating
  through the five regions. Shown on the map and the HUD.
- In that region: 1.5× packs, 3× elite chance, 10–30 % of packs from other regions, events twice as often.
- Enemies drop Ash Shards (normal 1, elite 5, boss 25). Three Harvest Caches per region cost 250 shards each:
  a guaranteed legendary, materials and a chance at a recipe. Dying drops half the carried shards.

## Crafting and the Codex

- **Tempering** (blacksmith): recipes (12: offense, defense, utility, mobility) found from world bosses,
  Harvest caches and Rift Guardians. Tempering adds one random affix from the recipe's list; at most two
  tempered affixes per item; each item has five tempering charges.
- **Masterworking** (blacksmith): ranks 0–12 for gold and materials (Lumen Dust from salvaging legendaries,
  Rift Shards from rifts). Each rank +5 % to every affix; ranks 4, 8 and 12 also upgrade one random affix
  by 25 %. Can be reset for gold.
- **Codex of Power** (technician): the first clear of each dungeon unlocks its aspect for the whole
  account; unlocked aspects can be imprinted without limit, at a value scaled by the World Tier.

## Deferred

Hardcore characters, seasons, a Swedish interface, online leaderboards, new region content.

## Build order

1. World Tiers, Neural Matrix and glyphs, Deep Rifts, world bosses, Ash Harvest, crafting and the Codex,
   built in parallel against the shared state above.
2. Integration, balance pass and tests; browser playtest of every system.
3. Docs, artifact, then I wait for your feedback.

## As built

All six systems are built (tiers, matrix, rifts, world bosses, harvest, crafting and the Codex). The numbers
below are the ones in `src/data/endgame/`; where they differ from the plan above, the deviation is listed at
the end of each part.

### World Tiers
- Exactly the table above (`TIER_TABLE`). The tier is chosen at a Tier Beacon (every hub) out of combat (no hit
  taken or dealt for 6 s and no hunting enemy within 22 m). Tier 2 unlocks when Lumen falls, tier 3 and 4 with
  Deep Rift 20 and 40. Unlocking tier 2 shows two toasts: the unlock, and a one-time pointer to the Tier Beacon,
  the Rift Obelisks, the world bosses and the Ash Harvest.
- Shops and quests follow the tier: the trader's stock rolls with the tier's item power and greater-affix chance,
  a blacksmith reroll adds the tier's greater-affix chance (at the item's own power, which already carries the tier
  it dropped at), and quest XP is multiplied by the tier's XP (the quest texts show the scaled number).
- **Inside a Deep Rift world tiers are suspended** (the badge reads WT I): a rift has its own scaling.

### Neural Matrix
- **Points:** after level 50, XP fills a Matrix level; at most 200 points. The cost of the next point is
  `round(xpToNext(49) × 0.6 × (1 + 0.02 × pointsEarned))`: 10,165 XP for the first point (xpToNext(49) is 16,941),
  20,329 for the 51st, 30,494 for the 101st and 50,620 for the 200th; about 6.08 M XP for all 200. Spent and unspent
  points both count towards `pointsEarned`.
- **Boards:** 9×9 grids, five of them (start, Ash, Forge, Bloom, Deep), 45–46 nodes each: 22–27 normal, 8–12 magic,
  4 rare, 1 legendary, 1 glyph socket and 4 gates (edge midpoints). The start board has the free start node `@`.
  A board is attached (0/90/180/270 degrees) to an allocated, free gate of a board that is already placed; it can be
  rotated or detached only while none of its nodes is taken. Nodes are taken one at a time along connected paths.
- **Respec:** all points back for 250 gold + 60 per allocated node.
- **Glyphs:** twelve (four attributes × three). Brawn, Precision and Insight are given when the character first earns
  Matrix XP, so the board is usable before any rift. A socketed glyph affects the normal and magic nodes within
  **radius 3** (Euclidean, same board) whose stat is in its family: each glyph level adds **+8 %** to their values
  (levels 1–21). The bonus effect switches on when the normal nodes of the glyph's attribute inside the radius add up
  to **8 attribute points** (the first four glyphs) or **16** (the other eight).
- **Upgrades:** an attempt always works while the glyph's level is at most rift level / 5, then the chance falls 25
  points per level above that, to a floor of 5 %.
- Deviations: the plan's per-board "about 45 nodes" is 45–46; glyph sockets hold one glyph; the panel's pinch-zoom is
  built but not tested on a real phone.

### Deep Rifts
- Obelisks in Outpost Ember and the Last Camp; levels 1–100; the next level opens when the last is cleared (two when
  more than half of the time was left). Needs World Tier 2.
- **Progress:** 120 points fill the bar; a normal kill is 1, a champion 5, an elite (rare, named) 10. 9-11
  rooms on the main path plus 4-6 branch rooms, 2-3 packs each, drawn from 25 pack templates of all five regions.
  Once every room has woken and the bar is not full, a surge pack arrives every 6 s while fewer than 6 enemies are alive.
- **Guardian:** one of five earlier bosses (Brood Mother, Slag Heart, Vine Matriarch, Archivist, Elder Guardian) in the
  Lumen look, with extra life of ×1.2 to ×12 on top of its own. **600 s** for the whole run.
- **Scaling:** monsters are level 50; life and damage ×1.06 per rift level.
- **Rewards (cleared in time):** 3 glyph upgrade attempts; a cache with 2 + floor(level / 25) guaranteed legendaries at
  item power 410 + 2 × level (cap 540), 2 + 0.25 × level Rift Shards and a 25 % chance of a tempering recipe; the
  account's best level and time; rift 20 and 40 unlock World Tier 3 and 4. A first clear also gives a glyph if the
  character has none. Out of time the rift collapses and throws you out, with no upgrades.
- **Leaving early:** using the start-room exit while the rift is running (bar or guardian) first shows a warning toast;
  using it again within 8 s abandons the run (no rewards). A cleared rift with attempts left asks once as before.
  This is a double-use confirmation, not a modal dialog, so it works on touch and inside the artifact iframe.
- Deviations: none in numbers; the guardians' life multipliers are per boss.

### World bosses
- One every **45 minutes of play time** (plan: 3 h, shortened for a browser game). Announced 5 minutes ahead (toast,
  map marker, HUD countdown), alive for **15 minutes**, then gone. The schedule is a pure function of the account's
  play time (the n-th boss appears at n × 45 min); which boss comes up is seeded, never the same twice running.
- Three bosses, each with three phases, monster level 50, life 4,200 (Colossus), 4,000 (Mother) and 5,000 (Engine) at level 50, times ×4 / ×4 / ×4.5, then the
  World Tier's life: **Ashen Colossus** (Cinder Flats -440,-480; Refinery District 60,-280 and 360,580), **Mother of
  Spores** (Hydroponic Vaults 320,320 and -100,-280; Cinder Flats -220,460), **Hollow Engine** (Deep Mines -60,510;
  the Core 220,100 and -140,280). Arena radius 22-26 m.
- **Chest:** a guaranteed legendary from the boss table (item power with the tier), 20-25 % chance of a unique (times
  the tier's drop multiplier), 1-2 tempering recipes (new ones first) and 8-16 Lumen Dust.
- Deviation: recipes are a sure drop (plan: a chance). The kill is not saved: reloading inside the 15-minute window
  brings the boss back.

### Ash Harvest
- From World Tier 2. One region per **20 minutes of play time**, in the order Cinder Flats, Refinery District,
  Hydroponic Vaults, Deep Mines, the Core (a 100-minute cycle).
- In the region: packs ×1.5, champion and rare chance ×3, 10-30 % of the packs replaced by packs of other regions (not
  the Lumen Giant or Drill Colossus), world events twice as often.
- **Shards:** 1 per normal kill, 5 per elite, 25 per boss, only in the region under the Harvest.
- **Caches:** three per region at fixed open spots; 250 shards each: one guaranteed legendary, 4-8 Lumen Dust and a 35 %
  chance of a recipe the character does not know. An opened cache comes back the next time its region is under the Harvest.
- Deviation: **dying loses half the carried shards for good** (plan: they drop to be picked up). There is no pickup.

### Crafting and the Codex
- **Tempering** (blacksmith, World Tier 2, rare and better): 12 recipes (3 each of offense, defense, utility, mobility)
  found from world bosses, Harvest caches and Rift caches. Up to **2 tempered affixes** and **5 charges** per item; a
  tempering costs `150 × itemPower / 100 × 1.5^chargesSpent` gold (150, 225, 338, 506, 759 at item power 100).
- **Masterworking** (rare and better): rank 0-12, every rank +5 % to every affix; ranks 4, 8 and 12 also raise one random
  affix by a further 25 %. Reaching rank r costs `200 × itemPower / 100 × 1.35^(r-1)` gold (200 for rank 1, 897 for
  rank 6, 5,429 for rank 12 at item power 100; 20,368 in all), `ceil(2 + 0.75 r)` Lumen Dust (3 to 11, 87 in all) and, from
  rank 5, `r - 3` Rift Shards (2 to 9, 44 in all). A reset costs `250 × itemPower / 100 × (1 + rank / 4)` gold.
  Lumen Dust also comes from salvaging legendaries (2), uniques (3) and mythics (5).
- **Codex of Power** (technician): the first clear of each of the 20 dungeons (16 in the regions, 4 in the Core) unlocks
  its aspect for the account; imprinting costs `140 × itemPower / 100` gold and is unlimited. The value is the aspect's
  range at `0.5 + the tier's greater-affix chance` (tier 4: 95 % up the range), scaled for item power plus the tier's
  item power. It uses the real `tierMods`, so only the chosen tier counts.
- Deviation: none in numbers.

### HUD
One column holds the rows that appear in the endgame: Deep Rift timer and bar, the world boss countdown, and the Ash
Harvest line with the shard counter (`.endgame-stack`, built in `game.ts`, positioned in `style.css`). Desktop: top left
under the title. Touch landscape: left, under the menu row. Touch portrait: left, under the region name and the World
Tier badge. The tier badge stays under the region name; the target frame and event box moved 12 px down to clear it,
and the landscape quest tracker 22 px down.
