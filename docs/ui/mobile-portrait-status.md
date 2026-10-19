# Mobile portrait: implementation status

Status of the 200 audit items in `mobile-portrait-audit-hud.md` (H001-H100) and `mobile-portrait-audit-panels.md` (P001-P100), checked against the code on this branch and, for layout items, in a headless browser at 390x844, 360x780 and 320x640 (plus 1280x720 and 844x390 for regressions).

Totals: done 195, partial 5, skipped 0. Priority-1 items: all done (H039 under the limit below).

Open after this pass:

- H051 (P3): the region label is a pill in the left HUD column, not under the minimap. The column keeps the name next to the bars and it fades on its own, so moving it was not worth a second anchor.
- H080 (P2): the bike is always in the overflow popover; the game has no bike ownership, so there is nothing to test.
- H081 (P2): the menu button was added, but the top menu grid stays beside it (no setting to collapse it).
- H089 (P3): the death screen dims the HUD but shows no stat line; the game has no death penalty (no shards or gold lost), so there is nothing true to print.
- P024 (P3): the tokens exist and the portrait sheets use them; the 94 raw `font-size: 0.x` rules in `style.css` are desktop-owned and were left as they are.

Known limits: in a very busy frame at 320x640 or 360x780 (boss frame, ten statuses, prompt and two toasts) a toast can still cover the region label or sit over the loot labels for a few seconds; both are transient. With the left column at full height the loot band shrinks to about two labels plus the "+N" chip. Landscape touch keeps its older layout, where toasts and the target frame share the top-centre band (as before the portrait work).

| ID | Status | Pri | Item | Note |
|---|---|---|---|---|
| H001 | done | 2 | Life & resource bars | Life bar 22 px, resource bar 16 px, 13/12 px bold text (hud.css); the rows below follow the new heights. |
| H002 | done | 1 | Life & resource bars | Resource caption ("HEAT 45 / 100") in caps, 12 px text, aria-label on the orb. |
| H003 | done | 1 | Life & resource bars | Level chip (38x42, gold border) left of the bars, gold "+" dot when skill points wait; also a dot on the Skills button. |
| H004 | done | 3 | Life & resource bars | 5 px XP bar with outline, `.gain` flash and a glow above 90%. |
| H005 | done | 1 | Life & resource bars | Low-life vignette (`.low-life-vignette`, pulses 0.4-0.9 over 1.1 s) toggled from Hud.update. |
| H006 | done | 3 | Life & resource bars | Ghost bar (`.orb-ghost`, 0.45 s lag) and a white flash on a hit over 10% of max life. |
| H007 | done | 3 | Life & resource bars | Barrier as a striped 4 px strip on the life bar; "+NN" in the life text. |
| H008 | done | 2 | Life & resource bars | Overheat: red fill, white outline, blinking "OVERHEAT" text; haptic via H097. |
| H009 | done | 1 | Skill / dodge / potion buttons | Dodge beside attack, potion above it, skills on an arc (controls.css, checked at 390/360/320). |
| H010 | done | 1 | Skill / dodge / potion buttons | Potion is a masked icon with a charge badge and a conic recharge ring. |
| H011 | done | 2 | Skill / dodge / potion buttons | Dodge uses the evasive status icon (mask), label hidden on touch. |
| H012 | done | 2 | Skill / dodge / potion buttons | `--btn`/`--atk` derive from vw; every slot position is calc() from them; `--btn-scale` setting on top. |
| H013 | done | 1 | Skill / dodge / potion buttons | Stick zone width = 100vw minus the arc, min 120 px, so it never overlaps the buttons. |
| H014 | done | 2 | Skill / dodge / potion buttons | No-resource buttons turn red and desaturated with a red ring; resource cost shown at the bottom edge. |
| H015 | done | 3 | Skill / dodge / potion buttons | `.ready` flash (350 ms) when a cooldown ends. |
| H016 | done | 3 | Skill / dodge / potion buttons | Pressed: accent outline and inner glow; `.denied` 120 ms shake for a blocked press. |
| H017 | done | 2 | Skill / dodge / potion buttons | Attack button scales with width (76-92 px) and has a 10 px invisible halo hit area. |
| H018 | done | 3 | Skill / dodge / potion buttons | Long-press on a skill button shows the tooltip above the cluster without casting. |
| H019 | done | 2 | Skill / dodge / potion buttons | Potion pulses green (`.urgent`) while life is low and charges remain. |
| H020 | done | 3 | Skill / dodge / potion buttons | Empty slots are dashed rings with "+" (tap opens Skills); hidden while in combat. |
| H021 | done | 2 | Joystick | 8 px dead zone, then rescaled (`stickReading`); unit-tested in touchStick.test.ts. |
| H022 | done | 2 | Joystick | Drag-follow (`followStick`): the base trails a thumb that leaves the ring. |
| H023 | done | 1 | Joystick | Dark outer ring, brighter rim, idle opacity 0.75. |
| H024 | done | 2 | Joystick | Orientation change releases the stick and every held button (`releaseAll`). |
| H025 | done | 2 | Joystick | While a panel is open the stick sleeps and the skills fade to 35%; dodge/potion stay live. |
| H026 | done | 2 | Joystick | Zone is 46dvh tall (vh fallback), base anchored 92 px above the bottom. |
| H027 | done | 3 | Joystick | Short tick when the stick first reaches full deflection. |
| H028 | done | 1 | Interact prompt | Prompt docks above the thumbs (`--prompt-bottom`), one line, 52 px tall; toasts now stack above it. |
| H029 | done | 1 | Interact prompt | min-height 52, 17 px text, 2 px gold border, `:active` brightness. |
| H030 | done | 3 | Interact prompt | Tap glyph (ring with a dot) replaces the key chip on touch. |
| H031 | done | 2 | Interact prompt | NPC plates are 44 px buttons on touch that walk to the NPC. |
| H032 | done | 3 | Interact prompt | 150 ms pop-in for a new target plus a tap haptic. |
| H033 | done | 2 | Damage numbers | 17 px numbers with 1.2 px stroke; crits 26 px. |
| H034 | done | 1 | Damage numbers | Damage taken: #ff7a66, 20 px, 2 px stroke. |
| H035 | done | 2 | Damage numbers | Hits on one target merge within a window, 24 live numbers max, weak DoT ticks and non-player misses dropped. |
| H036 | done | 2 | Damage numbers | Damage layer clipped below the top chrome (clip-path inset sat+190 px). |
| H037 | done | 1 | Loot labels | Labels 44 px tall, 14 px text, stacked 46 px apart. |
| H038 | done | 1 | Loot labels | Label x clamped to the safe area, max-width 70vw with ellipsis. |
| H039 | done | 1 | Loot labels | At most 6 labels (rare+ always), the rest collapse into a "+N items" chip; the label band starts below the top chrome and the left HUD column (--left-bottom, up to 42dvh), and a pile that overflows it is re-stacked inside. |
| H040 | done | 2 | Loot labels | Touch auto-picks common/magic within range and shows one grouped "Picked up N items" toast. |
| H041 | done | 3 | Loot labels | Labels react on pointerdown. |
| H042 | done | 3 | Loot labels | Rarity-coloured left border and a glyph per tier (bullet, diamond, stars). |
| H043 | done | 1 | Status tiles | Wrapping status row, 28 px tiles, at most 8 plus a "+N" tile. |
| H044 | done | 1 | Status tiles | Status row sits in the left HUD column under the target frame and endgame chip (not at a fixed top). |
| H045 | done | 2 | Status tiles | Timer on a dark strip inside the tile, stacks top right. |
| H046 | done | 3 | Status tiles | Harmful tiles: 2 px red border and "!" dot; tiles under 3 s blink. |
| H047 | done | 2 | Status tiles | Exposure meter is a 4 px line under the XP bar; flare counter is a chip in the left column. |
| H048 | done | 2 | Minimap | Minimap is tappable (opens the map); pointer cursor. |
| H049 | done | 3 | Minimap | Minimap clamp(104px, 30vw, 124px), marker radius 5, ring with dark outer stroke. |
| H050 | done | 2 | Minimap | Off-circle markers pinned to the rim as outward triangles (`rimMark`); quest gold, world boss red. |
| H051 | partial | 3 | Minimap | "N" tick on the rim. The region label stays in the left column (restyled as a pill) instead of under the minimap. |
| H052 | done | 2 | Quest tracker | Tracked quest expanded plus a "+N" chip that opens the quest log. |
| H053 | done | 1 | Quest tracker | 12.5/11.5 px text, width clamp(150px, 42vw, 196px), 3-line clamp. |
| H054 | done | 2 | Quest tracker | Tap collapses; auto-collapses after 6 s of combat; expands on a step change. |
| H055 | done | 2 | Quest tracker | `.updated` highlight for 1.5 s plus the quest haptic. |
| H056 | done | 2 | Quest tracker | Distance and rotating arrow to the nearest marker (`quest-dist`). |
| H057 | done | 1 | Toasts, banners, cards | Toasts in the band above the thumbs, 13 px; now right of the menu button and above the prompt when one shows. |
| H058 | done | 1 | Toasts, banners, cards | Max 3 toasts, identical text merges into "x3" with a fresh timer; world boss warning shortened. |
| H059 | done | 1 | Toasts, banners, cards | Event box is the first row of the left column. |
| H060 | done | 1 | Toasts, banners, cards | Banner at 48% with a side scrim, clamp(16px, 5vw, 24px), above loot labels. |
| H061 | done | 2 | Toasts, banners, cards | Banner max 88vw, balanced, 2 lines max. |
| H062 | done | 2 | Toasts, banners, cards | Banner queue (bannerQueue.ts): sequential, 150 ms gap, duplicates dropped; unit-tested. |
| H063 | done | 2 | Toasts, banners, cards | Gold level-up banner with a 44 px "spend points" button, light ring on the life bar, level-up haptic. |
| H064 | done | 2 | Toasts, banners, cards | Region card 64vw image, 20 px name; skipped when the label shows the same text. |
| H065 | done | 3 | Toasts, banners, cards | Boss card portrait 28vw, 18 px name (placed at 46%, below the target frame). |
| H066 | done | 1 | Toasts, banners, cards | Region label 13/12 px, light text, strong shadow and a 35% black pill. |
| H067 | done | 2 | Toasts, banners, cards | Label dims after 6 s and hides after 12 s; returns on zone change or minimap tap. |
| H068 | done | 2 | Target & boss frame | Name 13 px ellipsis, affixes on their own line, 10 px bar; the targeted elite has no world plate. |
| H069 | done | 2 | Target & boss frame | Boss frame spans the width: 16 px bar, percentage, phase ticks; the quest tracker steps below it. |
| H070 | done | 2 | Target & boss frame | Edge arrow (edgeArrows.ts) points at an off-screen engaged boss. |
| H071 | done | 3 | Target & boss frame | Target frame stays while the enemy is within 12 m or 8 s after the last hit. |
| H072 | done | 1 | Endgame status stack | All endgame text 12 px or more. |
| H073 | done | 1 | Endgame status stack | One 28 px chip rotating rows every 4 s (rift pinned), tap expands for 5 s (endgameStack.ts, tested). |
| H074 | done | 2 | Endgame status stack | Chip width = left column, translucent plain background, ellipsis. |
| H075 | done | 2 | Endgame status stack | Rift timer pinned next to the life bar plus a 4 px progress strip. |
| H076 | done | 3 | Endgame status stack | Timer pulses under 60 s, haptic at 60/30/10 s (RIFT_BUZZ_AT). |
| H077 | done | 3 | Endgame status stack | Tier badge hidden in a rift; 12 px elsewhere. |
| H078 | done | 2 | Endgame status stack | "Boss  4:12" short form; tapping the row now opens the map centred on the boss spot (MapUi.openAt). |
| H079 | done | 1 | Touch menu row | Five panel buttons plus "more" in a 3x2 grid of 44 px buttons beside the minimap (fits at 320). |
| H080 | partial | 2 | Touch menu row | "..." popover with bike, flare (only in zones with flares), full screen, sound. The bike is always listed: the game has no bike ownership to test. |
| H081 | partial | 2 | Touch menu row | 52 px menu button above the stick zone opens the panels as a vertical sheet. The top grid does not collapse when it is on: both stay, no setting. |
| H082 | done | 2 | Touch menu row | Attention dots on Skills (points), Bag (new items), Quests (step change); cleared on open. |
| H083 | done | 3 | Touch menu row | Pressed look and a tap haptic on pointerdown. |
| H084 | done | 1 | Touch menu row | One 44 px close in every panel header (panelHeader.ts, P003) instead of a floating 48 px X; the sound panel became Settings. |
| H085 | done | 2 | Touch menu row | 44 px slider rows with 28 px thumbs. |
| H086 | done | 1 | Death & respawn | Death heading centred, clamp(26px, 8.5vw, 40px). |
| H087 | done | 1 | Death & respawn | Death overlay above the thumb buttons, which are disabled and dimmed. |
| H088 | done | 1 | Death & respawn | 56 px "Rise again" button after a 1.2 s lock with a countdown. |
| H089 | partial | 3 | Death & respawn | HUD dims to 35% over 600 ms on death. No stat line: the game has no death penalty to report. |
| H090 | done | 2 | Safe areas & rotation | Safe-area vars defined on `#ui.touch-ui` and used by every touch rule. |
| H091 | done | 2 | Safe areas & rotation | Landscape: tracker beside the minimap, label under the menu row, buff bar above the orbs. |
| H092 | done | 2 | Safe areas & rotation | Camera shifts the hero lower below 700 px height (camera.ts, tested). |
| H093 | done | 2 | Safe areas & rotation | While a main panel is open the HUD behind it is hidden (the life bar stays as a strip). |
| H094 | done | 2 | One-handed play | Setting `touchLayout` mirrors stick and buttons (`#ui.lefty`). |
| H095 | done | 3 | One-handed play | Double-tap attack locks auto-attack (padlock glyph); tap or dodge releases. |
| H096 | done | 2 | Haptics | haptics.ts: feature-detected, throttled, `Settings.haptics` switch in Settings. |
| H097 | done | 3 | Haptics | Hit, dodge, potion, death and overheat patterns are wired. |
| H098 | done | 3 | Haptics | Level-up, quest step, boss intro and legendary drop patterns are wired. |
| H099 | done | 3 | Haptics | Heartbeat pattern below 25% life, stopped by heal, death or reduced motion. |
| H100 | done | 3 | Clutter | Secondary HUD fades to 45% in combat and returns 1.5 s after. |
| P001 | done | 1 | Epilogue Continue and Skip cannot be tapped | Epilogue allow-listed for taps, whole card tappable, 44 px Skip (epilogue.ts, base.css). |
| P002 | done | 1 | Android Back button and browser Back leave the game | panelStack.ts: one history entry per open panel; Back and Escape close the top one (checked at 390 and 1280). |
| P003 | done | 1 | One close control, in the panel header, that knows every panel | panelHeader.ts: one 44 px close in every header; .touch-close and .service-close gone. |
| P004 | done | 2 | Swipe down on the header to close a panel | Grab handle and swipe-down on the header closes the sheet (not inside the tree scroll, matrix or sliders). |
| P005 | done | 2 | One main panel at a time plus a bottom tab bar to switch | Portrait: one main panel at a time and a bottom tab bar with badges; desktop keeps panels independent. |
| P006 | done | 1 | Leaving a hub service or the Tier Beacon leaves the inventory open | `inventoryOpenedByService`: closing a service closes the bag it opened. |
| P007 | done | 1 | HUD ghosts through the panels; panels need an opaque backdrop in portrait | Panels are opaque (#0e0c0b) and the HUD behind them is hidden while one is open. |
| P008 | done | 2 | Keep a thin life/resource strip visible above full-screen panels | A 6 px life strip stays at the top above full-screen panels. |
| P009 | done | 2 | Optional "pause while menus are open" | `Settings.pauseInMenus` (default on): pauses with a menu open in a hub or with no enemy within 12 m; "Paused" chip. |
| P010 | done | 1 | Toasts and error notices render under the panels | Toasts above panels (z 58) as a bottom snackbar while a panel is open; 44 px min height. |
| P011 | done | 2 | Sticky panel header with title, close and gold | Sticky header with title, gold/extras and close. |
| P012 | done | 1 | Replace native `confirm()` with an in-app confirmation sheet | confirmSheet.ts replaces native confirm(): two 48 px buttons, Back/Escape cancel. |
| P013 | done | 1 | Two-step confirmation for expensive or irreversible one-tap actions | `armConfirm`: first tap becomes "Confirm - N gold" for 3 s with a haptic; used for rare+ sells and destroy actions. |
| P014 | done | 3 | Tap outside non-full panels closes them | Scrim behind panels closes the top one on a tap outside (touch only). |
| P015 | done | 3 | Panel open/close motion (and reduced motion) | Slide-up/slide-down motion, off under prefers-reduced-motion. |
| P016 | done | 3 | Declare touch-scroll behaviour on panels (containment, momentum) | touch-action: pan-y and overscroll containment on panels; overscroll none on html/body. |
| P017 | done | 3 | Scroll position survives refresh and re-open | `preserveScroll` and a per-panel scroll memory. |
| P018 | done | 3 | Show that a panel scrolls | Bottom fade while more is below and a 44 px back-to-top chip after 600 px. |
| P019 | done | 1 | Minimum text size 12 px in the touch UI | `--fs-min: 12px` applied; an open-panel sweep finds only the 11 px inventory cell badge (kept at 11 px as P050 specifies). |
| P020 | done | 1 | Every control is at least 44x44 CSS px | `--tap-min` 44 px on controls; the sweep finds no smaller control in the six panels or the vendor, technician and stash at 390x844. |
| P021 | done | 2 | Contrast of muted text and empty states | Muted text (slot labels, hints, kind lines) raised to a lighter colour at 12 px or more under touch-ui (base.css). |
| P022 | done | 2 | Layouts must survive the text-size setting (0.75x to 2x) | Layouts use em/min() and survive 0.9x-2x text size (checked at scale 2 on the tree and dialogue). |
| P023 | done | 2 | Safe-area insets missing outside the panels | Safe-area insets on panels, select screen, epilogue and lore; vars available on `#ui.touch-ui`. |
| P024 | partial | 3 | Spacing and type scale tokens | Tokens `--space-1..5`, `--fs-*` defined and used by the portrait sheets (~200 uses); desktop style.css still has 94 raw `font-size: 0.x` rules, left alone to keep desktop unchanged. |
| P025 | done | 1 | Settings panel (Sound / Display / Controls tabs) | settingsPanel.ts: Sound / Display / Controls tabs, writes through the existing settings path. |
| P026 | done | 1 | Text size control with live preview | S/M/L/XL text size sets `--text-scale` live. |
| P027 | done | 2 | Controls tab: touch controls, movement, thumb layout | Controls tab: touch mode, move mode, `touchLayout` (stick side) and `buttonScale`. |
| P028 | done | 2 | Display tab: graphics, FPS and screen shake out of the debug panel | Display tab: graphics, screen shake, FPS. |
| P029 | done | 3 | Vibration (haptics) setting | `Settings.haptics` switch (hidden without vibrate support) and the haptic() helper. |
| P030 | done | 2 | Menu button naming: the sliders icon only opens Sound | The sliders button opens Settings (key `soundSettings`); the speaker button swaps to a muted icon. |
| P031 | done | 2 | First-run coach marks | Four coach marks (move, attack, menu, interact) with "Skip tips", stored under `ashfall.hints`. |
| P032 | done | 2 | First-open panel tips instead of permanent 10 px hint lines | Panel hint lines become a dismissible first-open tip, then a "?" in the header. |
| P033 | done | 2 | Notification dots on the menu buttons | Attention dots on the menu buttons and badges on the tab bar. |
| P034 | done | 1 | Mouse wording shown on a phone | `touchText(key)` picks `${key}Touch` strings under touch-ui; mouse wording rewritten as "Tap...". |
| P035 | done | 1 | Do not autofocus the name field on touch | No name-field autofocus on coarse pointers; select screen scrolls to the top. |
| P036 | done | 1 | Name field: 16 px, right keyboard attributes | 16 px name field, autocapitalize words, enterkeyhint done, counter. |
| P037 | done | 2 | Begin and Back stay reachable above the keyboard | Sticky bottom action bar that follows visualViewport (`--kb`). |
| P038 | done | 2 | Slot cards: compact rows instead of 254 px portrait cards | Slots are 88 px rows in portrait. |
| P039 | done | 2 | Class picker: three compact choices and details without scrolling | Classes are a 3-column chip row with the details card under it. |
| P040 | done | 1 | Delete character: bigger, safer control | Separate 44 px options button; delete goes through the confirm sheet naming the hero. |
| P041 | done | 3 | Continue shortcut and useful slot details | "Continue" for the last-played slot and "last played N ago" on rows. |
| P042 | done | 3 | Credits block as an info sheet | Credits behind a 44 px button and sheet. |
| P043 | done | 1 | Backpack grid: fewer, bigger columns | Backpack grid of 52 px cells (auto-fill minmax). |
| P044 | done | 1 | Tap selects an item and shows an action sheet (drag-free) | Tap selects and opens the item sheet with Equip / Salvage / Socket actions; double-tap equips. |
| P045 | done | 2 | Long-press needs visible progress and clear outcome | Added in this pass: a held bag cell or skill slot settles and a conic ring fills above the finger over 450 ms (touchControls.ts, items.css). |
| P046 | done | 2 | Salvage on touch, with multi-select | Select mode with check badges and a bottom bar ("Salvage N items"); rare+ asks first. |
| P047 | done | 2 | Compact equipment area | Doll is two strips of 48 px slots in portrait. |
| P048 | done | 2 | Sort button | Sort menu (rarity, slot, power, newest) via `Game.sortInventory`. |
| P049 | done | 2 | Filter chips and search | Filter chips (All, Weapons, Armour, Jewellery, Crystals, Better) fade non-matches. |
| P050 | done | 2 | Item power, upgrade arrow and new badge on cells | Power badge (11 px by spec), up/down arrow and "new" dot on cells. |
| P051 | done | 3 | Capacity counter and full-bag state | "37 / 40" counter, red at full, bag-full banner with a salvage-junk shortcut. |
| P052 | done | 3 | Crystal socketing flow | Socketing banner, pulsing sockets on valid cells, rest dimmed. |
| P053 | done | 3 | Rings and dual slots: say which item is replaced | Dual-slot items compare against each ring and equip asks which slot (inventoryLogic.ts, tested). |
| P054 | done | 1 | Tooltip as a dismissible bottom sheet with one shared controller | tooltipSheet.ts: one bottom sheet for items and skills; closes by X, tap outside, swipe, Escape, Back. |
| P055 | done | 1 | Tooltip contents are clipped and cannot scroll | Scrollable sheet with a pinned header and compare summary. |
| P056 | done | 2 | Side-by-side comparison with the equipped item | This item / Equipped / Changes tabs with a one-line verdict and green/red chips (tested). |
| P057 | done | 2 | Make the affix symbols explainable | Symbol legend behind an "i"; tapping a symbol explains it. |
| P058 | done | 2 | Summary header and collapsible sections | Header card (portrait, name, level, XP, gold) and accordions with remembered state. |
| P059 | done | 3 | Tap a stat to see what it does | Tap a stat row for a sheet with the formula and sources. |
| P060 | done | 3 | Shortcuts to spend points and manage gear | Footer buttons "Skills (N)" and "Bag" switch panels. |
| P061 | done | 1 | Learning a skill needs select then confirm (like the Matrix) | Select, then a full-width "Learn (1 point)" button in the sheet; second tap spends. |
| P062 | done | 2 | Tree layout uses the width | Tree nodes in a 4-per-row grid at 390 (checked). |
| P063 | done | 2 | Header wraps into four-line buttons | Two-row header; Reset moved to a "..." menu with a confirm. |
| P064 | done | 2 | Guided action-bar assignment | Slot pick shows "Pick a skill for slot N", dims non-assignable nodes, "Equip to bar" in the sheet. |
| P065 | done | 2 | Jump chips for the long branch list | Jump chips (Basic ... Key Passive) scroll to the branch; locked branches collapse. |
| P066 | done | 3 | Show why a node cannot be learned on the node | Lock glyph, `data-reason`, rank pips and an "or" connector. |
| P067 | done | 2 | Fit the board to the viewport on open | Matrix board fits on open, nodes at least 40 px apart (camera maths tested). |
| P068 | done | 2 | Visible Allocate button and touch wording | Full-width "Allocate (1 point)" button and a one-line touch hint. |
| P069 | done | 2 | Matrix header: "Skills" button vs close | Back chevron to Skills, points pill, XP progress bar in the matrix header. |
| P070 | done | 3 | Glyph chips and sockets as a picker sheet | Socket nodes open a glyph picker with 56 px+ rows (67 px measured). |
| P071 | done | 3 | Gate attach and rotate with a preview | Ghost of the board at the chosen rotation, rotate button, full-width Attach. |
| P072 | done | 2 | Collapsible entries and Active / Completed tabs | Accordion rows with Active (n) / Completed (n) tabs; the tracked quest starts open. |
| P073 | done | 2 | Track as a toggle, with "Show on map" | 44 px star toggle and "Show on map", which now opens the map centred on the quest marker (MapUi.openAt). |
| P074 | done | 3 | Completed quests as a list with rewards | Completed rows with check, title and rewards; tap shows the summary. |
| P075 | done | 3 | Empty and first-quest states | Empty state with an "Open map" button and a one-time Track hint. |
| P076 | done | 1 | Teleport needs a confirmation sheet | Tapping a teleporter selects it and asks in a confirm sheet; only Travel moves. |
| P077 | done | 2 | Markers are tiny and unlabeled | 28 px snap radius, ring and name on the selected marker, legend chips. |
| P078 | done | 2 | Map layout: full-height sheet, header close, legend instead of a long footer | Top-aligned sheet, chips for explored %/tier/harvest and a one-line hint. |
| P079 | done | 2 | Region tabs should scroll and be tappable | Scrollable 44 px region tabs with edge fades; last region remembered per session. |
| P080 | done | 3 | Pan, zoom and "locate me" | Pinch, drag, double-tap zoom and a locate button (maths tested). |
| P081 | done | 2 | Options of 44 px and no overlap with the thumb buttons | Dialogue sits above the thumb cluster, options 48-50 px, no slot overlap (checked). |
| P082 | done | 3 | Tap-to-advance, speaker header and readable body | Speaker header, scrolling text, tap advances single-option pages. |
| P083 | done | 3 | Quest offers as cards with accept as the primary button | Offer card with level, XP and gold chips; Accept is the filled last button. |
| P084 | done | 1 | Service panel and backpack must share the screen, not overlap | Portrait split: service on top, backpack below with 52 px cells. |
| P085 | done | 1 | Buy and sell through an item sheet with price, comparison and gold after | Buy/sell through the item sheet with price, gold after and arm-then-confirm. |
| P086 | done | 2 | Prices as chips under the cells with affordability | 64 px stock cells with price pills, red when unaffordable, struck out when sold. |
| P087 | done | 2 | Pinned item card with full stats while reforging | Pinned item card with affix chips while reforging. |
| P088 | done | 2 | Accordion sections: Reroll, Tempering, Masterwork | Reroll, Tempering and Masterwork are accordion sections (checked: one open). |
| P089 | done | 2 | Tempering preview, ranges and which affix is replaced | Temper rows show the rolled range, cost have/need and one button; full items show radio rows. |
| P090 | done | 2 | Masterwork costs as chips and next-rank preview | Cost chips with have/need, before/after line, 48 px rank button. |
| P091 | done | 1 | Confirm and count for "Salvage all common and magic items" | "Salvage N items" opens a confirm listing the first items with Keep toggles. |
| P092 | done | 2 | Codex of Power: unlocked first, locked grouped | Unlocked aspects first, locked ones grouped with progress. |
| P093 | done | 2 | Show the aspect before extract or imprint | Aspect shown before extract/imprint with a before/after line. |
| P094 | done | 2 | Stash: empty state, counts and transfer clarity | Stash header with counts, empty state, store-all-junk shortcut, "Moved to stash" toast. |
| P095 | done | 2 | Volume sliders: bigger, with values and a test sound | 48 px sound rows with value, -/+ steppers, mute row and a tick on release. |
| P096 | done | 1 | Tier Beacon rebuilds its buttons twice a second, swallowing taps | Tier Beacon rebuilds only when its state key changes, so taps are not swallowed. |
| P097 | done | 2 | Tier rows: compact comparison, lock progress and confirm | Tier rows with effect chips, lock progress, "In combat" banner and a confirm. |
| P098 | done | 2 | Rift level stepper and slider are too small | 48 px stepper, big level, quick buttons, 32 px thumb, effect chips, full-width Enter Rift. |
| P099 | done | 3 | Rift result: glyph attempts with odds and feedback | Glyph rows with success chance, attempts, result line and portal button (tested). |
| P100 | done | 3 | Credits pacing and readability on a phone | Hold pauses credits, tap shows Skip, screen wake lock, safe-area skip button. |
