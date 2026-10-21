---
name: mobile-portrait-game-ui
description: Audit and improve a browser game's DOM UI for phones held upright (portrait) — HUD, touch controls, panels, menus. Use when asked to make a game's GUI work on mobile/portrait, to audit mobile UI, or when touch players report unreadable text, missed taps or being stuck on a screen.
---

# Mobile portrait UI for a browser game

## Audit first, then implement

1. Screenshot every state at 390×844, 360×780 and 320×640 (see headless-browser-game-checks): hub, combat with a
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

## Not verifiable headless

Real keyboards, real vibration, notch insets on hardware, wake lock. Say so and ask the user to test on a phone.
