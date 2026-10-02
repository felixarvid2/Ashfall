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
- Implicits: weapons give weapon damage (Hydraulic Hammer 28–34, Power Sword +8 % attack speed,
  Knuckles +4 % crit), armor gives armor, jewelry gives resistances.

## Crystals (sockets)
Three crystals with tiers chipped / regular / flawless (by item power < 150 / < 300 / ≥ 300).
Like Diablo 4 gems, the stat depends on where they are socketed:

| Crystal | Weapon / off-hand | Armor | Jewelry |
|---|---|---|---|
| Ember | +8/12/16 % damage to Burning | +10/20/32 life | +8/12/16 % heat resistance |
| Lumen | +8/12/16 % damage to Vulnerable | +3/5/7 % resource generation | toxic resistance |
| Void | +6/9/12 % crit damage | +1/1.5/2 % damage reduction | void resistance |

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
