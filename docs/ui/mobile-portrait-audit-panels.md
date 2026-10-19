# Mobile portrait GUI audit: panels and menus

100 concrete improvements for the DOM panels and menus of Ashfall on a phone held upright (`#ui.touch-ui.portrait`, `src/ui/`, `src/ui/style.css`). Nothing in `src/` was changed; this is an audit.

- **Scope:** character select and creation, inventory and equipment, item tooltips and comparison, character stats, skill tree and Neural Matrix, quest log, full map and teleport, dialogue, hub services (vendor, blacksmith incl. tempering and masterwork, technician incl. Codex, stash), sound, World Tier and Deep Rift panels, epilogue and credits, confirm and notice dialogs, plus missing basics (settings, onboarding, back/close, scrolling, tap vs hold, text size, contrast, safe areas, keyboard, empty states, sort/filter, spacing).
- **Out of scope:** the in-world HUD (bars, minimap, tracker, thumb buttons, name plates, region banner, loot labels) is covered by the sibling HUD audit. HUD items appear here only where they touch a panel (ghosting, overlap with the dialogue sheet).
- **Method:** production build (`npx vite build`), `vite preview` on port 5191, Playwright Chromium with software WebGL and mobile emulation (`isMobile`, `hasTouch`, DPR 2) at **390x844**, **360x780** and **320x640**. The test character was level 50 with 40 backpack items (all rarities, crystals), 48,210 gold, four quests, 12 Neural Matrix points, learned tempering recipes, materials, and `ashfall.account` `endgame.tierUnlocked` set so tiers 2-3 and Deep Rift 25 were open. Panels were opened with the touch menu buttons (real `tap`), hub panels through the debug handle (`window.ashfall.openService`, `tierPanel.show`, `riftPanel.showSelect`, `epilogue.show`) with the player placed in Outpost Ember. Real touch swipes and holds were sent through CDP `Input.dispatchTouchEvent`. Measurements (tap-target sizes, computed font sizes, panel rectangles) come from `getBoundingClientRect` / `getComputedStyle` in the page.
- **Limits:** emulated Chromium only. All three widths were captured for every panel. The soft keyboard was simulated by shrinking the viewport, safe-area insets and haptics were assessed from the code (`env()`, `navigator.vibrate`), not on a device.
- **Screenshots:** `/tmp/claude-0/-home-user/91b10048-104f-50d9-baf1-7585dd3fa3ee/scratchpad/ui-audit-b/shots/` (`<name>-<width>.png`, e.g. `inv-390.png`, `vendor-390.png`; character select files are `cs-*`). Names are quoted in every item; the full list is in the appendix.
- **Priorities:** 1 = broken, unsafe or blocks play on a phone; 2 = clear usability gain; 3 = polish. **Effort:** S = a CSS/DOM tweak in one or two files, M = a new component or a change across several files, L = a new panel layout or feature.
- **Respecting past decisions:** `docs/decisions.md` (2026-10-03 touch controls, 2026-10-15 portrait layout, 2026-10-18 no `confirm()` because of the artifact iframe) was read first. Items P012 and P013 build on the third one (P013 generalises the "use the exit twice within 8 s" pattern that already guards leaving a rift); the touch controls and portrait HUD layout themselves are kept.

## Most important findings

1. **The epilogue cannot be dismissed by touch** (P001): `#ui *` removes pointer events from the Continue and Skip buttons.
2. **The service panels hide or cover the backpack** (P084, P006): the blacksmith and technician grow to the full screen and sit on top of the inventory, vendor and stash overlap it, and closing a service leaves the inventory open.
3. **One tap spends money or points** (P013, P061, P085, P076, P091): vendor buy and sell, "salvage all", skill learning and map teleport have no preview and no confirmation.
4. **Native `confirm()`** for character delete and respec (P012) is already known to be blocked in the artifact iframe.
5. **Tooltips are hover leftovers** (P054, P055): they stick after a tap, cannot scroll, and are clipped at 48 vh.
6. **No settings, no Back, five different close controls** (P025, P002, P003): textScale, graphics, shake, FPS and touch mode exist in `settings.ts` but only in the F3 debug panel.
7. **Tap targets and text are too small** (P020, P043, P019): 25-31 px backpack cells, 23 px close buttons, 9-10 px labels.
8. **The Tier Beacon rebuilds its DOM twice a second** (P096), which detaches the button under the finger.
9. **Name entry** (P035-P037): autofocus raises the keyboard before the classes are seen; the field is 15 px (iOS zoom) with no keyboard hints.
10. **Layering:** panels stack on each other and the HUD ghosts through (P005, P007), and toasts render below panels (P010).

## Counts

| | S | M | L | Total |
|---|---|---|---|---|
| Priority 1 | 14 | 10 | 2 | 26 |
| Priority 2 | 36 | 14 | 0 | 50 |
| Priority 3 | 18 | 6 | 0 | 24 |
| **All** | 68 | 30 | 2 | **100** |

## Index

| ID | Area | Item | Eff | Pri |
|---|---|---|---|---|
| P001 | Epilogue | Epilogue Continue and Skip cannot be tapped | S | 1 |
| P002 | Navigation | Android Back button and browser Back leave the game | M | 1 |
| P003 | Navigation | One close control, in the panel header, that knows every panel | M | 1 |
| P004 | Navigation | Swipe down on the header to close a panel | M | 2 |
| P005 | Navigation | One main panel at a time plus a bottom tab bar to switch | M | 2 |
| P006 | Navigation | Leaving a hub service or the Tier Beacon leaves the inventory open | S | 1 |
| P007 | Layering | HUD ghosts through the panels; panels need an opaque backdrop in portrait | S | 1 |
| P008 | Layering | Keep a thin life/resource strip visible above full-screen panels | S | 2 |
| P009 | Layering | Optional "pause while menus are open" | M | 2 |
| P010 | Notices | Toasts and error notices render under the panels | S | 1 |
| P011 | Layering | Sticky panel header with title, close and gold | S | 2 |
| P012 | Dialogs | Replace native `confirm()` with an in-app confirmation sheet | M | 1 |
| P013 | Dialogs | Two-step confirmation for expensive or irreversible one-tap actions | M | 1 |
| P014 | Layering | Tap outside non-full panels closes them | S | 3 |
| P015 | Layering | Panel open/close motion (and reduced motion) | S | 3 |
| P016 | Scrolling | Declare touch-scroll behaviour on panels (containment, momentum) | S | 3 |
| P017 | Scrolling | Scroll position survives refresh and re-open | S | 3 |
| P018 | Scrolling | Show that a panel scrolls | S | 3 |
| P019 | Typography | Minimum text size 12 px in the touch UI | S | 1 |
| P020 | Tap targets | Every control is at least 44x44 CSS px | M | 1 |
| P021 | Typography | Contrast of muted text and empty states | S | 2 |
| P022 | Typography | Layouts must survive the text-size setting (0.75x to 2x) | M | 2 |
| P023 | Safe areas | Safe-area insets missing outside the panels | S | 2 |
| P024 | Typography | Spacing and type scale tokens | M | 3 |
| P025 | Settings | Settings panel (Sound | Display | Controls tabs) | L | 1 |
| P026 | Settings | Text size control with live preview | S | 1 |
| P027 | Settings | Controls tab: touch controls, movement, thumb layout | M | 2 |
| P028 | Settings | Display tab: graphics, FPS and screen shake out of the debug panel | S | 2 |
| P029 | Settings | Vibration (haptics) setting | S | 3 |
| P030 | Settings | Menu button naming: the sliders icon only opens Sound | S | 2 |
| P031 | Onboarding | First-run coach marks | M | 2 |
| P032 | Onboarding | First-open panel tips instead of permanent 10 px hint lines | S | 2 |
| P033 | Onboarding | Notification dots on the menu buttons | S | 2 |
| P034 | Wording | Mouse wording shown on a phone | S | 1 |
| P035 | Character select | Do not autofocus the name field on touch | S | 1 |
| P036 | Character select | Name field: 16 px, right keyboard attributes | S | 1 |
| P037 | Character select | Begin and Back stay reachable above the keyboard | M | 2 |
| P038 | Character select | Slot cards: compact rows instead of 254 px portrait cards | S | 2 |
| P039 | Character select | Class picker: three compact choices and details without scrolling | M | 2 |
| P040 | Character select | Delete character: bigger, safer control | S | 1 |
| P041 | Character select | Continue shortcut and useful slot details | S | 3 |
| P042 | Character select | Credits block as an info sheet | S | 3 |
| P043 | Inventory | Backpack grid: fewer, bigger columns | S | 1 |
| P044 | Inventory | Tap selects an item and shows an action sheet (drag-free) | M | 1 |
| P045 | Inventory | Long-press needs visible progress and clear outcome | S | 2 |
| P046 | Inventory | Salvage on touch, with multi-select | M | 2 |
| P047 | Inventory | Compact equipment area | M | 2 |
| P048 | Inventory | Sort button | S | 2 |
| P049 | Inventory | Filter chips and search | M | 2 |
| P050 | Inventory | Item power, upgrade arrow and new badge on cells | S | 2 |
| P051 | Inventory | Capacity counter and full-bag state | S | 3 |
| P052 | Inventory | Crystal socketing flow | M | 3 |
| P053 | Inventory | Rings and dual slots: say which item is replaced | S | 3 |
| P054 | Tooltips | Tooltip as a dismissible bottom sheet with one shared controller | M | 1 |
| P055 | Tooltips | Tooltip contents are clipped and cannot scroll | S | 1 |
| P056 | Comparison | Side-by-side comparison with the equipped item | M | 2 |
| P057 | Tooltips | Make the affix symbols explainable | S | 2 |
| P058 | Character | Summary header and collapsible sections | S | 2 |
| P059 | Character | Tap a stat to see what it does | M | 3 |
| P060 | Character | Shortcuts to spend points and manage gear | S | 3 |
| P061 | Skill tree | Learning a skill needs select then confirm (like the Matrix) | M | 1 |
| P062 | Skill tree | Tree layout uses the width | S | 2 |
| P063 | Skill tree | Header wraps into four-line buttons | S | 2 |
| P064 | Skill tree | Guided action-bar assignment | S | 2 |
| P065 | Skill tree | Jump chips for the long branch list | S | 2 |
| P066 | Skill tree | Show why a node cannot be learned on the node | S | 3 |
| P067 | Neural Matrix | Fit the board to the viewport on open | S | 2 |
| P068 | Neural Matrix | Visible Allocate button and touch wording | S | 2 |
| P069 | Neural Matrix | Matrix header: "Skills" button vs close | S | 2 |
| P070 | Neural Matrix | Glyph chips and sockets as a picker sheet | M | 3 |
| P071 | Neural Matrix | Gate attach and rotate with a preview | M | 3 |
| P072 | Quests | Collapsible entries and Active / Completed tabs | S | 2 |
| P073 | Quests | Track as a toggle, with "Show on map" | S | 2 |
| P074 | Quests | Completed quests as a list with rewards | S | 3 |
| P075 | Quests | Empty and first-quest states | S | 3 |
| P076 | Map | Teleport needs a confirmation sheet | M | 1 |
| P077 | Map | Markers are tiny and unlabeled | S | 2 |
| P078 | Map | Map layout: full-height sheet, header close, legend instead of a long footer | S | 2 |
| P079 | Map | Region tabs should scroll and be tappable | S | 2 |
| P080 | Map | Pan, zoom and "locate me" | M | 3 |
| P081 | Dialogue | Options of 44 px and no overlap with the thumb buttons | S | 2 |
| P082 | Dialogue | Tap-to-advance, speaker header and readable body | S | 3 |
| P083 | Dialogue | Quest offers as cards with accept as the primary button | S | 3 |
| P084 | Hub services | Service panel and backpack must share the screen, not overlap | L | 1 |
| P085 | Vendor | Buy and sell through an item sheet with price, comparison and gold after | M | 1 |
| P086 | Vendor | Prices as chips under the cells with affordability | S | 2 |
| P087 | Blacksmith | Pinned item card with full stats while reforging | M | 2 |
| P088 | Blacksmith | Accordion sections: Reroll, Tempering, Masterwork | S | 2 |
| P089 | Blacksmith | Tempering preview, ranges and which affix is replaced | M | 2 |
| P090 | Blacksmith | Masterwork costs as chips and next-rank preview | S | 2 |
| P091 | Blacksmith | Confirm and count for "Salvage all common and magic items" | S | 1 |
| P092 | Technician | Codex of Power: unlocked first, locked grouped | S | 2 |
| P093 | Technician | Show the aspect before extract or imprint | S | 2 |
| P094 | Stash | Stash: empty state, counts and transfer clarity | S | 2 |
| P095 | Sound | Volume sliders: bigger, with values and a test sound | S | 2 |
| P096 | World Tier | Tier Beacon rebuilds its buttons twice a second, swallowing taps | S | 1 |
| P097 | World Tier | Tier rows: compact comparison, lock progress and confirm | S | 2 |
| P098 | Deep Rift | Rift level stepper and slider are too small | S | 2 |
| P099 | Deep Rift | Rift result: glyph attempts with odds and feedback | S | 3 |
| P100 | Credits | Credits pacing and readability on a phone | S | 3 |


## 1. Panel framework: back, close, layering, confirmations

How panels open, stack, close and ask "are you sure". Today there are five different close mechanisms and no history integration.

### P001 - Epilogue Continue and Skip cannot be tapped

- **Area:** Epilogue
- **Problem:** `.epilogue` sets `pointer-events: auto`, but `#ui * { pointer-events: none }` (style.css:30) zeroes every child, and only `.panel`, `.char-select` and a few others are re-enabled (style.css:31-32). On the epilogue card `document.elementFromPoint` over the Continue button returns `CANVAS#game` (`epilogue-390.png`; click only worked through `element.click()`). Nothing else advances the card, so a phone player is stuck on the ending screen.
- **Change:** Add `#ui .epilogue, #ui .epilogue * { pointer-events: auto; }` next to the other allow-list rules. Also make the whole card tappable (tap anywhere shows credits, tap on credits = skip after 1 s) and give `.epilogue-skip` a 44 px target. Test: with Playwright `page.tap("[data-testid=epilogue-continue]")` succeeds and the credits appear.
- **Files:** src/ui/style.css, src/ui/epilogue.ts
- **Effort / priority:** S / 1

### P002 - Android Back button and browser Back leave the game

- **Area:** Navigation
- **Problem:** No `history.pushState`, `popstate` or `Escape` handling exists anywhere in `src/` (grep). On a phone, Back from an open panel leaves the page (the artifact/PWA closes or reloads) instead of closing the panel. Escape is not handled either, so even on desktop only the toggle keys close a panel.
- **Change:** New `src/ui/panelStack.ts`: every panel registers `open()/close()`; opening pushes `history.pushState({panel:id}, "")`, `popstate` closes the top panel, closing by UI calls `history.back()` only if the top entry is ours. Character select sub-screens (class picker) use the same stack so Back returns to the slot list. Test: open Inventory, `page.goBack()` -> inventory hidden and the game still running.
- **Files:** src/ui/panelStack.ts (new), src/game.ts, src/ui/touchControls.ts, src/ui/characterSelect.ts
- **Effort / priority:** M / 1

### P003 - One close control, in the panel header, that knows every panel

- **Area:** Navigation
- **Problem:** Close is `.touch-close` (36 px X floating at the screen corner, `inv-390.png`), `.service-close` "×" 23x23 px (vendor, tier, rift: `tier-390.png`, `rift-390.png`), a text "Close" button (sound: `sound-390.png`), "Goodbye" (dialogue: `dialogue-390.png`), "Continue/Skip" (epilogue) and a "Close" on the lore panel. `touchControls.ts` TOGGLE_PANELS lists only inventory, character, skills, map and quests: with the vendor open the floating X closes the inventory and leaves the service panel up (in `blacksmith-390.png` the floating X sits on top of the service panel's own small "x"). On the map panel (vertically centred) the X sits over the minimap, far from the panel (`map-390.png`).
- **Change:** One `panelHeader(title, onClose)` helper used by every `.panel`: 44x44 close button at the header right, same glyph, `aria-label="Close"`. Remove `.touch-close` and `.service-close`. The close action calls the panel stack (P002) so any open service/tier/rift/sound/dialogue panel closes through the same path. Test: open each panel listed above and assert exactly one visible close button in its header with a >=44x44 box.
- **Files:** src/ui/panelHeader.ts (new), src/ui/touchControls.ts, src/ui/servicePanel.ts, src/ui/tierPanel.ts, src/ui/riftPanel.ts, src/ui/soundPanel.ts, src/ui/interactUi.ts, src/ui/style.css
- **Effort / priority:** M / 1

### P004 - Swipe down on the header to close a panel

- **Area:** Navigation
- **Problem:** Panels are full-width sheets in portrait (`#ui.touch-ui.portrait .panel`, style.css:905) but can only be closed with the far-corner X. There is no swipe gesture and no grab handle that says the sheet can be dismissed.
- **Change:** Add a 36x4 px grab handle above the title and a pointer handler on the header: drag down > 80 px (or fling > 0.5 px/ms) while `scrollTop === 0` translates the sheet and closes it through the panel stack; otherwise it springs back in 150 ms. Do not start the gesture inside `.tree-scroll`, `.matrix-viewport` or `input[type=range]`. Test: dispatch touch events 120 px down on the header -> panel hidden.
- **Files:** src/ui/panelHeader.ts (new), src/ui/style.css
- **Effort / priority:** M / 2

### P005 - One main panel at a time plus a bottom tab bar to switch

- **Area:** Navigation
- **Problem:** Opening Inventory, then Character, then Skills leaves three full-width panels stacked at `top: 6px`, ghosting each other (`three-panels-390.png`: "CHARACTER" visible behind "SKILLS"); one tap on the floating X then closes all of them at once (the `TOGGLE_PANELS` loop in `touchControls.ts`), so there is no way back from Skills to the Character panel underneath. The menu buttons are covered by the panel, so switching from Inventory to Skills is close, then tap the menu: two taps and a lost scroll position.
- **Change:** In portrait, opening one of Inventory/Character/Skills/Map/Quests closes the other four (service panels keep their inventory companion). Add a 48 px bottom tab bar (the five menu icons, active one highlighted, badge dots from P033) inside `.panel` while any of those is open. Test: press `character` while Inventory is open -> only `.character-panel` visible; tap the Skills tab -> skills visible in one tap.
- **Files:** src/game.ts, src/ui/touchControls.ts, src/ui/style.css
- **Effort / priority:** M / 2

### P006 - Leaving a hub service or the Tier Beacon leaves the inventory open

- **Area:** Navigation
- **Problem:** `servicePanel.onToggle(true)` opens the inventory but `onToggle(false)` only clears the grid-click hook (game.ts:529-536); `case "beacon"` and `"riftObelisk"` call `servicePanel.close()` before showing their own panel. Result: the Tier Beacon panel opens on top of a still-open inventory, whose hint text shows through (`tier-360.png`, bottom edge), and a second close is needed.
- **Change:** Track `inventoryOpenedByService`; when the service panel closes (or the beacon/obelisk takes over) close the inventory too if the service opened it. Test: open vendor, close with its X -> no `.panel:not([hidden])` remains.
- **Files:** src/game.ts, src/ui/servicePanel.ts
- **Effort / priority:** S / 1

### P007 - HUD ghosts through the panels; panels need an opaque backdrop in portrait

- **Area:** Layering
- **Problem:** `.panel` background is `rgba(14,12,11,0.94)` (style.css:383) so the life bar text "906 / 906", the menu icons and the quest tracker stay faintly visible behind every title and control (`inv-390.png` title row, `skills-390.png` "6 skill points available" over the menu icons, `matrix-390.png`, `stash-390.png` where "INVENTORY" shows behind "STASH").
- **Change:** Under `#ui.touch-ui.portrait.touch-panel-open` hide the HUD that panels cover (`.hud`, `.touch-menu`, `.minimap`, `.quest-tracker`, `.endgame-stack`, `.wave-tracker`, `.target-frame`) with `visibility:hidden` and set panel background to `#0e0c0b` (opaque). Add the service/tier/rift/sound/dialogue panels to the same state class (they are not in `TOGGLE_PANELS`). Test: screenshot of any panel has no HUD glyphs inside its bounding box.
- **Files:** src/ui/touchControls.ts, src/ui/style.css
- **Effort / priority:** S / 1

### P008 - Keep a thin life/resource strip visible above full-screen panels

- **Area:** Layering
- **Problem:** The portrait panels cover the life bar, which is the only information about a fight that keeps running while the player reads a tooltip (nothing pauses: `loop.timeScale` is only set by hit-stop). A death behind an open inventory is possible.
- **Change:** In portrait with a panel open, show the life bar as a 6 px strip at the very top (`z-index: 35`, safe-area aware) and flash it red on damage; panels start below it (`top: calc(var(--sat) + 12px)`). Test: take damage with the inventory open -> strip width and colour change.
- **Files:** src/ui/style.css, src/ui/hud.ts
- **Effort / priority:** S / 2

### P009 - Optional "pause while menus are open"

- **Area:** Layering
- **Problem:** The simulation keeps running under a full-screen panel (`game.ts` update loop has no panel check). Reading the 12-line legendary tooltip or the Codex (`technician-360.png`) while enemies attack is not viable on a phone.
- **Change:** New setting `pauseInMenus: boolean` (default true when `isTouchDevice()` and no enemy is within 12 m; always on in hubs). `Game.update` sets `loop.timeScale = 0` while a main panel/service/dialogue is open and the setting is on. Show a small "Paused" chip in the panel header. Test: tick counter does not advance while Inventory is open.
- **Files:** src/data/settings.ts, src/game.ts, src/ui/panelHeader.ts (new)
- **Effort / priority:** M / 2

### P010 - Toasts and error notices render under the panels

- **Area:** Notices
- **Problem:** `.toast-stack` has no `z-index` while panels use 30 and tooltips 40 (style.css:819, 1037); in portrait the stack sits at `top: sat+190px`, inside the full-width panel area. Errors raised by panel actions ("Inventory full", "Your class cannot use this", `services.cannot.*`, `loot.cannot.*`) are therefore hidden while the panel that caused them is open: with the inventory open a toast at y=184-217 is covered, `document.elementFromPoint` at its centre returns the panel `.slot-label` element instead of `.toast` (`toast-under-panel-390.png`).
- **Change:** Give `.toast-stack` `z-index: 50` and, while `.touch-panel-open`, anchor it as a bottom snackbar above the safe-area (`bottom: calc(var(--sab) + 16px)`, full width, 44 px min height, 2.4 s for errors). Test: trigger `loot.cannot.full` with the inventory open -> `elementFromPoint` at the toast centre is `.toast`.
- **Files:** src/ui/style.css, src/ui/toast.ts
- **Effort / priority:** S / 1

### P011 - Sticky panel header with title, close and gold

- **Area:** Layering
- **Problem:** Long panels scroll their own title away: scrolled technician shows the gold line under the close button and no title (`technician-360.png`: "48,210 gold" collides with the X, the heading "Pell's Workbench" is gone). Blacksmith content is 803-834 px (just over one screen at 360-390 px width), technician 1369 px.
- **Change:** `position: sticky; top: 0` header row (title, optional gold, close) with the panel background; body scrolls under it. Test: scroll the technician panel to the bottom -> header still visible and the close button does not overlap text.
- **Files:** src/ui/panelHeader.ts (new), src/ui/servicePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P012 - Replace native `confirm()` with an in-app confirmation sheet

- **Area:** Dialogs
- **Problem:** `characterSelect.ts` (delete character) and `skillTreePanel.ts` (respec, 1250 gold at level 50) call `window.confirm`. docs/decisions.md (2026-10-18) records that `confirm()` can be blocked inside the claude.ai artifact iframe, where it returns false and silently does nothing. In the sH run the headless browser auto-dismissed the dialog (`dialogs` log), so the action was lost.
- **Change:** New `src/ui/confirmSheet.ts`: `confirmSheet({title, body, confirmLabel, danger})` returns a Promise<boolean>, bottom sheet with two 48 px buttons (cancel left, confirm right, confirm red for destructive), focus on cancel, Back button cancels. Use it for character delete (show name + level + class), respec (show gold cost and points refunded). Test: no `window.confirm` calls remain (`grep -rn "confirm(" src/ui`).
- **Files:** src/ui/confirmSheet.ts (new), src/ui/characterSelect.ts, src/ui/skillTreePanel.ts, src/game.ts
- **Effort / priority:** M / 1

### P013 - Two-step confirmation for expensive or irreversible one-tap actions

- **Area:** Dialogs
- **Problem:** One tap performs: buy a vendor item (`servicePanel.vendor()` click -> `actions.buy`), sell a backpack item (`backpackClick` -> `actions.sell`, even a legendary), store in stash, "Salvage all common and magic", "Extract aspect" (item destroyed), tempering (585 gold), masterwork, tier change, teleport (P076). Hover tooltips on touch show only simultaneously with the click, so the player cannot read what they are spending gold on first.
- **Change:** Shared pattern "arm then confirm": first tap turns the button into `Confirm - 1,235 gold` (accent colour, 3 s timeout, haptic tick), second tap executes; actions under a gold threshold or on common items stay one-tap. Rare+ sells and every destroy action always require the second tap. Test: tapping a vendor stock cell does not change gold; second tap on the armed button does.
- **Files:** src/ui/servicePanel.ts, src/ui/tierPanel.ts, src/ui/minimap.ts, src/ui/style.css
- **Effort / priority:** M / 1

### P014 - Tap outside non-full panels closes them

- **Area:** Layering
- **Problem:** Sound (204 px), Tier Beacon, Deep Rift and Dialogue panels leave most of the screen visible but taps on the world do nothing to them (and, because `#ui .panel *` is the only hit area, taps on the canvas still move the character while the panel stays open).
- **Change:** Add a transparent scrim element behind `.panel.sheet-small` panels (`pointer-events: auto`, `z-index: 29`) that swallows the tap and closes the top panel. Test: open the sound panel, tap at (195, 600) -> panel hidden and the player did not start walking.
- **Files:** src/ui/panelStack.ts (new), src/ui/style.css
- **Effort / priority:** S / 3

### P015 - Panel open/close motion (and reduced motion)

- **Area:** Layering
- **Problem:** Panels appear and disappear instantly (`hidden` toggled), which on a full-screen sheet reads as a flash and gives no spatial cue for swipe-to-close.
- **Change:** Slide-up 160 ms ease-out on open, slide-down 120 ms on close using a `.panel.is-opening/.is-closing` class; disable under `@media (prefers-reduced-motion: reduce)`. Test: computed `transition-duration` is 0s with reduced motion.
- **Files:** src/ui/panelStack.ts (new), src/ui/style.css
- **Effort / priority:** S / 3


## 2. Scrolling, text size, tap targets, safe areas

Measured at 360x780 with `scripts` in the audit session: smallest tap targets and smallest text per panel.

### P016 - Declare touch-scroll behaviour on panels (containment, momentum)

- **Area:** Scrolling
- **Problem:** Swipe scrolling works: CDP touch swipes over the technician panel moved `scrollTop` 0 -> 435 -> 478 (its maximum) and `window.scrollY` stayed 0. But nothing in the CSS declares it: `html.touch-device` is `touch-action: none` (style.css, touch section), `.panel`, `.tree-scroll`, `.char-select`, `.epilogue-card` and `.matrix-detail` set no `touch-action`, `overscroll-behavior` or `-webkit-overflow-scrolling`, and nested scrollers (tooltip sheet, matrix detail, tree list inside a scrolling panel) can chain a fling to the page on iOS Safari and Android Chrome (rubber band, pull-to-refresh). Not reproducible in emulated Chromium, so this is a code-level hardening.
- **Change:** `.panel, .tree-scroll, .char-select, .epilogue-card, .matrix-detail, .tooltip-sheet { touch-action: pan-y; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }` and `overscroll-behavior: none` on `html, body`. Test: after scrolling a panel to the end, a further swipe leaves `window.scrollY` at 0 and does not move the canvas camera.
- **Files:** src/ui/style.css
- **Effort / priority:** S / 3

### P017 - Scroll position survives refresh and re-open

- **Area:** Scrolling
- **Problem:** `ServicePanel.refresh()`, `QuestLog.refresh()`, `TierPanel.refresh()` and `CharacterPanel.refresh()` call `replaceChildren`, which can clamp or reset the panel scroll after every buy/temper/imprint; `SkillTreePanel.refresh()` shows the right pattern (reads `.tree-scroll` scrollTop first and restores it). Reopening any panel starts at the top (`blacksmith-s2-390.png` shows the scrolled state that is lost on close).
- **Change:** Extract `preserveScroll(el, fn)` (read `scrollTop` before rebuild, restore after) and apply to all panels that rebuild; remember `scrollTop` per panel id in a Map for re-open within the session. Test: scroll technician to 600, tap an imprint button -> `scrollTop` still 600.
- **Files:** src/ui/panelHeader.ts (new), src/ui/servicePanel.ts, src/ui/questUi.ts, src/ui/characterPanel.ts, src/ui/tierPanel.ts
- **Effort / priority:** S / 3

### P018 - Show that a panel scrolls

- **Area:** Scrolling
- **Problem:** The technician (1369 px with the Codex), the blacksmith (803 px in a 766 px panel at 360) and the skill tree (2116 px in a 651 px viewport) show no scrollbar on touch and no fade, so players assume the panel ends after "Raise to rank 1" (`blacksmith-390.png`) or after the first screen of Codex rows (`technician-390.png`).
- **Change:** Bottom edge fade (`mask-image` 24 px) while `scrollTop + clientHeight < scrollHeight - 4`, plus a floating "back to top" 44 px chip after 600 px of scroll. Test: fade class present at top, absent at bottom.
- **Files:** src/ui/panelHeader.ts (new), src/ui/style.css
- **Effort / priority:** S / 3

### P019 - Minimum text size 12 px in the touch UI

- **Area:** Typography
- **Problem:** Measured computed sizes per panel at 360 px: inventory hint 10.5 px and empty-slot labels 9.0 px (`.slot-label .6em`); skill node names 9.9 px (`.tree-node .66em`); quest-log reward/kind lines 9.8-10.5 px; dialogue option tag 10.2 px; vendor price 9.8 px; map footer 10.5 px; matrix hint and glyph chips 10.8 px. Base is 15 px.
- **Change:** Introduce `--fs-min: 12px` and clamp every `em` below 0.8 in `#ui.touch-ui` rules: `font-size: max(var(--fs-min), 0.7em)`. Test: a script walking `.panel` text nodes reports no computed font-size below 12 px at textScale 1.
- **Files:** src/ui/style.css
- **Effort / priority:** S / 1

### P020 - Every control is at least 44x44 CSS px

- **Area:** Tap targets
- **Problem:** Measured: backpack/stash cells 25-31 px (10 columns: 31 at 390, 29 at 360, 25 at 320); `.touch-menu-btn` 36; `.service-close` 23; `.service-btn` 27 high; quest `Track` buttons 28 high; dialogue options 28 high; `.sound-close` 29 high; range inputs 16 high; `.rift-step` 26-37 wide, 27 high; tab buttons (`matrix-tab`) 33 high; matrix zoom 36; `.char-slot-delete` 25x20 (P040).
- **Change:** Define `--tap-min: 44px` and apply `min-height/min-width: var(--tap-min)` to `.touch-menu-btn, .service-btn, .quest-log button, .dialogue-buttons button, .sound-close, .map-tab, .matrix button, .rift-step, .tree-header button`; range inputs get `height: 44px`. Test: a script lists any `button, input, .inv-cell, .tree-node` smaller than 44x44 inside open panels -> empty (cells excluded until P043).
- **Files:** src/ui/style.css
- **Effort / priority:** M / 1

### P021 - Contrast of muted text and empty states

- **Area:** Typography
- **Problem:** `--ui-muted #8c8378` on the near-black panel is ~5:1 but the 9 px `.slot-label` (`#5a514a` on `#120f0d`, about 2.3:1), `.inv-hint`, `.quest-step` and `.item-tip-power` combine low contrast with tiny size (`inv-390.png` "Helm / Amulet / Gloves").
- **Change:** Raise `.slot-label` to `#8c8378` at 12 px and draw a faint slot silhouette (CSS mask of the existing menu icons) instead of text; set `.inv-hint` to `--ui-text` at 85 % alpha. Test: computed contrast >= 4.5:1 for all body text via a small script.
- **Files:** src/ui/style.css
- **Effort / priority:** S / 2

### P022 - Layouts must survive the text-size setting (0.75x to 2x)

- **Area:** Typography
- **Problem:** `settings.textScale` goes up to 2 (`--text-scale` multiplies the 15 px root). Measured at 1.5x and 2x: no horizontal overflow, but only the text grows. Doll cells stay `60px` so "Off-Hand" wraps to two lines and the hint to three (`scale2-inv-390.png`), tree nodes stay `74px` with three-line names (`scale1.5-skills-390.png`), backpack cells stay 31 px so larger text brings no larger targets, the character panel grows from 584 to 1086 px, and the thumb-button labels ("Dodge", "Stim pack x4") overflow their circles.
- **Change:** Convert panel metrics to `em`/`rem` or `min()`: doll `grid-template-columns: repeat(3, minmax(3.6em, 1fr))` with `slot-label` `overflow-wrap: anywhere`, tree node `min-width: 5em`, grid columns `repeat(auto-fill, minmax(3.4em, 1fr))`, tooltip `width: auto`; scale `--tap-min` with the text (`max(44px, 3em)`). Test: at `--text-scale: 2` the smallest tap target in the inventory is >= 44 px and no `.panel` has `scrollWidth > clientWidth`.
- **Files:** src/ui/style.css
- **Effort / priority:** M / 2

### P023 - Safe-area insets missing outside the panels

- **Area:** Safe areas
- **Problem:** Panels use `--sat/--sab/--sal/--sar` but the character select (`padding-bottom: 48px`, style.css:935 region, credits block at the bottom), `.epilogue-skip` (`right/bottom: 16px`), `.epilogue-card`, `.lore-panel`, `.sound-panel` rule `#ui.touch-ui .sound-panel { top: 54px }` and `.dialogue-panel` bottom use plain pixels; `viewport-fit=cover` is set in index.html so content runs under the notch and the home indicator.
- **Change:** Use `max(16px, env(safe-area-inset-*))` on those paddings; make `--sat/--sab` available on `html` rather than only `#ui.portrait`. Test: with `env()` overridden to 44/34 px in DevTools, no text or button sits inside the inset.
- **Files:** src/ui/style.css
- **Effort / priority:** S / 2

### P024 - Spacing and type scale tokens

- **Area:** Typography
- **Problem:** Panel padding is `12px 14px`, headings `1em / 0.25em` tracking, section titles 0.7-0.8em with 0.12-0.15em tracking, rows use 4/6/8/10 px gaps arbitrarily (character panel `0.82em`, quest log `0.8em`, service `0.8em`, tooltip `0.82em`).
- **Change:** Define `--space-1..5` (4/8/12/16/24) and `--fs-body/--fs-small/--fs-title/--fs-label`; migrate `.panel`, `.service-*`, `.log-*`, `.char-section`, `.tree-*`, `.matrix-*`. Test: `grep -c "font-size: 0\."` for panel rules drops to the token uses only.
- **Files:** src/ui/style.css
- **Effort / priority:** M / 3


## 3. Settings and onboarding

settings.ts already stores textScale, graphics, screenShake, showFps, touchControls, moveMode, language and audio, but the only UI is the F3 debug panel, which a phone cannot open, and the volume sliders.

### P025 - Settings panel (Sound | Display | Controls tabs)

- **Area:** Settings
- **Problem:** The seventh menu icon (sliders, `hud-390.png`) opens only the volume sliders (`soundPanel.ts`, titled "Sound"). `Settings.textScale`, `graphics`, `screenShake`, `showFps`, `touchControls` and `moveMode` can be changed only in the debug panel (`devtools.ts`, toggle key F3/Backquote).
- **Change:** New `src/ui/settingsPanel.ts` with three tabs; the Sound tab is the existing `SoundUi` content (volume sliders + mute); Display: text size (P026), graphics, screen shake, FPS; Controls: P027. Writes through the existing `saveSettings` and `Game` setters (`setGraphics`, `setTouchControls`, `setMoveMode`). Test: change graphics to Low in the panel, reload -> still Low.
- **Files:** src/ui/settingsPanel.ts (new), src/ui/soundPanel.ts, src/game.ts, src/data/lang/en.json
- **Effort / priority:** L / 1

### P026 - Text size control with live preview

- **Area:** Settings
- **Problem:** The setting exists (0.75-2) and is applied at start (`game.ts:260`) but cannot be changed on a phone; at 390 px base text is 15 px, panels use 9-12 px (P019).
- **Change:** Segmented control S / M / L / XL (0.9 / 1.0 / 1.15 / 1.35) with a preview line, applied immediately by setting `--text-scale` on `documentElement`. Needs P022 so layouts survive. Test: choose XL -> `getComputedStyle(document.documentElement).fontSize` is 20.25px and no panel overflows horizontally.
- **Files:** src/ui/settingsPanel.ts (new), src/game.ts
- **Effort / priority:** S / 1

### P027 - Controls tab: touch controls, movement, thumb layout

- **Area:** Settings
- **Problem:** `touchControls` (auto/on/off) and `moveMode` are debug-only. The joystick is fixed at the lower left and the thumb cluster at the right (`#ui.touch-ui.portrait .slots`), which suits right-handed play only; button size is fixed (46/76 px).
- **Change:** Controls tab: Touch controls auto/on/off, Move mode (click/WASD), joystick side (left/right), thumb button size (S/M/L scale 0.9-1.2). New settings fields `joystickSide`, `buttonScale` in `SettingsSchema` (default unchanged). Apply via CSS custom properties on `#ui`. Test: switch side -> joystick zone and cluster swap sides in a screenshot.
- **Files:** src/data/settings.ts, src/ui/settingsPanel.ts (new), src/ui/touchControls.ts, src/ui/style.css
- **Effort / priority:** M / 2

### P028 - Display tab: graphics, FPS and screen shake out of the debug panel

- **Area:** Settings
- **Problem:** `graphics: low|medium|high`, `showFps`, `screenShake` are only reachable through `DevTools` (F3). Phones start on medium (`game.ts` first-run) with no way to lower it when the frame rate drops.
- **Change:** Display tab rows: Graphics (3-way segmented, explains "Low: no post-processing"), Screen shake (switch), Show FPS (switch). Reuse `Game.setGraphics` and the `DebugActions` setters. Test: Low -> `renderer` quality changes without reload.
- **Files:** src/ui/settingsPanel.ts (new), src/game.ts
- **Effort / priority:** S / 2

### P029 - Vibration (haptics) setting

- **Area:** Settings
- **Problem:** The only haptic is `navigator.vibrate?.(20)` after a long press (`touchControls.ts:280`), unconditional and not configurable; equip, level-up, errors and potion use give no tactile cue; iOS Safari has no vibrate API.
- **Change:** New `Settings.haptics: boolean` (default true), a `haptic(kind)` helper (`tick` 10 ms, `success` 25 ms, `error` 40-30-40 ms) used by long-press, equip/unequip, purchase, errors, level up; the switch is hidden when `!("vibrate" in navigator)`. Test: stub `navigator.vibrate` and assert calls on equip; none when the switch is off.
- **Files:** src/data/settings.ts, src/ui/touchControls.ts, src/game.ts, src/ui/settingsPanel.ts (new)
- **Effort / priority:** S / 3

### P030 - Menu button naming: the sliders icon only opens Sound

- **Area:** Settings
- **Problem:** The tenth menu button (`sliders` glyph) is labelled `touch.menu.soundSettings` and opens a panel titled "Sound"; the speaker button next to it only mutes. Players looking for settings find volume only (`hud-390.png`).
- **Change:** Rename to `touch.menu.settings`, open the new Settings panel; keep the speaker as mute. When muted, show a small strike-through badge on the speaker icon. Test: tap the sliders icon -> `.settings-panel` visible with the Sound tab selected.
- **Files:** src/ui/touchControls.ts, src/ui/soundPanel.ts, src/data/lang/en.json
- **Effort / priority:** S / 2

### P031 - First-run coach marks

- **Area:** Onboarding
- **Problem:** A new character lands in the world with no hint that the left half is a joystick, the big button attacks and auto-aims, the icons open panels, or that the "Use | Talk" prompt is tappable; the only hint line (`hud-hint`) is hidden in touch (`#ui.touch-ui .hud-title { display:none }`).
- **Change:** Four dismissible coach marks (move, attack, menu, interact) shown the first time the matching condition occurs, stored in `localStorage` (`ashfall.hints`) with a "Skip tips" link; each is an arrow + 12 px text anchored to the real element. Test: fresh storage shows the move tip; after 3 s of stick input it is marked done and never returns.
- **Files:** src/ui/onboarding.ts (new), src/game.ts, src/ui/style.css, src/data/lang/en.json
- **Effort / priority:** M / 2

### P032 - First-open panel tips instead of permanent 10 px hint lines

- **Area:** Onboarding
- **Problem:** Each panel prints its instructions permanently at 10.5 px muted grey: inventory "Hold an item: equip...", skills "Tap an action bar slot...", matrix "Drag to pan, scroll or pinch...", map footer, vendor hint. They are easy to miss and waste space every time.
- **Change:** Show each hint once per install as a dismissible info banner at the top of the panel (`x` and "Got it"), then move it behind a `?` button in the header. Test: second opening of the inventory has no `.inv-hint`.
- **Files:** src/ui/panelHeader.ts (new), src/ui/inventoryPanel.ts, src/ui/skillTreePanel.ts, src/ui/matrixPanel.ts, src/ui/minimap.ts, src/ui/servicePanel.ts
- **Effort / priority:** S / 2

### P033 - Notification dots on the menu buttons

- **Area:** Onboarding
- **Problem:** Unspent skill points (6 at level 50), new gear, a new quest step or an unspent Neural Matrix point are only visible after opening the panel; the touch menu buttons are plain icons (`touch-menu-btn`).
- **Change:** Add a 10 px accent dot (top-right of the button) driven by: `skillPoints > 0` (Skills), items picked up since the inventory was last opened (Inventory), `quests` changed since last open (Quests), `matrixPoints > 0` (Skills). Clear on open. Test: after a level up the Skills button has `.has-dot`.
- **Files:** src/ui/touchControls.ts, src/game.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P034 - Mouse wording shown on a phone

- **Area:** Wording
- **Problem:** Strings with no touch variant: `map.travel` "Click a discovered teleporter to travel." (`map-390.png`), `services.vendor.hint` "Click an item to buy it. Click an item in your backpack to sell it.", `services.stash.hint`, `matrix.hint` "Drag to pan, scroll or pinch...", `matrix.state.available` "Click to allocate (1 point)", `tree.barHint`; skill descriptions say "at the cursor". Only the inventory and skill-bar hints have a `*Touch` variant.
- **Change:** Add `*Touch` keys for each (and a `touchText(key)` helper that picks `${key}Touch` when `#ui.touch-ui`), rewrite as "Tap...", "Hold...", "Pinch...". For skill descriptions add a `{aim}` token ("at the cursor" / "at your target") filled per input mode. Test: no `Click` or `cursor` text appears in any panel when `#ui.touch-ui` is set (DOM text scan).
- **Files:** src/data/lang/en.json, src/data/i18n.ts, src/ui/minimap.ts, src/ui/servicePanel.ts, src/ui/matrixPanel.ts, src/ui/skillTreePanel.ts
- **Effort / priority:** S / 1


## 4. Character select and creation

Cards stacked at 320 px wide; the class picker is 1560 px tall at 390x844 (`cs-390-class-full.png`).

### P035 - Do not autofocus the name field on touch

- **Area:** Character select
- **Problem:** `showClassPicker` ends with `nameInput.focus()`. On a phone this raises the keyboard before the player has seen the three classes and scrolls the screen to the bottom (`cs-390-class.png` opens already scrolled to the Xenomant card and details; the first two class cards and the heading are above the fold).
- **Change:** Skip `focus()` when `matchMedia("(pointer: coarse)")`; scroll the screen to top on entering the picker; focus only when the name field is tapped. Test: after tapping an empty slot `document.activeElement` is `body` and `scrollTop === 0`.
- **Files:** src/ui/characterSelect.ts
- **Effort / priority:** S / 1

### P036 - Name field: 16 px, right keyboard attributes

- **Area:** Character select
- **Problem:** `.char-name-input` uses `font: inherit` = 15 px; iOS Safari zooms the page on focus for inputs under 16 px (and `maximum-scale=1` is ignored there). The input sets no `autocapitalize`, `autocomplete` or `enterkeyhint` and leaves `spellcheck` at its default, on (measured `csInfo.attrs`: empty, empty, true, empty), so the keyboard offers autocorrect and a "return" key.
- **Change:** Set `font-size: max(16px, 1em)`, `autocapitalize="words"`, `autocomplete="off"`, `spellcheck=false`, `enterkeyhint="done"`, `maxlength 24` with a live "n/24" counter, and make Enter on the keyboard submit (already wired). Test: computed font-size >= 16 px and attributes present.
- **Files:** src/ui/characterSelect.ts, src/ui/style.css
- **Effort / priority:** S / 1

### P037 - Begin and Back stay reachable above the keyboard

- **Area:** Character select
- **Problem:** The name row (input, Begin, Back) is at the bottom of a 1560 px page; with the keyboard open (viewport shrunk to 52 % in `cs-keyboard-390.png`) only the title and the first two class cards fit: the name field and Begin are about 1,100 px below the fold, and tapping the field scrolls the class cards away.
- **Change:** Make the row a sticky bottom action bar (`position: sticky; bottom: 0; padding-bottom: env(safe-area-inset-bottom)`) and listen to `visualViewport.resize` to set a `--kb` inset so the bar sits on the keyboard. Test: with `visualViewport.height` at 52 %, the Begin button `getBoundingClientRect().bottom` is <= `visualViewport.height`.
- **Files:** src/ui/characterSelect.ts, src/ui/style.css
- **Effort / priority:** M / 2

### P038 - Slot cards: compact rows instead of 254 px portrait cards

- **Area:** Character select
- **Problem:** Empty slots are 105 px tall dashed cards (`cs-390-slots.png`), but a saved character becomes a 254 px card with a 175 px square portrait (`cs-existing-390.png`, measured `card` 320x254); three used slots need about 760 px plus the heading, and the credits block is pushed below the fold. Nothing on the card says when it was last played.
- **Change:** In portrait render slots as 88 px rows: 72 px portrait thumbnail left, name + "Bastion - Level 50" + last played right, chevron; empty slot is a 64 px dashed row "+ New character". Test: three used slots + heading fit in 390x700 without scrolling.
- **Files:** src/ui/style.css, src/ui/characterSelect.ts
- **Effort / priority:** S / 2

### P039 - Class picker: three compact choices and details without scrolling

- **Area:** Character select
- **Problem:** Three 234 px class cards stack vertically (measured `cards`, `cs-390-class-full.png`: 1560 px page), the splash/details appear below them, so after choosing a class the player must scroll to read why. The selected state is a border colour only.
- **Change:** Render classes as a 3-column row of 96 px portrait chips (name under each, selected chip raised with accent ring) and show the details card (splash, tagline, description, resource) immediately under it; the chip row is `scroll-snap` on 320 px. Test: at 390x844 the class chips, details and name row are visible without scrolling.
- **Files:** src/ui/characterSelect.ts, src/ui/style.css
- **Effort / priority:** M / 2

### P040 - Delete character: bigger, safer control

- **Area:** Character select
- **Problem:** `.char-slot-delete` is a bare "✕" absolutely placed at `top:6px; right:6px` on the card that plays the character on tap (`char-select` click handler on the card), about 20 px wide (`cs-existing-390.png`, measured in the sH run `del`). A mis-tap on the corner either deletes (after a native confirm) or starts the game.
- **Change:** Replace with a 44 px "..." button in a separate trailing column; it opens a small menu (Delete, Rename) and delete goes through the confirm sheet (P012) that names the character ("Delete Kestrel, level 50 Bastion? This cannot be undone."). Test: tapping 5 px inside the corner no longer triggers delete.
- **Files:** src/ui/characterSelect.ts, src/ui/style.css
- **Effort / priority:** S / 1

### P041 - Continue shortcut and useful slot details

- **Area:** Character select
- **Problem:** `SlotSummary.savedAt` is supplied but never shown; returning players must tap a slot, there is no "Continue" for the last character, and nothing shows World Tier or zone.
- **Change:** Top of the screen: a primary "Continue - Kestrel, Level 50" button (last played slot, remembered in `localStorage`); slot rows show "last played 2 h ago" from `savedAt`. Test: reload with one saved character -> one tap on Continue enters the game.
- **Files:** src/ui/characterSelect.ts, src/game.ts
- **Effort / priority:** S / 3

### P042 - Credits block as an info sheet

- **Area:** Character select
- **Problem:** The 4-line credit text (11 px, `cs-390-slots.png` bottom) sits permanently under the cards and, in the class picker, under the Back button where it is mistaken for UI help text.
- **Change:** Replace with a 44 px "Credits" text button that opens a scrollable sheet with the same lines (and the licence text). Test: `.char-select-credits` is no longer in the DOM of the slot screen.
- **Files:** src/ui/characterSelect.ts, src/ui/style.css
- **Effort / priority:** S / 3


## 5. Inventory and equipment

Inventory panel at 390x844: paper doll 270 px tall, then a 10-column backpack of 31 px cells (`inv-390.png`).

### P043 - Backpack grid: fewer, bigger columns

- **Area:** Inventory
- **Problem:** `.inv-grid { grid-template-columns: repeat(10, 1fr) }` gives 31 px cells at 390 px, 29 px at 360 and 25 px at 320 (`inv-320.png`), under half of the 44-48 px touch minimum; frames, sockets (5 px dots) and rarity borders blur together and mis-taps pick the neighbouring item. Same grid class is reused by vendor stock and stash.
- **Change:** Portrait: `grid-template-columns: repeat(auto-fill, minmax(52px, 1fr))` (6 columns at 360, 7 at 390) with the panel scrolling; socket dots 8 px. Test: `.inv-grid .inv-cell` width >= 44 px at 320, 360 and 390, and 40 cells reachable by scrolling.
- **Files:** src/ui/style.css
- **Effort / priority:** S / 1

### P044 - Tap selects an item and shows an action sheet (drag-free)

- **Area:** Inventory
- **Problem:** On touch the tooltip appears by an emulated `mouseenter` and nothing else happens: equip is only a 450 ms hold (`touchControls.ts` LONG_PRESS), unequip is a hold on the doll, salvage exists only as Shift+click (`inventoryPanel.ts` `e.shiftKey`), socketing is two taps with a crystal. The only instructions are the 10.5 px hint (`inv-390.png`).
- **Change:** Tap = select (accent outline, tooltip sheet from P054) with a 3-button action bar in the sheet: Equip (or Unequip for doll items), Salvage (shows gold), Compare/Socket where relevant; double-tap on a gear item equips it. Keep long-press as a shortcut. Test: tap a legendary pants item, tap Equip -> item moves to the doll; no key or hold needed.
- **Files:** src/ui/inventoryPanel.ts, src/ui/itemTooltip.ts, src/game.ts, src/ui/style.css
- **Effort / priority:** M / 1

### P045 - Long-press needs visible progress and clear outcome

- **Area:** Inventory
- **Problem:** The 450 ms hold (`LONG_PRESS`) fires a synthetic `contextmenu` with no progress indication: holding a backpack cell for 300 ms shows nothing (`longpress-300-390.png`), at 700 ms the item is equipped (equipped slots 3 -> 4) and the tooltip vanishes because the grid is rebuilt (`longpress-after-390.png`). iOS has no `navigator.vibrate`, so a successful equip gives no feedback besides the cell moving. A finger that drifts 10 px silently cancels.
- **Change:** Draw a 28 px circular progress ring (CSS conic-gradient, 450 ms) under the finger on `.inv-cell, .tree-slot`, scale the cell to 0.94 while held, and flash "Equipped" on success; keep the 10 px slop but cancel visibly. Test: after 300 ms the ring element exists with `--p: 0.66`.
- **Files:** src/ui/touchControls.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P046 - Salvage on touch, with multi-select

- **Area:** Inventory
- **Problem:** Salvage is Shift+click in the inventory (`inventoryPanel.ts`), so on a phone it exists only at the blacksmith ("Salvage all common and magic"). Clearing a full backpack means tapping each item twice at the blacksmith or leaving loot behind.
- **Change:** A "Select" toggle in the panel header switches the grid to multi-select (check badge on cells, bottom bar "Salvage 7 items for 312 gold" / "Move to stash" when a service is open). Rare and better items need the confirm sheet (P012). Test: select three items, tap Salvage -> gold increases by the sum shown.
- **Files:** src/ui/inventoryPanel.ts, src/game.ts, src/ui/confirmSheet.ts (new)
- **Effort / priority:** M / 2

### P047 - Compact equipment area

- **Area:** Inventory
- **Problem:** The paper doll is 10 empty/occupied 60 px slots in a 3x4 layout (270 px of the 518 px panel, `inv-390.png`) before the backpack starts at y=335; at 320x640 the backpack spans y=340-445 of 640 (`inv-320.png`), so a 45 % tooltip sheet covers it entirely.
- **Change:** Portrait layout: a 2-row strip of 48 px slots (helm, amulet, chest, gloves, pants, boots / main, off, ring, ring) or an "Equipped | Backpack" segmented control; selected slot highlights where a selected backpack item would go. Test: backpack top edge <= 200 px from the panel top at 390x844.
- **Files:** src/ui/inventoryPanel.ts, src/ui/style.css
- **Effort / priority:** M / 2

### P048 - Sort button

- **Area:** Inventory
- **Problem:** The 40-cell backpack has no ordering: items stay where they dropped, mixed with crystals (`inv-390.png` rows are random rarities). Finding the best pants means opening tooltips one by one.
- **Change:** Header button "Sort" (menu: Rarity, Slot, Item power, Newest) that reorders `inv.grid` via a new `Game.sortInventory(mode)`; crystals last. Persist the mode in settings. Test: after Sort by item power the first cell has the highest `itemPower`.
- **Files:** src/ui/inventoryPanel.ts, src/game.ts, src/systems/loot/inventory.ts
- **Effort / priority:** S / 2

### P049 - Filter chips and search

- **Area:** Inventory
- **Problem:** No way to narrow 40 mixed items to weapons, armour, jewellery or crystals, which also matters for the vendor/stash flows that route taps to the same grid.
- **Change:** A horizontal chip row (All, Weapons, Armour, Jewellery, Crystals, Better than equipped) above the grid; non-matching cells fade to 25 % and become non-tappable; chip state is shared with the service panels. Test: tapping Crystals leaves exactly the crystal cells at full opacity.
- **Files:** src/ui/inventoryPanel.ts, src/ui/style.css
- **Effort / priority:** M / 2

### P050 - Item power, upgrade arrow and new badge on cells

- **Area:** Inventory
- **Problem:** Every cell shows only an icon, a rarity frame and socket dots; the only way to compare is to open each tooltip (`inv-tap-item-360.png`). Items picked up since the panel was last open are indistinguishable.
- **Change:** Corner badges on cells: item power (11 px, bottom right), green "▲" when `Game.compare(item).damagePct > 0` for the target slot, red when worse, and a 8 px accent dot for items new since last open (cleared on view). Test: a legendary with +152 armour shows the green arrow.
- **Files:** src/ui/inventoryPanel.ts, src/game.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P051 - Capacity counter and full-bag state

- **Area:** Inventory
- **Problem:** The backpack holds 40 items but shows no count; with it full, pickups fail with a toast that is hidden behind the panel (P010) and the player cannot tell why loot does not vanish.
- **Change:** Header text "37 / 40" turning red at 40, a "Bag full" banner with a "Salvage junk" shortcut button (reuses `salvageJunk`). Test: grid with 40 items shows the red counter.
- **Files:** src/ui/inventoryPanel.ts, src/game.ts
- **Effort / priority:** S / 3

### P052 - Crystal socketing flow

- **Area:** Inventory
- **Problem:** Socketing is: tap a crystal (cell gets an accent outline, `inv-tap-item-390.png`), then tap a gear cell; the only prompt is a 10.5 px hint line, there is no preview of the bonus and no marker on which items have free sockets (just 5 px dots).
- **Change:** When a crystal is selected show a banner "Pick an item to socket - Flawless Void Crystal: +16% Void Resistance (jewellery)", highlight every gear cell with an empty socket (pulsing frame), dim the rest, and show the resulting stat in the sheet before confirming. Test: with a crystal selected, only cells with free sockets are tappable.
- **Files:** src/ui/inventoryPanel.ts, src/ui/itemTooltip.ts, src/ui/style.css
- **Effort / priority:** M / 3

### P053 - Rings and dual slots: say which item is replaced

- **Area:** Inventory
- **Problem:** `Game.compare` silently picks one ring slot via `targetSlot()`; the tooltip says "Compared to equipped" without naming the item or which of the two ring slots will be used, so a swap can remove the better ring.
- **Change:** For items with two eligible slots, the compare section shows two tabs "vs Ring 1" / "vs Ring 2" with the item names, and the Equip action asks which slot (default: empty or weaker). Test: equip a ring with both ring slots filled -> sheet offers two targets.
- **Files:** src/game.ts, src/ui/itemTooltip.ts, src/ui/inventoryPanel.ts
- **Effort / priority:** S / 3


## 6. Item tooltips and comparison

The same `mouseenter` tooltip pattern is used by the inventory, vendor, stash, skill tree and matrix.

### P054 - Tooltip as a dismissible bottom sheet with one shared controller

- **Area:** Tooltips
- **Problem:** Tooltips are built on `mouseenter` (`inventoryPanel.ts` hover, `servicePanel.ts` hover, `skillTreePanel.ts` nodeCard) and hidden only on `mouseleave`. On touch the browser emulates `mouseenter` on the first tap and never fires `mouseleave` until another element is tapped, so a sheet stays up over the grid (`inv-tap-item-390.png`, 162 px tall; 374 px for a legendary at 360x780, `inv-tap-item-360.png`) with no close affordance. In the skill tree the same tap also spends the point (P061).
- **Change:** New `TooltipSheet` (src/ui/tooltipSheet.ts): `show(anchor, node, actions)`, dismissed by the close button, tapping the same cell again, tapping elsewhere, scrolling the list or opening another panel; fixed to the bottom with `max-height: 45dvh`, drag handle, `role="dialog"`. All panels call it instead of their own `.item-tooltip` logic. Test: after a tap the sheet exists; tapping the dim area removes it.
- **Files:** src/ui/tooltipSheet.ts (new), src/ui/inventoryPanel.ts, src/ui/servicePanel.ts, src/ui/skillTreePanel.ts, src/ui/matrixPanel.ts, src/ui/itemTooltip.ts
- **Effort / priority:** M / 1

### P055 - Tooltip contents are clipped and cannot scroll

- **Area:** Tooltips
- **Problem:** `.item-tooltip` has `pointer-events: none` (style.css:428) but portrait gives it `max-height: 48vh; overflow-y: auto` (style.css:~1040): at 360x780 a legendary tooltip is 374 px tall and its last lines (salvage value, bottom of the comparison) are cut off with no way to scroll (`inv-tap-item-360.png`).
- **Change:** Make the sheet `pointer-events: auto; overflow-y: auto; overscroll-behavior: contain` and pin the header (icon, name, item power, rarity) with the compare summary underneath it. Test: a unique with aspect, 4 affixes, 2 sockets and compare at 320x640 can be scrolled to its "Salvage" line.
- **Files:** src/ui/style.css, src/ui/tooltipSheet.ts (new)
- **Effort / priority:** S / 1

### P056 - Side-by-side comparison with the equipped item

- **Area:** Comparison
- **Problem:** The compare block lists only deltas ("▲ 152 Armor", "▲ 0.2% Damage", `inv-tap-item-360.png`): the equipped item itself is not shown, so the player cannot judge affixes, sockets or the unique effect being lost, and cannot tell that a +0.2% damage gain loses an aspect.
- **Change:** In the sheet add a segmented control "This item | Equipped | Changes"; Changes is the delta list with a one-line verdict ("+0.2% damage, +152 armour, -1 socket") and green/red chips; Equipped renders `renderItemTooltip(equipped, { equipped: true })`. Test: switching to Equipped shows the worn item name.
- **Files:** src/ui/itemTooltip.ts, src/ui/tooltipSheet.ts (new), src/game.ts
- **Effort / priority:** M / 2

### P057 - Make the affix symbols explainable

- **Area:** Tooltips
- **Problem:** Greater (`◆`), tempered (`⚒`), boosted (`▲`), aspect (`✦`) and empty socket (`◇`) are explained only through `title` attributes (`itemTooltip.ts` `row.title`), which do not exist on touch.
- **Change:** A 5-item legend toggled by a small "i" at the sheet corner (or tap on a symbol) with the same strings, visible once per session on first legendary tooltip. Test: tapping the `◆` row shows "Greater affix" text.
- **Files:** src/ui/itemTooltip.ts, src/data/lang/en.json
- **Effort / priority:** S / 2


## 7. Character panel

A 584 px flat list of 25 rows (`char-390.png`).

### P058 - Summary header and collapsible sections

- **Area:** Character
- **Problem:** The panel is a plain scrolling list: heading line "Bastion - Level 50 - 1234 / 17444 XP" in 12 px grey, then Attributes, Offense, Defense, Utility fully expanded (`char-390.png`). Level, XP and class are not visual, and Defense/Utility require scrolling.
- **Change:** Header card: class portrait (reuse `char-portrait`), name, level, XP bar and gold; sections become accordions (Offense and Defense open by default, state remembered). Test: collapsing Attributes reduces `.character-panel` scrollHeight by its section height.
- **Files:** src/ui/characterPanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P059 - Tap a stat to see what it does

- **Area:** Character
- **Problem:** Rows like "Damage 18.0", "Armor 83", "Physical damage reduction 9.4%" have no explanation of how they are derived or what raises them; the panel is refreshed 4x per second by rebuilding DOM, so any inline expansion would be lost.
- **Change:** Tap on a row opens a small sheet with the formula in words and the top sources ("Armor 83: gear 79, passives 4; 9.4% physical reduction at level 50"), built from `DerivedStats`/`CombatStats`; refresh updates text nodes in place instead of `replaceChildren`. Test: row tap opens sheet; value updates without closing it.
- **Files:** src/ui/characterPanel.ts, src/systems/stats.ts, src/data/lang/en.json
- **Effort / priority:** M / 3

### P060 - Shortcuts to spend points and manage gear

- **Area:** Character
- **Problem:** Unspent skill points, Neural Matrix points and unused gold are not shown on the character panel; the player must close it and open Skills (menu is covered). The panel gives no route to Inventory.
- **Change:** Footer buttons "Skills (6)" and "Bag" that switch panels through the panel stack (P002), with the point count; show gold and the resource bar under the header. Test: tapping "Skills (6)" closes Character and opens the skill panel.
- **Files:** src/ui/characterPanel.ts, src/game.ts
- **Effort / priority:** S / 3


## 8. Skill tree and Neural Matrix

Skill tree: 2116 px of content in a 651 px scroller; matrix: SVG board with tap-to-select.

### P061 - Learning a skill needs select then confirm (like the Matrix)

- **Area:** Skill tree
- **Problem:** `skillTreePanel.ts` `nodeCard` click handler calls `actions.learn(n.id)` immediately while `mouseenter` shows the tooltip in the same tap, so the description and the point spend happen together. Points cost 1250 gold to refund (`Reset (1250 gold)`, `skills-390.png`). The Matrix already uses the right pattern ("Touch selects first, a second tap allocates", `matrixPanel.ts` `onTap`).
- **Change:** First tap selects the node and opens the tooltip sheet with a full-width "Learn (1 point)" / "Add rank 2/5" button (disabled with the reason when `canLearn` fails); second tap on the node or the button spends. Test: tapping a learnable node leaves `unspent` unchanged; tapping the sheet button decrements it by 1.
- **Files:** src/ui/skillTreePanel.ts, src/ui/tooltipSheet.ts (new)
- **Effort / priority:** M / 1

### P062 - Tree layout uses the width

- **Area:** Skill tree
- **Problem:** `.tree-branch { grid-template-columns: 110px 1fr }` leaves 230 px at 390 px (200 px at 360) for 74 px nodes, so only two columns fit (3x74+2x5 = 232 > 230) and ~90 px at the right stays empty while the "BASIC" label sits alone at the left (`skills-390.png`, `skills-320.png`). The whole tree is 2116 px high, and at 320x640 the branch column is only 160 px wide and the scroll area just 433 px high (`skills-320.png`).
- **Change:** Stack label above nodes (grid 1 column), `.tree-nodes { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)) }` (4 per row at 390), node min-height 84 px, names 12 px. Test: at 390 px each branch row shows 4 nodes per line and the tree height drops below 1300 px.
- **Files:** src/ui/style.css, src/ui/skillTreePanel.ts
- **Effort / priority:** S / 2

### P063 - Header wraps into four-line buttons

- **Area:** Skill tree
- **Problem:** The header row puts "6 skill points available", "Neural Matrix" and "Reset (1250 gold)" in one flex row; at 390 px all three wrap to two lines (`skills-390.png`), at 320 px the buttons stack text into three lines (`skills-320.png`).
- **Change:** Two rows: points chip + Matrix button (full-width primary when points exist), and Reset moved into an overflow "..." menu with its gold cost shown in the confirm sheet. Test: header height <= 96 px at 320 px.
- **Files:** src/ui/skillTreePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P064 - Guided action-bar assignment

- **Area:** Skill tree
- **Problem:** Assigning a skill is a hidden mode: tap one of six 48 px slots (selected = outline) then a learned node, with the hint in 10.5 px (`skills-390.png`); the slots show only icons, no key labels visible on touch (`.slot-key`) and no indication which nodes are assignable.
- **Change:** After tapping a slot dim every non-assignable node, show a banner "Pick a skill for slot 3", and add an "Equip to bar" button in the node sheet that picks the first free slot. Test: with slot 2 selected, learned skill nodes have class `.assignable` and others `.dim`.
- **Files:** src/ui/skillTreePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P065 - Jump chips for the long branch list

- **Area:** Skill tree
- **Problem:** Branches (Basic, Core, Tactical, Defensive, Key) are 100-300 px each in one 2116 px scroll; there is no way to reach "Key Passive" without a long swipe, and locked branches (opacity 0.45) take as much room as open ones.
- **Change:** Sticky chip row under the action bar (Basic | Core | Tactical | Defensive | Key) that scrolls the `.tree-scroll` to the branch; locked branches collapse to a 44 px row "Core - 2 points to unlock". Test: tapping Tactical sets `scrollTop` to that branch top.
- **Files:** src/ui/skillTreePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P066 - Show why a node cannot be learned on the node

- **Area:** Skill tree
- **Problem:** The reason ("Learn the previous node first", red) appears only inside the hover tooltip (`skills-tap-node-390.png`); locked nodes are just dimmer. Rank "0/5" has no pips and enhancement/modifier choices ("Choose one of the two modifiers") are visible only in the tooltip.
- **Change:** Node cards show a lock glyph and the reason in the sheet button state; ranks as 5 small pips; the pair of mutually-exclusive modifiers get a visible "or" connector. Test: a locked node has `[data-reason]` and a lock icon.
- **Files:** src/ui/skillTreePanel.ts, src/ui/style.css
- **Effort / priority:** S / 3

### P067 - Fit the board to the viewport on open

- **Area:** Neural Matrix
- **Problem:** The matrix viewport is 448 px of which the 9x9 board uses about 330 px; there is 120 px of empty dark space above it and the board is offset (`matrix-390.png`, `matrix-320.png`). Nodes are small after the fit: circles measure 34 px at 390, 31 px at 360 and 27 px at 320 across. The viewport shows the whole 5-board graph only after panning.
- **Change:** On `show()` and after attach/detach compute the bounding box of all attached boards and set the initial transform to fit with 12 px padding (the `⌖` button already exists, call it automatically); cap zoom-out so a node never drops below 40 px apart. Test: the Core Board bounding box fills >= 90 % of the viewport width.
- **Files:** src/ui/matrixPanel.ts
- **Effort / priority:** S / 2

### P068 - Visible Allocate button and touch wording

- **Area:** Neural Matrix
- **Problem:** Touch needs two taps ("Touch selects first, a second tap allocates") but nothing says so: the detail card reads "Click to allocate (1 point)" (`matrix.state.available`) and there is no button; the hint line says "scroll" (`matrix-320.png`).
- **Change:** When the selected node is allocatable show a full-width "Allocate (1 point)" button in `.matrix-detail` (and keep second-tap as shortcut); replace the idle hint with a one-line "Tap a node. Pinch to zoom." Test: tapping an available node shows a button with the point cost; pressing it calls `actions.allocate`.
- **Files:** src/ui/matrixPanel.ts, src/data/lang/en.json
- **Effort / priority:** S / 2

### P069 - Matrix header: "Skills" button vs close

- **Area:** Neural Matrix
- **Problem:** Inside the Matrix the header shows a button labelled "Skills" (back to the tree) next to "Reset (0 gold)" while the floating X closes the whole panel, so "Skills" is read as a tab and X as back (`matrix-390.png`). The XP line "0 / 12,604 XP to the next point - 12 / 200 earned" is 11 px muted text.
- **Change:** Replace with a header back chevron "< Skills" next to the title, points as a pill, and a thin progress bar for XP to next point with the numbers under it. Test: back chevron returns to the tree and keeps the scroll; X closes the panel (history entry, P002).
- **Files:** src/ui/matrixPanel.ts, src/ui/skillTreePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P070 - Glyph chips and sockets as a picker sheet

- **Area:** Neural Matrix
- **Problem:** Glyphs appear as three 64-76 x 33 px chips at the bottom ("Brawn 1", "Precision 1", "Insight 1", `matrix-390.png`); picking one deselects the node, and filling a socket needs a different flow (select socket, then a button list inside the 30 % detail area).
- **Change:** Tapping a socket node opens a bottom sheet listing glyphs with icon, level, radius and current bonus, one 56 px row each; tapping a glyph chip highlights its socket and affected nodes on the board. Test: socket sheet rows are >= 56 px tall and the chosen glyph is `socketed` after one tap.
- **Files:** src/ui/matrixPanel.ts, src/ui/tooltipSheet.ts (new), src/ui/style.css
- **Effort / priority:** M / 3

### P071 - Gate attach and rotate with a preview

- **Area:** Neural Matrix
- **Problem:** `gateControls` renders board choices, four rotation buttons (0/90/180/270) and "Attach" inside `.matrix-detail { max-height: 30% }` (about 200 px at 844, 140 px at 640), so the form scrolls; the board being attached is not drawn until it is attached (rotation is fixed afterwards: "rotatable while untouched").
- **Change:** Show a translucent ghost of the chosen board at the chosen rotation on the SVG while the form is open; rotation as a segmented control with a rotate-90 icon button, "Attach" as a full-width primary. Test: changing rotation moves the ghost; the form has no inner scrollbar at 390x844.
- **Files:** src/ui/matrixPanel.ts, src/ui/style.css
- **Effort / priority:** M / 3


## 9. Quest log

Three active quests already take 680 px (`quests-390.png`).

### P072 - Collapsible entries and Active / Completed tabs

- **Area:** Quests
- **Problem:** Every active quest is fully expanded (summary, step, rewards, button; ~290 px each), and the completed list is an inline paragraph at the bottom (`quests-390.png`). With ten quests the player scrolls through screens of prose to find the tracked one.
- **Change:** Accordion rows (collapsed = title, kind/level badge, current step; expand on tap) with the tracked quest open; two tabs Active (n) / Completed (n) pinned under the header. Test: with 4 active quests the collapsed list is < 400 px tall.
- **Files:** src/ui/questUi.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P073 - Track as a toggle, with "Show on map"

- **Area:** Quests
- **Problem:** Each entry has a 28 px text button "Track"/"Tracked" (disabled when tracked, so tracking can not be turned off); there is no link from a quest to its location (`quests-390.png`).
- **Change:** 44 px star toggle in the row header (tap tracked star = untrack), plus a "Show on map" button that opens the map centred on the quest marker (`questMarkers` exist). Test: tapping the star on the tracked quest clears `tracked` and the HUD tracker row disappears.
- **Files:** src/ui/questUi.ts, src/ui/minimap.ts, src/game.ts
- **Effort / priority:** S / 2

### P074 - Completed quests as a list with rewards

- **Area:** Quests
- **Problem:** Completed quests are one dot-separated sentence ("Wake Up - Signal in the Ash - Cook's Spices", 12 px muted) so they cannot be tapped or re-read.
- **Change:** Rows with check icon, title and the XP/gold earned; tap opens the summary and the choice made. Test: `Completed (3)` tab lists three rows.
- **Files:** src/ui/questUi.ts
- **Effort / priority:** S / 3

### P075 - Empty and first-quest states

- **Area:** Quests
- **Problem:** The empty state is a 10.5 px muted paragraph (`questUi.noQuests`); a fresh character sees one quest and no hint where quests come from (`fresh-quests-390.png`).
- **Change:** Centered empty state with an icon and "No active quests. Talk to people marked !" plus a button that opens the map; for the first quest add a one-time "Tap Track to follow it on the HUD" hint. Test: with no quests the empty block is >= 120 px tall and contains a button.
- **Files:** src/ui/questUi.ts, src/data/lang/en.json
- **Effort / priority:** S / 3


## 10. Full map and teleport

Map panel is 477 px tall, vertically centred, 366 px canvas (`map-390.png`).

### P076 - Teleport needs a confirmation sheet

- **Area:** Map
- **Problem:** `MapUi.onMapClick` travels to the nearest discovered teleporter within 16 world units of the tap and closes the map (`minimap.ts:465-486`). Cinder Flats is 1,496 m across (`halfSize` 748) drawn rotated into a 366 px canvas, about 0.17 CSS px per metre, so 16 world units is a pick radius of roughly 3 CSS px: the target is hard to hit, and when a tap does land within range the player is teleported at once with a fade.
- **Change:** Tap selects a teleporter (ring + name label), shows a bottom card "Outpost Ember - 240 m - [Travel]" and only the button travels. Test: tapping a marker leaves the player position unchanged; the Travel button calls `travel(id)`.
- **Files:** src/ui/minimap.ts, src/ui/confirmSheet.ts (new)
- **Effort / priority:** M / 1

### P077 - Markers are tiny and unlabeled

- **Area:** Map
- **Problem:** Teleporter dots are 6-8 px with a 6 px orange diamond for POIs (`map-390.png`); there are no names, no legend, and the pick radius is 16 world units (about 3 CSS px, see P076), not a pixel size.
- **Change:** Draw markers at >= 14 px with 44 px hit areas (pick radius in screen pixels converted to world units), snap to the nearest within 28 px, label the selected one, and add a legend chip row (teleporter, quest, boss, you). Test: a tap 20 px from a marker selects it.
- **Files:** src/ui/minimap.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P078 - Map layout: full-height sheet, header close, legend instead of a long footer

- **Area:** Map
- **Problem:** The panel is centred (`#ui.touch-ui.portrait .map-panel { top: 50% }`) with 184 px of empty world above it, the floating X lands on the minimap (`map-390.png`), and the footer concatenates "0% explored - Click a discovered teleporter to travel. - Restoration tier 0 - 0/5 points - Ash Harvest" in 10.5 px text.
- **Change:** Top-aligned full-height sheet with the P003 header; canvas fills the width; footer becomes three chips (Explored %, Restoration tier, Ash Harvest) and a one-line touch hint. Test: no overlap between the close button and the minimap; footer font >= 12 px.
- **Files:** src/ui/minimap.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P079 - Region tabs should scroll and be tappable

- **Area:** Map
- **Problem:** `.map-tabs` is a non-wrapping flex row of 26 px high buttons; one region fits (`map-390.png`), but with five visited regions the row will overflow the 366 px panel (zone names are 10-18 characters). Tabs are 83x26.
- **Change:** `overflow-x: auto; scroll-snap-type: x proximity;` with 44 px high pill tabs and an edge fade; remember the last viewed region per session. Test: with 5 zones the active tab is scrolled into view and all tabs are >= 44 px high.
- **Files:** src/ui/minimap.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P080 - Pan, zoom and "locate me"

- **Area:** Map
- **Problem:** The full map is a fixed 640 px canvas scaled to the width (`map-canvas`), no pinch zoom or pan, so in the Core and the larger regions markers crowd.
- **Change:** Pinch and drag on the canvas (transform on a wrapper, same `pointers` Map approach as `matrixPanel.ts`), double-tap to zoom, a "locate" button that centres the player. Test: pinch increases the canvas scale to 2x and tapping still hits the right marker.
- **Files:** src/ui/minimap.ts, src/ui/style.css
- **Effort / priority:** M / 3


## 11. Dialogue

Bottom sheet, 213 px tall with three options (`dialogue-390.png`).

### P081 - Options of 44 px and no overlap with the thumb buttons

- **Area:** Dialogue
- **Problem:** Dialogue options are 28 px tall (measured `348x28`), and the Dodge/Stim thumb buttons stay on top of the sheet edge (`dialogue-390.png`: the circles overlap the top border at y=1195-1280 device px), so a tap near the upper option can hit Dodge. There is no close control except the "Goodbye" option.
- **Change:** Raise `.dialogue-panel` above the thumb cluster (`z-index: 36`) or hide `.slots` while a dialogue is open; options `min-height: 48px; padding: 12px 14px`; header close (P003). Test: no `.slot` element intersects the dialogue rect.
- **Files:** src/ui/style.css, src/ui/questUi.ts, src/game.ts
- **Effort / priority:** S / 2

### P082 - Tap-to-advance, speaker header and readable body

- **Area:** Dialogue
- **Problem:** Long NPC text is a plain block at 15 px with the speaker line 14 px and role 10 px; quest-talk pages end with a single "Continue" at the bottom of the sheet.
- **Change:** Sticky speaker header (portrait thumbnail from `npcs`, name, role 12 px), text max-height with scroll for pages over 6 lines, tap on the text area advances single-option pages. Test: a 3-paragraph page does not push the options off the 60vh cap.
- **Files:** src/ui/questUi.ts, src/ui/style.css
- **Effort / priority:** S / 3

### P083 - Quest offers as cards with accept as the primary button

- **Area:** Dialogue
- **Problem:** A quest offer shows prose plus a "Rewards: 220 XP, 45 gold" line, then "Accept" and "Decline" as two identical outline buttons stacked (`game.ts:1239`, `questOffer`); a "New quest" tag (`.dialogue-tag`) sits inside the "Rations Run" option label at 12 px.
- **Change:** Offer page layout: title, level/difficulty, reward chips (XP, gold), primary filled Accept (right/bottom), secondary text Decline. Test: Accept has the accent fill and is the last element in the sheet.
- **Files:** src/ui/questUi.ts, src/game.ts, src/ui/style.css
- **Effort / priority:** S / 3


## 12. Hub services: vendor, blacksmith, technician, stash

The service panel opens together with the inventory (`servicePanel.onToggle`), both positioned at `top: 6px` in portrait.

### P084 - Service panel and backpack must share the screen, not overlap

- **Area:** Hub services
- **Problem:** At 390x844 the vendor (`.service-panel`, 133 px) is drawn over the top of the inventory (`vendorOverlap`: service 6-139 px, inventory 6-524 px), cutting the paper doll in half and doubling the gold line and the titles (`vendor-390.png`, `stash-390.png` shows "INVENTORY" behind "STASH"). Once an item is selected at the blacksmith or technician the service panel grows to the full 832 px (technician content is 1369 px) and covers the backpack completely (`blacksmith-390.png`), so another item can not be chosen without closing the panel.
- **Change:** In portrait split vertically: service sheet takes the top 52 dvh (own scroll, sticky header), backpack grid the bottom 48 dvh (6 columns, cells >= 52 px), a 4 px divider; or a two-tab control "Shop | Bag". The selected backpack item stays highlighted and its card is pinned in the service header (P087). Test: with the blacksmith item selected, `elementFromPoint` at a backpack cell returns that cell, and tapping another cell changes the selection.
- **Files:** src/ui/servicePanel.ts, src/ui/inventoryPanel.ts, src/ui/style.css, src/game.ts
- **Effort / priority:** L / 1

### P085 - Buy and sell through an item sheet with price, comparison and gold after

- **Area:** Vendor
- **Problem:** A vendor stock cell click calls `actions.buy(i)` at once (`servicePanel.vendor`) and tapping a backpack item sells it (`backpackClick` -> `actions.sell`) with no sheet; the tooltip (`hover`, `mouseenter`) opens in the same tap so the price is read after the money is gone. Selling a legendary costs one stray tap. The hint is "Click an item to buy it..." (`vendor-390.png`).
- **Change:** Tap opens the item sheet (P054) with price row ("Buy - 1,235 gold - you have 48,210"), compare tab (P056) and a primary Buy / Sell button using the two-step arming from P013 for rare+ and over-threshold prices; sell value shown for backpack items. Test: tapping a stock cell leaves gold unchanged and opens the sheet; Buy then Confirm deducts the price once.
- **Files:** src/ui/servicePanel.ts, src/ui/tooltipSheet.ts (new), src/game.ts
- **Effort / priority:** M / 1

### P086 - Prices as chips under the cells with affordability

- **Area:** Vendor
- **Problem:** Vendor prices are `.price` overlays at 0.65em (9.8 px) over the lower right of each icon, partly hidden by the rarity frame and unreadable on bright art ("1235", "245" in `vendor-390.png`; at 320 px four-digit prices cover most of a 25 px cell, `vendor-320.png`); unaffordable items look the same; the gold total is printed twice (service header and inventory).
- **Change:** Make each stock slot a 64 px cell with a 14 px price pill below it (gold icon, thousands separator), red when `price > gold`, struck-through grey for sold slots; one gold readout in the pinned header. Test: with 100 gold every price over 100 has `.unaffordable`.
- **Files:** src/ui/servicePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P087 - Pinned item card with full stats while reforging

- **Area:** Blacksmith
- **Problem:** `selectedHeader` prints only the item name in rarity colour; the reroll buttons read "+19% Damage to Elites -> reroll (156 gold)" with no current value range, item power or what else the item has (`blacksmith-390.png`). The player must keep the tooltip in memory.
- **Change:** A pinned card at the top of the service sheet: icon, name, item power, all affixes as chips (tempered purple, greater amber, masterwork rank), with the affix being rerolled highlighted; roll range shown on each reroll button. Test: card shows the same affix list as `renderItemTooltip` for the selected item.
- **Files:** src/ui/servicePanel.ts, src/ui/itemTooltip.ts, src/ui/style.css
- **Effort / priority:** M / 2

### P088 - Accordion sections: Reroll, Tempering, Masterwork

- **Area:** Blacksmith
- **Problem:** With a legendary selected the blacksmith fills the whole panel (834 px, 803 px at 360): rerolls (4 buttons), tempering (charges, four recipe rows), masterwork (rank, three text lines, two buttons), then the junk button, all expanded (`blacksmith-390.png`, `blacksmith-s2-390.png`); a rare with fewer affixes or more recipes pushes it past one screen. The salvage button is the last row, below everything.
- **Change:** Three collapsible sections with a summary line each ("Tempering - 5/5 charges", "Masterwork 0/12"), one open at a time; the junk-salvage button moves to the header menu. Test: on opening, only the Reroll section is expanded and the panel is shorter than the viewport.
- **Files:** src/ui/servicePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P089 - Tempering preview, ranges and which affix is replaced

- **Area:** Blacksmith
- **Problem:** Each recipe row says "Razor Edge - Offense / Can add: Critical Strike Chance, Critical Strike Damage" and a generic "Temper (585 gold)" (`blacksmith-390.png`); the possible values at this item power are not shown, four identical buttons look the same, and when both slots are filled the choice of replaced affix is a separate pair of buttons above the list (`temper-slots`) that is easy to miss.
- **Change:** Row layout: recipe name, group chip, the rolled range for this item ("+3-5% crit chance / +12-20% crit damage"), cost with have/need colouring, and a single Temper button; when full, show the two current tempered affixes as radio rows right inside the row. Uses P013 two-step. Test: each row shows min-max values computed from the recipe options and `item.itemPower`.
- **Files:** src/ui/servicePanel.ts, src/systems/endgame/crafting.ts, src/ui/style.css
- **Effort / priority:** M / 2

### P090 - Masterwork costs as chips and next-rank preview

- **Area:** Blacksmith
- **Problem:** Masterworking is three muted sentences: "Each rank adds 5% to every affix...", "You have 240 Lumen Dust and 30 Rift Shards.", "Next rank: 780 gold, 3 Lumen Dust, 0 Rift Shards." (12 px, `blacksmith-390.png`) above a 27 px button; the effect of the next rank on the item is not shown.
- **Change:** Cost chips (gold, Lumen Dust, Rift Shards) with have/need colouring, a before/after line for the affected stats ("Armour 79 -> 83"), and a 48 px "Raise to rank 1" button; reset moves under a "..." menu with confirm. Test: missing material chip is red and the button disabled with the reason as text.
- **Files:** src/ui/servicePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P091 - Confirm and count for "Salvage all common and magic items"

- **Area:** Blacksmith
- **Problem:** `service-btn` "Salvage all common and magic items in the backpack" is the last row of the blacksmith (`blacksmith-390.png`, 27 px high) and executes `actions.salvageJunk()` immediately; there is no count, no value and no way to exclude an item.
- **Change:** Button label with count and gold ("Salvage 18 items - about 312 gold"), opens the confirm sheet listing the first 8 items with a "Keep" toggle each; disabled with "Nothing to salvage" when zero. Test: count equals the common+magic items in the grid; confirming removes exactly those.
- **Files:** src/ui/servicePanel.ts, src/ui/confirmSheet.ts (new), src/game.ts
- **Effort / priority:** S / 1

### P092 - Codex of Power: unlocked first, locked grouped

- **Area:** Technician
- **Problem:** All 20 Codex aspects are listed as 55 px rows (about 1,100 px), all locked at this account stage with the same text ("Locked: clear Meridian's Hold"), identical rows between the extract button and anything usable (`technician-390.png`, `technician-360.png`); unlocked ones would be mixed in.
- **Change:** Unlocked aspects first with imprint buttons; locked ones in a collapsed "Locked (20) - 0 of 20 dungeons cleared" section, sorted by dungeon order with a progress bar; compact 64 px rows with a "How to unlock" expander. Test: with 0 unlocked, the panel is shorter than 2 screens and the first row is the Extract button or the empty-cache message.
- **Files:** src/ui/servicePanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P093 - Show the aspect before extract or imprint

- **Area:** Technician
- **Problem:** Extract reads "Extract aspect (234 gold)" with a one-line warning "The item is destroyed; its aspect goes into your cache." (`technician-390.png`); the aspect name/value being extracted is not shown, and imprint buttons say "Imprint (gold)" without naming which aspect lands on which item (`aspect-row`).
- **Change:** Pinned card shows the item's aspect (icon, name, value) and, on imprint rows, a before/after ("Aspect: none -> Brutal +7% damage") and "replaces: <current aspect>" when overwriting; extraction uses P013 arming. Test: the extract button label contains the aspect name.
- **Files:** src/ui/servicePanel.ts, src/ui/itemTooltip.ts
- **Effort / priority:** S / 2

### P094 - Stash: empty state, counts and transfer clarity

- **Area:** Stash
- **Problem:** 50 empty 25-31 px cells with a 10 px hint ("Shared by all your characters. Click a stash item to take it; click a backpack item to store it.", `stash-390.png`); no count (0/50), no empty-state message, and the action direction depends on which grid you tap, which on touch also opens a sticky tooltip.
- **Change:** Header "Stash 0/50 - shared by all characters", empty state "Nothing stored yet. Tap a backpack item to store it." with an arrow, 52 px cells (P043), a "Store all junk" shortcut; a moved item flashes and the toast says "Moved to stash". Test: with an empty stash the empty-state element is present and the grid cells are >= 44 px.
- **Files:** src/ui/servicePanel.ts, src/ui/style.css, src/data/lang/en.json
- **Effort / priority:** S / 2


## 13. Sound, World Tier, Deep Rift, credits

Smaller panels that still follow their own rules.

### P095 - Volume sliders: bigger, with values and a test sound

- **Area:** Sound
- **Problem:** `input[type=range]` rows are 16 px high (measured `254x16`) with 15 px labels and no numeric readout; `change` saves but nothing plays, so the player cannot judge the level (`sound-390.png`). There is no mute row inside the panel and its own text "Close" button (`sound-close`, 70x29) differs from every other close.
- **Change:** In the Settings Sound tab: 48 px rows with label, `%` value and a stepper (-/+ 10), a mute switch row on top, a short UI tick (`audio.play("ui.equip")`) on slider release, and the shared header close (P003). Test: slider row height >= 44 px; releasing the slider calls `audio.play` once.
- **Files:** src/ui/soundPanel.ts, src/ui/settingsPanel.ts (new), src/ui/style.css
- **Effort / priority:** S / 2

### P096 - Tier Beacon rebuilds its buttons twice a second, swallowing taps

- **Area:** World Tier
- **Problem:** `Game.render` calls `tierPanel.refresh()` every 0.5 s (`game.ts:1003`) and `refresh()` does `body.replaceChildren(...)`. In the headless run `tap(tier-2)` failed with "element was detached from the DOM, retrying" in a loop; on a phone the finger lands on a button that is removed between touchstart and touchend, so the tier change is dropped.
- **Change:** Only rebuild when the state changed (key of `unlocked|chosen|combat`, like `RiftHud.update`) and toggle `disabled`/text in place otherwise. Test: capturing a reference to `[data-testid=tier-2]`, waiting 1.2 s and comparing `isConnected` returns true.
- **Files:** src/ui/tierPanel.ts, src/game.ts
- **Effort / priority:** S / 1

### P097 - Tier rows: compact comparison, lock progress and confirm

- **Area:** World Tier
- **Problem:** Each unlocked tier is a 100-115 px button with 3-4 lines of prose ("Enemy life x1.5, enemy damage x1.25. Experience x1.5, gold x1.5...", `tier-390.png`); locked tiers say "Clear Deep Rift 40." with no progress; in combat the whole list is disabled with one line of grey text; selecting changes difficulty immediately.
- **Change:** One-line effect chips per tier (Enemies +50% life, +25% dmg | Rewards +50% XP/gold | Loot +40 power), highlighted differences vs the current tier, lock rows with progress ("Best rift 24 / 40"), a visible banner "In combat - tier locked" and a confirm step ("Switch to Veteran? Applies to enemies that spawn from now on."). Test: tier row height <= 76 px; locked row shows best rift progress.
- **Files:** src/ui/tierPanel.ts, src/ui/style.css, src/data/lang/en.json
- **Effort / priority:** S / 2

### P098 - Rift level stepper and slider are too small

- **Area:** Deep Rift
- **Problem:** The level stepper buttons are 26-37 x 27 px (`-10`, `-`, `+`, `+10`), the slider track is 16 px high (`rift-390.png`, measured `rift-step`, `rift-slider`), and "Enter Rift 25" is a 27 px bar. At level 25 of 25 a 100-step slider with a 22 px thumb is hard to place exactly.
- **Change:** 48 px stepper buttons, a large level number, quick buttons "Last cleared", "Highest" and "Easier -5", slider thumb 32 px, effect chips (life x4.29, item power 460), and a 52 px full-width "Enter Rift" button with the 10-minute timer in its label. Test: all rift controls >= 44 px high.
- **Files:** src/ui/riftPanel.ts, src/ui/style.css
- **Effort / priority:** S / 2

### P099 - Rift result: glyph attempts with odds and feedback

- **Area:** Deep Rift
- **Problem:** The result panel lists glyph rows as 27 px buttons "Brawn - level 1" under "All glyph upgrade attempts are used."; chance of success is not shown (it depends on rift level / 5, `docs/decisions.md`), the log is a `pre-line` text block.
- **Change:** Glyph rows with icon, level, success chance ("100%" / "75%"), attempts left as pips, an animated result line under the tapped row; "Take the portal" button at the bottom. Test: each row displays a percentage between 0 and 100 and updates after an attempt.
- **Files:** src/ui/riftPanel.ts, src/systems/endgame/rifts.ts, src/ui/style.css
- **Effort / priority:** S / 3

### P100 - Credits pacing and readability on a phone

- **Area:** Credits
- **Problem:** Credits scroll for a fixed 28 s (`CREDITS_SECONDS`) in 15 px muted grey with a 37 px "Skip" at the bottom right (`credits-390.png`); a touch cannot pause or fast-forward, the screen may dim on devices that time out in 30 s, and the skip button ignores the safe area.
- **Change:** Hold to pause, tap to show a "Skip" bar, speed scaled to text length, request a Screen Wake Lock while the epilogue/credits are open, `max(16px, env(safe-area-inset-bottom))` for the skip. Test: touchstart on the credits adds `.paused` (animation-play-state: paused); `navigator.wakeLock.request` is called once.
- **Files:** src/ui/epilogue.ts, src/ui/style.css
- **Effort / priority:** S / 3


## Suggested order of work

1. **Unblock and de-risk (all priority 1, mostly S):** P001, P006, P007, P010, P019, P034-P036, P040, P043, P055, P091, P096.
2. **Shared components (unlock many items):** `panelHeader` + `panelStack` (P002, P003, P004, P005, P011, P014, P015, P017, P018), `confirmSheet` (P012, P013, P040, P061, P076, P091), `TooltipSheet` (P054, P056, P057, P044, P061, P085), `settingsPanel` (P025-P030, P095).
3. **Layout rework:** inventory grid and doll (P043, P047), service split view (P084-P094), skill tree (P061-P066), map (P076-P080).
4. **Polish:** the priority 3 items.

## Appendix: how each finding was verified

- **Measured in the page** (Playwright, 390/360/320): tap-target sizes (P020), computed font sizes (P019), panel and overlap rectangles (P084, `vendorOverlap`), tree node geometry (P062), tooltip height (P055), `elementFromPoint` on the epilogue button (P001), tier button detachment (P096), name input attributes and font size (P036), delete button box 25x20 and the native `confirm` dialog text (P040, P012), swipe and hold behaviour through CDP touch events (P016, P045), toast layering (P010), text scale 1.5/2 overflow (P022).
- **Read from the code** (not exercised on a device): Android Back and history (P002), safe-area handling (P023), `navigator.vibrate` (P029), iOS focus zoom (P036), `visualViewport` keyboard handling (P037), Screen Wake Lock (P100), proposed new components.

## Appendix: screenshots

Folder: `/tmp/claude-0/-home-user/91b10048-104f-50d9-baf1-7585dd3fa3ee/scratchpad/ui-audit-b/shots/`

| Panel | Files (390 unless noted) |
|---|---|
| HUD with menu | `hud-390.png` |
| Character select | `cs-390-slots.png`, `cs-390-class.png`, `cs-390-class-full.png`, `cs-390-class-bottom.png`, `cs-top-390.png`, `cs-spectre-390.png`, `cs-keyboard-390.png`, `cs-existing-390.png` |
| Inventory and tooltips | `inv-<390,360,320>.png`, `inv-scrolled-360.png`, `inv-tap-item-<390,360,320>.png`, `longpress-300-390.png`, `longpress-after-390.png`, `fresh-inv-390.png` |
| Character | `char-<390,360,320>.png`, `char-scrolled-360.png` |
| Skills and Matrix | `skills-<390,360,320>.png`, `skills-tap-node-<390,360>.png`, `matrix-<390,360,320>.png`, `fresh-skills-390.png` |
| Quests | `quests-<390,360,320>.png`, `quests-scrolled-360.png`, `fresh-quests-390.png` |
| Map | `map-<390,360,320>.png` |
| Dialogue | `dialogue-<390,360,320>.png` |
| Hub services | `vendor-<390,360,320>.png`, `vendor-scrolled-390.png`, `blacksmith-<390,360,320>.png`, `blacksmith-s1-390.png`, `blacksmith-s2-<390,360,320>.png`, `technician-<390,360,320>.png`, `technician-s2-390.png`, `stash-<390,360,320>.png` |
| Sound | `sound-<390,360,320>.png`, `scale1.5-sound-390.png`, `scale2-sound-390.png` |
| Tier and Rift | `tier-<390,360,320>.png`, `tier-picked-390.png`, `rift-<390,360,320>.png`, `rift-result-<390,360,320>.png` |
| Epilogue and credits | `epilogue-<390,360,320>.png`, `credits-<390,360,320>.png` |
| Stacking and layering | `two-panels-390.png`, `three-panels-390.png`, `toast-under-panel-390.png` |
| Text scale | `scale1.5-{inv,skills,char,sound}-390.png`, `scale2-{inv,skills,char,sound}-390.png` |

Scripts used for the capture live in the audit session scratchpad (`.../scratchpad/scripts/`); they are throw-away and not part of the repository.
