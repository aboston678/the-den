# PROGRESS: The Den

Claude Code updates this file after every milestone: tick the box, add a short note, and say what's next.
**[ANDREW APPROVES]** = stop, show Andrew, and wait for his OK.

**Current status:** Not started. Next up: milestone 1.1.

---

## Phase 1: Walk the property with friends
Goal: Andrew sends friends a link; everyone makes or joins a party, loads in at the driveway, walks into the house, opens doors, roars, dances, and watches day turn to night.

- [ ] **1.1 Project setup.** Monorepo (`client`/`server`/`shared`), TypeScript, Vite + React + React Three Fiber + Rapier, Colyseus server, Vitest, Playwright smoke test that opens the page and screenshots it, `npm run dev` runs everything, `.env.example`, `.gitignore`, pushed to GitHub.
- [ ] **1.2 Bear concept.** 4 concept images (`gpt_image_2_5`, ~1 credit total). **[ANDREW APPROVES]** the pick.
- [ ] **1.3 Bear 3D model.** `meshy_v7_image_to_3d` with texture, PBR, A-pose, rig, Idle (47.5 credits; ask first). Turntable viewer page. **[ANDREW APPROVES]** the look.
- [ ] **1.4 Rig test.** 2 extra clips (Casual_Walk 30, RunFast 16; 16 credits). Prove the clips play on ONE skinned mesh in three.js. If not, stop and explain.
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
| | | | | |

## Decision log
| Date | Decision | Why |
|---|---|---|
| 2026-10-11 | Upright two-legged grizzly only (no all-fours mode) | Higgsfield's rig and animation library is two-legged only |
| 2026-10-11 | House built at 1.25× real scale | 2.1 m bear must fit through doors; third-person camera needs room indoors |
| 2026-10-11 | Vercel (site) + Railway (multiplayer server) + Supabase (accounts/DB) | Vercel can't run an always-on WebSocket game server |
| 2026-10-11 | Google sign-in, no guest mode | Leaderboard + friends need real accounts; no passwords to manage |
| 2026-10-11 | Dogs on the main floor only | Dog pathfinding on stairs isn't worth the complexity |

## Session notes
(Newest first. 1–3 lines per session: what got done, what's next, anything Andrew needs to do.)
