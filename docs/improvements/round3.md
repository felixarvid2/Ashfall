# Improvement round 3 (50 items)

Leftovers from the earlier passes (docs/improvements/status.md, docs/ui/diablo-status.md, agent notes) plus
gamepad support, which both UI audits flagged and nothing has built. No paid generation: new things reuse
existing icons, art and models. Each item: what to change and how to verify.

## A. Gamepad and input (A01–A10)

- **A01 Gamepad play.** Gamepad API input: left stick moves, right stick aims (or auto-targets the nearest
  enemy in the stick direction / facing when idle), face buttons and bumpers/triggers map to the six action
  slots, dodge, potion and interact. Dead zones, works alongside mouse/keyboard (last-used device wins).
  Verify: unit tests with a fake `navigator.getGamepads()`.
- **A02 Pad bindings.** Gamepad bindings live in the keybinding model (defaults + overrides) and are
  rebindable in Settings > Controls (a "Gamepad" group). Verify: rebind/conflict tests like the keyboard ones.
- **A03 Menu focus navigation.** D-pad / left stick moves focus between controls in panels and menus
  (spatial navigation), A confirms, B backs (same as Escape / panel stack pop), focus is trapped in modals and
  restored on close, every screen opens with a focused control. Verify: tests on a DOM fixture (jsdom is not
  installed — use the existing test style, or pure functions for the spatial-nearest choice).
- **A04 Inventory with a pad.** D-pad moves a cursor over the bag grid and doll; the tooltip (with
  comparison) shows for the focused cell; A equips/uses, X marks junk, Y locks, bumpers switch tabs.
- **A05 Start/Select.** Start opens the pause menu, Select opens the map.
- **A06 Button prompts.** Key labels (`keyLabel`, hints, coach tips, prompts) switch to pad glyphs
  (A/B/X/Y, LB/RB, LT/RT) when the pad was used last, back to keys on keyboard/mouse input.
- **A07 Rumble.** `vibrationActuator` rumble on big hits, crits on bosses, level-up — behind the existing
  haptics setting, throttled.
- **A08 Hot-plug.** "Controller connected/disconnected" toast; pause when the active pad disconnects mid-play.
- **A09 Unreachable click.** A ground click that the nav can't reach shows a short red X instead of the move
  marker (F005 leftover).
- **A10 Rebound key text.** Strings in en.json that hard-code keys ("Press K…", "Hold Alt…") use
  placeholders filled from the current bindings, so rebinding updates them.

## B. Feel and UI leftovers (B01–B12)

- **B01 Reduce motion.** A `reduceMotion` setting separate from screen shake: turns off slow-mo, push-in,
  letterbox, camera look-ahead and crowd pull-back, hit recoil squash.
- **B02 Elite beat.** Elites (not only bosses) get a short intro: a 0.4 s name flash on their plate and a
  small camera nudge (skipped with reduceMotion).
- **B03 Level-up stagger.** Level-up knocks back and staggers enemies within 6 m (F017 leftover).
- **B04 Death recap.** The death screen lists the last three hits (source, damage, type) and the damage taken
  in the last 5 s (F014 leftover).
- **B05 Guide route.** The golden guide line follows the nav path (not a straight line) and the banner names
  the real destination (F007 leftover).
- **B06 Tips setting.** Settings: "Show tips" toggle and "Reset tips" (F006 leftover).
- **B07 Ring arrows.** Tooltip arrows for rings compare against the weaker equipped ring, so they agree with
  Equip best.
- **B08 Sharp map.** The map canvas backing size follows devicePixelRatio and zoom (it is soft at 4×).
- **B09 Map legend from data.** Quest marker classification uses quest data (main/side/mystery), not
  hard-coded colours.
- **B10 Ellipsis style.** Unify "..." vs "…" in en.json (pick the majority) and add it to the string lint.
- **B11 Tooltip summary.** The comparison tooltip opens with one summary line: "+12 % damage, −3 % life"
  (from the existing compareGear numbers).
- **B12 Magnet feedback.** The loot magnet plays a soft pickup sound and a small spark when gold/crystals
  arrive.

## C. Tech (C01–C14)

- **C01 exactOptionalPropertyTypes.** Enable it and fix the errors (about 56).
- **C02 Lazy panels.** Skill tree, map, settings and character panels load on first open (T005 leftover),
  keeping their keys/buttons working before load.
- **C03 Vite config warning.** Fix the extensionless-import warning from vite.config.ts and tools/.
- **C04 Determinism test.** A 600-tick seeded sim with two zone changes gives the same state hash twice.
- **C05 Silent catches.** Review the remaining 32 `catch {}`: log or comment each; a test fails on a new
  uncommented empty catch.
- **C06 Coverage.** Tests for the five lowest-coverage modules that matter (from `npm run coverage`),
  raising overall coverage by at least 5 points.
- **C07 Texture caps.** A local script that reports textures above a size cap per category and downsizes
  the ones above it (no paid API); run it and keep every model loading.
- **C08 Zone byte budget.** A test that each zone's entry asset set stays under its byte budget.
- **C09 Real fixtures.** Save/account fixtures produced by the game's own export path from a sim run.
- **C10 three.js imports.** Check what vendor-three contains and trim unused three.js modules/examples.
- **C11 CI.** CI also runs `npm run build` and `assets:check`.
- **C12 Release checks.** The release workflow runs `tsc` and fails if the zip contains `.map` files.
- **C13 Error report.** The error overlay has "Copy details" (error, stack, version, browser).
- **C14 Perf in CI.** A quick perf-budget test (one zone, short) runs in CI.

## D. Gameplay and content (D01–D14)

- **D01 Halo uptime.** Halo of the Penitent: Sanctuary uptime ≤ ~35 % (was ~47 %).
- **D02 Zealot stacking.** Check Zealot + Radiant aspect + Sacred Flame; cap the stack if it exceeds the
  other classes' best builds at L30 (sim).
- **D03 Bounty variety.** One more bounty per region using an escort or defend objective.
- **D04 Quest NPC greetings.** Quest-only and follower NPCs get context greetings.
- **D05 Trader reroll.** Pay gold to reroll the trader's stock (rising cost per day).
- **D06 Codex hints.** The Codex shows which dungeon unlocks each missing aspect.
- **D07 World boss notice.** Active world bosses are announced and shown on the map with a timer.
- **D08 Rift records.** Local best time per class per rift level, shown in the rift panel.
- **D09 Salvage preview.** Salvage shows the expected materials before confirming.
- **D10 Deposit materials.** Stash: "Deposit all materials" button.
- **D11 Daily rift.** A daily seeded rift (seed from the date) with its own record.
- **D12 Feats.** About 20 local achievements (kills, uniques, rifts, bosses, classes) with a toast and a list
  in the character panel; existing icons only.
- **D13 Feat rewards.** Some feats grant cosmetic titles shown under the name on character select.
- **D14 Balance report.** `npm run balance:report` writes a markdown table of all builds (L10 times, L30
  DPS neutral/corrupted, pack-of-5) to docs/balance-report.md.
