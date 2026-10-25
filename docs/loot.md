# Loot and progression (Phase 3a–3b)

All numbers live in `src/data/loot/` (bases, affixes, rarities, crystals, drop tables, progression curves)
and are validated with Zod in `src/data/loot/db.ts`. Generation is pure and seeded
(`src/systems/loot/generate.ts`), so the same seed always produces the same loot.

## Levels and XP
- XP to go from level *L* to *L+1*: `round(60 × L^1.45)` (level 2 needs 60, level 10 needs ~1 690).
- Kill XP = drop-table XP × (1 + 0.1 × (enemy level − 1)).
- Each level: +1 skill point (spent in the skill tree, K), attribute growth from the class data, full life.
- Monsters match the player's level, clamped to the zone range (Cinder Flats 1–10).
  Enemy life +18 % and damage +12 % per level above 1.

## Item power
- Drops: `10 + 8 × monster level ± 4` (level 1 ≈ 18, level 50 ≈ 410).
- Affix and implicit values are defined at item power 100 and scaled:
  `linear = (IP + 50) / 150`, `sqrt = √linear` (percent stats), `none` = fixed.

## Rarities
| Rarity | Affixes | Greater-affix chance | Socket chance | Beam |
|---|---|---|---|---|
| Common (grey) | 0 | – | 12 % per slot | none |
| Magic (blue) | 1–2 | 1 % | 22 % | small |
| Rare (yellow) | 3–4 | 3 % | 32 % | medium |
| Legendary (orange) | 3–4 + aspect | 5 % | 40 % | tall |
| Unique (gold) | fixed + unique effect | – | – | tall |
| Mythic (red) | fixed, all greater | 100 % | – | tallest |

Greater affixes roll 1.5× the normal range and are marked ◆ in tooltips.
Aspects and unique items are described in [skill-tree.md](skill-tree.md). If no aspect fits a legendary's
item type it drops as a rare; if no unique of the rolled rarity exists it drops as a legendary.

## Bases and affixes
- 10 equipment slots: helm, chest, gloves, pants, boots, amulet, 2 rings, weapon, off-hand.
- Bases for future classes (Spectre, Xenomant) already drop: 85 % of drops are restricted to bases the
  player's class can use; the rest can be anything (brief §5.6).
- Affix pools are per item type (a ring can't roll armor), and an item never rolls the same affix twice.
- Armour and jewellery have a second base for helm, chest, boots, amulet and ring (Signal Visor, Mesh Vest,
  Grip Boots, Lumen Locket, Signet Band). They have a different implicit (resource generation, resist all,
  move speed, life, crit chance), start dropping at item power 150 and reuse the first tier's look until
  their own art exists.
- Affix weights depend on the class (`affixWeight`, `src/systems/loot/generate.ts`): the class's primary
  attribute rolls 1.5× as often as the other three, and `meleeDamage` / `rangedDamage` follow how the class
  fights (`CLASS_AFFIX_WEIGHTS` in `src/data/loot/affixes.ts`: Bastion favours melee, the other three ranged).
  `rangedDamage` is a damage bonus against ranged hits, like `meleeDamage` for melee; the Fury temper has a ranged option.
- Implicits: weapons give weapon damage (Hydraulic Hammer 28–34, Power Sword +8 % attack speed,
  Knuckles +4 % crit), armor gives armor, jewelry gives resistances.

## Crystals (sockets)
Five crystals with tiers chipped / regular / flawless (by item power < 150 / < 300 / ≥ 300).
Like Diablo 4 gems, the stat depends on where they are socketed:

| Crystal | Weapon / off-hand | Armor | Jewelry |
|---|---|---|---|
| Ember | +8/12/16 % damage to Burning | +10/20/32 life | +8/12/16 % heat resistance |
| Lumen | +8/12/16 % damage to Vulnerable | +3/5/7 % resource generation | toxic resistance |
| Void | +6/9/12 % crit damage | +1/1.5/2 % damage reduction | void resistance |
| Frost | +8/12/16 % damage to Stunned | +12/22/36 armor | +8/12/16 % cold resistance |
| Storm | +2/3/4 % attack speed | +4/6/9 % barrier | +8/12/16 % energy resistance |

Frost and Storm reuse the Void and Lumen icons with their own tint until they get art.

## Aspects, uniques and mythics (content pass)
- Every class has at least two aspects of its own for each armour and jewellery slot, and every class skill has
  an aspect or a unique (`tests/contentCoverage.test.ts`). The Codex of Power unlocks two aspects per dungeon
  (`CODEX_ASPECTS` maps a dungeon to a list); every class can reach at least five of its own there.
- Uniques: each class has one on gloves, ring or amulet (Reaper's Grip, Signet of Rot, Sunwheel Pendant,
  Cinder Collar) besides its weapon, helm, chest or boots ones.
- Mythics: `heart_of_lumen` is Bastion-only (its overheat effect needs Heat). Each other class has its own
  (Aureole of the First Dawn, The Last Word, Diadem of the Swarm Queen) and `ouroboros_coil` suits every class.
- A unique with `source: 'quest'` (the two Mother Tree rewards) is handed out by its quest only: it is never
  rolled by `pickUnique` and never in a world boss chest (`worldBossUniques`).
- `dt.dungeon_cache`, `dt.locked_chest` and `dt.event_gold` weight uniques ×1.5 (bosses ×3, rare elites ×2).

## Trader stock
Seven of the eight slots roll magic / rare / legendary by region (`VENDOR.regionStock`, by zone key), and the last slot
is a legendary the player's class can use (a base it can equip and, if the aspect is class-bound, one for it).
Legendary weight per region: Cinder Flats 3, Refinery 5, Hydroponic Vaults 8, Deep Mines 10, The Core 12 (the
plain table is 5). From the Refinery on, uniques can appear in stock with weight 0.2 / 0.4 / 0.6 / 0.8. A call
without a region (or an unknown one) uses the plain table and sells no uniques.

## Drop tables
| Table | Item chance | Gold | Crystal | XP |
|---|---|---|---|---|
| Infected Colonist | 12 % | 35 %, 1–3 × level | 1.5 % | 12 |
| Security Drone | 16 % | 40 %, 1–4 × level | 2 % | 14 |
| Spore Carrier | 40 % (rares ×2) | 60 %, 3–6 × level | 5 % | 26 |
| Wave reward cache | 2 items, magic+ (rares ×1.5) | 6–10 × level | 30 % | – |

## Inventory
- 40-cell backpack (Diablo 4 style, one cell per item) + equipment paper doll.
- Right-click equips/unequips, Shift+click salvages for gold (`IP / 10 × rarity rate`),
  click a crystal then an item to socket it. Tooltips compare against the equipped item
  (damage estimate, life and per-stat ▲/▼).
- Stash, vendors, aspect extraction and crafting arrive with hubs (Phases 5 and 7).

## Saving
Save format v3 adds the skill tree ranks and the action bar (v2 saves get `level − 1` skill points
and the starting skill). Save format v2 stores level, XP, skill points, gold, backpack, equipment and the loot RNG state.
Version-1 saves migrate automatically (the character receives the starter kit on load).
