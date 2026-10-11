# PROGRESS: The Den

Claude Code updates this file after every milestone: tick the box, add a short note, and say what's next.
**[ANDREW APPROVES]** = stop, show Andrew, and wait for his OK.

**Current status:** 1.4 done. 1.5 starting: Andrew OK'd the remaining clips (~96 credits).

---

## Phase 1: Walk the property with friends
Goal: Andrew sends friends a link; everyone makes or joins a party, loads in at the driveway, walks into the house, opens doors, roars, dances, and watches day turn to night.

- [x] **1.1 Project setup.** Monorepo (`client`/`server`/`shared`), TypeScript, Vite + React + React Three Fiber + Rapier, Colyseus server, Vitest, Playwright smoke test that opens the page and screenshots it, `npm run dev` runs everything, `.env.example`, `.gitignore`, pushed to GitHub.
  - Done 2026-10-11. Colyseus 0.18 (core + ws-transport), Vite 8, React 19, R3F 9, Rapier, TypeScript 7. `npm run dev` starts both; `npm test` (10 unit tests) and `npm run test:e2e` (page renders + connects; two browsers share a party) pass. Placeholder scene: ground, sky, physics capsule as the bear stand-in.
- [x] **1.2 Bear concept.** 4 concept images (`gpt_image_2_5`, ~1 credit total). **[ANDREW APPROVES]** the pick.
  - Done 2026-10-11. Andrew picked **#4** (`assets/concepts/bear/bear-concept-4.png`, Higgsfield job a8521404-145d-4cf5-b29d-7e841a83eea8): widest arm gap for rigging.
- [x] **1.3 Bear 3D model.** `meshy_v7_image_to_3d` with texture, PBR, A-pose, rig, Idle (47.5 credits; ask first). Turntable viewer page. **[ANDREW APPROVES]** the look.
  - Done 2026-10-11. Andrew approved the look and asked for "a little fatter": `tools/fatten-bear.mjs` widens the torso 22% (+15% belly) in the mesh only, skeleton untouched, so clips still fit. Source kept at `assets/models/bear/bear-base-original.glb`; game uses `client/public/models/bear-base.glb`. Before/after: `assets/concepts/bear/bear-fatter-*.png`. Viewer: `/viewer.html`.
- [x] **1.4 Rig test.** 2 extra clips (Casual_Walk 30, RunFast 16; 16 credits). Prove the clips play on ONE skinned mesh in three.js. If not, stop and explain.
  - 2026-10-11: clips do NOT drop straight onto our bear: every Higgsfield re-rig places joints differently (up to 23° / 15 cm vs our bear; walk vs run rigs differ ~5° / 2 cm). Fix (no credits): `tools/retarget-clip.mjs` converts each clip onto our skeleton so the mesh bends exactly like the clip's own rig (mean ~2 cm vs reference, about half the naive-copy error). Verified numerically (`tools/verify-retarget.mjs`) and visually (`assets/concepts/bear/rigtest/`). Clip sources stripped to skeleton+animation (`assets/models/bear/clips/`). Andrew approved the approach (and the fatter bear) 2026-10-11.
- [ ] **1.5 All bear clips.** Remaining clips from GAME_SPEC §5.2 (~12 × 8 = ~96 credits; ask first). Show preview-GIF choices for the "preview first" clips. **[ANDREW APPROVES]** walk and dance picks. Merge and compress into one `bear.glb`.
- [ ] **1.6 Character controller.** Test ground, third-person camera with wall avoidance, WASD/Shift/Space, mouse look, Y roar, B dance, smooth blending, no foot sliding.
- [ ] **1.7 Multiplayer.** Colyseus party rooms, 5-character codes, create/join, max 6, host hand-off, synced movement/animations, interpolation, name tags, bumping, reconnect. Two-browser test.
- [ ] **1.8 Outdoor map.** 300 × 300 m terrain with the slope, lawn clearing, forest, driveway from the NW spawn, stone walls, boulder, stream, dock with the rod bucket (static for now), trail, perimeter. Screenshot tour. **[ANDREW APPROVES]**
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

## Decision log
| Date | Decision | Why |
|---|---|---|
| 2026-10-11 | Upright two-legged grizzly only (no all-fours mode) | Higgsfield's rig and animation library is two-legged only |
| 2026-10-11 | House built at 1.25× real scale | 2.1 m bear must fit through doors; third-person camera needs room indoors |
| 2026-10-11 | Vercel (site) + Railway (multiplayer server) + Supabase (accounts/DB) | Vercel can't run an always-on WebSocket game server |
| 2026-10-11 | Google sign-in, no guest mode | Leaderboard + friends need real accounts; no passwords to manage |
| 2026-10-11 | Dogs on the main floor only | Dog pathfinding on stairs isn't worth the complexity |
| 2026-10-11 | Bear made fatter in code (torso +22%, belly +15%) instead of regenerating | Andrew wanted it a little fatter; reshaping the mesh keeps the same skeleton and costs no credits |
| 2026-10-11 | Every extra animation clip is retargeted onto the base bear's skeleton (`tools/retarget-clip.mjs`) | Higgsfield re-rigs per clip with different joint placement; straight copying bends the wrong spots. GAME_SPEC §5.1 updated |
| 2026-10-11 | Basement stairs moved under the main staircase; new basement stair landing; bowling lanes shifted ~6 m east (x 22→28); back hall became a pantry | Andrew: the real stairs start under the stairs going up. Lanes had to move so the stairs don't land on the approach |

## Session notes
(Newest first. 1–3 lines per session: what got done, what's next, anything Andrew needs to do.)

- **2026-10-11 · Session 1 (cont.).** Andrew OK'd the Phase 1 asks. Floorplan answers: pink sitting room = the common area (confirmed); downstairs bedroom is on the far east side next to the Catan room (matches the plan); basement stairs start right under the main stairs in the foyer and go down the opposite way (NOT the back hall). Andrew approved the fix; `floorplan.json` + `floorplan.png` updated (see decision log).
- **2026-10-11 · Session 1.** Project lives in `~/Projects/the-den`, private repo github.com/aboston678/the-den. Higgsfield checked: 1,210 credits (Plus). Milestone 1.1 done and pushed. Next: 1.2 bear concepts. Andrew to answer the floorplan questions (is the pink room the "little common area"? where do the basement stairs start? which side is the downstairs bedroom?).
