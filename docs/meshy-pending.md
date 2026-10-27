# Meshy work waiting for credits

Assets that are not in `assets/manifest.json` (an entry nothing in the game uses fails `npm run assets:check`) but whose prompts are
worth keeping. The concept images stay in `assets/source/<id>/` (`concept.png`, `preview.png`); the world bosses use runtime variants
of other bodies meanwhile (`src/data/endgame/worldBosses.ts`).

To finish one: add the entry back to `assets/manifest.json` (fields below; the preview task is the concept image), run
`npm run meshy -- refine --ids <id>` (image to 3D with textures), then `rig` and `optimize` (or, without credits,
`npm run blender:autorig`, docs/blender.md "Rigging without Meshy", for a biped), and point the enemy at the new `assetId`.
The three below are not bipeds: they need Meshy's rig or a hand-made one, or stay unrigged with root parts.

All three: `category: "enemy"`, `source: "image"`, `targetPolycount: 15000`, status was `preview` (concept approved:
`meshy.previewApproved: true`, 6 credits spent), file `enemies/<name>.glb` once optimized.

## boss.ashen_colossus

- Preview (concept image) task: `01a17d48-8f54-731f-a8c8-e55f734b4c4d`
- `heightMeters`: 3.2
- Prompt: colossal industrial mining mech walker covered in ash and slag, two huge hydraulic claw arms, furnace glowing orange in the chest, chimney stacks on the back, heavy stomping legs
- Concept prompt: full body concept art, three-quarter front view, colossal industrial mining mech walker caked in grey ash and cooled slag, two huge hydraulic claw arms, a furnace glowing orange in its open chest, smoking chimney stacks on its back, heavy stomping legs, hazard stripes worn away, towering and menacing, dark sci-fi industrial, plain background
- Placeholder: box `#5a5048`, size 2.4 x 3.2 x 2, emissive `#ff7a2a` 0.4, facing marker `#ff7a2a`
- In the game now: `variant.ashen_colossus` (the cargo loader with parts), enemy `world_ashen_colossus`.

## boss.mother_of_spores

- Preview (concept image) task: `01a17d48-be23-712f-a570-cae6e91d759d`
- `heightMeters`: 1.9
- Prompt: monstrous swollen fungal mother creature, bloated translucent spore sacs on the back, many thin legs, a crown of fleshy fronds, glowing green veins, small spore brood clinging to it
- Concept prompt: full body concept art, three-quarter front view, monstrous swollen fungal mother creature, a bloated body with translucent glowing green spore sacs bulging on its back, many thin spindly legs, a crown of fleshy fronds around a small eyeless head, pulsing green veins, tiny spore creatures clinging to its flanks, dark sci-fi industrial, plain background
- Placeholder: sphere `#3b4a2a`, size 1.6 x 1.9 x 1.6, emissive `#7dff6a` 0.4, facing marker `#7dff6a`
- In the game now: `variant.mother_of_spores` (the spore carrier with parts), enemy `world_mother_of_spores`.

## boss.hollow_engine

- Preview (concept image) task: `01a17d48-c991-73a6-89cf-35b0e6cff75e`
- `heightMeters`: 3.5
- Prompt: giant hollow machine golem of pale gold metal and Lumen light, ring-shaped hollow torso with a floating glowing core, slow heavy limbs, ancient engraved plates, faint light leaking from seams
- Concept prompt: full body concept art, three-quarter front view, giant hollow machine golem of pale gold metal and warm Lumen light, a ring-shaped hollow torso with a glowing core floating in the empty centre, long heavy arms, thick legs, ancient engraved plates, faint golden light leaking from every seam, serene and enormous, dark sci-fi industrial, plain background
- Placeholder: capsule `#e8dcae`, size 2.2 x 3.5 x 2.2, emissive `#ffd76a` 0.4, facing marker `#ffd76a`
- In the game now: `variant.hollow_engine` (the core guardian with parts), enemy `world_hollow_engine`.
