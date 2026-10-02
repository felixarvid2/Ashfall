# Ashfall — Progress

> Read this first at the start of every session. Full design brief: [docs/design-brief.md](docs/design-brief.md).

## Current phase

**Phase 0 – Foundation: ✅ done.** Next up: **Phase 1 – Core combat** (plan to be approved first).

## Done

### Phase 0 – Foundation
- Project setup: TypeScript (strict) + Vite + Three.js + Zod + Vitest, folder layout per brief §8.3.
- `src/core/loop.ts` — fixed-timestep loop (60 Hz logic, interpolated rendering, frame clamp, `timeScale` ready for hit-stop).
- `src/core/ecs.ts` — minimal ECS (`World`, components, ordered `Scheduler`, deferred destroy).
- `src/core/input.ts` — keyboard via data-driven key bindings, mouse (NDC + buttons), wheel.
- `src/core/save.ts` — versioned saves validated with Zod, migration chain, `localStorage` store, JSON export/import.
- `src/core/rng.ts` — seeded sfc32 RNG with `fork()`, weighted picks and save/restore of state.
- Movement: WASD (camera-relative) **or** click-to-move, selectable in the debug panel (persisted in settings).
- Rendering: near-isometric follow camera (55° pitch, 45° yaw, smooth follow, wheel zoom), dark lighting with fog,
  emergency lights, Lumen glow, player light radius, shadows, falling ash particles, instanced debris (700 rocks, 1 draw call).
- Asset placeholders driven by `assets/manifest.json`: every placeholder is tied to an asset id
  (`char.bastion`, `prop.cargo_crate`, …) so Meshy models can replace them automatically in Phase 2.
- UI: English text via `src/data/lang/en.json` + `t()`; HUD hint, toasts, FPS meter, debug panel (F3 / §).
- Dev-mode data validation at startup (`src/data/validate.ts`).
- 44 unit tests (RNG, ECS, saves + migrations, i18n, movement, click-to-move, loop, data, settings).

## How to run

```bash
cd ashfall
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # typecheck + production build into dist/
```

Controls: **WASD** move · **mouse wheel** zoom · **F3** debug panel · **F5** quick save · **F9** quick load.
Switch to click-to-move in the debug panel.

## What to test (Phase 0)
1. Walk around with WASD — the camera should follow smoothly, W walks "up" the screen.
2. Scroll to zoom in/out a little.
3. Press F3, switch Movement to "Click to move", hold left mouse to walk toward the cursor.
4. F5 to save, walk away, F9 to load — you should snap back. Reload the page and F9 again.
5. Debug panel → Export, then Import the downloaded file.
6. Check the FPS meter on your machine (target: 60 FPS).

## Known issues / limitations
- No collision yet: the player walks through crates and lights (collision arrives with combat in Phase 1).
- No post-processing (bloom, vignette, colour grading) yet — planned for Phase 2 alongside real assets.
- Performance has only been measured in a headless CPU-rendered browser (≈6 FPS there, not representative);
  please report real FPS from a laptop with integrated graphics.
- Settings UI (key rebinding, text size, screen shake) is not built yet; settings exist in data and are persisted.

## Next steps
- Phase 1 plan: Bastion with 4 abilities (Heat resource), 3 placeholder enemy types with AI, damage, death,
  status effects, hit-stop, screen shake, floating damage numbers, simple collision, a test arena.
- Phase 2 needs a Meshy API key in `ashfall/.env` (or as the `MESHY_API_KEY` environment variable).
