---
name: mobile-portrait-game-ui
description: Audit and improve a browser game's DOM UI, above all for phones held upright (portrait) — HUD, touch controls, panels, menus — plus general game-UI rules for every viewport (hierarchy, stable layout, event-driven HUD, screen stack, keyboard/gamepad focus, accessibility). Use when asked to make a game's GUI work on mobile/portrait, to audit or design game UI, or when players report unreadable text, missed taps, stuck controls or being stuck on a screen.
---

# Mobile portrait UI for a browser game

## Audit first, then implement

1. Screenshot every state at 390×844, 360×780 and 320×640 (see playwright-webgl-testing): hub, combat with a
   horde, boss with phase banner, low life, loot pile, level up, toasts stacking, every panel and dialog.
2. Write each finding as a **testable item**: ID, area, problem (screenshot name), concrete change (px, position,
   behaviour), files, effort, priority. No "improve UX".
3. Split implementation by file ownership (see parallel-subagent-builds); finish with a status list.

## Rules that held up

- **Targets ≥44 px** (48 for primary thumb buttons); text ≥12 px; tokens for spacing/font sizes so a text-size
  setting scales everything.
- **Thumb zone**: attack/skills in an arc bottom-right, joystick bottom-left, never overlapping; a lefty layout
  mirror; menu buttons reachable with the thumb on tall screens.
- **Safe areas**: `env(safe-area-inset-*)` on every edge element; test with a forced notch inset.
- **One status column**: toasts (max ~3, merge duplicates), banners in a queue, event/endgame rows in one
  stack — never on top of the hero or the target frame.
- **Loot labels**: cap the count on short screens, collapse the rest into a "+N items" chip, clamp to the
  screen, auto-pick commons.
- **Panels**: one panel stack — one main panel at a time, a shared header with one close button, swipe down to
  close, tap outside to close, **Android/browser Back via `history`**, Escape on desktop. Service panels share
  the screen with the backpack instead of covering it.
- **Tooltips**: hover leftovers don't work on touch — tap opens a scrollable bottom sheet with actions and
  comparison; long-press with a progress ring for secondary info.
- **Confirmations**: an in-page confirm sheet (native `confirm()` is blocked in sandboxed iframes) and "armed"
  buttons (second tap confirms) for valuable buys/sells, salvage-all (with Keep boxes), skill choices that lock
  alternatives, map travel.
- **Death screen** must block the combat buttons and need a deliberate tap after a short delay.
- **Name entry**: no autofocus before the player sees the options; input ≥16 px (iOS zooms below);
  `autocapitalize`, `enterkeyhint`.
- **Don't rebuild DOM on a timer** under the finger (a panel re-rendering twice a second makes taps hit detached
  elements) — rebuild only when the data changes.
- **Haptics** via `navigator.vibrate` behind a setting, throttled.
- **Fullscreen**: hide/replace when `document.fullscreenEnabled` is false (iPhone Safari, iframes); offer
  "Add to Home Screen" with a web manifest (`display: fullscreen`) for the standalone build.
- Keep desktop unchanged: scope rules to `.touch-ui.portrait`.

## Game UI rules for every viewport

Adapted from the `game-ui-ux` and `threejs-game-ui-designer` skills (installed next to this one; see
"Companion skills").

- **Hierarchy and zones**: survival and status first, then objective, then feedback, then flavour.
  Objective/timer top-left, currency/pause top-right, controls in the bottom corners, short banners
  centre-top. Keep UI off the player, threats, pickups and the next decision.
- **Stable layout**: fixed-width slots and `font-variant-numeric: tabular-nums` for life, resource,
  gold, timers and damage, so changing values don't shift anything. Test with the longest values:
  max level, 7-digit gold, the longest item/skill names, strings about 30 % longer than English.
- **Event-driven HUD**: update an element when its value changes (events or a dirty check), never by
  rewriting DOM every frame. The same rule as not rebuilding DOM on a timer.
- **Screens as a stack**: push/pop instead of `isPaused`/`inSettings` flags; the top screen owns
  input; Back, Escape and swipe-down all pop. The panel stack above is this pattern.
- **Keyboard and gamepad**: every screen opens with a focused control; a visible focus ring distinct
  from hover; focus trapped inside modals and returned on close; mouse and focus coexist (moving the
  mouse never strands a gamepad user).
- **States on every control**: hover, pressed, focus, disabled. Debug UI behind a flag.
- **Touch input that can't stick**: handle `pointerup`, `pointercancel`, `lostpointercapture`, window
  `blur` and `visibilitychange`; scope `touch-action` to controls and the canvas; touch controls emit
  the same game intents as keys and mouse.
- **Accessibility**: a text-size setting up to 200 % without clipping; contrast at least 4.5:1 for
  text that carries gameplay information (3:1 for large text and key visuals); never state by colour
  alone (add an icon, shape or text); reduce-motion and reduce-flashing toggles.
- **One source of truth**: UI reads game state and dispatches intents; no game rules duplicated in
  UI code, no stale values after a restart, zone change or class switch.
- **Not a web dashboard**: no generic stat cards, nested cards, pill buttons, cream panels or
  monospace labels unless the art direction asks; use meters, rings, badges, slots and motifs from the
  game world.

## Companion skills

- `game-ui-ux` (gamedev-skills/awesome-gamedev-agent-skills, Apache-2.0): engine-neutral layout,
  scaling, focus navigation, screen stack, accessibility numbers. Its code is Godot/Unity; translate it
  to DOM/CSS.
- `threejs-game-ui-designer` (majidmanzarpour/threejs-game-skills, MIT): HUD/menu workflow, state
  inventory and UI patterns for three.js games. It mentions that pack's Gemini/Tripo generators, which
  aren't installed: use the project's own art pipeline, after stating the cost.

## Not verifiable headless

Real keyboards, real vibration, notch insets on hardware, wake lock. Say so and ask the user to test on a phone.
