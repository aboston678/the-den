# Third-party assets and licenses

Every model, texture, HDRI, sound or font not made in this repo goes here.

| Asset | Used for | Source (URL) | License | Notes |
|---|---|---|---|---|
| allen-weiss.mp3 | Menu + loading music | Andrew's own Suno track | Andrew's | 3:13 |
| bear-concept-1..4.png | Bear concept art (milestone 1.2) | Generated with Higgsfield `gpt_image_2_5` | Andrew's (own generation) | `assets/concepts/bear/` |
| bear-base-original.glb | The player bear source: mesh, PBR textures, rig, Idle (milestone 1.3) | Generated with Higgsfield `meshy_v7_image_to_3d` from bear-concept-4 (job 53f8fc92) | Andrew's (own generation) | `assets/models/bear/` |
| clips/*.glb | 14 bear animation clips (milestones 1.4–1.5), stripped to skeleton + animation | Higgsfield `meshy_rigging`; job IDs + URLs in `assets/models/bear/clips/manifest.json` | Andrew's (own generation) | `assets/models/bear/clips/` |
| bear.glb | The game's bear: fattened, 15 retargeted clips, meshopt + WebP (`npm run build:bear`) | Built from the two rows above | Andrew's | `client/public/models/` |
