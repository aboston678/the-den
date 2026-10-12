# Third-party assets and licenses

Every model, texture, HDRI, sound or font not made in this repo goes here.

| Asset | Used for | Source (URL) | License | Notes |
|---|---|---|---|---|
| allen-weiss.mp3 | Menu + loading music | Andrew's own Suno track | Andrew's | 3:13 |
| bear-concept-1..4.png | Bear concept art (milestone 1.2) | Generated with Higgsfield `gpt_image_2_5` | Andrew's (own generation) | `assets/concepts/bear/` |
| bear-base-original.glb | The player bear source: mesh, PBR textures, rig, Idle (milestone 1.3) | Generated with Higgsfield `meshy_v7_image_to_3d` from bear-concept-4 (job 53f8fc92) | Andrew's (own generation) | `assets/models/bear/` |
| clips/*.glb | 14 bear animation clips (milestones 1.4–1.5), stripped to skeleton + animation | Higgsfield `meshy_rigging`; job IDs + URLs in `assets/models/bear/clips/manifest.json` | Andrew's (own generation) | `assets/models/bear/clips/` |
| bear.glb | The game's bear: fattened, 15 retargeted clips, meshopt + WebP (`npm run build:bear`) | Built from the two rows above | Andrew's | `client/public/models/` |
| EZ-Tree (`@dgreenheck/ez-tree` 1.1.0) incl. its bark + leaf textures | Procedural trees for the forest (milestone 1.8), baked by `tools/build-trees.mjs` into `client/public/models/trees.glb` | https://github.com/dgreenheck/ez-tree | MIT | npm dev dependency of `client`; the textures ship inside trees.glb |
| leafy_grass, forest_leaves_02, forrest_ground_01, brown_mud_leaves_01, river_small_rocks, asphalt_02, stacked_stone_wall, weathered_planks | Outdoor ground + material textures (1.8): lawn, forest floor, forest edge, mud/trail, stream bed, driveway, stone walls (greyed), dock planks | https://polyhaven.com/textures (one page per name) | CC0 | Downloaded by `tools/fetch-polyhaven.mjs` to `assets/polyhaven/` (gitignored); built to `client/public/textures/outdoor/` by `tools/build-outdoor-textures.mjs` |
| boulder_01, rock_moss_set_01, rock_moss_set_02, dead_tree_trunk, tree_stump_01, fern_02, shrub_02, shrub_04 | Front-lawn boulder, mossy rocks, fallen logs, stumps, ferns, rhododendron/shrubs (1.8) | https://polyhaven.com/models (one page per name) | CC0 | Same download script; slimmed and packed into `client/public/models/outdoor-props.glb` by `tools/build-outdoor-props.mjs` |
