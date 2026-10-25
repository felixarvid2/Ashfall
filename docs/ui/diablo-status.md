# Diablo UI pass: implementation status

Status of the 100 audit items in `diablo-audit-hud.md` (A001-A050) and `diablo-audit-panels.md` (B001-B050), checked against the code on this branch. Checks: `tsc` clean, vitest 941/941, production build passes, and a headless browser run at 1280x720 and 390x844 touch with no page errors. Portrait HUD, thumb buttons, inventory sheet and map are unchanged.

Totals: done 87, partial 13, skipped 0.

Rule kept: item cells (30 px), icons and ground loot labels (19 px tall, 11.7 px text) keep their size.

Not verifiable headless: a real gamepad (not in scope), and the feel of beams and vignette timing.

Partial, or changed from the spec:

| ID | Status | Note |
|---|---|---|
| A012 | partial | No skill-point dot on the K hint: desktop has no Skills key row. An 8 px dot at the right end of the XP bar shows learned skills that are not on the bar. |
| A024 | partial | Telegraph fill alpha kept at 0.35; the outline brightens over the last 0.3 s. |
| A031 | partial | Element colours come from the existing `damageType`; no new event field. |
| A038 | partial | Beam changes are in `src/render/lootVisuals.ts`; the opacity constants in `BEAM` may need visual tuning. |
| A049 | partial | Strings only. |
| B003 | partial | Junk mark by Alt+click; it feeds Salvage junk. The touch sheet has Lock only. |
| B015 | partial | Search is a "/" button in the tools row, desktop only. |
| B023 | partial | Buyback is memory-only, cleared on restock; the row scrolls sideways. |
| B026 | partial | Aspect filter by slot type; there are no offensive/defensive categories. |
| B027 | partial | Likely the HUD tracker over the panel. The tracker is now hidden while panels are open, and the tree panel z-index is raised. |
| B028 | partial | Panel height unchanged. |
| B032 | partial | Refund one rank by right-click, at 20 % of the respec price. No touch action. |
| B050 | partial | Reward chips show shard and legendary yield. Rift data has no XP bonus, so none is shown. |

Other changes in this pass:

- Item flags `locked` and `junk` (mutually exclusive). Save version 8 with a migration. Locked items are skipped by salvage, sell, salvage junk and aspect extraction.
- New settings: `reduceFlashing` (class `reduce-flashing` on `#ui`), `colorblind` (protanopia, deuteranopia, tritanopia), `brightness` (0.8-1.4 via renderer exposure), `lootLabelMin` (default magic).
- Fixes after the browser check:
  - The hint and title fade uses real time (`src/ui/hintFade.ts`).
  - The full-bag warning moved into the tools row, so the 4th grid row stays visible at 720p.
  - Synthetic keydown fallback for rebinding.
  - The death cause prettifies unknown affix ids.
  - The minimap hides on desktop while a panel is open (it overlapped the inventory doll).
