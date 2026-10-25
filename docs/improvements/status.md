# Improvement pass: implementation status

Status of the 100 items in `gameplay.md` (G), `content.md` (C), `tech.md` (T) and `feel.md` (F) in this folder, checked against the code on this branch. Checks: `tsc --noEmit` clean, vitest 1269 passed (18 skipped), `assets:check`, `build` and `build:artifact` pass, `balance:check` pass. Headless browser run at 1280x720 and 390x844: no page errors or 404s; boot to character select about 0.5 s; all four classes load their models; death and respawn, inventory Equip best, quest log, settings and context loss/restore pass; portrait HUD and zone card fit.

Totals: done 84, partial 16, skipped 0.

Not verifiable headless: zone change took 8.7 s on the first load of Hydroponic Vaults, and respawn took about 12 s under software rendering (about 1 fps). Check both on real hardware. Also unchecked: audio feel, telegraph visibility and slow-mo (not triggered in the test).

Partial, or changed from the spec:

| ID | Status | Note |
|---|---|---|
| G007 | partial | Heal casts per minute target met. Devotion at L30 is 76 against a 60 target. |
| G009 | partial | Lightbearer flat passives are not converted to % stats. |
| G013 | partial | Furnace Cleave meets 10:30 on one seed only. |
| G014 | partial | Heat Vent build reaches 744 against an 800 goal. |
| C004 | partial | One new unique per class on gloves, ring and amulet, not two. |
| T005 | partial | Entry chunk split into 7; panels still load eagerly. |
| T015 | partial | Sync reuse only; no skipping of static props. |
| T017 | partial | Most per-frame allocations removed; enemy bar info objects remain. |
| T022 | partial | 7 new test files; no coverage run. |
| T024 | partial | `noUnusedLocals` and `noUnusedParameters` on; `exactOptionalPropertyTypes` and dead exports left. |
| T025 | partial | `localPrefs` and an rng for minions; module-level AI state and silent catches left. |
| F004 | partial | No recommended-node ring. |
| F018 | partial | No silhouette for occluded enemies. |
| F019 | partial | No minimap pip colours. |
| F020 | partial | No loot magnet. |
| F025 | partial | First-quest toast is generic. |

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
