---
name: free-game-asset-pipeline
description: Find, verify and import free (CC0) 3D models, textures, HDRIs, UI icons, sound effects and music into a web game, and keep paid AI generation (Meshy, FLUX) under budget. Use when a game needs new assets without paid generation, when sourcing from Kenney/Quaternius/Poly Haven/ambientCG, or before any paid asset generation.
---

# Free asset pipeline for a web game

## Sources that worked (all CC0)

- **Kenney** (kenney.nl): models, UI, and audio packs (Sci-Fi Sounds, Impact, Interface, Digital, RPG, UI Audio,
  Music Jingles). Pack pages link a zip; grep the page for the `.zip` URL.
- **Quaternius** (quaternius.com): rigged, animated enemies and modular kits. Downloads are Google Drive
  folders: fetch the folder page with curl to find file ids, then download per file with
  `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t` (folder zips fail).
  Some packs' License.txt headers name the wrong pack — record the pack page's CC0 statement in the credits.
- **Poly Haven** (API works): models, PBR textures, HDRIs. **ambientCG**: `https://ambientcg.com/get?file=<ID>_1K-JPG.zip`.
- **Abstraction Music Loop Bundle** (tallbeard.itch.io): CC0 loops (credit appreciated).
- Blocked here: poly.pizza (Cloudflare). Skip anything with no licence file or a credit-only notice you can't meet.

## Import

1. Keep downloads in a gitignored source folder (`assets-src/third-party/…`, env override for the path); the
   build must never depend on `/tmp` or another repo's checkout. Copy only the files you use, plus each
   pack's licence, into an **assets repo** so a fresh clone can rebuild.
2. Models: convert `.gltf`(+bin) to `.glb` with gltf-transform, hand-write the manifest entry (source
   external, credit, placeholder), run the optimizer. Map clip names onto the game's animation states; skinned
   models usually skip normalisation, so scale them in the enemy data. Models without a death clip need a
   code-driven fade-and-shrink death.
3. **Style match**: flat low-poly packs next to PBR models clash. Use them only where a material treatment hides
   the style (emissive "light creature" look: dark body + bright fresnel rim; check contrast on the actual ground
   colour — full emissive turns into white blobs under bloom).
4. Credits row per pack in `docs/credits.md` (and in-game when the licence asks for credit).

## Audio specifics

- ffmpeg pipeline: SFX mono, trimmed, peak-normalised, packed into **one sprite** (fewer files to publish);
  music loudnorm to ~-16 LUFS; ship **Ogg + MP3** and pick with `canPlayType` (Safari).
- MP3 adds encoder delay (1105 samples with LAME): drop it from the sprite and verify offsets by decoding back;
  set loop points to the source's true length so loops have no gap.
- A generated catalog (ids → file, clips, bus, gain) with a test that every id exists and clips don't overlap.

## Paid generation guardrails (Meshy, FLUX/fal)

- Never delegate paid runs. Dry-run first (`--dry`), state the cost to the user, run only after a yes.
- Keep a spend ledger and a hard budget in the script; restrict runs to the exact keys (`--only a,b,c`) — in a
  fresh container the raw cache is empty and a plain run would regenerate everything.
- A post-processing step that rewrites a generated file list from what exists locally will drop entries when the
  cache is missing: merge with the previous list instead.
- API keys only in `.env` (gitignored); scan staged diffs for key patterns before every commit.
