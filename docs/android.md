# Android build for the AYN Thor

Ashfall runs on the AYN Thor (Android 13, dual screen: 6" 1920x1080 top screen, 3.92" 1240x1080 touch bottom
screen, built-in controller) as an APK that hosts the web build in an Android `WebView`. The game code is the same
as the browser build; a thin host layer connects it to the device. Layout and build follow felixarvid2/thor-survivors
(plain Java, no dependencies, minSdk 29, targetSdk 35, committed `debug.keystore`).

## Layout

- `android/` a Gradle project (`settings.gradle`, `gradlew`, `app/`), package `se.felixarvid.ashfall`.
- `android/app/src/main/assets/www/` the Vite build (generated, gitignored).
- `android/app/src/main/assets/panel/` the bottom-screen page (hand-written HTML/CSS/JS, committed).
- `src/core/host.ts` the game side of the host API below.
- `npm run build:android` builds the web game into `www/`, runs Gradle and copies the APK to
  `dist-android/ashfall-thor.apk` (gitignored). Needs the Android SDK (`android/local.properties` with `sdk.dir`,
  or `ANDROID_HOME`). The release workflow builds it too and attaches `ashfall-vX.Y.Z-thor.apk` to the release.

## Serving the game

The WebView never loads `file://`. `MainActivity` serves `assets/www/` on `https://appassets.androidplatform.net/`
through `shouldInterceptRequest` with a Content-Type per extension (`.js` → `text/javascript`, `.wasm` →
`application/wasm`, json, css, html, glb, ktx2, png, webp, jpg, ogg, mp3, wav, woff2, svg, txt) and supports
byte-range requests. The origin is fixed, so `localStorage` (saves, account) persists between runs.
WebSettings: JavaScript, DOM storage, media without a user gesture, text zoom 100, no zoom controls.
The activity is landscape, immersive sticky, keeps the screen on and is hardware accelerated.

## Host API

The Java side injects `window.AshfallAndroid` (`addJavascriptInterface`) before the page runs. Its presence is how
the game knows it runs on the Android host.

Java → game (via `evaluateJavascript`, ignored when the function is missing):

- `window.__ashfallPad(connected: boolean, name: string, axes: number[4], buttons: number[17])` on every controller
  change. Standard Gamepad mapping: axes `[lx, ly, rx, ry]` in -1..1 with +y down; buttons 0 A, 1 B, 2 X, 3 Y,
  4 LB, 5 RB, 6 LT, 7 RT (analog 0..1), 8 Select, 9 Start, 10 L3, 11 R3, 12-15 D-pad up/down/left/right, 16 Home.
  The Activity consumes controller key and motion events, so the WebView's own Gamepad API never sees them.
- `window.__ashfallCommand(name: string)` from the system Back button (`'back'`) and the bottom-screen panel:
  `'back'`, `'pause'`, `'inventory'`, `'character'`, `'skills'`, `'quests'`, `'map'`, `'potion'`, `'flare'`,
  `'mount'`, `'pickup'`. `'back'` does what Escape does (close the top panel, else open the pause menu).

Game → Java (methods on `window.AshfallAndroid`, all `@JavascriptInterface`, all optional to call):

- `platform(): string` returns `"android"`; `secondScreen(): boolean` whether the bottom panel is up.
- `rumble(strong: number, weak: number, ms: number)` vibrates the controller (or the device) when haptics are on.
- `panelState(json: string)` at most 4 times a second: `{ hp, hpMax, res, resMax, resName, level, xpPct, zone,
  gold, potions, potionsMax, inGame }`. The Activity forwards it to the bottom screen.

Game behaviour on the host: no touch controls overlay (the device has a controller and the bottom panel; taps on
the top screen still click), the pad source is `__ashfallPad` instead of `navigator.getGamepads()`, rumble goes to
`rumble`.

## Bottom screen

`DualScreenManager` finds a second display (`DisplayManager.getDisplays(DISPLAY_CATEGORY_PRESENTATION)`) and shows
`PanelPresentation`, an `android.app.Presentation` holding a second WebView with `assets/panel/index.html`. If the
Presentation cannot be shown, `SecondaryActivity` is launched on that display instead (thor-survivors needed this
fallback on the device). Every step fails quietly: the game always runs on the top screen.
The panel shows HP, resource, level/XP, zone, gold and potions from `window.__panel(state)` and buttons (Inventory,
Character, Skills, Quests, Map, Potion, Flare, Mount, Pause) that call `AshfallPanel.command(name)`, which the
Activity forwards to the game as `__ashfallCommand(name)`. Controller events that reach the panel window are
routed to the game too.

## Not testable in the cloud

There is no emulator (no KVM). Checks: the APK builds, `aapt dump badging` shows the package and activity, the APK
contains `assets/www/index.html` and everything it references, vitest covers the host bridge, and a headless browser
run against the built `www/` with a mocked `window.AshfallAndroid` covers pad input, commands and the hidden touch
overlay. Untested until it runs on a Thor: the Presentation path, real controller routing, WebGL performance, audio.
