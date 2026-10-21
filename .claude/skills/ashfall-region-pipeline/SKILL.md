---
name: ashfall-region-pipeline
description: How Ashfall builds a new region or a large game phase (plan, zone, enemies, content, report, ship) with its data files, tests and subagents. Use when adding a region, a dungeon set, a boss or an endgame system to Ashfall.
---

# Building a region in Ashfall

Template: the last region built (Deep Mines → The Core). Ask `Explore` for its anatomy before planning.

## Phases

- **Plan** `docs/regions/<region>.md`: map (design coords ×2.2 = 1500 m), subzones with level bands, hazard,
  POIs, an enemy table (40–60 % returning types), dungeons, stronghold, region boss, quests, hub, engine work,
  assets, build order, and **scope decisions** (simplified/deferred and why). Commit it.
- **A – zone**: `src/data/zones/<region>.ts` (ZoneDef, levels, subzones, roads, props, packs, POIs, teleporters),
  gate from the previous region (quest-gated via `requires`), walkability (`caves` grid), hazards as env
  features with pure step functions, renderer special cases, the wiring list: `zones/index.ts` +
  `tests/zones.test.ts`, `data/audio.ts`, decals, art files, world events, region card, minimap, region report
  mode, e2e zone scenario. Tests `tests/region<N>.test.ts`.
- **B – enemies**: defs in `enemies.ts` with `family` (drives death sounds) and `look` (shade/lumen variants of
  existing models); behaviours in a region AI module; packs swapped to the roster.
- **C – content** (3 agents in parallel): quests/NPCs/events (`content`), dungeons + stronghold + minibosses,
  region boss + epilogue. Fix the shared ids and **signal strings** up front (`dungeon.<id>`, POI ids,
  `<stronghold>.id`, boss objective) and relay them between agents.
- **D – report**: `npm run region:report -- <mode>`, `docs/regions/<region>-playtest.md`, playtester passes
  (instances; stronghold + boss + ending), fixes, docs (PROGRESS, decisions), boss portraits/region art via
  `npm run art:generate -- --only …` after stating the cost, artifact, PR.

## Gotchas

- A new zone needs its art (region painting, map) or `tests/art.test.ts` must skip it explicitly.
- Bosses on `dt.boss` require a portrait; use another drop table until art exists.
- Lighting: a "lit" zone needs hemisphere/grade/fog values; check readability of enemies on the zone's ground.
- Check the boss is on screen from where the player fights it (camera shows ~20 m).
- `npx tsc --noEmit -p .` and `npx vitest run` must pass before any commit (`--testTimeout=60000` under load).
