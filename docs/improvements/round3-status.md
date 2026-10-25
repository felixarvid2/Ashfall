# Improvement round 3: implementation status

Status of the 50 items in `round3.md` (A, B, C, D) in this folder, checked against the code on this branch. Checks: `tsc --noEmit` clean, vitest 134 files / 1469 tests pass, `build` OK. Headless browser run at 1600x900 and 390x844: feats and titles, rift daily and records, trader reroll, salvage preview, stash materials, settings tabs, lazy panels, death recap, red X, world boss label; no page or console errors.

Totals: done 50, partial 0, skipped 0.

Known limits (the items are done, with these exceptions):

- A01/A02: Pad16 (home button) can't be bound.
- A09: A* gives up after 4000 cells; the red X shows then.

Account data stays version 1. The new fields have defaults, and saves are unchanged.

| ID | Status | Note |
|---|---|---|
| A01 | done | Gamepad polling with dead zones; last device wins (`src/core/gamepad.ts`). Pad16 is not reachable as a binding. |
| A02 | done | Gamepad group in Settings > Controls with rebind, conflict and reset. Pad16 can't be bound. |
| A03 | done | Spatial focus navigation (`src/ui/focusNav.ts`), modal focus trap and restore. |
| A04 | done | Inventory pad cursor over bag and doll; A/X/Y and bumpers as specified. |
| A05 | done | Start opens pause, Select opens map. |
| A06 | done | Pad glyphs when the pad was used last (`src/core/inputLabels.ts`). |
| A07 | done | Rumble on big hits, boss crits and level-up, behind the haptics setting and throttled. Vibration switch also shows while a gamepad is in use. |
| A08 | done | Connect/disconnect toast; pause when the active pad drops mid-play. |
| A09 | done | Red X on unreachable ground clicks. A* gives up after 4000 cells. |
| A10 | done | 14 strings in `en.json` use `{key:action}` placeholders filled from bindings. |
| B01 | done | `reduceMotion` setting, separate from screen shake. |
| B02 | done | 0.4 s elite name flash and a camera nudge (skipped with reduce motion). |
| B03 | done | Level-up knockback and stun within 6 m. |
| B04 | done | Death recap: last three hits and damage in the last 5 s. |
| B05 | done | Guide line follows the nav path; banner names the destination. |
| B06 | done | Show tips toggle and Reset tips in Settings. |
| B07 | done | Ring arrows compare against the weaker equipped ring. |
| B08 | done | Map backing size follows devicePixelRatio and zoom. |
| B09 | done | Quest marker style from quest kind (main, side, mystery). |
| B10 | done | Ellipsis unified to "..."; covered by the string lint. |
| B11 | done | One-line comparison summary at the top of comparison tooltips. |
| B12 | done | Soft pickup sound and spark when the magnet brings gold or crystals. |
| C01 | done | `exactOptionalPropertyTypes` on; 65 errors fixed. Widened to `?: T \| undefined` only for per-tick AI state, zod-inferred fields and option bags. |
| C02 | done | Character, skill tree and settings panels load on first open; the map stays eager for the minimap. Pause menu no longer stays over Settings. |
| C03 | done | Vite config warning gone. |
| C04 | done | 600-tick seeded determinism test with two zone changes. |
| C05 | done | Every empty catch is commented; a test guards new ones. |
| C06 | done | Line coverage 53.3 % → 63.3 %. |
| C07 | done | `scripts/assets/textureCaps.ts`; all 663 textures already within caps; chained into `assets:check`. |
| C08 | done | Zone byte budget test. |
| C09 | done | Fixtures from the game's own save path (`npm run fixtures:build`). |
| C10 | done | three.js imports pinned by a test. |
| C11 | done | CI runs build and `assets:check`. |
| C12 | done | Release workflow runs tsc and rejects `.map` files. |
| C13 | done | "Copy details" on the error overlay. |
| C14 | done | Perf budget test runs in CI. |
| D01 | done | Halo of the Penitent: Sanctuary uptime about 35 %. |
| D02 | done | Radiant aspect is additive (4–7 %); guard keeps the Zealot stack ≤ 1.1× the best other build. |
| D03 | done | One escort bounty per region (20 in total). |
| D04 | done | Greetings for quest-only NPCs. |
| D05 | done | Trader reroll with a rising daily cost. |
| D06 | done | Codex shows the dungeon for each missing aspect. |
| D07 | done | World boss banner, map label with timer, footer chip. |
| D08 | done | Rift records per class and level. |
| D09 | done | Salvage preview; salvaged junk legendaries now give dust. |
| D10 | done | Deposit and take all materials in the stash (account-wide pool). |
| D11 | done | Daily seeded rift with its own record. |
| D12 | done | 21 feats with toast and a list in the character panel. |
| D13 | done | 9 feats grant titles shown on character select. |
| D14 | done | `npm run balance:report` writes `docs/balance-report.md`. |

Behaviour changes to note:

- Quest-only NPCs now greet by context.
- Rift records, feats and the daily rift are local to the account.
- Salvaged junk legendaries give dust.

Other changes in this round:

- **Balance:** the level-up shove moved two Lightbearer L10 times out of band. Lightbearer early numbers were retuned so all balance bands pass.
- Lightbearer retune: BALANCE_PENDING
- **Performance and tech:** exactOptionalPropertyTypes, lazy panels, coverage and CI checks are described in the table above.
