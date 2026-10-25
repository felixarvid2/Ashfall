# Diablo 3 / Diablo 4 audit: in-world HUD and combat feedback on desktop (A001-A050)

Scope: action bar and cooldowns, orbs, XP, buffs, minimap, tracker, enemy/elite/boss bars, damage numbers, hit and low-life feedback, ground loot, interact prompts, toasts/banners, death, region cards, rift HUD. Panels (inventory, tooltips, vendor, skill tree, map panel, settings) are the other audit. The 200 mobile items (H001-H100, P001-P100) are done; this list does not repeat them and several items below are "unscope the portrait rule for desktop".

**Method.** Production build (`npx vite build`, `vite preview` on :5291, one Chromium, software GL at about 4 FPS) at 1280x720, state seeded through `window.ashfall` (`?debug`): loot rewards, a 40-enemy horde with held LMB, synthetic damage numbers, player statuses, champion pack plus rare, toasts and banner, 18 % life, level up (debug button), region card, death, Deep Rift 5. Screenshots: `/tmp/claude-0/-home-user/91b10048-104f-50d9-baf1-7585dd3fa3ee/scratchpad/ui-d3a/shots/` (`d-01-hub` ... `d-16-rift-combat`, plus `metrics.json` with bounding boxes). **Not captured:** the boss fight (no `Boss` entity existed in the first dungeon, so `d-11..13` show the dungeon, not a boss) and the 390x844 pass: the script was stopped after the desktop run. Mobile impact is therefore reasoned from the CSS (`#ui.touch-ui` rules in src/ui/portrait/*.css) and stated per item; re-check with `npm run e2e -- --scenario portrait` after each change. Items judged from code only say so. The slow sim (4 FPS) also made banners and the level-up text linger in several shots; that is a timing artefact, not an item.

**Hard rule respected.** No item makes ground labels, item icons or footprints larger. Loot items change colour, opacity, order, count or z-order only. Where an item moves something on desktop it uses space that is already empty or that the item itself frees.

**Legend.** Priority 1 = clearly worse than D3/D4 and affects every fight, 2 = clear improvement, 3 = polish. Effort S = under about 2 h in one or two files, M = a day or several files, L = none.

## Summary

- Items: 50. Priority 1: 14, priority 2: 26, priority 3: 10. Effort S: 40, M: 10, L: 0.
- Biggest finding: most of the combat feedback the mobile work added (low-life vignette, ghost bar and hit flash, level-up ring, XP flash, potion urgent pulse, ready flash, no-resource tint, buff expiry blink, target % and phase ticks, boss frame, loot "+N" chip) is scoped to `#ui.touch-ui` in src/ui/portrait/*.css; desktop has none of it (about 14 items are "unscope it").
- Missing on every viewport: overhead enemy life bars, minimap enemy blips, element-coloured numbers, a death cause line.
- Measured on desktop: orbs 104 px, slots 62 px (small 52), XP bar 13 px, minimap 180 px, tracker 230 px, target frame 320 x 44, loot label 92 x 19 at 11.7 px, buff tiles 34 px, slot key text 9.75 px.
- Screenshots: d-01-hub, d-02-loot, d-03-combat-horde, d-04-damage-numbers, d-05-statuses, d-06-elite-pack, d-07-toasts-banner, d-08-low-life, d-09-levelup-a/b, d-10-region-card, d-14-death, d-15-rift, d-16-rift-combat.

## Top 10

1. A032: Low-life vignette is touch-only; at 19 % life on desktop there is no screen cue.
2. A035: Loot labels draw over the action bar, orbs and banners.
3. A020: No life bars over damaged enemies (only one target frame).
4. A021: Elite/champion names have no bar or affix info and can sit on the HUD.
5. A037: 23 ground labels at once; no cap, no "+N", commons never fade.
6. A016: Minimap has no enemy blips (40 enemies in range, none shown).
7. A045: Any click respawns instantly on desktop; the lock is touch-only.
8. A042: Toast stack and event box overlap the target frame (same y-band).
9. A019: Permanent control hints run under the target frame.
10. A047: Region card is a 620x349 painting in the middle of the playfield.

## Items

### A001 - Action bar (P2, S)
- **D3/D4:** D3 flashes a skill slot when its cooldown ends; D4 pulses the icon.
- **Problem:** Desktop slots get no ready cue: `.slot.ready` (350 ms flash) exists only in portrait/controls.css, and the cooldown is a dark conic sweep plus an integer (`d-03-combat-horde.png`, slots dark with no change when a cooldown ends).
- **Change:** Move the `.ready` rule to style.css: 350 ms `box-shadow: inset 0 0 0 2px #ffd27a, 0 0 10px #ffd27a` fading out, no size change. Hud.Slot.set already toggles the class.
- **Files:** src/ui/style.css (.slot), src/ui/portrait/controls.css (.ready), src/ui/hud.ts Slot.set
- **Mobile 390x844:** Same rule already applies on touch; just unscope it.
- **Effort / priority:** S / 2

### A002 - Action bar (P3, S)
- **D3/D4:** D3/D4 show the cooldown as a number on the icon.
- **Problem:** `Slot.set` shows `Math.ceil(cooldown)` only when `max >= 1`: a 2.1 s cooldown reads "3" for a full second and a 0.8 s one shows nothing.
- **Change:** Below 2 s show one decimal ("1.4", font 0.9em); keep the dirty-key (`frac.toFixed(2)|ceil`) but use `toFixed(1)` under 2 s so the DOM changes at most 10x per second.
- **Files:** src/ui/hud.ts Slot.set (cdText)
- **Mobile 390x844:** Applies to both; touch slots are 46 px, 1.4em text still fits.
- **Effort / priority:** S / 3

### A003 - Action bar (P1, S)
- **D3/D4:** D3 greys a skill and the resource orb flashes when the resource is short; D4 dims the icon and shows the cost.
- **Problem:** Heat/Focus cost is invisible on desktop: `.no-resource` and the cost badge exist only in portrait/controls.css. With 23/100 Heat (`d-05-statuses.png`) nothing tells which slot is unaffordable; the player only gets a toast after pressing.
- **Change:** Port `.no-resource` (desaturate 60 %, inner red ring `inset 0 0 0 2px #b8322a`) to style.css and write the cost into the existing `.slot-key` row, right-aligned, 10 px (no new element, no slot growth). Fed by `SlotState.affordable`, already in HudState.
- **Files:** src/ui/style.css (.slot), src/ui/hud.ts Slot.set (extra.affordable, cost)
- **Mobile 390x844:** Touch already has it; the cost sits at the bottom edge there. Do not duplicate: scope the key-row cost to `#ui:not(.touch-ui)`.
- **Effort / priority:** S / 1

### A004 - Action bar (P2, S)
- **D3/D4:** D3 plays an error voice and flashes the orb; D4 shakes the slot when a press is denied.
- **Problem:** A denied press (cooldown/resource) only raises a toast (`Not enough Heat`); `.denied` (120 ms shake) lives in portrait/controls.css.
- **Change:** On a denied keyboard/mouse skill press add `.denied` to the slot (translateX +-3 px, 120 ms) and flash the resource orb border `#ff3b2f` for 200 ms; drop the toast for resource-denied presses (keep it for "Inventory full").
- **Files:** src/game.ts (skill-denied path next to toasts.show), src/ui/style.css, src/ui/portrait/controls.css
- **Mobile 390x844:** Touch keeps the shake; remove the toast there too only if the shake is visible (it is, H016).
- **Effort / priority:** S / 2

### A005 - Action bar (P3, S)
- **D3/D4:** D3 shows empty slots as outlined sockets; D4 shows empty rings with a plus.
- **Problem:** At level 1 five of six slots sit at `opacity: .35` with "RMB 1 2 3 4" in dim orange; they read as disabled or broken (`d-01-hub.png`).
- **Change:** Empty slot: 1 px dashed `#4a4038` border, key label at 60 % opacity, click opens the Skills panel (portrait already does this, H020); no size change.
- **Files:** src/ui/style.css (.slot[data-category='empty']), src/ui/hud.ts
- **Mobile 390x844:** Portrait already dashed; reuse that rule for all viewports.
- **Effort / priority:** S / 3

### A006 - Action bar (P2, S)
- **D3/D4:** D3 key hints are bold and readable; D4 uses outlined key caps.
- **Problem:** `.slot-key` is `0.65em` mono = 9.75 px, orange on near-black; below the 12 px floor of the mobile rules and hard to read at 1280x720.
- **Change:** `.slot-key { font-size: 11px; font-weight: 700; text-shadow: 0 0 2px #000, 0 0 2px #000; }` in the same bottom-left position (the 62 px slot has room); cooldown text stays centred.
- **Files:** src/ui/style.css L167
- **Mobile 390x844:** Touch slots hide the key label; no effect.
- **Effort / priority:** S / 2

### A007 - Action bar (P1, S)
- **D3/D4:** D3/D4: at low life the potion pulses and its charge count is a badge.
- **Problem:** At 19 % life (`d-08-low-life.png`) the stim-pack slot ("Stim pack x4 / Q") looks identical to the idle state; `.urgent` pulse and the conic recharge ring exist only in portrait CSS (hud.css, controls.css).
- **Change:** Port `.slot.urgent` (green outline pulse 0.8 s, active when life < 35 % and charges > 0) and the `--recharge` ring to style.css; replace the "x4" text with the corner badge used on touch so the name line shrinks, not the slot.
- **Files:** src/ui/style.css, src/ui/hud.ts (potion Slot, setRecharge), src/ui/portrait/hud.css
- **Mobile 390x844:** Already on touch; unscope. Keep `prefers-reduced-motion` guard (hud.css L33).
- **Effort / priority:** S / 1

### A008 - Life / resource orbs (P2, S)
- **D3/D4:** D3 shows a white drain chunk when life drops; D4 shows a lighter strip.
- **Problem:** Desktop life orb jumps instantly: `.orb-ghost` (0.45 s lag strip) and the 120 ms white `.hit` flash exist only in portrait hud.css.
- **Change:** Unscope `.orb-ghost` and `.orb.hit` for the round orb: ghost = the same fill colour at 40 % opacity, `clip-path`/height transition 0.45 s; flash when one hit takes > 10 % of max life (already computed in `Orb.set`).
- **Files:** src/ui/portrait/hud.css (.orb-ghost, .hit), src/ui/style.css L190-L233
- **Mobile 390x844:** Portrait bar keeps its own geometry; only the selector scope changes.
- **Effort / priority:** S / 2

### A009 - Life / resource orbs (P2, S)
- **D3/D4:** D3 labels each resource orb by colour and shape; D4 shows the resource name on hover.
- **Problem:** The empty Heat orb is a black disc with "0 / 100" (`d-01-hub.png`); it does not say Heat, and at 0 it looks like a missing life orb.
- **Change:** Show the existing `.orb-cap` (caption "HEAT", 9 px caps, 70 % opacity) above the number inside the orb, and tint the orb border per kind (`#ff9a3a` heat, `#6fe0ff` focus, `#8aff6a` biomass) at 50 % so it reads when empty. No size change.
- **Files:** src/ui/style.css (.orb-heat, .orb-cap), src/ui/hud.ts Orb
- **Mobile 390x844:** Portrait shows the caption already; desktop only.
- **Effort / priority:** S / 2

### A010 - Life / resource orbs (P3, S)
- **D3/D4:** D3 orbs have a moving liquid surface.
- **Problem:** Both orbs are flat gradients; fill height is the only motion (`d-01-hub.png`).
- **Change:** Add a 3 px lighter band at the top edge of `.orb-fill` that slides sideways (background-position animation 3 s, `transform`-free), off under reduce-motion.
- **Files:** src/ui/style.css L200-L215
- **Mobile 390x844:** Desktop only (portrait uses bars).
- **Effort / priority:** S / 3

### A011 - XP bar (P3, S)
- **D3/D4:** D3/D4: a thin XP bar glows on gain.
- **Problem:** XP gain is silent on desktop: `.xp-bar.gain` flash and the glow above 90 % exist only in portrait hud.css.
- **Change:** Unscope: on XP increase flash the fill to `#fff3c0` for 250 ms; above 90 % add `box-shadow: 0 0 8px #e8c86a`.
- **Files:** src/ui/portrait/hud.css (.xp-bar), src/ui/style.css L358
- **Mobile 390x844:** Already on touch.
- **Effort / priority:** S / 3

### A012 - XP bar (P2, S)
- **D3/D4:** D3 puts a plus on the skill button; D4 pulses the skill-tree key.
- **Problem:** Unspent points are the tail of 9.75 px text ("Level 5 · 0 / 619 XP · 7 SP", `d-14-death.png`); easy to miss for ten levels.
- **Change:** Render "7 SP" as its own span: `#ffd27a`, 11 px bold, with a 6 px pulsing gold dot before it when > 0; add the same dot to the K hint in the key row of the Skills entry. Same row, no new line.
- **Files:** src/ui/hud.ts (xp text), src/ui/style.css L366
- **Mobile 390x844:** Portrait has the level chip dot (H003); desktop only.
- **Effort / priority:** S / 2

### A013 - Buffs / debuffs (P3, S)
- **D3/D4:** D3 groups buffs left and debuffs right; D4 keeps debuffs apart with a red divider.
- **Problem:** Boons and harmful tiles share one row, only the border differs (`d-05-statuses.png`: burning, poison, stun are mixed in with empowered and barrier).
- **Change:** Sort harmful after boons (already) and add a 10 px gap plus a 1 px `#d0402a` divider between the groups; no extra row.
- **Files:** src/ui/statusTiles.ts, src/ui/style.css L616
- **Mobile 390x844:** Same CSS applies; check at 320 px that the 274 px bar still fits (H043).
- **Effort / priority:** S / 3

### A014 - Buffs / debuffs (P2, S)
- **D3/D4:** D3/D4 show a tooltip with name, effect and time on hover.
- **Problem:** `.buff-bar` has `pointer-events: none`; a 34 px icon is the only information (`d-05-statuses.png`). Seven tiles, no names.
- **Change:** `pointer-events: auto` on `.buff` and show the existing `.tooltip` with the status name, its effect line and remaining seconds; use `t("status.<id>")`.
- **Files:** src/ui/style.css L616-L629, src/ui/hud.ts (buff render)
- **Mobile 390x844:** Touch: long-press, not hover; skip on touch.
- **Effort / priority:** S / 2

### A015 - Buffs / debuffs (P2, S)
- **D3/D4:** D3 flashes buffs about to expire; D4 blinks the icon.
- **Problem:** `.buff.expiring` blink (0.5 s) is in portrait hud.css only; desktop timers at 11 px sit 4 px over the action bar top (buff bar y 558-592, label +13 px = 605, bar top 601).
- **Change:** Unscope `.buff.expiring` (steps(2) blink under 3 s); raise the buff bar from `bottom: 128px` to `bottom: 136px` so the timer text clears the slots frame.
- **Files:** src/ui/portrait/hud.css L15, src/ui/style.css L616
- **Mobile 390x844:** Portrait positions the bar separately; no change there.
- **Effort / priority:** S / 2

### A016 - Minimap (P1, M)
- **D3/D4:** D3 and D4 show hostile blips (red dots) on the minimap; elites larger.
- **Problem:** With 40 enemies within 22 m (`d-03-combat-horde.png`) the minimap shows none; `minimap.ts` has no enemy layer (grep for enemy/hostile/elite returns nothing).
- **Change:** Draw hostile blips: 2.5 px `#d9443a` dots for enemies within 40 m, 4 px `#6fb3ff` champions, 4 px `#ffd23a` rares, boss 6 px with a ring; update at 5 Hz from `EnemyAI` + `Transform`, cap at 60 dots; hide dead.
- **Files:** src/ui/minimap.ts (draw loop near L627-L700), src/game.ts (feed positions)
- **Mobile 390x844:** Same canvas on touch; 2.5 px dots at 148 px map are visible, cap lowers clutter.
- **Effort / priority:** M / 1

### A017 - Minimap (P2, M)
- **D3/D4:** D3 shows an arrow to off-screen bosses/objectives; D4 pings them on the compass.
- **Problem:** `updateBossArrow` returns null unless `touchControls.shown`; on desktop an engaged boss off-screen gets no pointer.
- **Change:** Run the existing `EdgeArrow` on desktop too, inside bounds that avoid the HUD (left 24, right 24, top 160, bottom 180); same colour as the boss frame.
- **Files:** src/game.ts updateBossArrow L2120, src/ui/edgeArrows.ts
- **Mobile 390x844:** Touch bounds stay as they are (0.42h margins); only drop the `touchControls.shown` guard.
- **Effort / priority:** M / 2

### A018 - Quest tracker (P3, S)
- **D3/D4:** D3 plays a chime and strikes the step through; D4 flashes the tracker.
- **Problem:** A finished step just swaps text (`quest-step`); with a big centre banner already shown there is no marker on the tracker itself.
- **Change:** On step change: `.quest-row` gets a 1.2 s gold left border flash and the old step fades out with a check mark; no height change.
- **Files:** src/ui/questUi.ts (tracker update), src/ui/style.css L648
- **Mobile 390x844:** Applies to both.
- **Effort / priority:** S / 3

### A019 - HUD clutter (P1, S)
- **D3/D4:** D3 and D4 show no control text during play.
- **Problem:** The control hint line ("LMB move, attack and use...", 0.78em at 80 %, x 16-764, y 73) is permanent and runs under the target name and frame (480-800, y 76-120): "Q potion / I inventory / K skills" are struck through by the red target ring in `d-04-damage-numbers.png` and `d-06-elite-pack.png`. The "ASHFALL" title block also stays on screen.
- **Change:** Fade `.hud-hint` to opacity 0 after 20 s of play or the first skill use (store `hintsSeen`), show it again on F1/`?`; fade the title block after 8 s. Both are pointer-events none, so no layout change.
- **Files:** src/ui/hud.ts (hint, title), src/ui/style.css L50
- **Mobile 390x844:** Not checked on touch; scope to `#ui:not(.touch-ui)` so the mobile layout is untouched.
- **Effort / priority:** S / 1

### A020 - Enemy bars / nameplates (P1, M)
- **D3/D4:** D3 shows a life bar over damaged monsters; D4 shows bars on damaged and targeted enemies.
- **Problem:** Only one target frame exists; the 40-enemy fight (`d-03-combat-horde.png`) gives no life information per enemy and no feedback who is nearly dead.
- **Change:** New pooled overlay (like DamageNumbers, projection via `renderer.toScreen`): a 3 x 28 px bar above each enemy that has taken damage (life < 100 %) within 16 m, fade out 3 s after the last hit, max 24 live, red `#c22a1f` on `#1a0d0b`. Not shown for full-life enemies.
- **Files:** new src/ui/enemyBars.ts, src/game.ts (create + update next to damageNumbers), src/ui/style.css
- **Mobile 390x844:** Make it 2 x 22 px on touch and cap at 12; hide in portrait if the crowd exceeds 12.
- **Effort / priority:** M / 1

### A021 - Enemy bars / nameplates (P1, M)
- **D3/D4:** D3 shows champion names and a bar over each pack member; D4 shows the elite bar and name above the enemy.
- **Problem:** Elite name text floats at about 12 px in rarity colour with no bar and no affix info (`d-06-elite-pack.png`: "Champion Ash Walker", "Brakk the Glowing, Breaker of Convoys" at y 540-570, partly behind the action bar); the target frame shows only the last targeted enemy.
- **Change:** Add a 4 px bar under every elite name within 28 m (blue `#6fb3ff` champion, gold `#ffd23a` rare), always shown; keep the name at its size; clamp the plate above y 590 so it never sits on the HUD.
- **Files:** src/ui/enemyBars.ts (A020), src/render/gameRenderer.ts (name labels)
- **Mobile 390x844:** Same plates, 3 px high.
- **Effort / priority:** M / 1

### A022 - Elite / boss bars (P2, S)
- **D3/D4:** D3/D4 colour the elite bar and show a percentage.
- **Problem:** `target-frame` uses one red bar for everything; the life % (`.target-pct`) and phase ticks (`.target-tick`) are defined only in portrait hud.css.
- **Change:** Style by tier: normal `#c22a1f`, champion blue border, rare gold border, boss gold; unscope `.target-pct` (right of the name, 11 px) and `.target-tick`. Frame stays 320 x 44.
- **Files:** src/ui/portrait/hud.css L7, L193, src/ui/style.css L249-L261, src/ui/hud.ts (target block L720-L740)
- **Mobile 390x844:** Portrait rules stay; the desktop rules apply under `#ui:not(.touch-ui)`.
- **Effort / priority:** S / 2

### A023 - Elite / boss bars (P2, S)
- **D3/D4:** D3 and D4 show a pale chunk where the last hit landed.
- **Problem:** `.target-fill` shrinks with only a 0.1 s width transition; a big hit on a boss is hard to see.
- **Change:** Add a `.target-ghost` strip behind the fill (lighter red `#e8a090`, 0.45 s lag), same as `.orb-ghost`.
- **Files:** src/ui/hud.ts (target track), src/ui/style.css L260-L261
- **Mobile 390x844:** Applies to both.
- **Effort / priority:** S / 2

### A024 - Enemy bars / nameplates (P2, M)
- **D3/D4:** D4 telegraphs fill from the edge so the timing is readable; D3 uses a red ring that pulses.
- **Problem:** Ground rings are static (`d-04-damage-numbers.png`: red circles at (370,150), (580,60)); the player cannot tell when they will hit.
- **Change:** Scale an inner disc 0 to 1 over the cast time with `alpha .25` red, and brighten the ring in the last 0.3 s; use the existing telegraph timer, no new geometry.
- **Files:** src/render/gameRenderer.ts (telegraph meshes), src/systems/ai (cast timers)
- **Mobile 390x844:** Same mesh.
- **Effort / priority:** M / 2

### A025 - Elite / boss bars (P2, M)
- **D3/D4:** D3 lists affix names in the frame; D4 puts affix icons next to the nameplate.
- **Problem:** Affixes are a text line (`.target-affix`, ~11 px, separated by " | " from statuses) and only for the targeted enemy; unreadable in a pack fight.
- **Change:** Show affixes as 14 px chips (icon from `assets/ui/status/*.svg` where one exists, else a 2-letter glyph) in the same line; add the same chips to the elite plate (A021); `title` has the full name.
- **Files:** src/ui/hud.ts (targetAffix), src/data/enemies affix data, src/ui/style.css
- **Mobile 390x844:** Chips 12 px on touch (min size rule), one line only.
- **Effort / priority:** M / 2

### A026 - Damage numbers (P2, S)
- **D3/D4:** D3 and D4 make crits bigger with a pop; D4 uses a different colour.
- **Problem:** Crit is colour plus `1.55em` (`d-04-damage-numbers.png`: 1119, 2118 gold); the pop (`1 + (0.12-t)*4`, up to 1.48x) is the same for every hit, so a crit does not feel different in motion.
- **Change:** Normal pop 1.15x max; crit pop 1.7x for 0.12 s settling to 1.0, plus `text-shadow: 0 0 8px #ff9a00`; crits live 1.1 s (already).
- **Files:** src/ui/damageNumbers.ts update L87, src/ui/style.css L326-L341
- **Mobile 390x844:** Same code; keep the touch cap of 24.
- **Effort / priority:** S / 2

### A027 - Damage numbers (P2, S)
- **D3/D4:** D3/D4 sum rapid hits on a target.
- **Problem:** Merging (120 ms, same target and kind) and the 24 cap run only when `touch`; on desktop a fast skill spawns one number per hit up to 80 (`pool max`).
- **Change:** Run `merge` on desktop too (non-crit only), cap live numbers at 40, never merge crits or taken numbers.
- **Files:** src/ui/damageNumbers.ts (handle, spawn)
- **Mobile 390x844:** Already on touch.
- **Effort / priority:** S / 2

### A028 - Damage numbers (P3, S)
- **D3/D4:** D3 scales big hits; D4 scales by share of target life.
- **Problem:** "120" and "1234567" use the same size (`d-04-damage-numbers.png`).
- **Change:** Font scale `0.9 + 0.5 * min(1, amount / targetMaxLife / 0.25)` (callback `maxLifeOf` exists), clamped 0.9-1.4em; crits keep their own 1.55em multiplier.
- **Files:** src/ui/damageNumbers.ts
- **Mobile 390x844:** Same.
- **Effort / priority:** S / 3

### A029 - Damage numbers (P2, S)
- **D3/D4:** D4 abbreviates big values; D3 uses thousands grouping or "k/M".
- **Problem:** Seven-digit hits print raw digits ("1234567", 74 px wide, `d-04-damage-numbers.png`), hard to compare with a neighbour.
- **Change:** `>= 10 000` -> "12.3k", `>= 1 000 000` -> "1.23M" through one `formatDamage()` helper; add `font-variant-numeric: tabular-nums`.
- **Files:** src/ui/damageNumbers.ts, src/ui/style.css L326
- **Mobile 390x844:** Shorter text also helps portrait.
- **Effort / priority:** S / 2

### A030 - Damage numbers (P2, S)
- **D3/D4:** D4 shows damage taken small and off to the side; D3 shows it on the hero in red.
- **Problem:** Damage taken (`dmg-taken #ff5544`) spawns on the hero, over the sprite and over heal numbers; the left slide (-44 px) is touch only.
- **Change:** Desktop: `slide: -34`, size 0.9em, and `translateY(+10 px)` so it lands beside the hero, not on it.
- **Files:** src/ui/damageNumbers.ts L58-L65
- **Mobile 390x844:** Already slides on touch.
- **Effort / priority:** S / 2

### A031 - Damage numbers (P3, M)
- **D3/D4:** D3 colours numbers by damage type; D4 by element.
- **Problem:** All outgoing numbers are cream or gold; a burning DoT is a smaller `#e0a070` (`dmg-dot`), nothing else tells element.
- **Change:** Add an optional `element` to the damage event from `CombatStats.tags` and map to a colour var (fire `#ff9a3a`, shock `#7fd6ff`, toxin `#9be86a`, physical cream); fall back to cream.
- **Files:** src/core/events.ts, src/systems/combat.ts (damage emit), src/ui/damageNumbers.ts
- **Mobile 390x844:** Same colours; keep 4.5:1 on the dark world.
- **Effort / priority:** M / 3

### A032 - Hit / low-life feedback (P1, S)
- **D3/D4:** D3 reddens the screen edges and beats at low life; D4 pulses a red vignette.
- **Problem:** The vignette (`.low-life-vignette`) is `#ui.touch-ui` only (hud.css L17). At 19 % life on desktop (`d-08-low-life.png`) the only cue is the orb pulse, which is behind loot labels.
- **Change:** Drop the `.touch-ui` scope: `.low-life-vignette.on` under 30 % life, pulse 1.1 s, `radial-gradient(transparent 55%, rgba(160,10,10,.45))`, z-index under the HUD; honour reduce-motion.
- **Files:** src/ui/portrait/hud.css L17-L33, src/ui/hud.ts (toggle)
- **Mobile 390x844:** Same element on touch.
- **Effort / priority:** S / 1

### A033 - Hit / low-life feedback (P2, S)
- **D3/D4:** D4 flashes the screen edge on each hit taken; D3 shows a quick blood flash.
- **Problem:** Getting hit on desktop gives no screen feedback; the number on the hero is the only cue.
- **Change:** On a hit of >= 5 % max life add `.hit` to the vignette for 140 ms (opacity .15 + 0.5 x hit share, max .5).
- **Files:** src/ui/hud.ts update, src/ui/portrait/hud.css L17
- **Mobile 390x844:** Same.
- **Effort / priority:** S / 2

### A034 - Toasts / banners / level-up (P2, S)
- **D3/D4:** D3 shows a golden level-up flash; D4 an animated "level up" burst.
- **Problem:** The desktop level-up is the plain banner "L E V E L 3" at 33 px, grey-cream, and a loot label ("Power Sword") crosses it (`d-09-levelup-a.png`). The gold `variant: levelup` and `.orb.levelup` ring exist only in portrait CSS.
- **Change:** Unscope the `levelup` banner variant (gold `#ffd27a`, glow `0 0 24px rgba(255,200,80,.7)`) and the 700 ms orb ring; keep font size.
- **Files:** src/ui/portrait/hud.css, src/ui/style.css L264-L283, src/ui/hud.ts levelUp
- **Mobile 390x844:** Same.
- **Effort / priority:** S / 2

### A035 - Loot on the ground (P1, S)
- **D3/D4:** D3 and D4 draw ground labels under the HUD and never over the orbs.
- **Problem:** Labels sit above the action bar and orbs: "Sullen Furnace" over slot 4, six labels over the life orb (`d-02-loot.png`, `d-04-damage-numbers.png`, `d-06-elite-pack.png`); the level-up banner is crossed too. Measured label size 92 x 19 px at (323, 658).
- **Change:** Put `.loot-labels` below `.action-bar`, `.orb`, `.minimap` (z-index) and clamp label y so it never lands in the rect x 247-1033, y 596-706: labels that would overlap are moved up to 590 or hidden unless hovered. No size change.
- **Files:** src/ui/lootLabels.ts update L138, src/ui/style.css L464
- **Mobile 390x844:** Portrait already clamps (H037); use the rect of the desktop bar only for `:not(.touch-ui)`.
- **Effort / priority:** S / 1

### A036 - Loot on the ground (P1, S)
- **D3/D4:** D3 colours labels by rarity and fades junk; D4 shows only legendary labels by default.
- **Problem:** Every rarity is the same 92 x 19 box, 11.7 px, 1 px border at 8 % white; a legendary and a common look equally important (`d-02-loot.png`). Colour is the only difference.
- **Change:** Without changing size: common 55 % opacity text on 60 % background; magic normal; rare +1 px border in its colour; legendary+ border `currentColor`, `text-shadow: 0 0 6px currentColor` and 100 % opacity. Sorting (A037) keeps legendary on top.
- **Files:** src/ui/lootLabels.ts L170, src/ui/style.css L465
- **Mobile 390x844:** Same.
- **Effort / priority:** S / 1

### A037 - Loot on the ground (P1, S)
- **D3/D4:** D3 filters by rarity; D4 shows labels on Alt only and caps the count.
- **Problem:** 23 labels in a 280 x 500 px area (`d-02-loot.png`); nothing limits the number on desktop (the "+N" chip is portrait only).
- **Change:** Show at most 14 labels by priority (rarity, then distance); beyond that hide commons/magic until `Alt` is held or they are hovered, and show a "+N" chip using the portrait chip style; legendary+ always shown (`ALWAYS_SHOWN`).
- **Files:** src/ui/lootLabels.ts L146-L160
- **Mobile 390x844:** Portrait cap is 2-3 labels (H039); keep it.
- **Effort / priority:** S / 1

### A038 - Loot on the ground (P1, M)
- **D3/D4:** D3 beams are thin and only legendary; D4 beams are subtle and fade near the player.
- **Problem:** Beams are tall and thick: one red beam crosses the screen from y 600 to y 0 over the fight (`d-03-combat-horde.png`), six more run through the packs (`d-02-loot.png`); they hide enemies.
- **Change:** Beam alpha 0.5 for magic/rare (legendary+ 0.9), height 0.4x for magic/rare, and alpha x0.3 within 3 m of the player or in combat. Same mesh and width (not bigger).
- **Files:** src/render/gameRenderer.ts (loot beam material), src/ui/lootLabels.ts
- **Mobile 390x844:** Same renderer; saves fill rate on phones.
- **Effort / priority:** M / 1

### A039 - Loot on the ground (P3, S)
- **D3/D4:** D3 plays a sound; D4 sparkles the label on drop.
- **Problem:** A legendary drop appears without any pulse (haptic only on touch).
- **Change:** On first appearance, legendary+ labels pulse the border (3 x 0.4 s, opacity only) and the minimap shows a 4 px gold pip for 5 s (needs A016 canvas).
- **Files:** src/ui/lootLabels.ts, src/ui/minimap.ts
- **Mobile 390x844:** Same.
- **Effort / priority:** S / 3

### A040 - Loot on the ground (P2, S)
- **D3/D4:** D3 raises the hovered label; D4 brightens it.
- **Problem:** Overlapping labels (`d-02-loot.png`, the cluster at (700-930, 440-560)) cannot be read or clicked; `:hover` only changes the border.
- **Change:** `:hover { z-index: 5; background: rgba(0,0,0,.95); filter: brightness(1.25); }` and sort DOM order by `sy` so lower labels sit on top.
- **Files:** src/ui/style.css L476, src/ui/lootLabels.ts
- **Mobile 390x844:** Hover does not exist on touch; harmless.
- **Effort / priority:** S / 2

### A041 - Interact prompts (P2, S)
- **D3/D4:** D4 shows the reason ("Inventory full") in place of the prompt; D3 greys it.
- **Problem:** A blocked interaction (inventory full, locked, wrong class) is explained by a toast only; the prompt stays in the same style (judged from code: `interactUi.ts` has one style, not captured).
- **Change:** Add `.interact-prompt.blocked`: key box `#d9443a`, text replaced by the reason (same line, same width as the original text, ellipsis).
- **Files:** src/ui/interactUi.ts, src/ui/style.css L589-L615
- **Mobile 390x844:** Portrait prompt is 39 px (H028); keep one line.
- **Effort / priority:** S / 2

### A042 - Toasts / banners / level-up (P1, S)
- **D3/D4:** D3 shows messages bottom-centre; D4 stacks them left of centre away from the boss bar.
- **Problem:** The toast stack starts at top 70 px (548-732) and the target frame at top 76 px (480-800, 44 px high): they overlap whenever a message arrives during a fight; the event box is also at top 76 (`style.css` L680).
- **Change:** Add `#ui.has-target` (set from `Hud.update`) that moves `.toast-stack` to `top: 128px`, and the event box to `top: 128px` unless it is the only one; no new elements.
- **Files:** src/ui/hud.ts update, src/ui/style.css L99-L110, L680
- **Mobile 390x844:** Portrait uses its own anchors (world.css); scope to desktop.
- **Effort / priority:** S / 1

### A043 - Toasts / banners / level-up (P2, S)
- **D3/D4:** D3 and D4 clear transient messages on death.
- **Problem:** The banner "QUEST COMPLETE: WAKE UP" stays above "YOU HAVE FALLEN" (`d-14-death.png`, y 202 vs 335).
- **Change:** On death clear `BannerQueue`, set toasts to fade, and hide `.quest-tracker`, `.minimap` and `.buff-bar` (opacity 0.25).
- **Files:** src/ui/hud.ts (death branch), src/ui/bannerQueue.ts, src/ui/toast.ts
- **Mobile 390x844:** Same on touch.
- **Effort / priority:** S / 2

### A044 - Toasts / banners / level-up (P2, S)
- **D3/D4:** D3 shows world events as a tag under the minimap; D4 uses a side banner.
- **Problem:** `.event-box` sits at top 76 centred, in the band of the target frame (A042) and 40 px under the region title.
- **Change:** Move it to the right column under the quest tracker (`right: 14px; top: 290px`, width 230) when the target frame is visible, otherwise leave it.
- **Files:** src/ui/style.css L680
- **Mobile 390x844:** Portrait uses the left column already.
- **Effort / priority:** S / 2

### A045 - Death screen (P1, S)
- **D3/D4:** D3 shows a revive button with options; D4 a button with a short lock and the death count.
- **Problem:** Any click on the screen respawns at once (`death.addEventListener("click", ...)` when not touch) and `R` too; the lock (`DEATH_LOCK` 1.2 s) is touch only. A thumb still mashing LMB skips the screen (`d-14-death.png`).
- **Change:** Add the 1.2 s lock on desktop, replace the "Press R or click" paragraph by a 180 x 36 px button "Rise (R)" with a fill that completes in 1.2 s; a click elsewhere does nothing.
- **Files:** src/ui/hud.ts (death block, riseButton), src/ui/style.css L288-L307
- **Mobile 390x844:** Touch button exists; share the lock.
- **Effort / priority:** S / 1

### A046 - Death screen (P2, M)
- **D3/D4:** D4 shows what killed you; D3 shows nothing but a respawn timer.
- **Problem:** The screen says only "YOU HAVE FALLEN" (`d-14-death.png`); the player does not learn about the elite affix or the telegraph that did it.
- **Change:** Show one line in the existing `<p>`: "Slain by Champion Ash Walker - Molten" from the last damage source; store `lastHitSource` in the player Health component on damage.
- **Files:** src/systems/combat.ts, src/ui/hud.ts (deathHint)
- **Mobile 390x844:** Same line on touch.
- **Effort / priority:** M / 2

### A047 - Region / zone cards (P1, S)
- **D3/D4:** D4 shows the region name as a top banner; D3 uses a small zone title.
- **Problem:** The region card is a 620 x 349 painting at top 14% (331-949, 100-440) plus the name over it, 4 s, in the middle of the playfield; the hero and the fight are covered (`d-10-region-card.png`).
- **Change:** Desktop: image `min(420px, 86vw)`, `top: 8%`, opacity 0.85 and a 0.6 s fade in; name stays. Never larger than before.
- **Files:** src/ui/style.css L1004-L1013, src/ui/hud.ts regionCard
- **Mobile 390x844:** Portrait card is 2.6 s (H064); leave it.
- **Effort / priority:** S / 1

### A048 - Endgame HUD (P2, S)
- **D3/D4:** D3 shows a wide rift bar with time and a guardian marker; D4 a bar with boss pip.
- **Problem:** The rift block (`d-15-rift.png`) is about 338 x 8 px with about 9 px "PROGRESS 0%" text; time "10:00" has no urgency state; the harvest line below has no background on the grate.
- **Change:** Keep the bar size; text to 11 px, add a 2 px tick at 100 % (boss), turn the timer red and pulse under 60 s, harvest row background `linear-gradient(90deg, rgba(10,9,8,.85), transparent)`.
- **Files:** src/ui/riftPanel.ts (RiftHud), src/ui/endgameStack.ts, src/ui/style.css
- **Mobile 390x844:** Portrait stack has 8-9 px text rows (H072); same text size fix helps.
- **Effort / priority:** S / 2

### A049 - Endgame HUD (P3, S)
- **D3/D4:** D3 has a single rift bar, no duplicate text.
- **Problem:** The top-centre line says "RIFT 5: SLAY ENEMIES (0%)" while the stack at the left repeats "PROGRESS 0%" (`d-15-rift.png`).
- **Change:** Remove the percentage from the centre sub-line; keep the objective text; show "KILL THE GUARDIAN" there at 100 %.
- **Files:** src/game.ts locationLabel L1887, src/systems/endgame/rifts.ts riftHud
- **Mobile 390x844:** Same.
- **Effort / priority:** S / 3

### A050 - Elite / boss bars (P2, M)
- **D3/D4:** D3/D4 draw the boss bar wide at top-centre with the name and phase marks.
- **Problem:** The desktop boss frame is the normal 320 x 44 frame: `.target-frame.boss` rules exist only in portrait hud.css (L193-L195). Not captured (no boss spawned in the dungeon I entered); judged from the CSS.
- **Change:** `#ui:not(.touch-ui) .target-frame.boss`: width 440, height 52, portrait 40 px (`target-portrait`), name 15 px, phase ticks from `bossPhaseTicks`; quest tracker already steps down via `--boss-frame-h`.
- **Files:** src/ui/portrait/hud.css L193, src/ui/style.css L249, src/ui/hud.ts
- **Mobile 390x844:** Portrait keeps its full-width frame.
- **Effort / priority:** M / 2

