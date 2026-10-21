---
name: parallel-subagent-builds
description: Split a large feature (a game region, an endgame phase, 200 UI fixes) across several subagents working in parallel in one repo without them breaking each other's work. Use when a task is big enough for 3+ implementers, when the user asks to use many subagents, or when parallel agents keep colliding.
---

# Parallel subagent builds in one working tree

The main session plans, decides, reviews and commits; subagents read, run and write and return short reports.
Model routing that worked: Haiku for search, test runs, docs and shipping; Sonnet for implementing and visual
checks; the main session (Opus) for the plan, the shared contracts and review.

## Before spawning anyone

1. **Orient cheaply**: one read-only explorer answers the questions (spec, template from the last similar
   feature, hooks in code) with file:line refs. Don't read many files in the main session.
2. **Write the plan doc** with numbers and explicit **scope cuts** (what's simplified or deferred, and why). Get
   advice on it if an advisor is available. Commit it.
3. **Write the shared contracts yourself, first** — this is what makes parallel work possible:
   - shared state in the save format (with defaults so old saves still load, no version bump per agent);
   - small entry-point modules other systems call (`tierMods`, `grantGlyph`, `grantRecipe`, …) as working
     stubs the owner later fleshes out, keeping the exported names;
   - fixed id lists (sound ids, asset ids, instance/boss ids, signal strings) every agent codes against;
   - **one override file per agent** for shared hotspots (e.g. `portrait/<area>.css` loaded after the base
     sheet) instead of everyone editing `style.css`.
   Commit, typecheck, test — then spawn.

## Each agent's brief

- What it owns (files), what others own, and the shared files it may touch minimally ("re-read right before
  every edit; add only your own entries").
- The exact ids/signals it must emit or consume; which entry points to import, not reimplement.
- "Do NOT commit." Verify with typecheck + tests; browser checks on **its own port** from a **production build +
  `vite preview`** (the HMR dev server reloads whenever another agent saves, killing runs).
- On a loaded machine: one browser at a time, longer test timeouts (`--testTimeout=60000`); timeouts under load
  are not failures if the file passes alone.
- Report in ≤15 lines: done, skipped and why, ids/signals, screenshot paths.

## While they run

- Relay cross-agent facts with a message (e.g. "your rift instances must use kind 'rift'", "emit
  `core.boss.lumen`", "call recomputePlayer after glyph upgrades").
- Agents that hit their turn limit: resume them with a short "finish X, then report" message.
- Commit a **checkpoint** whenever typecheck and tests pass, even mid-wave; never commit a tree that doesn't
  compile. Tell the user what's in flight instead of committing half-done work.
- Watch for agents running destructive git (stash, checkout of a file) — re-run the full checks afterwards.
- Run dependent work in waves: foundation APIs first (panel stack, confirm sheet), then the agents that build on
  them.

## After

- One integration agent fixes cross-area overlaps and writes a status list (done / partial / skipped with the
  reason) against the original item list.
- A playtester walks every system in a browser; a shipper publishes and opens the PR. Merge only on the user's
  word.
