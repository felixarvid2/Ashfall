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
