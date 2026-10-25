# Diablo 3 / Diablo 4 audit: panels and menus (desktop first)

50 concrete, testable UI improvements for the DOM panels and menus of Ashfall, measured against Diablo 3 and Diablo 4. Nothing in `src/` was changed; this is an audit.

- **Scope:** inventory and paper doll, item tooltips and comparison, stash, vendor / blacksmith / technician, skill tree and action-bar assignment, Neural Matrix entry, character panel, map, quest log, settings, pause/main menu, character select, Tier Beacon and Deep Rift panels, loot-filter options. The in-world HUD (bars, action bar, minimap, nameplates, damage numbers, ground labels, toasts) belongs to the other auditor; it appears here only where it overlaps a panel (B024).
- **Hard rule from the user:** no item may take more space. Inventory and stash cells, item icons and doll slots keep their current size and every item keeps a one-cell footprint (no D3-style 1x2 items). Every change below works with sorting, marking, filters, comparison, colour, badges and tooltips, or moves existing elements. Items that touch a panel's height only use room that is already there.
- **Method:** production build (`npx vite build`), `vite preview` on port 5292, one Chromium (software WebGL) with two contexts one after the other: desktop **1280x720** and portrait touch **390x844**. One script (`scratchpad/ui-d3b/cap.mjs`) seeded a level-50 Bastion through `window.ashfall` (`applySave`): 40 backpack items (common to unique, aspects, sockets, tempered, masterwork, three crystals), 5 equipped items, 3 stash items, 1,234,567 gold, 12 skill points, 12 Matrix points, 3 quests, tiers and Deep Rift 25 unlocked. Panels were opened with the real keys (I, C, K, M, J, Esc) or the debug handles (`openService`, `settingsPanel.show`, `tierPanel.show`, `riftPanel.showSelect`). Sizes come from `getBoundingClientRect` / `getComputedStyle`.
- **Limits:** the Neural Matrix board itself was not captured on desktop (my selector missed the "Neural Matrix" button); B031 is based on the Skills header only. The blacksmith Reroll and Masterwork sections were collapsed in the capture. The mobile portrait set (390x844: inventory, item sheet, character, skills, settings, vendor, stash) was captured as a baseline only; no mobile regression was found, and each item states how it behaves there. Real hover/keyboard timing was not tested.
- **Already done in the earlier mobile work (not repeated here):** sort menu (Rarity/Slot/Item power/Newest), filter chips incl. "Better", up/down arrows and "new" dots on cells, multi-select salvage, "Salvage junk" when full, tooltip sheet with Item/Equipped/Changes tabs and symbol legend, confirmation sheets, shared panel header, panel stack.
- **Screenshots:** `/tmp/claude-0/-home-user/91b10048-104f-50d9-baf1-7585dd3fa3ee/scratchpad/ui-d3b/shots/` named `d-<nn>-<name>.png` (desktop) and `m-<nn>-<name>.png` (390x844). Quoted in every item.
- **Priorities:** 1 = a defect or a data-loss risk, or a core Diablo expectation that is missing; 2 = clear usability gain; 3 = polish. **Effort:** S = CSS/DOM tweak in one or two files; M = new logic or a change across several files; L = a new panel or system.

## Summary

Ashfall's backpack is already close to Diablo 4 in spirit (one-cell items, arrows, sort, filters, aspects in tooltips). What Diablo players will miss on a desktop screen:

1. **No way to protect an item** (favourite/lock) and **Shift+click salvages any item at once**, legendaries included (B002, B004).
2. **Comparison is a text block, not a comparison**: it never says which item it is against (two rings), shows no item-power delta and no equipped tooltip beside the new one (B005-B009).
3. **The 720p layout loses content**: the inventory grid is clipped (B001), the Ash Harvest tracker prints over every left-hand panel title (B024), the stash grid is 527 px inside a 500 px panel (B020), the character panel shows 5 of 20 stats (B033), the class-select screen pushes name and Create below the fold (B048).
4. **Stash is a bare list**: no sort, filter, search, pages or power badges (B020-B022); vendor has no buyback (B023).
5. **Settings are touch-first**: no key rebinding although 26 actions are bindable, no pause menu on Esc, touch-only rows on desktop, no accessibility or loot-filter options (B041-B047).

## Top 10 (do these first)

| Rank | ID | One line |
|---|---|---|
| 1 | B004 | Shift+click on a backpack item salvages it without any confirmation (legendary too): route it through the existing confirm. |
| 2 | B002 | Favourite/lock flag (corner padlock, no size change) that every salvage, sell and store-junk action skips. |
| 3 | B001 | Raise the inventory panel's max height to `100vh - 185px` so the 4th grid row is not clipped at 1280x720. |
| 4 | B024 | Hide the Ash Harvest tracker and top hint line while a left-hand panel is open; they overprint titles now. |
| 5 | B005 | Show the equipped item's tooltip beside the hovered one (Shift toggles), as D3/D4 do. |
| 6 | B006/B007 | Name the compared item (both rings) and show the item-power delta ("112 +51") in the tooltip header. |
| 7 | B042 | Key rebinding list in Settings > Controls (the data model already has `keybindings` for 26 actions). |
| 8 | B041 | Esc with nothing open opens a small pause menu (Resume, Settings, Character select, Export save). |
| 9 | B020 | Stash gets the same Sort button and filter chips as the backpack (`sortGrid`, `filterMatches` exist). |
| 10 | B033 | Character stat rows from 36 px to 26 px pitch: 11 stats visible instead of 7 without scrolling. |

## Counts

| | S | M | L | Total |
|---|---|---|---|---|
| Priority 1 | 7 | 5 | 0 | 12 |
| Priority 2 | 16 | 11 | 0 | 27 |
| Priority 3 | 6 | 4 | 1 | 11 |
| **All** | 29 | 20 | 1 | **50** |

## Index

| ID | Area | Item | Eff | Pri |
|---|---|---|---|---|
| B001 | Inventory | Inventory panel clips its grid at 720p | S | 1 |
| B002 | Inventory | Favourite / lock flag | M | 1 |
| B003 | Inventory | Junk mark | M | 2 |
| B004 | Inventory | Shift+click salvages without confirmation | S | 1 |
| B005 | Tooltip | Equipped item tooltip beside the hovered one | M | 1 |
| B006 | Tooltip | Comparison names its target; both rings | S | 1 |
| B007 | Tooltip | Item power delta in the header | S | 1 |
| B008 | Tooltip | Per-affix delta markers | M | 2 |
| B009 | Tooltip | Roll range on each affix | M | 2 |
| B010 | Inventory | Highlight the target doll slot on hover | S | 2 |
| B011 | Inventory | Choose the ring slot on desktop | S | 2 |
| B012 | Inventory | Socket banner on one line | S | 2 |
| B013 | Inventory | Rarity not by colour alone | S | 2 |
| B014 | Inventory | Bag nearly full warning | S | 3 |
| B015 | Inventory | `/` search in the chip row | M | 2 |
| B016 | Inventory | Drag-to-mark in select mode | M | 3 |
| B017 | Tooltip | Aspect Codex status line | S | 2 |
| B018 | Inventory | Desktop key hints | S | 3 |
| B019 | Inventory | Doll labels and hint text too small and dim | S | 2 |
| B020 | Stash | Sort and filter chips in the stash | M | 1 |
| B021 | Stash | Stash pages | M | 2 |
| B022 | Stash/Vendor | Power badges and arrows on stash and vendor cells | S | 2 |
| B023 | Vendor | Buyback row | M | 2 |
| B024 | Panels | HUD tracker prints over panel titles | S | 1 |
| B025 | Technician | Condensed Aspect Cache and Codex rows | M | 2 |
| B026 | Technician | Codex slot filter and "fits this item" toggle | S | 2 |
| B027 | Skills | Half-dimmed "skill points available" line | S | 2 |
| B028 | Skills | Tier jump chips on desktop | M | 2 |
| B029 | Skills | Assign by number key / drag | M | 2 |
| B030 | Skills | "Next rank" line in the skill tooltip | S | 2 |
| B031 | Skills | Matrix button shows unspent points | S | 2 |
| B032 | Skills | Refund one rank | M | 3 |
| B033 | Character | Stat rows too tall | S | 1 |
| B034 | Character | Average item power line | S | 2 |
| B035 | Character | Panel touches the life orb | S | 3 |
| B036 | Skills | Dot for learned skills not on the bar | S | 3 |
| B037 | Map | Larger map panel on desktop | M | 2 |
| B038 | Map | Glyphs without legend or label | S | 2 |
| B039 | Map | Zoom and pan | L | 3 |
| B040 | Quests | Main/side grouping and trivial-quest dimming | S | 3 |
| B041 | Menu | Esc opens a pause menu | M | 1 |
| B042 | Settings | Key rebinding | M | 1 |
| B043 | Settings | Touch-only rows on desktop | S | 2 |
| B044 | Settings | Accessibility: reduce flashing, colour-blind palette | M | 2 |
| B045 | Settings | Brightness | S | 2 |
| B046 | Settings | Loot label filter option | S | 2 |
| B047 | Settings | Reset to defaults | S | 3 |
| B048 | Char select | Name and Create below the fold at 720p | S | 1 |
| B049 | Char select | Richer slot cards | M | 3 |
| B050 | Rift | Reward preview on the Deep Rift panel | M | 3 |

## Items

### Inventory, paper doll and tooltips

**B001. Inventory panel clips its grid at 720p** (Inventory, S, P1)
- *D3/D4:* the whole stash/bag is always visible without scrolling inside the panel.
- *Ashfall:* `.panel { max-height: calc(100vh - 220px) }` = 500 px at 720p. Panel y 60-560, grid y 437-567: the fourth row is cut in half (`d-10-inv.png`, `d-17-inv-filter-better.png`), and the hint, socket banner and select bar push the grid further down (`d-18`, `d-19`). The panel cannot grow freely: the resource orb sits at x 930-1030, y 603+.
- *Change:* for desktop only, `.inventory-panel { max-height: calc(100vh - 185px) }` (535 px at 720p, bottom 595, above the orb) and reduce `.inv-doll` margin-bottom 10 to 6 px. Cells stay 30 px. Test: at 1280x720 `grid.bottom <= panel.bottom - padding` and `scrollHeight <= clientHeight` with the 40-item seed.
- *Mobile:* scope with `#ui:not(.touch-ui) .inventory-panel`; the portrait sheet sets its own height (`m-10-inv.png`).
- *Files:* `src/ui/style.css` (`.panel`, `.inventory-panel`, `.inv-doll`).

**B002. Favourite / lock flag** (Inventory, M, P1)
- *D3/D4:* D4 lets you mark an item as a favourite; it is skipped by salvage-all and sell-all. D3 has no lock but protects with junk marking.
- *Ashfall:* nothing protects an item. `salvageJunk`, "Store all junk", the Blacksmith "Salvage N items" button, multi-select and Shift+click can all hit a rare. Only common/magic count as junk now, but select mode and Shift+click take anything.
- *Change:* add optional `locked: boolean` to the item schema (bump the save version, default false). Toggle with `L` while hovering a cell, or a "Lock" button in the item sheet. Draw an 8x8 px padlock (CSS mask on the existing icon set) in the cell's top-left, over the "new" dot position when both apply. Locked items: Shift+click and select mode show a short "Locked" toast instead of salvaging; `salvageJunk`, `junkSummary` and vendor sell skip them. Test: lock a magic item, press "Salvage junk", it remains.
- *Mobile:* sheet gets a Lock toggle row; badge identical.
- *Files:* `src/data/loot/schemas.ts`, `src/core/save.ts`, `src/ui/inventoryPanel.ts`, `src/ui/inventoryLogic.ts`, `src/ui/servicePanel.ts` (`junkSummary`), `src/ui/portrait/items.css`.

**B003. Junk mark** (Inventory, M, P2)
- *D3:* mark items as junk, then one click sells all junk at the vendor; marked cells show a coin.
- *Ashfall:* "junk" is hard-coded to common and magic (`needsSalvageConfirm`). A player cannot say "this rare is junk" and the bag-full banner is the only bulk action.
- *Change:* same field as B002 as a tri-state `mark: 'fav' | 'junk' | null`. `Alt+click` toggles junk: cell opacity 0.55 and a 10 px red slash in the top-right (no size change). "Salvage junk", "Store junk" and vendor "Sell junk" act on marked items plus common/magic. Test: mark a rare, salvage junk, it is removed; unmark, it stays.
- *Files:* as B002 plus `src/ui/confirmSheet.ts` (the armed button already exists).

**B004. Shift+click salvages without confirmation** (Inventory, S, P1)
- *D3/D4:* destructive actions on legendary gear ask first (D4 confirms salvage of legendaries/uniques).
- *Ashfall:* `InventoryPanel.onGridClick` calls `actions.salvage(index)` directly when `e.shiftKey`; `Game.salvageItem` does not confirm either (`src/game.ts:2314`). One slip destroys a legendary. The touch sheet and select mode already confirm via `needsSalvageConfirm`.
- *Change:* on Shift+click, if `needsSalvageConfirm(item)` open the same `confirmSheet` as the touch sheet ("Salvage {name}?"); common/magic stay instant. Test: Shift+click the legendary hammer: dialog appears, gold unchanged until confirmed.
- *Mobile:* unaffected (Shift is desktop).
- *Files:* `src/ui/inventoryPanel.ts` (`onGridClick`).

**B005. Equipped item tooltip beside the hovered one** (Tooltip, M, P1)
- *D3/D4:* hovering a bag item shows it next to the item currently worn; D4 shows both and an item-power arrow.
- *Ashfall:* one 280x481 px tooltip with an aggregated "Compared to equipped" list (`d-11-inv-tip-legendary.png`); the player has to open the character slot separately to see the other item.
- *Change:* on hover of a gear item in the bag, render the comparison target with `renderItemTooltip(equipped, {equipped:true})` in a second `.item-tooltip` to the left of the first (the first ends at x 913, so 280 px + 10 px gap fits in x 343-623 at 1280 wide; if it does not fit, put it to the right of the panel's left edge). Holding `Shift` hides it; default on. Keep the aggregate block. Test: hover the Warden Ring: two tooltips, no overlap with the panel.
- *Mobile:* the item sheet already has the "Equipped" tab; no change.
- *Files:* `src/ui/inventoryPanel.ts` (`hover`), `src/ui/itemTooltip.ts`, `src/ui/style.css` (`.item-tooltip`).

**B006. Comparison names its target; both rings** (Tooltip, S, P1)
- *D4:* rings are compared to both worn rings.
- *Ashfall:* the block says only "Compared to equipped" (`d-14-inv-tip-ring-compare.png`: a Warden Ring compared to ... which of the two rings?). `actions.compare(item)` picks one default slot.
- *Change:* title the block "vs Etched Ring (70)" using the target's `itemDisplayName` and power; for dual slots (rings) add a second block "vs Dull Ring (50)" using the other slot (`slotsFor(base.type)` already gives both). Test: ring tooltip shows two "vs" headings.
- *Mobile:* sheet "vs Ring 1 / Ring 2" tabs exist; just reuse the heading text in the Changes tab.
- *Files:* `src/ui/itemTooltip.ts` (`renderComparison`), `src/ui/inventoryPanel.ts`, `src/data/lang/en.json` (`items.compare`).

**B007. Item power delta in the header** (Tooltip, S, P1)
- *D4:* the item power line shows an arrow and the difference to the equipped item ("+51").
- *Ashfall:* header reads "112 Item Power" only. Cell badges show power plus a ▲, but no number for the gain.
- *Change:* after the power text add `▲ +51` (green, 13 px) or `▼ -12` (red) against the default target slot; nothing for an equal value or equipped items. Also add the same to the sheet's verdict chips. Test: Cinder Hammer (112) vs Rusted Power Sword (61) shows "+51".
- *Files:* `src/ui/itemTooltip.ts` (`renderItemTooltip` header, `compareVerdict`).

**B008. Per-affix delta markers** (Tooltip, M, P2)
- *D4:* affixes that are new or higher than on the worn item are marked.
- *Ashfall:* all affixes are blue; the only delta is the list at the bottom. Reading "+7.7% Critical Strike Chance" needs a mental subtraction.
- *Change:* for each affix row whose stat also exists on the target, append a muted 11 px delta `(+2.7)`; if the stat is absent on the target, a 5 px accent dot (not colour only: add `title="New stat"`). Test: ring affixes show a delta for Critical Strike Chance and a dot on Strength.
- *Files:* `src/ui/itemTooltip.ts`.

**B009. Roll range on each affix** (Tooltip, M, P2)
- *D3/D4:* D3 shows ranges for legendary affixes, D4 shows the roll as a bar/range ("[5 - 9]%").
- *Ashfall:* `+7.7% Critical Strike Chance` has no hint whether that is a low or high roll; "greater" (◆) is the only quality signal.
- *Change:* append `[min-max]` in muted 11 px after each affix, from the affix tier table (`src/data/loot/affixes.ts`) at the item's power; highlight in accent when the roll is in the top 20 %. Test: a rolled value always lies inside the printed range.
- *Files:* `src/ui/itemTooltip.ts`, `src/data/loot/affixes.ts`, `src/systems/endgame/itemMods.ts`.

**B010. Highlight the target doll slot on hover** (Inventory, S, P2)
- *D3:* hovering a bag item outlines the slot it would replace.
- *Ashfall:* nothing on the doll reacts while hovering a bag cell.
- *Change:* on `mouseenter` of a gear cell add `.compare-target` to the doll cell(s) from `slotsFor(base.type)` (2 px accent outline, no layout change); remove on leave. Test: hover a ring: both ring slots outlined, helm hover outlines helm only.
- *Files:* `src/ui/inventoryPanel.ts` (`hover`), `src/ui/style.css`.

**B011. Choose the ring slot on desktop** (Inventory, S, P2)
- *D3/D4:* right-click equips to the first slot, a modifier or drag chooses the other.
- *Ashfall:* right-click calls `actions.equip(index)` with `defaultTargetSlot` only; only the touch sheet offers "Equip as Ring 2".
- *Change:* `Shift+right-click` equips to the other slot; add "Shift+right-click: other ring" as the last line of the ring tooltip (B018). Test: with both rings worn, Shift+right-click replaces the ring that is not the default.
- *Files:* `src/ui/inventoryPanel.ts` (contextmenu handler).

**B012. Socket banner on one line** (Inventory, S, P2)
- *D4:* socketing keeps the bag visible.
- *Ashfall:* with a crystal picked the banner wraps to four lines (rect about 330x92, `d-19-inv-socket-mode.png`) and pushes the grid off the 500 px panel.
- *Change:* one 34 px row: crystal icon + name, the three group bonuses as three 11 px chips ("Weapon +8% dmg", ...) with ellipsis, Cancel at right. Test: banner height <= 40 px with "Chipped Ember Crystal".
- *Files:* `src/ui/inventoryPanel.ts` (`renderBanners`), `src/ui/style.css` (`.inv-banner`).

**B013. Rarity not by colour alone** (Inventory, S, P2)
- *D4:* D4 uses colour only; accessibility guides ask for a second cue.
- *Ashfall:* common/magic/rare borders differ by hue only (`d-10-inv.png`); the game rules say never state by colour alone.
- *Change:* a rarity pip strip, 2 px high, 12 px wide at the cell's top edge: 1 segment magic, 2 rare, 3 legendary, a 4 px diamond for unique (and mythic). Pure CSS pseudo-element from `.r-<rarity>`. No size change. Test: computed `::after` width differs per rarity class.
- *Files:* `src/ui/style.css`, `src/ui/portrait/items.css`.

**B014. Bag nearly full warning** (Inventory, S, P3)
- *D4:* a red bag counter at full.
- *Ashfall:* the counter `39 / 40` turns `.full` only at 40 (`d-10`).
- *Change:* `.inv-count.near` (amber, from 90 %) and a one-time toast "Bag almost full" at 36/40. Test: count class at 36.
- *Files:* `src/ui/inventoryPanel.ts` (`refresh`), `src/ui/style.css`.

**B015. `/` search in the chip row** (Inventory, M, P2)
- *D4:* item search added in later seasons; D3 has none.
- *Ashfall:* six chips cover categories, but not "Critical Strike", "Fissuring" or a name.
- *Change:* press `/` (or click a magnifier chip) to swap the chip row for a same-height (28 px) text field; typing dims non-matching cells (existing `.filtered-out`) by item name, base, affix text and aspect text; Esc restores the chips. No extra space. Test: type "fissur" and only the Cinder Hammer stays lit.
- *Mobile:* leave the chips as they are; hide the magnifier on touch.
- *Files:* `src/ui/inventoryPanel.ts`, `src/ui/inventoryLogic.ts` (`filterMatches` gets a text predicate).

**B016. Drag-to-mark in select mode** (Inventory, M, P3)
- *D4:* marking many items for salvage by dragging over them.
- *Ashfall:* select mode needs one click per cell.
- *Change:* in select mode, `pointerdown` on a cell then `pointerenter` on others adds them (and Shift+click selects a range). Test: drag over cells 30-39 selects 10.
- *Files:* `src/ui/inventoryPanel.ts`.

**B017. Aspect Codex status line** (Tooltip, S, P2)
- *D4:* items with an aspect show whether the aspect is already in the Codex of Power.
- *Ashfall:* the tooltip shows the aspect text only (`d-11`); the player cannot tell whether extracting is worth gold (Pell's "Extract" button costs gold).
- *Change:* under the aspect line add a muted 12 px line "In your cache" / "In Codex" / "New aspect" (accent) from `inv.aspects` and `account.endgame.codex`. Test: Fissuring on the hammer says "In Codex".
- *Files:* `src/ui/itemTooltip.ts`, `src/data/lang/en.json`.

**B018. Desktop key hints** (Inventory, S, P3)
- *Ashfall:* the hint line ("right-click equips, Shift+click salvages") has a 0x0 rect on desktop; it is turned into a first-open tip. Shift+click salvage, right-click equip and Alt show-labels are not discoverable.
- *Change:* a `?` 18 px button in the panel header (left of the close button) that opens a key list as a tooltip (same text as `.inv-hint`, plus L lock, Alt junk, Shift compare). Test: hover shows 6 lines.
- *Files:* `src/ui/inventoryPanel.ts`, `src/ui/panelHeader.ts`.

**B019. Doll labels and hint text too small and dim** (Inventory, S, P2)
- *Measured:* empty slot labels 9 px `#5a514a` on `#120f0d` (about 2.4:1); hint 10.5 px; cell power badge 11 px (`inv fonts` note in `cap.out`).
- *Change:* `.slot-label` 9 px to 11 px, colour `#8a8076` (about 4.8:1); `.inv-hint` 10.5 px to 12 px. The 60 px doll slots stay 60 px. Test: computed values.
- *Files:* `src/ui/style.css` (`.inv-cell .slot-label`, `.inv-hint`).

### Stash, vendor, blacksmith and technician

**B020. Sort and filter chips in the stash** (Stash, M, P1)
- *D3/D4:* stash tabs have sort; D4 added filters.
- *Ashfall:* the stash is a plain grid with a count and "Store all junk" (`d-67-stash.png`). 50 slots: grid rect 350x527 inside a 500 px panel, so about 3 of 9 rows are below the fold; cells are 55 px, unlike the 30 px bag.
- *Change:* reuse `sortGrid` and `filterMatches` with the same Sort menu and chips in the stash panel header area (use the existing `.service-count` row; chips in one line). Cell size stays. Test: sort "Item power" puts the 130-power vest first.
- *Mobile:* the portrait stash (`m-67-stash.png`) gets the same row, scrolled with the grid.
- *Files:* `src/ui/servicePanel.ts` (`stash`), `src/ui/inventoryLogic.ts`, `src/game.ts` (stash sort action).

**B021. Stash pages** (Stash, M, P2)
- *D3/D4:* tabs/pages.
- *Ashfall:* one 50-slot list; the account stash grows with Restoration (`stashSlots`).
- *Change:* view-only pages of 24 cells (6 columns x 4 rows, 55 px cells = 4 rows fit without scrolling) as `1 2 3` buttons in the count row; data model unchanged (`stash.slice(p*24, p*24+24)`). Test: no vertical scroll in the stash panel on any page.
- *Files:* `src/ui/servicePanel.ts`.

**B022. Power badges and arrows on stash and vendor cells** (Stash/Vendor, S, P2)
- *D4:* stash and vendor items show item power and the upgrade arrow.
- *Ashfall:* stash cells (`d-67`) and vendor stock (`d-60-vendor.png`) are plain icons with a price pill; the bag shows power and ▲▼. The decorate helper is private to `InventoryPanel`.
- *Change:* move `decorate` into `renderItemCell` options and pass `{power, sign}` in `servicePanel` for stash and stock cells; compare arrows use `actions.compare`. No size change. Test: stash vest shows 130 and a green arrow.
- *Files:* `src/ui/inventoryPanel.ts`, `src/ui/servicePanel.ts`.

**B023. Buyback row** (Vendor, M, P2)
- *D3/D4:* D3 keeps a 20-item buyback tab; D4 has buyback for the last sold items.
- *Ashfall:* clicking a bag item in the vendor sells it (hint text in `d-60`); `needsSalvageConfirm`-style confirmations guard valuable ones, but there is no undo.
- *Change:* a single line of up to 8 sold items (cells in the existing grid size, price in the pill) under the stock grid, memory only (cleared when the vendor restocks). Click buys back at the sale price. Test: sell, then buy back, gold back to start.
- *Files:* `src/ui/servicePanel.ts`, `src/game.ts` (vendor actions).

**B024. HUD tracker prints over panel titles** (Panels, S, P1)
- *Ashfall:* "ASH HARVEST: CINDER FLATS - 17:45 LEFT / Ash Shards: 0 / 250" (x 12-375, y 95-135) draws on top of the left-hand panels: it overprints "CHARACTER" (`d-20-char.png`), the first row of the quest log (`d-41-quests.png`), the vendor hint (`d-60`), the Technician item name (`d-65-tech.png`), the stash hint (`d-67`) and the Tier Beacon text (`d-70-tier.png`). The top hint line ("Space dodge - Q potion ...") also shows through panel headers.
- *Change:* while any `.panel` (not the HUD) is visible on a non-touch UI, `#ui:has(.panel:not([hidden])) :is(.harvest-hud, .hud-hint) { visibility: hidden }`, or raise the panels' z-index above `.hud` and give the headers an opaque background. Test: at 1280x720 with the character panel open, `elementFromPoint(100, 110)` is inside `.character-panel`.
- *Mobile:* already hidden under `has-panel` in portrait; scope the new rule to `#ui:not(.touch-ui)`.
- *Files:* `src/ui/style.css`, `src/ui/harvestHud.ts`.

**B025. Condensed Aspect Cache and Codex rows** (Technician, M, P2)
- *D4:* the Codex of Power is a compact list with the aspect's name, category and a single line of text.
- *Ashfall:* every cache or Codex row uses about 100 px: icon, name, description, a line "Aspect: Fissuring -> Brutal Deal x15% ... / Replaces: Fissuring" that repeats the description, and a full-width Imprint button (`d-65-tech.png`). 22 aspects need a long scroll.
- *Change:* one 44 px row: icon, name, `x15% (current x30%)`, right-aligned Imprint button (price inside); full text on hover. Test: 6 rows visible without scroll instead of 2.
- *Files:* `src/ui/servicePanel.ts` (Codex and cache sections), `src/ui/style.css`.

**B026. Codex slot filter and "fits this item" toggle** (Technician, S, P2)
- *D4:* Codex tabs per category (offensive, defensive, utility, mobility, resource).
- *Ashfall:* the list shows aspects that cannot go on the selected item (`types` in `src/data/loot/aspects.ts`).
- *Change:* a "Fits this item" chip (default on) and category chips from `ASPECT_DEFS`; no extra panel height beyond one 28 px row.
- *Files:* `src/ui/servicePanel.ts`, `src/data/loot/aspects.ts`.

### Skills, Matrix and character

**B027. Half-dimmed "skill points available" line** (Skills, S, P2)
- *Ashfall:* in every Skills shot the line "12 skill points available" is dim on the left and bright on the right ("12 skill points avai" vs "lable", `d-30-skills.png`, `d-31`, `d-33`). Something (a gradient overlay or `mask`) sits across the text.
- *Change:* find the overlay (likely the `.tree-scroll` fade or a `.tree-header` pseudo-element) and limit it to the scroll area; the text should be one colour, accent when points > 0. Test: pixel colour at the text start equals the end.
- *Files:* `src/ui/skillTreePanel.ts`, `src/ui/style.css` (`.tree-header`, `.tree-points`).

**B028. Tier jump chips on desktop** (Skills, M, P2)
- *D4:* the whole tree is on one screen.
- *Ashfall:* the scroll area is 790x342; two tiers (Basic, Core) are visible, five more (Defensive, Tactical, Mastery, Ultimate, Key Passive) need scrolling (`d-30`). The mobile jump chips exist but not on desktop.
- *Change:* show the jump chips (existing `.tree-jump`) under the slot row on desktop and scroll smoothly; give `.tree-scroll` the free height (panel is 520 px, header/slots/hint use 165 px). Test: clicking "Ultimate" brings that tier within the viewport.
- *Files:* `src/ui/skillTreePanel.ts`, `src/ui/style.css`.

**B029. Assign by number key / drag** (Skills, M, P2)
- *D4:* drag a skill onto the bar.
- *Ashfall:* two clicks (slot, then skill); a mis-click on the wrong slot is easy (`d-33-skills-assign.png` shows a big orange banner bar).
- *Change:* with the pointer over a learned active skill, keys `1-4` assign it to that slot (flash the slot), and HTML5 drag from the node to a slot works. Test: hover Hydraulic Strike, press 2, `ctx` slot 2 holds it.
- *Files:* `src/ui/skillTreePanel.ts`, `src/game.ts` (`assignSlot`).

**B030. "Next rank" line in the skill tooltip** (Skills, S, P2)
- *D3/D4:* D4 shows current and next rank values.
- *Ashfall:* tooltip reads "Damage: 116% / Each rank: +10% damage / Select an action bar slot first" (`d-33`).
- *Change:* add "Next rank: 126% (1 point)" in accent, and "Max rank" at 5/5. Test: rank 2 shows 126%.
- *Files:* `src/ui/skillTreePanel.ts`, `src/data/lang/en.json`.

**B031. Matrix button shows unspent points** (Skills, S, P2)
- *D4:* the Paragon board shows unspent points on the entry button.
- *Ashfall:* "Neural Matrix" is a plain button next to "Reset" even with 12 points to spend (`d-30`); only the skill points have text.
- *Change:* a 16 px accent badge with the number on the button (same dot logic as the Skills button). Test: badge text "12".
- *Files:* `src/ui/skillTreePanel.ts`, `src/ui/style.css`.

**B032. Refund one rank** (Skills, M, P3)
- *D4:* skill points can be removed one at a time for gold.
- *Ashfall:* only "Reset (1250 gold)" for the whole tree (`d-30`).
- *Change:* right-click a learned leaf node removes one rank for a small gold cost (confirm via `armConfirm`); only if no dependent node loses its prerequisite. Needs a design decision (docs/decisions.md). Test: refund restores 1 point and gold drops.
- *Files:* `src/ui/skillTreePanel.ts`, `src/game.ts` (`resetSkillTree` neighbours).

**B033. Stat rows too tall** (Character, S, P1)
- *D3/D4:* the character sheet shows all stats at once.
- *Ashfall:* the panel is 300x500; rows are 36 px apart (Strength y 355, Dexterity 391); only Attributes plus 2 Offense rows are visible, the other 14 stats and the "Skills / Bag" buttons need scrolling (`d-20-char.png`).
- *Change:* row pitch 36 px to 26 px (stat rows are text, not item cells), section header 36 to 28 px, and remember each section's collapsed state. Test: 11 or more stat rows visible at 1280x720 without scrolling.
- *Mobile:* keep the touch row height (44 px tap target) under `#ui.touch-ui`.
- *Files:* `src/ui/characterPanel.ts`, `src/ui/style.css` (`.stat-row`).

**B034. Average item power line** (Character, S, P2)
- *D3/D4:* D4 shows the character's item power on the sheet.
- *Ashfall:* none; the doll shows five separate numbers.
- *Change:* a row "Gear power 54" under the level line: mean of equipped `itemPower`; arrow vs the best bag set is not needed. Test: seeded set gives 54.6 and rounds to 55.
- *Files:* `src/ui/characterPanel.ts`.

**B035. Character panel touches the life orb** (Character, S, P3)
- *Ashfall:* the panel (x 12-312, y 110-610) overlaps the life orb (x 247-350, y 603+) by 7 px (`d-20`).
- *Change:* `max-height: calc(100vh - 235px)` for `.character-panel` on desktop (485 px at 720p).
- *Files:* `src/ui/style.css`.

**B036. Dot for learned skills not on the bar** (Skills, S, P3)
- *D4:* new skills highlight until assigned.
- *Ashfall:* action bar slots RMB, 1-4 are empty with several learnable skills (`d-04-hud.png`).
- *Change:* an 8 px accent dot on learned active nodes that are not in `skills.slots`, and an "unassigned" dot on the Skills tab. Test: learn Piston Jab, dot appears; assign, it disappears.
- *Files:* `src/ui/skillTreePanel.ts`.

### Map and quests

**B037. Larger map panel on desktop** (Map, M, P2)
- *D3/D4:* the map is nearly full-screen.
- *Ashfall:* panel 480x642 at x 400-880, y 39-681; the map square is 450x450; the panel covers the action bar and the region name (`d-40-map.png`).
- *Change:* desktop size `min(960px, 100vw - 40px) x (100vh - 120px)` with the map scaled to fit and the legend as a right column; centred above the action bar. Test: panel bottom <= 600 at 720p and the map is at least 500 px.
- *Files:* `src/ui/minimap.ts` (MapUi), `src/ui/style.css`.

**B038. Glyphs without legend or label** (Map, S, P2)
- *Ashfall:* the legend lists Teleporter (blue diamond), Quest (yellow dot), Boss (red diamond), You; the map shows six white circles and two orange diamonds that are not in the legend (`d-40`).
- *Change:* list every drawn glyph in the legend and show a 120 ms hover label with the place name. Test: each glyph colour has a legend entry.
- *Files:* `src/ui/minimap.ts`.

**B039. Zoom and pan** (Map, L, P3)
- *D3/D4:* wheel zoom and drag pan.
- *Ashfall:* a fixed 450 px square.
- *Change:* wheel zoom 1x-4x, drag to pan, double-click to re-centre on the player, `Esc`/`M` close. Test: wheel up doubles the scale.
- *Files:* `src/ui/minimap.ts`.

**B040. Main/side grouping and trivial-quest dimming** (Quests, S, P3)
- *D4:* grouped by zone and type; low-level quests greyed.
- *Ashfall:* one list; a level-3 quest for a level-50 character looks the same (`d-41-quests.png`).
- *Change:* "Main" first, "Side" second with small headings; quests 20+ levels below the player get a muted title and the label "Trivial". Test: Fuel for the Living above the two side quests.
- *Files:* `src/ui/questUi.ts`.

### Settings, menus and endgame

**B041. Esc opens a pause menu** (Menu, M, P1)
- *D3/D4:* Esc opens Resume, Settings, Controls, Quit to character select.
- *Ashfall:* Esc with nothing open does nothing (`d-05-escape-nothing-open.png`); settings are reachable by the 34 px icon at the bottom right; there is no way back to character select or a manual save/export except F5 and debug.
- *Change:* a 280 px centred panel "Paused": Resume, Settings, Character select, Export save; pauses the simulation (`pauseInMenus` already exists). Esc closes. Test: press Esc, four buttons, game time stops.
- *Mobile:* the same panel from the existing menu button.
- *Files:* `src/ui/panelStack.ts`, `src/ui/panelRegistry.ts`, `src/game.ts`.

**B042. Key rebinding** (Settings, M, P1)
- *D3/D4:* full key rebinding.
- *Ashfall:* `settings.keybindings` and 26 actions exist (`src/data/settings.ts`) but the Controls tab shows only touch options (`d-52-set-controls.png`).
- *Change:* a list in Settings > Controls: action label, key chips, click to rebind (listen for the next key), conflict warning, per-row reset. Test: rebind inventory to B and the new key opens it.
- *Files:* `src/ui/settingsPanel.ts`, `src/data/settings.ts`, `src/ui/hud.ts` (`keyLabel`).

**B043. Touch-only rows on desktop** (Settings, S, P2)
- *Ashfall:* the Controls tab shows Touch controls, Movement, Thumb layout and Button size on a desktop; Display shows Vibration (`d-51`, `d-52`).
- *Change:* hide Thumb layout, Button size and Vibration unless touch is active (`html.touch-device`), keep Movement (click vs WASD) on both. Test: three fewer rows at 1280x720.
- *Files:* `src/ui/settingsPanel.ts`.

**B044. Accessibility: reduce flashing and colour-blind palette** (Settings, M, P2)
- *D4:* colour-blind modes and a "reduce flashing" option.
- *Ashfall:* Display has only Text size, Graphics, Screen shake, Show FPS, Pause in menus (`d-51`). Green/red arrows (▲▼), rarity colours and status colours have no alternative palette.
- *Change:* an "Accessibility" block in Display: Reduce flashing (disable low-life vignette pulse, hit flash, ready flash), Colour-blind palette (CSS variables swap green/red to blue/orange for ▲▼, bars). Test: with the option on, `.cell-arrow.up` colour is not green.
- *Files:* `src/ui/settingsPanel.ts`, `src/data/settings.ts`, `src/ui/style.css`.

**B045. Brightness** (Settings, S, P2)
- *D3/D4:* a brightness/gamma slider.
- *Ashfall:* the scene is dark (`d-04-hud.png`) and the only visual options are Low/Medium/High.
- *Change:* a 0.8-1.4 slider in Display applying `filter: brightness()` to the canvas (`--scene-brightness`); the UI stays unfiltered. Test: setting persists after reload.
- *Files:* `src/ui/settingsPanel.ts`, `src/data/settings.ts`.

**B046. Loot label filter option** (Settings, S, P2)
- *D3/D4:* loot filter; D4 hides low rarities.
- *Ashfall:* `lootLabels.ts` shows magic+ always and everything while Alt is held; the player cannot change the threshold.
- *Change:* a segmented "Loot labels" row in Display: All / Magic+ / Rare+ / Legendary+ (default Magic+), plus "Always show crystals". Only the setting is in scope here; label design belongs to the HUD audit. Test: with Rare+ a magic drop has no label.
- *Files:* `src/ui/settingsPanel.ts`, `src/ui/lootLabels.ts`, `src/data/settings.ts`.

**B047. Reset to defaults** (Settings, S, P3)
- *Ashfall:* no reset anywhere in Settings (`d-50`-`d-52`).
- *Change:* a "Reset this tab" button at the bottom using `armConfirm` (two taps). Test: change Graphics to Low, reset, High.
- *Files:* `src/ui/settingsPanel.ts`.

**B048. Name and Create below the fold at 720p** (Char select, S, P1)
- *D3/D4:* the create screen shows class, name and Create together.
- *Ashfall:* after picking a class the hero image starts at y 495 and fills the rest of the screen; the name field, class text and Create button are not visible at 1280x720 (`d-02-select-class.png`, `d-03-select-class-picked.png`). The mobile cards are 83x105 (`m-02`).
- *Change:* cap the hero art at `max-height: calc(100vh - 560px)` (about 160 px at 720p) or put it behind the cards, and keep the name and Create row in view. Test: `[data-testid=char-create]` rect bottom <= 720.
- *Files:* `src/ui/characterSelect.ts`, `src/ui/style.css`.

**B049. Richer slot cards** (Char select, M, P3)
- *D3/D4:* the slot shows class, level, zone, playtime and gear power.
- *Ashfall:* `characterSlots()` returns name, classId, level, savedAt only (`src/game.ts:837`).
- *Change:* read zone and mean equipped power from the save for a second line ("Cinder Flats - Gear 55") and "last played" as relative time. Test: the card shows the zone name.
- *Files:* `src/game.ts` (`characterSlots`), `src/ui/characterSelect.ts`.

**B050. Reward preview on the Deep Rift panel** (Rift, M, P3)
- *D3:* Greater Rift level shows the expected reward tier.
- *Ashfall:* the panel shows only "Life x4.29" and "Item power 460" for level 25 (`d-71-rift.png`), and "Best: Rift 24, cleared in -" for a missing time.
- *Change:* add chips for expected XP bonus and shard yield from `rifts` data, and print "no time" instead of "-". Test: chips change with the slider.
- *Files:* `src/ui/riftPanel.ts`, `src/data/lang/en.json`.
