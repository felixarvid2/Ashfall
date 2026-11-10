# Meshy work waiting for credits

Nothing is waiting. The three world bosses that were parked here (`boss.ashen_colossus`, `boss.mother_of_spores`,
`boss.hollow_engine`) are done: optimized in `assets/manifest.json` like the other 15 boss models and used directly by the
`world_*` enemies in `src/data/endgame/worldBosses.ts` (no variant, no Blender parts).

When an asset is parked again, keep its prompts and concept task ids here and its concept images in
`assets/source/<id>/`; an entry nothing in the game uses fails `npm run assets:check`, so it stays out of the manifest until
it is finished (`npm run meshy -- refine --ids <id>`, `rig`, `optimize`, then point the enemy at the new `assetId`).
