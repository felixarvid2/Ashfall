# Improvement pass: implementation status

Status of the 100 items in `gameplay.md` (G), `content.md` (C), `tech.md` (T) and `feel.md` (F) in this folder, checked against the code on this branch. Checks: `tsc --noEmit` clean, vitest 1269 passed (18 skipped), `assets:check`, `build` and `build:artifact` pass, `balance:check` pass. Headless browser run at 1280x720 and 390x844: no page errors or 404s; boot to character select about 0.5 s; all four classes load their models; death and respawn, inventory Equip best, quest log, settings and context loss/restore pass; portrait HUD and zone card fit.

Totals: done 84, partial 16, skipped 0.

Not verifiable headless: zone change took 8.7 s on the first load of Hydroponic Vaults, and respawn took about 12 s under software rendering (about 1 fps). Check both on real hardware. Also unchecked: audio feel, telegraph visibility and slow-mo (not triggered in the test).

Partial, or changed from the spec (updated after the polish pass; 14 of the 16 are now done):

| ID | Status | Note |
|---|---|---|
| G007 | done (polish) | L30 healer Devotion 78 → 59 (Devout and Piety gain). |
| G009 | done (polish) | Vigil, Consecrated Mail and Sacred Oath are percentage stats. |
| G013 | done (polish) | Furnace Cleave reach 3.9 m; L10 8:26–9:37 on four seeds. |
| G014 | done (polish) | Heat Vent 0.15 per Heat; vent build 744 → 816. |
| C004 | done (polish) | Four more uniques (gloves/rings), two per class in total. |
| T005 | partial | Entry chunk split into 7; services, Neural Matrix and epilogue load lazily (−12 kB gzip); skill tree, map, settings and character still eager. |
| T015 | done (polish) | Static props placed once and culled on focus moves (1.4 → 0.4 ms/frame at 3,749 entities). |
| T017 | done (polish) | Enemy bar infos, blips and affix lists come from a frame pool. |
| T022 | done (polish) | `npm run coverage`: 54 % statements. |
| T024 | partial | Flags on, 7 dead exports removed, `CaveSource` type; `exactOptionalPropertyTypes` left (56 errors). |
| T025 | done (polish) | AI state per context; silent catches 43 → 32, the rest commented. |
| F004 | done (polish) | Recommended first node ring. |
| F018 | done (polish, simpler cue) | A ring under enemies hidden by tall props; no silhouette pass. |
| F019 | done (polish) | Minimap pips per interactable kind. |
| F020 | done (polish) | Gold and crystals within 2.5 m fly to the player. |
| F025 | done (polish) | First quest shows the reward summary. |

Behaviour changes to note:

- Every zone change holds for at least 0.9 s behind a card with a tip.
- Respawn is a short sequence: fade, then "You rise again".
- Death costs gold (5 %, capped at 40 × level) and half the potion charges.
- Slow-mo, letterbox and shake follow the screen-shake setting.

Other changes in this pass:

- **Balance:** Magnus Exorcismus full-aspect build 2,703 → 1,223 DPS. Benediction minimum cooldown 30 s, and cheat-death spends itself. Lightbearer healer and shepherd reach L10 in about 11–13 min (was 13–23). Spectre Blades deaths 11/7 → 0/0. Xenomant disease single-target 390 → 502. Potions recharge 0.75 s per kill. Kill XP falls 30 % per level above the zone cap (floor 10 %). Deep Rift damage ×10.3 → ×4.0; rift item power cap 540 → 610.
- **Content:** 10 aspects, 4 uniques, 4 mythics, 5 bases, a ranged damage stat, 2 crystal types (33 FLUX images, $0.264). 15 repeatable bounties, 2 choice quests, items on 24 quests, Force Wall and Laser Grid affixes, 2 world bosses, 4 tempering recipes, 2 Cinder Flats enemies. Greetings change with progress; Core and mystery quests are varied. British spelling and a string lint.
- **Performance:** ms/tick in Hydroponic Vaults 8.73 → 0.37 (other zones 1–2.7 → 0.17–0.37). LOD files 21.8 → 3.0 MB; `public/assets` 74 → 55 MB. Bytes before character select 39 MB → 3.6 MB (models load per zone). Ground splat 1.6–3.2 s → about 0.1 s, memoised. Entry chunk 2,093 kB → 7 chunks (largest 676 kB).
- **Saves and robustness:** account recovery from backups; autosave failures are shown; corrupt or newer saves are never overwritten; WebGL context loss is handled. PR CI workflow.
- **Feel and audio:** new Lightbearer sounds, a telegraph sound per attack, Core music, a combat drum layer, tiered loot sounds. Coach tips, a guide line, a move marker, a zone-change card, a framed respawn, a level-up effect and a boss intro beat.
