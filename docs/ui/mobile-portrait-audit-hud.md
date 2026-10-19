# Mobile portrait audit: in-world HUD and touch controls (H001-H100)

Scope: `#ui.touch-ui.portrait` in-world HUD only (bars, thumb controls, prompts, numbers, loot, status, minimap, tracker, toasts/banners/cards, target/boss, endgame stack, touch menu row, death, safe areas, rotation, one-handed play, haptics). Panel contents (inventory, skill tree, character) are out of scope except where they interact with the HUD.

**Method.** Built per spec (`npx vite build` to `scratchpad/ui-audit-a/dist`, served with `vite preview` on :5190); because the capture scripts needed `import('/src/...')` to set up state (skills, quests, bosses, statuses, rift), the screenshots were taken against the dev server on :5195, which renders the same CSS/JS. Chromium 1194 (swiftshader), mobile emulation (`isMobile`, `hasTouch`, DPR 2) at 390x844, 360x780 and 320x640, with a CDP safe-area override (top 47 px, bottom 34 px) for the notch checks; real multi-touch (CDP `Input.dispatchTouchEvent`) for the stick/attack-held shot. Screenshots: `/tmp/claude-0/-home-user/91b10048-104f-50d9-baf1-7585dd3fa3ee/scratchpad/ui-audit-a/shots/` (files are `<width>-<name>.png`); DOM metrics (`getBoundingClientRect`, computed font sizes) in `scratchpad/ui-audit-a/metrics-{390,360,320}.txt`. CSS line numbers refer to `src/ui/style.css` at the time of the audit. Animated cards (region/boss) could not be captured reliably under software GL (CSS animation start is delayed by the 4 FPS main thread), so their items are grounded in the CSS and measured boxes, not in a screenshot of the animation.

**Legend.** Priority: 1 = broken, unreadable or below usability on a phone (fix first), 2 = clear improvement, 3 = polish. Effort: S = under about 2 h, one file, M = a day or several files, L = multi-day (none needed here: every item is CSS/DOM/JS with existing assets).

## Summary

- Items: 100. Priority 1: 28, priority 2: 46, priority 3: 26. Effort S: 74, M: 26, L: 0.
- Measured facts behind the P1 items (390x844 unless noted): menu buttons 36 px; panel close 36 px; loot labels 27 px tall, 11.7 px text; interact prompt 39 px tall; dodge/potion 44 px; skill buttons 46 px; life bar 16 px, resource bar 12 px (text 9 px); XP bar 3 px; quest text 10.5/9.75 px; endgame rows 8.25-9.3 px; potion label 8.4 px; slot 2 spans x 167-213 at 360 wide and 127-173 at 320 wide while the stick zone spans x 0-180 / 0-160; buff bar content 314 px in a 274 px box at 320 wide; at 320x640 the endgame stack (y 337-369/376) overlaps the buff bar (310-344) and the dodge button (358-402).
- Verified by script: after death `elementFromPoint` at the attack/dodge/potion centres returns the slots (they sit above the death overlay) and a tap on attack leaves the death screen up; `.touch-stick-zone` computes to `border: 0` (the border rule at L699 is not applied, so the zone itself is invisible); landscape <-> portrait switching toggles `.portrait` correctly but does not release the stick.
- Screenshot index: `idle-hub`, `skills-idle`, `hub-npc`, `quests2`, `toasts-banner`, `loot`, `loot-few`, `combat-horde`, `low-life`, `low-life-clean`, `levelup`, `boss-intro-mid`, `boss-phase2`, `damage-numbers`, `core-gardens`, `core-toast-quest`, `core-camp`, `rift-stack`, `interact-chest`, `stick-and-attack-held`, `panel-inventory`, `sound-panel`, `landscape`, `back-portrait`, `death`, `region-card` at 390; `stack-statuses`, `target-elite`, `toasts-stack` at 390, 360 and 320.

## Top 10 problems

1. Boss/elite banners, toasts and the event box are drawn on top of the hero and the target frame (H057-H061).
2. Loot labels: 27 px tall, 11.7 px, not clamped to the screen, 13+ labels cross the whole top HUD (H037-H039).
3. Endgame stack: 8-9 px text and a 300 px wide block that overlaps buffs and the dodge/potion buttons at 320x640 (H072-H073).
4. Dodge and potion sit at the top of the thumb cluster at 44 px, the potion label is 8.4 px, and at 360/320 the arc overlaps the joystick zone (H009, H010, H013).
5. Death screen: heading clipped on the left, thumb buttons above the overlay and a one-tap instant respawn (H086-H088).
6. Interact prompt follows the world, is 39 px tall and is covered by the quest tracker (H028, H029).
7. Core/rift legibility: region label, joystick ring and numbers vanish on bright or grate ground (H023, H034, H066).
8. Menu and close buttons are 36 px, all ten shown at once, far from the thumbs (H079-H081, H084).
9. Buff bar overflows at 320 and collides with the stack/timers (H043-H044).
10. Quest tracker hides every quest but one and its text is 9.75-10.5 px (H052-H053).

## Items

### H001 - Life & resource bars (P2, S)
- **Problem:** Portrait life bar is 16 px tall and the resource bar 12 px (measured 250x16 / 250x12 at 390 wide) in `390-idle-hub.png`; at arm's length the red fill is a thin line and the 2-bar block reads as chrome, not as the most important gauge.
- **Change:** Life bar `height: 16px` -> `22px`, resource bar `12px` -> `16px`, keep 4 px gap (`.orb-heat` top = `--sat + 8 + 22 + 4`); shift `.xp-bar`, `.touch-menu`, target frame and endgame stack tops down by the 10 px added (they are all `calc(var(--sat) + Npx)` constants). Life text 11 px -> 13 px bold.
- **Files:** src/ui/style.css L840-L860 (portrait orb rules), L862-L876 (tops that follow)
- **Effort / priority:** S / 2

### H002 - Life & resource bars (P1, S)
- **Problem:** Resource bar text is 9 px (`.orb-heat .orb-text`, L859) and shows only "0 / 100"; the resource (Heat/Focus/Biomass) is only in a `title` tooltip that touch cannot show (`390-idle-hub.png`).
- **Change:** Resource text 9 px -> 11 px; prefix the label from `t("resources."+kind)` as a 10 px caps caption inside the bar ("HEAT  45 / 100"); fill colour already differs per kind, keep it. `Orb.set` builds the text, add an `aria-label` too.
- **Files:** src/ui/hud.ts (`Orb.set`, L102-L113), src/ui/style.css L858-L859
- **Effort / priority:** S / 1

### H003 - Life & resource bars (P1, S)
- **Problem:** The character level is displayed nowhere in portrait: `.xp-text` is `display:none` (L768) and the portrait XP bar is a 3 px line (`390-idle-hub.png`). The player cannot see level or unspent skill points without opening the Hero panel.
- **Change:** Add a 22x22 px level chip at the left end of the life bar (`Lv 12`, 11 px, gold border) fed from `state.xp.level`; when `xp.skillPoints > 0` show a gold "+" dot on the chip and on the Skills menu button (see menu badge item). Bar width becomes `100% - 140px - 26px`.
- **Files:** src/ui/hud.ts (`update`, xp block L499-L508; new element in constructor), src/ui/style.css L860
- **Effort / priority:** S / 1

### H004 - Life & resource bars (P3, S)
- **Problem:** XP bar is 3 px (`.xp-bar` portrait, L860) with a 0.2 s width transition; progress toward the next level is invisible, and it gives no feedback on gain.
- **Change:** Raise to 5 px, add a 1 px dark track outline; when XP increases flash the fill to `#fff3c0` for 250 ms (toggle a `.gain` class like `harvest-shards.gain`); when > 90% add a slow glow.
- **Files:** src/ui/style.css L860, L364; src/ui/hud.ts xp block
- **Effort / priority:** S / 3

### H005 - Life & resource bars (P1, M)
- **Problem:** Low life is communicated only by a 26 px red box-shadow pulse on the bar (`.orb.warn`, L231) - `390-low-life-clean.png` shows a faint red halo at 15% life; the playfield (where the eyes are) shows nothing, and the potion button does not react.
- **Change:** Add a `#ui.low-life` state (life < 30%, same threshold as `warn`): a `::after` full-screen `radial-gradient(transparent 55%, rgba(160,10,10,.45))` pulsing opacity .4<->.9 over 1.1 s, `pointer-events:none`, under the HUD. Toggle the class from `Hud.update` next to `lifeOrb.set`.
- **Files:** src/ui/hud.ts `update` (L437), src/ui/style.css (new rule near L231)
- **Effort / priority:** M / 1

### H006 - Life & resource bars (P3, S)
- **Problem:** Damage taken has no visual weight on the life bar: it just shrinks with a 0.12 s linear transition (`.orb-fill`, L850), so a big hit and a tick look alike.
- **Change:** Add a "ghost" chip: a second bar behind the fill in `#fff` at 60% opacity that lags 0.45 s behind (`transition: width .45s ease-out .15s`) and a 120 ms white flash on the whole bar when a single hit removes > 10% of max life.
- **Files:** src/ui/hud.ts `Orb` (extra div), src/ui/style.css L850-L853
- **Effort / priority:** S / 3

### H007 - Life & resource bars (P3, S)
- **Problem:** Barrier/shield is a 2 px right border on a translucent overlay (`.orb-shield` portrait, L852); at 12-16 px bar height it is invisible and has no number.
- **Change:** Draw barrier as a 4 px strip along the top edge of the life bar in `#9fd8ff` with a diagonal-stripe `repeating-linear-gradient`, and append " +NN" to the life text when barrier > 0.
- **Files:** src/ui/style.css L852; src/ui/hud.ts `Orb.set` (extra param already passed)
- **Effort / priority:** S / 3

### H008 - Life & resource bars (P2, S)
- **Problem:** Overheat (Bastion) only changes the heat bar border to `#ff3b2f` (`.orb-heat.warn`, L232) and starts the same box-shadow pulse; on a 12 px bar this is not noticeable while fighting (`390-combat-horde.png` heat bar is orange with no warning).
- **Change:** While `resource.overheating`: heat bar fill turns `#ff3b2f`, text becomes "OVERHEAT" (blinking 0.5 s), and the bar gains a 2 px white outline; also vibrate once (see haptics item).
- **Files:** src/ui/hud.ts (`heatOrb.set(..., overheating)` L439), src/ui/style.css L232
- **Effort / priority:** S / 2

### H009 - Skill / dodge / potion buttons (P1, M)
- **Problem:** Dodge (44 px) and Stim pack (44 px) sit at the top of the cluster, `bottom: 200px` (L898-L899): about 160 px above the attack button in `390-skills-idle.png` (attack y 716-792, dodge y 562-606), yet dodge is the most time-critical input. The two are also the smallest buttons in the cluster.
- **Change:** Move dodge to `right: 96px; bottom: 14px` (directly left of the 76 px attack button, thumb sweeps horizontally), size 56x56; potion to the old arc slot nearest the thumb (`right: 143px; bottom: 29px`, 52 px) and shift the skills arc up by one slot or onto a tighter radius so nothing overlaps (verify at 360x780 and 320x640).
- **Files:** src/ui/style.css L885-L899
- **Effort / priority:** M / 1

### H010 - Skill / dodge / potion buttons (P1, S)
- **Problem:** The potion button label is "Stim pack x4" in 8.4 px (`.slot-name` 0.56em, L796) wrapped over two lines inside a 44 px circle (`320-stack-statuses.png`): unreadable and the charge count is part of the name. There is also no recharge feedback (the potion recharges every 18 s) - `potionSlot.set(..., 0, 0, ...)` passes no cooldown.
- **Change:** Render the potion as an icon (flask drawn in CSS or `public/assets/ui/status/barrier.svg` mask) with a 14 px corner badge showing the charge count (`.slot-count`, 12 px bold) and a conic recharge ring fed from `state.potion` (add `recharge`/`rechargeMax` to HudState); drop the text.
- **Files:** src/ui/hud.ts `Slot.set` + potion call (L453), src/ui/style.css L796
- **Effort / priority:** S / 1

### H011 - Skill / dodge / potion buttons (P2, S)
- **Problem:** Dodge button is a text circle "Dodge" at 10 px with no icon (`390-skills-idle.png`), while every other button is an icon; tapping blind by shape is impossible.
- **Change:** Use the existing `public/assets/ui/status/evasive.svg` as a masked 26 px icon (same technique as `.buff-icon` / `.touch-menu-icon`), keep the cooldown number; label hidden on touch.
- **Files:** src/ui/hud.ts (Slot icon support exists: `set(..., icon)`), src/ui/style.css L796
- **Effort / priority:** S / 2

### H012 - Skill / dodge / potion buttons (P2, M)
- **Problem:** All thumb-button positions are hard-coded pixel offsets from the right edge (`right: 143px; bottom: 29px` ...) and sizes are 46/76/44 px regardless of screen; on 430 px wide phones the cluster is the same small 192 px block, on 320 px wide ones it grows into the joystick.
- **Change:** Define `--btn: clamp(46px, 13vw, 58px)` and `--atk: clamp(76px, 21vw, 92px)` on `#ui.touch-ui.portrait` and place slots with `calc()` from `--btn` (arc radius = `1.9 * var(--btn)`), so the cluster scales with width; cluster container `width/height` derived the same way.
- **Files:** src/ui/style.css L885-L899
- **Effort / priority:** M / 2

### H013 - Skill / dodge / potion buttons (P1, S)
- **Problem:** On narrow phones the left end of the skill arc lies over the joystick zone: at 360 wide slot 2 spans x 167-213 while the zone is x 0-180; at 320 wide 127-173 vs zone 0-160 (`metrics-360.txt`, `metrics-320.txt`; `320-stack-statuses.png`). A thumb dragging the stick to the right fires or blocks the skill (slot z-index 5 beats the zone).
- **Change:** Zone width `50vw` -> `calc(100vw - 232px)` (min 120 px) so it always ends before the arc; or add `@media (max-width: 370px)` that shrinks the arc radius. Re-check with the three viewports.
- **Files:** src/ui/style.css L881 (`.touch-stick-zone` portrait), L885-L899
- **Effort / priority:** S / 1

### H014 - Skill / dodge / potion buttons (P2, M)
- **Problem:** "Cannot cast" has one visual: `.slot.unusable .slot-name {opacity .45}` (L188). A skill on cooldown, one lacking Heat/Focus and an empty slot all look alike (`390-combat-horde.png` slots 3-4 are `unusable` but look nearly normal because the 3 px ring stays bright).
- **Change:** Cooldown keeps the dark conic sweep + number; not-enough-resource gets a red-tinted desaturated icon (`filter: grayscale(.8) sepia(1) hue-rotate(-30deg)` on `.slot-icon`) and a 2 px `#d9443a` ring; show the resource cost as a 10 px number at the bottom of the button.
- **Files:** src/ui/hud.ts `Slot.set` (pass `affordable` and `cost` separately), src/ui/style.css L188
- **Effort / priority:** M / 2

### H015 - Skill / dodge / potion buttons (P3, S)
- **Problem:** When a cooldown ends nothing happens: the conic overlay just disappears (`Slot.set` toggles `background`), so the player keeps looking at a number to know a skill is ready.
- **Change:** On cooldown end add class `.ready` for 350 ms: ring brightens (`box-shadow: 0 0 0 3px currentColor, 0 0 14px currentColor`) and the button scales 1.08 -> 1 (CSS keyframes). Triggered where `cooldown` goes from >0 to 0 in `Slot.set`.
- **Files:** src/ui/hud.ts `Slot.set`, src/ui/style.css (new keyframes next to L793)
- **Effort / priority:** S / 3

### H016 - Skill / dodge / potion buttons (P3, S)
- **Problem:** Press state is `filter: brightness(1.5); transform: scale(.94)` (L793): subtle on the already bright icons (`390-stick-and-attack-held.png` attack ring only turns yellowish). No state difference between "pressed and cast" and "pressed but blocked".
- **Change:** Add a 3 px accent outline + inner shadow on `.slot.pressed`, and a 120 ms red shake (`translateX(+-3px)`) when pressing an unusable slot. Keep `scale(.94)`.
- **Files:** src/ui/style.css L793; src/ui/touchControls.ts `bindSlot` (L177)
- **Effort / priority:** S / 3

### H017 - Skill / dodge / potion buttons (P2, S)
- **Problem:** Attack button is 76 px (L892) and it is the one held continuously; thumbs drift off it (`touch.attack` is released on `pointerup`/`lostpointercapture`, L195-L198). On a 6.7" phone 76 px = ~12 mm.
- **Change:** Enlarge to `--atk` (88 px at 390 wide) and extend its hit area invisibly with `::before { inset: -10px }` (the child already has `pointer-events: none`, so put the pseudo on the slot); keep pointer capture so sliding off does not release.
- **Files:** src/ui/style.css L892
- **Effort / priority:** S / 2

### H018 - Skill / dodge / potion buttons (P3, M)
- **Problem:** Skill buttons show only an icon and no way to learn what they do in combat; the desktop hover tooltip (`Hud.showTooltip`, mouseenter) never fires on touch.
- **Change:** Long-press (350 ms, no movement) on a skill button shows the existing tooltip above the cluster for 2.5 s without casting; tooltip placement: `bottom: --sab + 262px; right: 8px`. Reuse `LONG_PRESS` logic from `installLongPress`.
- **Files:** src/ui/hud.ts `showTooltip` (make public), src/ui/touchControls.ts `bindSlot`
- **Effort / priority:** M / 3

### H019 - Skill / dodge / potion buttons (P2, S)
- **Problem:** When life is low the potion button looks the same as at full life (`390-low-life-clean.png`), so a panicking player does not find it; the cluster is 12 buttons-worth of attention.
- **Change:** While life < 35% and potion charges > 0: potion button gets a pulsing green ring (1 s, `box-shadow: 0 0 0 3px #7dff9a`) and scales 1.1; clears on use or life >= 35%.
- **Files:** src/ui/hud.ts (`state.life` + `state.potion` both available in `update`), src/ui/style.css
- **Effort / priority:** S / 2

### H020 - Skill / dodge / potion buttons (P3, S)
- **Problem:** Empty action-bar slots are removed from the layout (`.slot[data-category="empty"] {display:none}`, L794): a new character shows only attack + dodge + potion (`390-idle-hub.png`), the arc silently has holes, and a player does not know that more skill buttons exist or where they would appear.
- **Change:** Render empty slots as a 34 px dashed 35%-opacity ring with a "+" at the same arc position; tapping it opens the Skills panel (`input.pressAction("skills")`); hide them again once all slots are filled or in boss/rift combat.
- **Files:** src/ui/style.css L794; src/ui/hud.ts `Slot.set` (empty branch)
- **Effort / priority:** S / 3

### H021 - Joystick (P2, S)
- **Problem:** `stickMove` (L215-L232) has no dead zone: any 1-2 px finger jitter right after touch-down produces a full-speed-ish vector (`x = dx / 56`), so the hero creeps when the player only wanted to place the thumb.
- **Change:** Dead zone of 8 px, then rescale: `mag = max(0, (len - 8) / (56 - 8))`; below dead zone report `stick = null`. Keep visual knob following the raw finger.
- **Files:** src/ui/touchControls.ts L215-L232
- **Effort / priority:** S / 2

### H022 - Joystick (P2, M)
- **Problem:** Dragging past `STICK_RADIUS` (56 px) clamps the knob but the base stays where the thumb landed, so reversing direction needs a 112 px swing; with the base only ~124 px wide near the screen edge it is hard to reach the opposite direction.
- **Change:** Drag-follow: when `len > STICK_RADIUS`, move `stickOrigin` (and the base element's left/top) by the excess along the same vector so the base trails the thumb. Clamp origin inside the zone.
- **Files:** src/ui/touchControls.ts `stickMove` + `stickDown` (L202-L232)
- **Effort / priority:** M / 2

### H023 - Joystick (P1, S)
- **Problem:** The idle joystick ring (`.touch-stick-base`, opacity .6, border `rgba(232,200,160,.25)`, L704-L716) disappears on bright ground: `390-core-gardens.png` and `390-rift-stack.png` (grate floor) show an almost invisible ring.
- **Change:** Add a dark outer ring `box-shadow: 0 0 0 2px rgba(0,0,0,.55)` and raise border alpha to .45; knob border stays orange; idle opacity .6 -> .75. Check against the Core Gardens beige.
- **Files:** src/ui/style.css L704-L726
- **Effort / priority:** S / 1

### H024 - Joystick (P2, S)
- **Problem:** `updatePortrait()` (L253) is the resize/orientation handler but it never calls `resetStick()` or releases held slots; rotating or resizing (split-screen, keyboard) while a thumb is down leaves `input.touch.stick` set and the hero running until the next touch.
- **Change:** In `onResize`, if orientation class changed: `this.resetStick()` and release all `.pressed` slots (`input.touch.attack=false`, `holdAction(...,false)`).
- **Files:** src/ui/touchControls.ts L124-L132, L253-L255
- **Effort / priority:** S / 2

### H025 - Joystick (P2, S)
- **Problem:** While a panel is open in portrait (`390-panel-inventory.png`) the stick zone and all thumb buttons remain live and fully lit below the panel; thumb contact near the bottom walks the hero while managing the bag.
- **Change:** On `#ui.touch-ui.touch-panel-open` set `.touch-stick-zone { pointer-events: none }` and `.slots .slot { opacity: .35; pointer-events: none }` (keep dodge/potion at .6 and live). The class already exists (`updatePanelOpen`).
- **Files:** src/ui/style.css L921-L931 (portrait close rules), src/ui/touchControls.ts L245-L251
- **Effort / priority:** S / 2

### H026 - Joystick (P2, S)
- **Problem:** Stick zone is `50vw x 40vh` (L881): `vh` is the large viewport so on iOS/Android with a collapsing toolbar the zone is taller than the visible area, and it never extends into the upper-left, so a thumb that starts a bit high (y < 506 of 844) is ignored; the static ring base ignores the bottom safe area (`top: 100% - 92px`, L707 -> ring bottom at y 814, inside the 34 px home-indicator band).
- **Change:** Use `height: 46dvh` (fallback `46vh`) and `top: calc(100% - 92px - var(--sab))` for the base; keep the 50vw/230px width rule from the arc-overlap item.
- **Files:** src/ui/style.css L694-L703, L707, L881
- **Effort / priority:** S / 2

### H027 - Joystick (P3, S)
- **Problem:** No tactile cue at the edge of the stick: you have to look at the knob to know you are at full speed.
- **Change:** When deflection first reaches 100% per drag, `navigator.vibrate?.(6)` once (reset when below 80%). Feature-detect via the shared haptics helper.
- **Files:** src/ui/touchControls.ts `stickMove`, new `src/ui/haptics.ts`
- **Effort / priority:** S / 3

### H028 - Interact prompt (P1, M)
- **Problem:** The prompt is world-anchored (`translate(project(x,1.6,z))`, interactUi.ts L46) so it lands anywhere, here under the quest tracker: "Open Supply Crate" is half hidden behind "Wake Up" (`390-interact-chest.png`), and the target for a tap moves with the camera.
- **Change:** On touch dock it at a fixed spot: `left: sal+8; right: 208px` (above the stick zone) `bottom: calc(sab + 40dvh + 10px)`, one line, 52 px tall, with an arrow/line to nothing (just text + icon). Still `onTap`. World-anchored mode stays for mouse.
- **Files:** src/ui/interactUi.ts L35-L53, src/ui/style.css L588-L613, L817
- **Effort / priority:** M / 1

### H029 - Interact prompt (P1, S)
- **Problem:** Tap target is 39 px tall (measured `[98,190,199,39]`), 15 px text, and sits in a screen area where both thumbs are not.
- **Change:** `#ui.touch-ui .interact-prompt { min-height: 52px; padding: 12px 18px; font-size: 17px; border-width: 2px; border-color: #c8a060 }`, plus `:active` (brightness 1.3).
- **Files:** src/ui/style.css L817
- **Effort / priority:** S / 1

### H030 - Interact prompt (P3, S)
- **Problem:** On touch the key chip reads "Use" (`t("touch.use")`) next to "Open Supply Crate" - the word is redundant and the chip looks like a keyboard key.
- **Change:** Replace the chip on touch by a 22 px hand/tap glyph (CSS mask of an existing menu SVG such as `public/assets/ui/menu/quests.svg`, or a simple border-circle with a dot) and keep only the action text.
- **Files:** src/ui/interactUi.ts L38-L49, `src/game.ts` L1401
- **Effort / priority:** S / 3

### H031 - Interact prompt (P2, M)
- **Problem:** NPC name plates ("Benny Rusk", "Hekla Strand", 11 px, `.npc-name`, L645) in `390-boss-intro-mid.png` are not tappable and tiny; the player must walk into the 1.5-2 m interact radius blind.
- **Change:** On touch make `.npc-plate` `pointer-events:auto` with a 44 px min height hit box; tapping it sets the existing interact/walk-to target (same as clicking the NPC on desktop) and font 13 px.
- **Files:** src/ui/style.css L643-L646; `src/ui/questUi.ts` `NpcPlates`
- **Effort / priority:** M / 2

### H032 - Interact prompt (P3, S)
- **Problem:** The prompt appears silently when walking past objects; in combat or while looking at the stick the player misses it.
- **Change:** First frame the prompt shows for a new target: 150 ms scale-pop animation and `navigator.vibrate?.(8)` (helper). Do not repeat for the same target.
- **Files:** src/ui/interactUi.ts `update` (the `text !== this.current` branch)
- **Effort / priority:** S / 3

### H033 - Damage numbers (P2, S)
- **Problem:** Numbers are 15.75 px (1.05em) with a 3 px black shadow; crit 24 px. In `390-damage-numbers.png` white numbers over beige/brown ground are readable only barely and crit gold `#ffcf5a` washes out on the Core ground.
- **Change:** Touch portrait: `.dmg { font-size: 17px; -webkit-text-stroke: 1.2px rgba(0,0,0,.85); paint-order: stroke fill }`, crit 26 px with a 4 px dark halo; keep `will-change`.
- **Files:** src/ui/style.css L325-L340
- **Effort / priority:** S / 2

### H034 - Damage numbers (P1, S)
- **Problem:** Damage taken is `#ff5544` over warm brown ground (`390-damage-numbers.png`, "219", "551") - low contrast and it spawns at the enemy/hit point (anywhere), not near the player or life bar.
- **Change:** Taken numbers: `#ff7a66`, 20 px, dark 2 px stroke, spawn above the player head and drift left; an additional red flash on the life bar already planned (see life items).
- **Files:** src/ui/style.css L338; src/ui/damageNumbers.ts L34 (`toPlayer` branch)
- **Effort / priority:** S / 1

### H035 - Damage numbers (P2, M)
- **Problem:** With a horde (`spawnHorde(30)`, `390-combat-horde.png`) the 80-element pool paints a number per hit per enemy; multi-hit skills and DoT produce a wall of digits over the fight and over the HUD.
- **Change:** On touch merge hits on the same target within 120 ms into one number (sum), cap live numbers to 24, drop `dmg-dot` ticks below 3% of the target's life, and skip "Miss" popups for non-player targets.
- **Files:** src/ui/damageNumbers.ts `handle` L28-L45, `spawn` L66-L88
- **Effort / priority:** M / 2

### H036 - Damage numbers (P2, S)
- **Problem:** The damage layer is later in the DOM than the menu/minimap, so numbers draw over the menu icons and the quest tracker ("53", "186" over the Bag/Hero buttons in `390-damage-numbers.png`).
- **Change:** Give `.damage-layer` `z-index: 1; clip-path: inset(calc(var(--sat) + 190px) 0 0 0)` in portrait (keeps numbers out of the top chrome) and the HUD groups a higher z-index.
- **Files:** src/ui/style.css L324 + portrait block
- **Effort / priority:** S / 2

### H037 - Loot labels (P1, S)
- **Problem:** Labels are 27 px tall and 11.7 px font (measured `[147,27]`, `.loot-label` L464-L474, touch override only adds padding 5x9 at L818): a 1-in-3 mis-tap on a pile; cannot meet 44 px.
- **Change:** `#ui.touch-ui .loot-label { min-height: 44px; display:flex; align-items:center; padding: 0 12px; font-size: 14px }` and offset stacking step from 19 px to 46 px in `LootLabels` (`Math.abs(q.y - y) < 19` and `y = hit.y - 19`).
- **Files:** src/ui/style.css L818; src/ui/lootLabels.ts L63-L70
- **Effort / priority:** S / 1

### H038 - Loot labels (P1, S)
- **Problem:** Labels are not clamped to the screen: "Slayer Hydraulic Knuckles" runs off the right edge (`390-combat-horde.png`), "Sullen Marrow" ends at 382/390 (`390-loot-few.png`).
- **Change:** After measuring width, clamp `x` to `[sal + 4 + w/2, innerWidth - sar - 4 - w/2]` and `max-width: 70vw; overflow: hidden; text-overflow: ellipsis`.
- **Files:** src/ui/lootLabels.ts (the `translate(...)` line ~L71)
- **Effort / priority:** S / 1

### H039 - Loot labels (P1, M)
- **Problem:** A big drop creates 13+ labels stacked upward 19 px apart that cross the life bars, menu row, minimap and quest tracker (`390-loot.png`, `390-low-life.png`, `390-levelup.png` - the "LEVEL 30" banner is buried under them).
- **Change:** On touch: show at most 6 labels (nearest to the player first; legendary+ always), collapse the rest into one "+N items" chip (tap = pick up the nearest); clip the label layer with `clip-path: inset(calc(var(--sat) + 190px) 0 calc(var(--sab) + 270px) 0)`.
- **Files:** src/ui/lootLabels.ts `update`, src/ui/style.css L463
- **Effort / priority:** M / 1

### H040 - Loot labels (P2, M)
- **Problem:** Picking up needs a precise tap on a 27 px label while a thumb is on the stick and enemies are around; common/magic items are mostly never worth it.
- **Change:** On touch, auto-request pickup for gold and items of rarity `common`/`magic` within 2.5 m of the hero (reusing `requestPickup`), keep manual labels for rare+; announce with one grouped toast "Picked up 4 items".
- **Files:** src/ui/lootLabels.ts, `src/game.ts` `requestPickup` L2089
- **Effort / priority:** M / 2

### H041 - Loot labels (P3, S)
- **Problem:** Labels listen to `mousedown` only (lootLabels.ts L39), relying on emulated mouse events after touchend.
- **Change:** Switch to `pointerdown` (with `ev.preventDefault()`) so the pickup triggers on touch-down and cannot be eaten by the long-press suppressor (`installLongPress`).
- **Files:** src/ui/lootLabels.ts L39-L42
- **Effort / priority:** S / 3

### H042 - Loot labels (P3, S)
- **Problem:** Rarity is carried by text colour only; blue `#4a7aff` on the dark ground and orange/yellow variants are hard to tell apart (`390-loot-few.png`), and unique/legendary/mythic have the same look.
- **Change:** Add a 3 px left border in the rarity colour and a 10 px glyph by tier (`.` magic, diamond rare, star legendary+) via `::before` on `.loot-label`, no new art.
- **Files:** src/ui/style.css L464-L476, src/ui/lootLabels.ts (set `data-rarity`)
- **Effort / priority:** S / 3

### H043 - Status tiles (P1, S)
- **Problem:** Eight statuses make a 314 px wide bar (8 x 34 + 7 x 6) centred on 50% - at 320 wide it spills past the screen edges (`320-stack-statuses.png`: tiles run from x~3 to x~317, flush against both screen edges, and the bar is 40 px wider than its box), and nothing wraps.
- **Change:** `.buff-bar { flex-wrap: wrap; max-width: calc(100vw - 16px); justify-content: flex-start }`, tile 34 -> 30 px in portrait, show max 8 tiles then "+N" tile.
- **Files:** src/ui/style.css L615-L616; src/ui/hud.ts L398-L420
- **Effort / priority:** S / 1

### H044 - Status tiles (P1, M)
- **Problem:** The buff bar is positioned from the bottom (`bottom: sab + 262px`, L901) in the middle of the screen; at 320x640 it occupies y 310-344 plus timers to 356, directly over the endgame stack (y 337-369) and the WT badge (`320-stack-statuses.png`, `320-target-elite.png`).
- **Change:** Move it to a fixed row under the menu grid: `top: calc(var(--sat) + 181px); left: var(--sal) + 8px; width: 196px` (menu grid ends sat+128+... verify), pushing target frame and wave tracker down by 34 px; tiles 28 px.
- **Files:** src/ui/style.css L901 (`.buff-bar`), L875 (`.target-frame` top), L876
- **Effort / priority:** M / 1

### H045 - Status tiles (P2, S)
- **Problem:** Remaining-time digits are 11 px and drawn 13 px *below* each tile (`.buff-time {bottom: -13px}`, L627): they collide with whatever is under the bar (stack text in `320-stack-statuses.png`).
- **Change:** Draw the timer inside the tile bottom (`bottom: 0; background: rgba(0,0,0,.6); font-size: 10px; padding: 0 2px`), stack count stays top right.
- **Files:** src/ui/style.css L626-L628
- **Effort / priority:** S / 2

### H046 - Status tiles (P3, S)
- **Problem:** Harmful tiles differ from boons only by a 1 px red border (`.buff.harmful`, L621) and nothing says a boon is about to expire.
- **Change:** Harmful: 2 px `#d0402a` border + corner exclamation dot; any tile with remaining <= 3 s blinks (`opacity .5<->1`, 0.5 s). Both CSS, class toggled in the `buffs.map` render.
- **Files:** src/ui/style.css L621; src/ui/hud.ts L398-L420
- **Effort / priority:** S / 3

### H047 - Status tiles (P2, S)
- **Problem:** Spore exposure meter (`bottom: sab + 304px`, 180 px wide) and the flare counter (`bottom: sab + 302px`, left 8 px) stack above the buff bar at the same band as the arc top (`style.css` L902-L903); with all three active they overlap and compete with dodge/potion.
- **Change:** Put the exposure meter as a 4 px line directly under the XP bar (`top: sat + 90`) and the flare counter as a chip right of the level chip; remove them from the lower-middle band.
- **Files:** src/ui/style.css L902-L903, L975; src/ui/hud.ts exposure/flares elements
- **Effort / priority:** S / 2

### H048 - Minimap (P2, S)
- **Problem:** Minimap is `pointer-events: none` (L580): the most natural tap target on the top right does nothing; opening the map requires the 36 px Map button in the grid.
- **Change:** Make `.minimap` `pointer-events:auto` in portrait with `click -> input.pressAction("map")` and a 44x44 invisible minimum (it is 104 px, fine); add `cursor:pointer` for hybrid devices.
- **Files:** src/ui/style.css L580, L870; src/ui/minimap.ts (constructor L100-L120), `src/game.ts` input wiring
- **Effort / priority:** S / 2

### H049 - Minimap (P3, S)
- **Problem:** Portrait minimap is 104 px (desktop 180) and marker dots are 4 px (`mark(..., 4)`): `390-hub-npc.png` shows quest/enemy dots as specks; ring stroke `#6a5a44` 2 px vanishes on bright Core ground (`390-core-gardens.png`).
- **Change:** Size `clamp(104px, 30vw, 124px)`; marker radius 4 -> 5 (dungeon `drawInstance` too); ring stroke `#c8b28a` with a 1 px black outer stroke.
- **Files:** src/ui/style.css L870; src/ui/minimap.ts `drawInstance` L179-L205, `drawMini`
- **Effort / priority:** S / 3

### H050 - Minimap (P2, M)
- **Problem:** Objective and boss markers only appear if they are inside the 130 m window; when the quest target is further away the player has no direction (`390-hub-npc.png`: the quest dot sits at the rim only occasionally).
- **Change:** Clamp markers that fall outside the circle onto the rim as a 6 px triangle pointing outward; quest markers gold, world boss red; use the existing `project()` result to compute the angle.
- **Files:** src/ui/minimap.ts `mark`/`project` (~L420-L450)
- **Effort / priority:** M / 2

### H051 - Minimap (P3, S)
- **Problem:** Nothing indicates compass/rotation: the minimap is camera-rotated (`cos/sin` in `View`) with only a tiny player arrow; and the region label, WT badge and endgame stack sit far below it, so there is no zone name next to the map.
- **Change:** Add a 10 px "N" tick on the rim (rotating with the map) and the region title (11 px, ellipsis) as a pill under the circle, replacing the free-floating `.wave-tracker` text in portrait (see region label items).
- **Files:** src/ui/minimap.ts `drawMini` end, src/ui/style.css L876
- **Effort / priority:** S / 3

### H052 - Quest tracker (P2, S)
- **Problem:** On touch only the tracked quest renders: `#ui.touch-ui .quest-row:not(.tracked) { display:none }` (L812). With two active quests (`mq.wake_up`, `sq.logs`, `sq.daughter` started in my run) the second/third are invisible and unreachable; `390-quests2.png` shows one row.
- **Change:** Show the tracked row expanded and a 28 px "+2" chip (`pointer-events:auto`) that opens the quest log (`input.pressAction("quests")`); `QuestTracker.update` already receives up to 3 rows.
- **Files:** src/ui/style.css L812; src/ui/questUi.ts L129-L157
- **Effort / priority:** S / 2

### H053 - Quest tracker (P1, S)
- **Problem:** Tracker text is 10.5 px (title 0.7em) / 9.75 px (step 0.65em) in a 140 px box (`metrics-390.txt`); two-line steps ("Climb out of the crater and reach the road") are all that fits.
- **Change:** Portrait: title 12.5 px, step 11.5 px, width `clamp(150px, 42vw, 196px)` (right-aligned to the minimap edge), `line-clamp: 3`; keep 1 px text shadow.
- **Files:** src/ui/style.css L871-L874
- **Effort / priority:** S / 1

### H054 - Quest tracker (P2, M)
- **Problem:** Tracker is permanently on screen at `top: sat + 130` and is the thing the interact prompt, banners and loot collide with (`390-interact-chest.png`, `390-boss-phase2.png`, `390-levelup.png`).
- **Change:** Tap on the tracker toggles collapsed (title only, 28 px); auto-collapse after 6 s of combat (use `ctx.player in combat` flag, else enemies near > 0) and auto-expand on a quest step change.
- **Files:** src/ui/questUi.ts `QuestTracker`, src/ui/style.css L871
- **Effort / priority:** M / 2

### H055 - Quest tracker (P2, S)
- **Problem:** A new objective/step silently replaces the text (`replaceChildren`, questUi.ts L145); no cue that the tracker changed.
- **Change:** On step/key change add `.updated` for 1.5 s: gold left border grows to 4 px, background flashes `rgba(255,210,58,.25)`, plus the haptic "quest" pattern.
- **Files:** src/ui/questUi.ts L140-L156, src/ui/style.css L647-L653
- **Effort / priority:** S / 2

### H056 - Quest tracker (P2, M)
- **Problem:** The tracker states what to do but not where: no distance or direction (kill counts are in the text, positions only on the 104 px minimap).
- **Change:** Add a right-aligned 11 px "142 m" with a rotating arrow glyph (CSS-rotated `>`) computed from `questMarkers(world, ctx)` nearest to the active step vs the player position and camera yaw.
- **Files:** `src/game.ts` L1013 (markers), L1161-L1170 (tracker feed), src/ui/questUi.ts
- **Effort / priority:** M / 2

### H057 - Toasts, banners, cards (P1, S)
- **Problem:** Toast stack is `top: sat + 190px; width: 92vw` (L877): it lands exactly on the player (38% from top), the target frame and the region label, and each 2-line toast is 40-60 px tall (`390-toasts-banner.png`, `320-toasts-stack.png`: toasts cover the "CINDER FLATS" label and the target bar).
- **Change:** Portrait: anchor toasts to the free band above the controls: `top: auto; bottom: calc(var(--sab) + 40dvh + 8px); left: sal+8; right: 208px; align-items:flex-start`, font 13 px, one-line ellipsis for info toasts.
- **Files:** src/ui/style.css L99-L118, L877, L879
- **Effort / priority:** S / 1

### H058 - Toasts, banners, cards (P1, S)
- **Problem:** Toasts are unbounded and undeduplicated: `Toasts.show` appends every message for 1.8 s (up to 4.5 s for world boss), so pickups, saves and errors fan out into a column (4 toasts = 240 px in `390-toasts-banner.png`).
- **Change:** Keep max 3 (remove the oldest immediately), merge identical text into one with a "x3" counter and restart its timer, shorten the world-boss warning to one line (`worldBoss.warning`, 4.5 s) - the stack row already carries the details.
- **Files:** src/ui/toast.ts L8-L18, src/ui/worldBossHud.ts L55-L61
- **Effort / priority:** S / 1

### H059 - Toasts, banners, cards (P1, S)
- **Problem:** `.event-box` and `.toast-stack` share the identical `top: calc(var(--sat) + 190px); width: 92vw` (L877-L878): a world event and any toast overprint each other.
- **Change:** Move the event box into the toast container as the first (pinned) child, or place it at `top: sat + 190px` and the toasts after it with `margin-top` = measured event height.
- **Files:** src/ui/style.css L877-L878; src/ui/hud.ts `eventBox` L286
- **Effort / priority:** S / 1

### H060 - Toasts, banners, cards (P1, S)
- **Problem:** Centre banner (Level up, wave clear, boss phase) sits at `top: 28%` -> y 236 on 844 px, i.e. on the target frame and quest tracker, with no backing (`390-toasts-banner.png`, `390-boss-phase2.png`, `390-levelup.png`).
- **Change:** Portrait: `top: 54%` (just below the hero), `font-size: clamp(18px, 6vw, 26px)`, add a horizontal scrim `linear-gradient(90deg, transparent, rgba(0,0,0,.7) 15% 85%, transparent)` and `padding: 8px 24px`; z-index above loot labels.
- **Files:** src/ui/style.css L263-L286 (+ portrait override)
- **Effort / priority:** S / 1

### H061 - Toasts, banners, cards (P2, S)
- **Problem:** Banner is letter-spaced 0.25em at 1.6em (L283-L285): "KRELL OVERRIDES THE LOADER'S SAFETY LIMITS" wraps to three lines and runs across the elite name, bar and quest tracker (`390-boss-phase2.png`).
- **Change:** Portrait: `letter-spacing: .1em; text-wrap: balance; max-width: 84vw; max-height: 2 lines` (`-webkit-line-clamp: 2`).
- **Files:** src/ui/style.css L263-L286
- **Effort / priority:** S / 2

### H062 - Toasts, banners, cards (P2, S)
- **Problem:** `Hud.showBanner` has a single text slot: a second banner (e.g. "Quest complete" 0.1 s after "Level 12") overwrites the first, and the 2 s timer restarts (hud.ts L350-L355).
- **Change:** Banner queue: push to an array, show each for its own duration with a 150 ms gap; drop duplicates already queued.
- **Files:** src/ui/hud.ts L350-L355, `update` L510-L514
- **Effort / priority:** S / 2

### H063 - Toasts, banners, cards (P2, M)
- **Problem:** Level-up is the same plain banner as any other event ("LEVEL 30" gets lost behind loot labels in `390-levelup.png`), with no mention that skill points are waiting.
- **Change:** Level-up variant: gold banner "LEVEL 12" + sub-line "+1 skill point - tap to spend" (a 44 px button opening the Skills panel), a 600 ms radial light ring over the life bar and the level-up haptic pattern.
- **Files:** `src/game.ts` L1067 (`ui.levelUp`), src/ui/hud.ts `showBanner`, src/ui/style.css
- **Effort / priority:** M / 2

### H064 - Toasts, banners, cards (P2, S)
- **Problem:** Region card image is `min(620px, 86vw)` x 16:9 (335x188 px at 390) at `top: 14%` (y 118-306, measured `[34,122,322,195]`): it covers the menu grid, target frame, tracker and 4 s of the top third each time a region is entered; it also repeats the name that is already printed as the persistent label (`390-region-card.png`).
- **Change:** Portrait: image `width: 64vw; aspect-ratio: 16/6`, `top: 30%`, name 20 px/0.16em, shorten to 2.6 s; skip the card when the persistent label will show the same text (re-entering within 60 s).
- **Files:** src/ui/style.css L1014-L1020, src/ui/hud.ts `regionCard` L357
- **Effort / priority:** S / 2

### H065 - Toasts, banners, cards (P3, S)
- **Problem:** Boss intro card is `min(220px, 40vw)` (156 px) portrait + 2 text lines at `top: 22%` (y 186), 3.2 s - it covers the boss target frame that appears at the same moment.
- **Change:** Portrait: portrait circle `28vw`, `top: 38%`, name 18 px; delay the target frame fade-in until the card ends (or place the card below it).
- **Files:** src/ui/style.css L1014-L1023
- **Effort / priority:** S / 3

### H066 - Toasts, banners, cards (P1, S)
- **Problem:** Region label (`.wave-title` #d8d0c4 11.25 px, `.wave-sub` #8c8378 9.75 px, no shadow; L245-L246) disappears on bright ground: "THE HANGING GARDENS" is unreadable on the cream Core floor (`390-core-gardens.png`); also on the grate floor of a rift (`390-rift-stack.png` "RIFT 5: SLAY ENEMIES 10%").
- **Change:** Portrait: title 13 px/`#f0e6d4`, sub 11.5 px/`#cfc3b0`, `text-shadow: 0 0 3px #000, 0 1px 2px #000, 0 0 8px rgba(0,0,0,.8)` and a `rgba(0,0,0,.35)` pill background.
- **Files:** src/ui/style.css L236-L246, L876
- **Effort / priority:** S / 1

### H067 - Toasts, banners, cards (P2, S)
- **Problem:** The region label is permanent at `top: sat + 232px` in the left column and duplicates the card/banner; together with the WT badge and stack it forms the clutter band (`390-core-gardens.png`).
- **Change:** Fade the label to 35% after 6 s and to hidden after 12 s of no zone change; bring it back for 3 s when the minimap is tapped or the zone changes (class toggle in `Hud.update` from `lastWave` key).
- **Files:** src/ui/hud.ts wave block L455-L470, src/ui/style.css L236-L246
- **Effort / priority:** S / 2

### H068 - Target & boss frame (P2, S)
- **Problem:** The target frame name wraps over two lines ("CORVO THE HOLLOW, BREAKER OF CONVOYS", 17 px caps with .12em tracking) and its bar then runs under the quest tracker, the yellow NPC plate repeats the same name over the bar (`320-target-elite.png`).
- **Change:** Portrait: name 13 px single line `text-overflow: ellipsis`, affixes on a second 11 px line, bar 10 px; hide the in-world NPC plate for the targeted elite.
- **Files:** src/ui/style.css L258-L261, L875; `src/game.ts` elite plates L1180
- **Effort / priority:** S / 2

### H069 - Target & boss frame (P2, M)
- **Problem:** Bosses use the same thin 10 px target bar as trash (`390-boss-phase2.png`), with no percentage, no phase marker and the status line at 10.8 px muted grey (`.target-status`, L261).
- **Change:** When the target has `portrait` or is a Boss: full-width (minus margins) 16 px bar at `top: sat + 146`, "62%" label, tick marks at the phase thresholds from `BOSS_SCRIPTS[...].below`, status line 12 px `#cfc3b0`.
- **Files:** src/ui/hud.ts target block L477-L495, src/ui/style.css L248-L261, L1010
- **Effort / priority:** M / 2

### H070 - Target & boss frame (P2, M)
- **Problem:** A boss spawned 9 m up-screen was off the visible field and nothing pointed at it (`390-boss-intro-mid.png`: bar present, boss not on screen; only a 5 px diamond on the minimap).
- **Change:** Edge arrow: a 28 px chevron at the screen edge in the boss direction (`project()` result clamped to the viewport inside safe areas) while an engaged boss/world boss is off-screen; pulses red.
- **Files:** src/ui (new `edgeArrows.ts`), `src/game.ts` render loop where `project` is used (L1013 area)
- **Effort / priority:** M / 2

### H071 - Target & boss frame (P3, S)
- **Problem:** Target memory is 4 s after the last hit (`TARGET_MEMORY`, game.ts L183) and the touch layout has no cursor, so the frame disappears while an elite is still chasing you.
- **Change:** On touch keep the frame while the entity is within 12 m and alive (or 8 s after last hit), fade out at the end; hide when a different enemy is hit.
- **Files:** `src/game.ts` L183, L1643-L1645
- **Effort / priority:** S / 3

### H072 - Endgame status stack (P1, S)
- **Problem:** Endgame rows use 8.25-9.3 px fonts: `.worldboss-hud` 8.4 px, `.harvest-line` 8.4 px, `.rift-hud-status` 8.25 px, `.rift-hud-head` 9.3 px (L1158-L1163, metrics). Unreadable on a phone even at arm's length (`390-rift-stack.png`).
- **Change:** All stack text >= 11 px (`.worldboss-hud` 0.74em, `.harvest-line` 0.74em, `.rift-hud-head` 0.74em, status 0.72em, timer 1.5em); drop the `#ui.touch-ui.portrait` 0.55-0.62em overrides.
- **Files:** src/ui/style.css L1156-L1163
- **Effort / priority:** S / 1

### H073 - Endgame status stack (P1, M)
- **Problem:** Stack top is a fixed `sat + 290px` and it is 300 px wide: with rift + world boss + harvest it spans y 337-410 (`390-rift-stack.png`) and at 320x640 it overlaps the buff bar and runs into the dodge/potion buttons at y 358 (`320-stack-statuses.png`).
- **Change:** Collapse the three rows into one 28 px ticker chip in the left column (rotates rows every 4 s, shows rift timer permanently when in a rift), tap to expand into the full list for 5 s; chip `top: calc(var(--sat) + 181px + 34px)`. Pure DOM/CSS in the three HUD classes.
- **Files:** src/ui/style.css L1154-L1163, src/ui/riftPanel.ts (`RiftHud`), src/ui/worldBossHud.ts, src/ui/harvestHud.ts, `src/game.ts` L342-L347
- **Effort / priority:** M / 1

### H074 - Endgame status stack (P2, S)
- **Problem:** Stack width `min(300px, 100vw - 16px)` covers most of the playfield left of the hero (centre of mass at 38% height) with 60-70% opaque panels (`390-rift-stack.png`).
- **Change:** Limit to `width: min(220px, 58vw)`, background `rgba(8,6,12,.45)` without the left bar fill gradients, `text-overflow: ellipsis`.
- **Files:** src/ui/style.css L1155-L1157
- **Effort / priority:** S / 2

### H075 - Endgame status stack (P2, M)
- **Problem:** The Deep Rift timer ("9:55", the only number that matters in a rift) is a 20 px number in the middle of a 3-line block (`390-rift-stack.png`).
- **Change:** In a rift pin the timer next to the life bar (right end, 16 px bold monospace `9:55`) and render progress as a 4 px strip under the XP bar; the stack row remains for the label.
- **Files:** src/ui/riftPanel.ts `RiftHud`, src/ui/style.css L1139-L1141, L860
- **Effort / priority:** M / 2

### H076 - Endgame status stack (P3, S)
- **Problem:** Rift time-low (`.rift-hud-time.low`) only turns the text red, in 9 px type.
- **Change:** Below 60 s: timer chip pulses (scale 1<->1.12, 0.5 s), plus `navigator.vibrate([40,40,40])` at 60/30/10 s thresholds (one-shot per threshold, via helper).
- **Files:** src/ui/riftPanel.ts `RiftHud.update`, src/ui/style.css L1136
- **Effort / priority:** S / 3

### H077 - Endgame status stack (P3, S)
- **Problem:** Inside a rift the WT badge shows "WT I SURVIVOR" while the chosen tier outside is "WT III NIGHTMARE" (`390-rift-stack.png` vs `390-core-gardens.png`) - same screen space, contradictory information, 9.75 px.
- **Change:** Hide `.tier-badge` while `ctx.instance?.rift` is active (replaced by the rift row) and make the badge text 11 px elsewhere; check with the design owner whether rifts really override the tier.
- **Files:** src/ui/hud.ts L471-L476 (`tierText`), src/ui/style.css L1096
- **Effort / priority:** S / 3

### H078 - Endgame status stack (P2, S)
- **Problem:** World boss row is a long sentence ("World boss: The Hollow Engine in 1:52 - The Core", 8.4 px) that will wrap to two lines once the font reaches 11 px, and it is not tappable.
- **Change:** Format "Hollow Engine  1:52" (name from `worldBoss.*.name`, region after a small tag only when not in that region); tap = open the map on that region (`input.pressAction("map")` + set `viewing`).
- **Files:** src/ui/worldBossHud.ts `worldBossLine` L16-L22, lang `worldBoss.hudWarning`
- **Effort / priority:** S / 2

### H079 - Touch menu row (P1, M)
- **Problem:** The menu has 10 buttons at 36 px (`.touch-menu-btn` portrait, L869; measured 36x36) in a 5x2 grid of 196x76: below the 44 px guideline, 4 px gaps, and they sit at the top left (thumb zone start is y>450 on 844).
- **Change:** Primary row of 5 at 44 px (Bag, Hero, Skills, Map, Quests; gap 4) = 236 px wide; at 320 wide this meets the minimap (x 208) so size to `min(44px, (100vw - 104px - 24px) / 5)` or move the minimap to second row; secondary buttons go to the overflow item below.
- **Files:** src/ui/style.css L862-L869
- **Effort / priority:** M / 1

### H080 - Touch menu row (P2, M)
- **Problem:** Mount (bike), flare, fullscreen, sound and volume are always shown (`MENU` list, touchControls.ts L58-L66; `390-idle-hub.png` second row) - flare matters in Deep Mines only, mount only when owned; the grid is permanent clutter.
- **Change:** Overflow: a 6th button "..." opens a 4-icon popover (fullscreen, sound, volume, bike); show the flare button only in zones with `flares`, bike only when owned (`HudState.flares` exists, add `mountOwned`).
- **Files:** src/ui/touchControls.ts L58-L66, L96-L135; src/ui/soundPanel.ts `touchEntries` L100-L112
- **Effort / priority:** M / 2

### H081 - Touch menu row (P2, M)
- **Problem:** The panel buttons are the only controls in the top-left corner: farthest point from either thumb on a 6.7" phone (y 99-175 of 844). Opening Bag/Skills mid-fight needs a hand reposition.
- **Change:** Add a 52 px "menu" FAB above the stick zone (`left: sal + 8; bottom: sab + 46dvh + 10`) that opens the 5 primary buttons as a vertical sheet; the top grid collapses to the minimap-adjacent row when the FAB is enabled (setting).
- **Files:** src/ui/touchControls.ts (new element), src/ui/style.css
- **Effort / priority:** M / 2

### H082 - Touch menu row (P2, S)
- **Problem:** No attention badges: with unspent skill points (`xp.skillPoints`), new inventory items or a full bag nothing marks the Skills/Bag buttons (`390-levelup.png`).
- **Change:** 8 px gold dot on the Skills button when `skillPoints > 0`, on Quests when a step changed, on Bag when an item was picked up since last open; `touch-menu-btn { position: relative }`, driven by `Hud.update` state.
- **Files:** src/ui/touchControls.ts `menuButton` L96-L109, src/ui/hud.ts `update`, src/ui/style.css L738-L757
- **Effort / priority:** S / 2

### H083 - Touch menu row (P3, S)
- **Problem:** Press feedback is `:active { border-color, color }` only (L757); buttons are inert-looking and give no haptic.
- **Change:** `:active`/`.pressed` -> `transform: scale(.92); background: rgba(60,50,40,.9)` and `navigator.vibrate?.(6)` through the helper on `pointerdown` (not click).
- **Files:** src/ui/style.css L757, src/ui/touchControls.ts `menuButton`
- **Effort / priority:** S / 3

### H084 - Touch menu row (P1, S)
- **Problem:** The panel close button is 36 px at the top right (`[344,55,36,36]`, L923-L930) and only closes the TOGGLE_PANELS; the Sound panel (`390-sound-panel.png`) covers the whole menu incl. its own button and needs its inner "Close" (not in the `TOGGLE_PANELS` list, touchControls.ts L46-L52).
- **Change:** Close button 48x48 at `top: sat + 6; right: sar + 6`; add `.sound-panel` (and lore/dialogue where relevant) to `TOGGLE_PANELS`; keep inner Close for desktop.
- **Files:** src/ui/touchControls.ts L46-L52, L136-L141; src/ui/style.css L923-L931
- **Effort / priority:** S / 1

### H085 - Touch menu row (P2, S)
- **Problem:** Volume sliders are native `input[type=range]` (default ~16 px thumb, `390-sound-panel.png`); dragging a slider with a thumb is imprecise and the panel is 378x204 over the HUD.
- **Change:** `.sound-row input[type=range]`: `height: 44px; accent-color` + custom thumb 28 px (`::-webkit-slider-thumb`, `::-moz-range-thumb`), row gap 14 px.
- **Files:** src/ui/style.css L1075-L1078
- **Effort / priority:** S / 2

### H086 - Death & respawn (P1, S)
- **Problem:** "YOU HAVE FALLEN" is a 45 px h2 with .35em tracking (L298-L305): its box is the full 390 px width with `text-align: start`, so the text starts flush left, the first letter touches the edge and the second line is left-aligned (`390-death.png`).
- **Change:** `.death-screen h2 { text-align:center; font-size: clamp(26px, 8.5vw, 40px); letter-spacing: .18em; padding: 0 16px }`.
- **Files:** src/ui/style.css L287-L306
- **Effort / priority:** S / 1

### H087 - Death & respawn (P1, S)
- **Problem:** The thumb buttons render above the death overlay: `elementFromPoint` at the attack centre while dead returns `.slot` (slot z-index 5, L891), so tapping the attack button on the dead screen does nothing and `death.hidden` stays false after a tap there (verified at 390x844).
- **Change:** `.death-screen { z-index: 45 }` and `#ui.dead .slots, #ui.dead .touch-stick-zone { pointer-events: none; opacity: .25 }` (toggle in `Hud.update` with `state.dead`).
- **Files:** src/ui/style.css L287-L297, L891; src/ui/hud.ts L497
- **Effort / priority:** S / 1

### H088 - Death & respawn (P1, S)
- **Problem:** Respawn is "Tap to rise again" in muted 15 px (`.death-screen p`, L306) and `click` anywhere respawns instantly: a player still mashing attack/dodge when they die respawns by accident within the first frames.
- **Change:** Show a 56 px high "Rise again" button (accent border) after a 1.2 s lock (`pointer-events:none` until then, countdown in the label), centred at 62% height; `click` handler on the button only.
- **Files:** src/ui/hud.ts constructor L273-L280 (`death` element), src/ui/style.css L306
- **Effort / priority:** S / 1

### H089 - Death & respawn (P3, S)
- **Problem:** On death the bars, menu grid, minimap and quest tracker stay fully lit above the dark vignette (`390-death.png`), so the screen still reads as alive.
- **Change:** `#ui.dead` dims `.orb, .touch-menu, .minimap, .quest-tracker` to 35% and shows a short stat line (time alive, shards lost) under the heading; fade over 600 ms.
- **Files:** src/ui/style.css (new rules), src/ui/hud.ts `update` dead flag
- **Effort / priority:** S / 3

### H090 - Safe areas & rotation (P2, S)
- **Problem:** `--sat/--sar/--sab/--sal` are defined only under `#ui.touch-ui.portrait` (L833-L838); the landscape touch rules hard-code `top: 8px`, `top: 56px`, `right: 6px` (L729-L816), so a notch/rounded corner clips the menu and minimap in landscape and during the rotation transition.
- **Change:** Move the four vars to `#ui.touch-ui` and use them in all touch rules (landscape menu left/top, minimap top/right, slots right/bottom, orbs bottom).
- **Files:** src/ui/style.css L729-L832
- **Effort / priority:** S / 2

### H091 - Safe areas & rotation (P2, S)
- **Problem:** In landscape the region label sits under the minimap and is covered by the skill arc, and the quest tracker draws over a skill button ("Wake Up" over the 2nd skill icon in `390-landscape.png`).
- **Change:** Landscape touch: tracker `right: 230px` (left of the arc, `top: 8px`), region label under the menu row at the left (`top: 56px`), buff bar above the orbs; or hide the tracker when the viewport is < 420 px high.
- **Files:** src/ui/style.css L807-L817
- **Effort / priority:** S / 2

### H092 - Safe areas & rotation (P2, M)
- **Problem:** The camera frames the hero 38% from the top (comment L831) but the HUD chrome (bars, menu, tracker, label, stack) reaches y ~ 230-420; at 320x640 the playfield between chrome and thumb cluster is ~220 px tall (`320-target-elite.png`), the hero is partly under the endgame stack.
- **Change:** Below 700 px viewport height shift the camera target to 46% (`camera.ts` aspect/vertical offset) or drop non-essential chrome (label, stack, tracker) into collapsed chips; verify at 320x640 and 360x780.
- **Files:** src/render/camera.ts (framing), src/ui/style.css L876-L879
- **Effort / priority:** M / 2

### H093 - Safe areas & rotation (P2, S)
- **Problem:** Open panels are translucent and the top HUD bleeds through them (`390-panel-inventory.png`: "220 / 220", menu and minimap ghosted behind the title, 12 px text over 12 px text).
- **Change:** `#ui.touch-ui.portrait.touch-panel-open .orb, .xp-bar, .touch-menu, .minimap, .quest-tracker, .wave-tracker, .endgame-stack { visibility: hidden }` (not the close button), panel background opacity .94.
- **Files:** src/ui/style.css L921-L931 + panel base L379
- **Effort / priority:** S / 2

### H094 - One-handed play (P2, M)
- **Problem:** Joystick left / actions right is hard-wired (`left:0` zone, `right:` slots); left-handed players have the attack button under the weaker thumb.
- **Change:** Setting `touchLayout: right|left`: toggles `#ui.lefty` which mirrors `.slots` (`left` instead of `right`), the zone (`right:0`) and the knob side; mirror arc offsets with `transform: scaleX(-1)` on the container and un-flip icons.
- **Files:** src/data/settings.ts (new key), src/ui/touchControls.ts `setActive`, src/ui/style.css L881-L899
- **Effort / priority:** M / 2

### H095 - One-handed play (P3, M)
- **Problem:** Holding attack needs a thumb pinned on the attack button (`touch.attack` released on `pointerup`, L195), which prevents sliding to the stick in one-handed play.
- **Change:** Double-tap the attack button to lock auto-attack (ring turns solid, lock glyph); tap again or press dodge to release. Keeps `touch.attack = true` until released.
- **Files:** src/ui/touchControls.ts `bindSlot` L177-L200
- **Effort / priority:** M / 3

### H096 - Haptics (P2, S)
- **Problem:** `navigator.vibrate` is used once (long-press, touchControls.ts L280). There is no central helper, no setting, and iOS Safari lacks the API.
- **Change:** New `src/ui/haptics.ts`: `buzz(pattern)` with feature detection (`"vibrate" in navigator`), `localStorage` toggle (default on), throttle 80 ms; add a "Vibration" row to the sound panel; used by the other haptic items.
- **Files:** src/ui/haptics.ts (new), src/ui/soundPanel.ts, src/ui/touchControls.ts L280
- **Effort / priority:** S / 2

### H097 - Haptics (P3, S)
- **Problem:** Taking a big hit, dying, and using a potion/dodge have no tactile feedback; combat is purely visual on a 4-6 inch screen.
- **Change:** Patterns: hit > 10% max life 14 ms (max 1 per 150 ms), dodge 10 ms, potion `[10,30,10]`, death `[60,40,120]`, overheat 20 ms. Hook into `GameEvent` damage with `toPlayer` (`damageNumbers.handle` location) and `bindSlot`.
- **Files:** src/ui/damageNumbers.ts L28-L35, src/ui/touchControls.ts `bindSlot`, src/ui/hud.ts
- **Effort / priority:** S / 3

### H098 - Haptics (P3, S)
- **Problem:** Level up, quest step/complete, boss intro and a legendary drop all show only a banner or card.
- **Change:** Patterns: level-up `[20,40,20,40,60]`, quest step 18 ms, boss intro `[40,60,40]`, legendary+ drop 25 ms (trigger where `showBanner/bossIntro/regionCard` are called in game.ts L1067, L1321, L1915).
- **Files:** `src/game.ts` L1067, L1321, L1915, src/ui/haptics.ts
- **Effort / priority:** S / 3

### H099 - Haptics (P3, S)
- **Problem:** Low life has only the bar glow (`.orb.warn`).
- **Change:** While life < 25%: a "heartbeat" `[30,70,30]` every 1.6 s (stop at potion/heal/death); disabled when haptics setting is off or `prefers-reduced-motion`.
- **Files:** src/ui/hud.ts `update`, src/ui/haptics.ts
- **Effort / priority:** S / 3

### H100 - Clutter (P3, S)
- **Problem:** In combat the HUD is at full contrast everywhere (`390-combat-horde.png`): menu grid, tracker, label, stack and minimap all compete with 30 enemies and telegraph rings.
- **Change:** While enemies are within 15 m (combat flag): menu grid and quest tracker/label/stack to 45% opacity, restore 1.5 s after combat ends (CSS transition on a root class set from `Hud.update`).
- **Files:** src/ui/hud.ts `update`, src/ui/style.css (new rules)
- **Effort / priority:** S / 3

