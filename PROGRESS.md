# PROGRESS: The Den

Claude Code updates this file after every milestone: tick the box, add a short note, and say what's next.
**[ANDREW APPROVES]** = stop, show Andrew, and wait for his OK.

**Current status:** 1.8 done (Andrew approved, with denser woods and the lawn raised under the deck's east end). Now: 1.9 house shell.

---

## Phase 1: Walk the property with friends
Goal: Andrew sends friends a link; everyone makes or joins a party, loads in at the driveway, walks into the house, opens doors, roars, dances, and watches day turn to night.

- [x] **1.1 Project setup.** Monorepo (`client`/`server`/`shared`), TypeScript, Vite + React + React Three Fiber + Rapier, Colyseus server, Vitest, Playwright smoke test that opens the page and screenshots it, `npm run dev` runs everything, `.env.example`, `.gitignore`, pushed to GitHub.
  - Done 2026-10-11. Colyseus 0.18 (core + ws-transport), Vite 8, React 19, R3F 9, Rapier, TypeScript 7. `npm run dev` starts both; `npm test` (10 unit tests) and `npm run test:e2e` (page renders + connects; two browsers share a party) pass. Placeholder scene: ground, sky, physics capsule as the bear stand-in.
- [x] **1.2 Bear concept.** 4 concept images (`gpt_image_2_5`, ~1 credit total). **[ANDREW APPROVES]** the pick.
  - Done 2026-10-11. Andrew picked **#4** (`assets/concepts/bear/bear-concept-4.png`, Higgsfield job a8521404-145d-4cf5-b29d-7e841a83eea8): widest arm gap for rigging.
- [x] **1.3 Bear 3D model.** `meshy_v7_image_to_3d` with texture, PBR, A-pose, rig, Idle (47.5 credits; ask first). Turntable viewer page. **[ANDREW APPROVES]** the look.
  - Done 2026-10-11. Andrew approved the look and asked for "a little fatter": `tools/fatten-bear.mjs` widens the torso 22% (+15% belly) in the mesh only, skeleton untouched, so clips still fit. Source kept at `assets/models/bear/bear-base-original.glb`; game now uses `client/public/models/bear.glb` (built in 1.5). Before/after: `assets/concepts/bear/bear-fatter-*.png`. Viewer: `/viewer.html`.
- [x] **1.4 Rig test.** 2 extra clips (Casual_Walk 30, RunFast 16; 16 credits). Prove the clips play on ONE skinned mesh in three.js. If not, stop and explain.
  - 2026-10-11: clips do NOT drop straight onto our bear: every Higgsfield re-rig places joints differently (up to 23° / 15 cm vs our bear; walk vs run rigs differ ~5° / 2 cm). Fix (no credits): `tools/retarget-clip.mjs` converts each clip onto our skeleton so the mesh bends exactly like the clip's own rig (mean ~2 cm vs reference, about half the naive-copy error). Verified numerically (`tools/verify-retarget.mjs`) and visually (`assets/concepts/bear/rigtest/`). Clip sources stripped to skeleton+animation (`assets/models/bear/clips/`). Andrew approved the approach (and the fatter bear) 2026-10-11.
- [x] **1.5 All bear clips.** Remaining clips from GAME_SPEC §5.2 (~12 × 8 = ~96 credits; ask first). Show preview-GIF choices for the "preview first" clips. **[ANDREW APPROVES]** walk and dance picks. Merge and compress into one `bear.glb`.
  - Done 2026-10-11. Andrew's picks from previews: W1 Casual_Walk, R1 RunFast (kept), D1 All_Night_Dance, F1 Pull_Radish (reel), B1 Crouch_Charge_and_Throw (bowl). `npm run build:bear` -> `client/public/models/bear.glb`: 5.9 MB, 15 clips (Idle, Walk, Run, Jump, Roar, OpenDoor, Pet, SitDown, SitIdle, StandUp, Cast, Celebrate, Dance, Reel, Bowl), meshopt + WebP. All clips checked on the built bear (`assets/concepts/bear/bear-all-clips.png`). Notes for 1.6: Jump lifts the hips 0.8 m (strip or sync with physics); SitDown/StandUp/Cast end lowered/shifted (blend carefully); Dance sways ~1 m sideways. Pet and Bowl still need trimming (2.3 / 3.2).
- [x] **1.6 Character controller.** Test ground, third-person camera with wall avoidance, WASD/Shift/Space, mouse look, Y roar, B dance, smooth blending, no foot sliding.
  - Done 2026-10-11. Code in `client/src/game/` (player, camera, input, test ground). Verified by `e2e/controller.spec.ts`: walk 2.4 / sprint 6 m/s, jump ~1.1 m, roar (3 s cooldown) and dance cancel on move, camera pulls in for walls, walk foot slide 0.23 m/s. Known: RunFast is stylised so sprint feet slide (~4 m/s, less visible at speed; a different run clip would fix it); walk speed lowered to 1.8 m/s on Andrew's call (clip now plays 2.5× its natural pace); roar sound waits for audio (1.10); roar camera shake for nearby bears comes with multiplayer (1.7). Later fixes (2026-10-11): ground flicker handled with coyote time + drop-based falling; bear waits for floor colliders on load and is lifted back if it ever ends up inside a floor (was sinking up to 1.5 m in ~half of page loads). Dev helpers: `window.__den` (state, `teleport(x,z)`, live-tunable `clip` timings), `?party=name` picks a room.
- [x] **1.7 Multiplayer.** Colyseus party rooms, 5-character codes, create/join, max 6, host hand-off, synced movement/animations, interpolation, name tags, bumping, reconnect. Two-browser test.
  - Done 2026-10-11. Lobby (create/join by code, party list, host-only Play), server-clamped 20 Hz poses, interpolated remote bears with animations, name tags (fade by 30 m, hidden behind walls), solid bumping + shove, roar shakes nearby cameras, page reload rejoins within 30 s (retries for a few seconds), host hand-off. Tests: 39 unit + 14 browser, full suite green twice in a row. Earlier flaky tests were test timing (code read before it arrived; 0.5 s shake missed between polls), now fixed. Screenshots: `docs/screenshots/1.7/`.
- [x] **1.8 Outdoor map.** 300 × 300 m terrain with the slope, lawn clearing, forest, driveway from the NW spawn, stone walls, boulder, stream, dock with the rod bucket (static for now), trail, perimeter. Screenshot tour. **[ANDREW APPROVES]**
  - Done 2026-10-11; Andrew approved after two changes: denser woods, and the lawn rising to ~2 m under the deck's east end. Layout + ground math in `shared/src/world/` (unit-tested): driveway 166 m from the NW spawn to the garage apron, trail 96 m, stream ~105 m east with a 3 m wadeable shelf, dock + rod bucket, lawn clearing, front lawn level / back lawn at basement level. Client in `client/src/game/world/property/`: textured terrain (5 CC0 textures) + Rapier heightfield, asphalt driveway, moving water, dock with invisible rails, dry-stone walls + apron retaining wall, ~2,500 EZ-Tree trees in 6 kinds × 3 detail levels plus saplings, ferns, mossy rocks, logs, stumps, rhododendrons, the front boulder; invisible boundary; white placeholder block for the house. Sun shadows follow the bear. 60 fps here; ~13 MB of new assets. `?world=test` keeps the 1.6 test field for the controller/multiplayer tests. Tests: `e2e/property.spec.ts` (spawn, boundary, wading, dock, walls) + `e2e/tour.spec.ts` (screenshots).
- [ ] **1.9 House shell.** From `docs/floorplan.json` at 1.25×: exterior matching the photos, every room, stairs, railings, windows, base materials per room, porch, deck, greenhouse shell, garage, basement den + bowling room shell. All doors open/close with E (synced); garage doors roll up. Screenshot tour of every room. **[ANDREW APPROVES]**
- [ ] **1.10 Day/night + lights + audio.** 68-minute synced cycle, sky/sun/moon, exterior lights at dusk, interior lights always on, flashlight (F), ambient sound by time of day, positional stream audio.
- [ ] **1.11 Menus.** Click-to-enter splash, loading screen (keyframe image + `kling3_0` video, ~20 credits per try; ask first) with the song, Fortnite-style home screen (rotating bear, party lineup, create/join, code display), settings, pause menu, HUD prompts. **[ANDREW APPROVES]** the loading video and home screen.
- [ ] **1.12 Performance.** Graphics presets (Auto/Low/Medium/High), budgets from GAME_SPEC §17, check frame times.
- [ ] **1.13 Deploy.** Walk Andrew through Vercel + Railway setup, deploy, then Andrew and one friend test from two different computers. **[ANDREW APPROVES]** 🎉

## Phase 2: The house comes alive
- [ ] **2.1 Furnish the main floor** from the photos. **[ANDREW APPROVES]**
- [ ] **2.2 Furnish upstairs, basement den, greenhouse** (winter stockpile + canoe), **TVs** with the two images. **[ANDREW APPROVES]**
- [ ] **2.3 Dogs.** Find animated dog models (free first, else 2–3 purchase links; **[ANDREW APPROVES]** any purchase). Merlin, Raptor, Luna: wander, pet (E), follow/stay (G), barks.
- [ ] **2.4 Fishing.** Rod bucket, cast, 10–45 s bites, spam-R tension reeling, 5 species, catch card, synced for everyone.
- [ ] **2.5 Google sign-in.** Supabase project + Google login (walk Andrew through it), usernames, profiles.
- [ ] **2.6 Friends + leaderboard.** Friend requests, leaderboard tabs (All/Friends), fish caught live; bowling and Catan columns ready.
- [ ] **2.7 Deploy + friend test.**

## Phase 3: Bowling alley
- [ ] **3.1 Build the alley:** 2 lanes, gutters, ball return, rack, pinsetter, overhead monitors, lounge.
- [ ] **3.2 Physics + throw controls:** position/aim/throw, spin and late hook, tuned until it feels like Wii Bowling.
- [ ] **3.3 Turns, scoring (unit-tested), sync, celebrations.**
- [ ] **3.4 High score to leaderboard. Deploy + friend test.** **[ANDREW APPROVES]**

## Phase 4: Catan
- [ ] **4.1 Rules engine** in `/shared` with thorough unit tests.
- [ ] **4.2 Table + board presentation,** sitting/standing at the 4 dining chairs, board camera.
- [ ] **4.3 Turn UI:** build, trade (players, bank, harbors), development cards, robber, discards.
- [ ] **4.4 Multiplayer, reconnect, spectators, wins to leaderboard. Deploy + friend test.** **[ANDREW APPROVES]**

## Phase 5: Polish
- [ ] **5.1 Sound pass.**
- [ ] **5.2 Visual polish** (fireflies, fog, grass, small details).
- [ ] **5.3 Performance** on the slowest friend's laptop.
- [ ] **5.4 Bug bash** with friends.

---

## Higgsfield credit ledger
Starting balance: 1,210 (2026-10-11)

| Date | What | Model | Credits | Balance |
|---|---|---|---|---|
| 2026-10-11 | 1.2 bear concepts ×4 (price check said 0.25 = per image) | `gpt_image_2_5` | 1 | 1,209 |
| 2026-10-11 | 1.3 bear 3D model: texture + PBR + A-pose + rig + Idle (job 53f8fc92) | `meshy_v7_image_to_3d` | 47.5 | 1,161.5 |
| 2026-10-11 | 1.4 rig test: Casual_Walk (job f68116cc) | `meshy_rigging` | 8 | 1,153.5 |
| 2026-10-11 | 1.4 rig test: RunFast (job 2e64ab6a) | `meshy_rigging` | 8 | 1,145.5 |
| 2026-10-11 | 1.5 clip Jump: Regular_Jump (466), job 14064a5c-016a-4ee0-abeb-6abdf8db9ae4 | `meshy_rigging` | 8 | 1,137.5 |
| 2026-10-11 | 1.5 clip Roar: Chest_Pound_Taunt (88), job dd00d07f-b877-499e-b04f-be24809d4c34 | `meshy_rigging` | 8 | 1,129.5 |
| 2026-10-11 | 1.5 clip OpenDoor: open_door (285), job c5ac366b-221f-4998-87d4-9abcc4f3cad9 | `meshy_rigging` | 8 | 1,121.5 |
| 2026-10-11 | 1.5 clip Pet: Male_Bend_Over_Pick_Up (276), job 89d34e38-f335-4a17-98b4-dc151d0aa1de | `meshy_rigging` | 8 | 1,113.5 |
| 2026-10-11 | 1.5 clip SitDown: Stand_to_Sit_Transition_M (57), job bca00fd0-ac79-4fe1-ba4c-0956d02e85d2 | `meshy_rigging` | 8 | 1,105.5 |
| 2026-10-11 | 1.5 clip SitIdle: Chair_Sit_Idle_M (33), job 7858fcee-7009-4133-90e3-75b5d9a7c7f1 | `meshy_rigging` | 8 | 1,097.5 |
| 2026-10-11 | 1.5 clip StandUp: Sit_to_Stand_Transition_M (53), job d03156b0-6e0a-4ae7-bb34-9cef7140e070 | `meshy_rigging` | 8 | 1,089.5 |
| 2026-10-11 | 1.5 clip Cast: Over_Shoulder_Throw (421), job 9d036e2c-5e16-480d-9c41-fbdc38f2feef | `meshy_rigging` | 8 | 1,081.5 |
| 2026-10-11 | 1.5 clip Celebrate: Cheer_with_Both_Hands_Up (298), job 99679e22-9751-4f85-9697-15e0f05e80fb | `meshy_rigging` | 8 | 1,073.5 |
| 2026-10-11 | 1.5 clip Dance: All_Night_Dance (64), job cbffae5d-c782-486e-b585-b91ecaa50697 | `meshy_rigging` | 8 | 1,065.5 |
| 2026-10-11 | 1.5 clip Reel: Pull_Radish (283), job b6aded48-d6b0-4187-9ef8-eda9e3c01b80 | `meshy_rigging` | 8 | 1,057.5 |
| 2026-10-11 | 1.5 clip Bowl: Crouch_Charge_and_Throw (398), job df8b6572-694e-47b5-ad16-f1783887eb13 | `meshy_rigging` | 8 | 1,049.5 |

## Decision log
| Date | Decision | Why |
|---|---|---|
| 2026-10-11 | Upright two-legged grizzly only (no all-fours mode) | Higgsfield's rig and animation library is two-legged only |
| 2026-10-11 | House built at 1.25× real scale | 2.1 m bear must fit through doors; third-person camera needs room indoors |
| 2026-10-11 | Vercel (site) + Railway (multiplayer server) + Supabase (accounts/DB) | Vercel can't run an always-on WebSocket game server |
| 2026-10-11 | Google sign-in, no guest mode | Leaderboard + friends need real accounts; no passwords to manage |
| 2026-10-11 | Dogs on the main floor only | Dog pathfinding on stairs isn't worth the complexity |
| 2026-10-11 | Walk speed 2.4 → 1.8 m/s (GAME_SPEC §5.3) | The walk clip had to play 3.4× fast to reach 2.4 m/s and looked hurried; Andrew chose the slower walk |
| 2026-10-11 | Bear made fatter in code (torso +22%, belly +15%) instead of regenerating | Andrew wanted it a little fatter; reshaping the mesh keeps the same skeleton and costs no credits |
| 2026-10-11 | Every extra animation clip is retargeted onto the base bear's skeleton (`tools/retarget-clip.mjs`) | Higgsfield re-rigs per clip with different joint placement; straight copying bends the wrong spots. GAME_SPEC §5.1 updated |
| 2026-10-11 | Bear textures shipped as WebP for now; KTX2 deferred to 1.12 | KTX2 encoder (toktx) isn't installed on this Mac and the bear is one shared 3-texture set; revisit with the house's many textures |
| 2026-10-11 | Trees are EZ-Tree (MIT) baked offline into 3 detail levels; ground/rock/fern assets are CC0 Poly Haven, kept out of git and re-downloadable (`npm run build:outdoor`) | Poly Haven's trees are 8–17 million triangles each; EZ-Tree gives ~7k / 3k / 800-triangle versions of the same tree |
| 2026-10-11 | Scenery (ground, trees, stream) continues ~30 m past the 300 m map edge, outside the invisible boundary | Hides the edge of the world in trees and haze |
| 2026-10-11 | Back lawn at basement level by the den's doors, rising to ~2 m below the deck at its east end (GAME_SPEC §4 updated) | At 1.25× the basement floor is 3.4 m down and must open onto the lawn; Andrew chose to bring the lawn up under the deck's east end (option b) |
| 2026-10-11 | Woods made denser (~1 tree per 22 m², up from ~40) | Andrew: "more dense"; still 60 fps |
| 2026-10-11 | Basement stairs moved under the main staircase; new basement stair landing; bowling lanes shifted ~6 m east (x 22→28); back hall became a pantry | Andrew: the real stairs start under the stairs going up. Lanes had to move so the stairs don't land on the approach |

## Session notes
(Newest first. 1–3 lines per session: what got done, what's next, anything Andrew needs to do.)

- **2026-10-11 · Session 2 (cont.).** 1.8 outdoor map built (CC0 downloads approved by Andrew, no credits spent). Andrew approved with denser woods + deck option (b), both done. Next: 1.9 house shell.

- **2026-10-11 · Session 2.** Finished 1.7 multiplayer: fixed two flaky browser tests and a hanging server-test shutdown, made reload-rejoin retry, two-browser screenshots in `docs/screenshots/1.7/`. Next: 1.8 outdoor map.

- **2026-10-11 · Session 1 (cont. 4).** Walk speed 1.8 m/s (Andrew). Fixed bear sinking into floor on load. 1.7 multiplayer mostly built (see status). Session ended at usage limit.
- **2026-10-11 · Session 1 (cont. 3).** 1.6 done: the bear walks/sprints/jumps/roars/dances on a test field with a third-person camera. Fixed a physics timing bug that lost ~15% of movement. Next: 1.7 multiplayer.
- **2026-10-11 · Session 1 (cont. 2).** Milestones 1.2–1.5 done: bear concept #4, 3D model made a bit fatter in code, rig test needed a clip-conversion step (approved), all 15 clips built into `bear.glb`. Floorplan v2 (basement stairs). Credits: 1,049.5 left (160.5 spent). Next: 1.6 character controller.
- **2026-10-11 · Session 1 (cont.).** Andrew OK'd the Phase 1 asks. Floorplan answers: pink sitting room = the common area (confirmed); downstairs bedroom is on the far east side next to the Catan room (matches the plan); basement stairs start right under the main stairs in the foyer and go down the opposite way (NOT the back hall). Andrew approved the fix; `floorplan.json` + `floorplan.png` updated (see decision log).
- **2026-10-11 · Session 1.** Project lives in `~/Projects/the-den`, private repo github.com/aboston678/the-den. Higgsfield checked: 1,210 credits (Plus). Milestone 1.1 done and pushed. Next: 1.2 bear concepts. Andrew to answer the floorplan questions (is the pink room the "little common area"? where do the basement stairs start? which side is the downstairs bedroom?).
