# Phase 5 plan: Polish (approved by Andrew 2026-10-14)

## Context
Andrew has finished the three friend tests (2.7 walking and fishing online, 3.4 bowling online, 4.4 Catan
play-test with the prank), so Phases 1–4 are done. Phase 5 (GAME_SPEC §22) is the last phase: a sound pass,
visual polish, performance on the slowest laptop, and a bug bash.

Andrew's input:
- **Running it:** same as Phases 2–4. Build on a branch, then one review (screenshots + a short video) before it goes live.
- **Bug found while playing:** in Catan you can't leave a game you don't want to finish. He wants a vote to end it.
  - Majority wins.
  - The fix goes live right away, before the rest of Phase 5.
- **Laptops:** the slowest one is this computer, an M1 MacBook Air (2020, 8 GB), which is the spec's target machine already.
  The other two friends have a Razer gaming laptop and a PC.

**Credits:** none planned (676.75 left). Anything that turns out to need Higgsfield gets priced and asked about first.

## Step 0: bookkeeping (on `phase-4`)
- In `PROGRESS.md`:
  - Tick 2.7, 3.4 and 4.4, with the note "Andrew confirmed the friend tests, 2026-10-14".
  - Update the current status.
  - Add the Phase 5 plan line and log the decisions below in the decision log.
- Save this plan as `docs/phase-5-plan.md`. Commit and push.

## Step 1: Catan "leave" and "vote to end" (hotfix: own branch `catan-quit` from main, then live)
Today the server already has a quit message (`MSG.catanQuit`, `CatanTables.quit` in `server/src/rooms/catan.ts`,
`removePlayer` in `shared/src/catan/game.ts`), but the HUD never offers it, and you can't stand up mid-game
(`stand()` refuses, and `CatanControls.tsx` only shows "Get up" when you're not playing).

**Rules (in `/shared`, unit-tested like trade offers):**
- Add `endVote: { by: number; yes: boolean[]; no: boolean[]; until: number } | null` to the game.
- New moves through `apply()` / `parseAction()`, allowed at any phase and from any player still in:
  - `proposeEnd`: starts a vote, and counts as a yes from whoever called it.
  - `voteEnd {yes}`: one answer per player.
- **Majority:** more than half of the players still in say yes → `phase = "over"`, `winner = null`, and the log says "The table voted to end the game".
  - A tie or a majority of no clears the vote.
  - After 30 s the vote lapses; the server's `tick` clears it.
  - One vote at a time.
  - `removePlayer` recounts an open vote when someone leaves.
- `publicView` shows the vote, so every chair sees it.

**Server (`server/src/rooms/catan.ts` + `PartyRoom.ts`):**
- Route the two new actions through the existing `act` path.
- Let `stand()` work mid-game by calling `quit()` first. Getting up = leaving the game: your cards go back to the bank and your pieces stay.
- An ended-by-vote game reports `winnerId: null`. `recordCatanGame` must save no win for anyone; check it.

**HUD (`client/src/ui/CatanHud.tsx`, `ui/catan/Dialogs.tsx`):**
- A small "Leave game" button with an "Are you sure? Your cards go back to the bank" confirm.
- A "Vote to end game" button.
- A vote banner for everyone at the table: "Andrew wants to end the game: Yes / No (2 of 3 needed, 0:24)".
  - It shows the result.
  - It ends on the existing game-over card, which reads "Game ended by vote".
- E "Get up" while playing asks the same leave confirm.

**Tests:**
- Shared rules tests (vote passes, fails, ties, times out, and a leaver during a vote; 2-, 3- and 4-player counts).
- Server test (stand mid-game quits; no win saved).
- Extend `e2e/catan.spec.ts`: three bears, one leaves, the other two vote to end, everyone sees the end card, and they can get up.

**Ship:** run the full suite, fast-forward to main, check Railway `/health` and the Vercel build, then branch `phase-5` from main.

## 5.1 Sound pass (branch `phase-5`)
What's already there: ambience by time of day, stream, loons, fire, roar, fishing, bowling, dice, music and
volume sliders (`client/src/game/audio/audio.ts`, `synth.ts`, `GameAudio.tsx`).

To add:
1. **Footsteps by surface** for you and for other bears (positional), timed to the walk and run clips' footfalls, plus a landing thud after a jump.
   - Add a `floorAt(x, y, z)` that returns grass / dirt / asphalt / wood / carpet / tile / stone. It reuses:
     - `surfaceAt` (lawn, forest, mud) and `DRIVEWAY.closest` from `shared/src/world/terrain.ts`;
     - `isOnDock`;
     - `insideHouse` (`client/src/game/house/lights.ts`), extended to also return the room;
     - `styleOf(room).floor` (`client/src/game/house/style.ts`).
   - Deck, porch, greenhouse and the bowling approach get mapped by hand.
   - Other bears' footsteps use the speed and action already in `remote/RemoteBears.tsx`, only within ~20 m.
2. **Doors:** open and close (creak + latch), and the garage door's motor rumble.
   - Played where the door is, for everyone, from the synced door state in `house/Doors.tsx`.
   - The garage rumble is made in code.
3. **UI sounds:** soft click and hover on menu, settings, home-screen and Catan HUD buttons; a tick on the party-code copy.
   - One shared `uiSound()` helper in `client/src/ui/`.
4. **Catan sounds:** wooden clack when a road, settlement or city goes down, thunk for the robber, card flick when you draw or trade, little fanfare for the winner, ding when it's your turn.
5. **Other bears' fishing:** cast whoosh and reel clicks positional for everyone (today you only hear your own).
6. **Mix fixes:**
   - Bird and loon calls follow only the Ambience slider (today Effects scales them too).
   - Moving a slider changes sounds that are already playing.
   - A short volume check in every spot so nothing is much louder than the rest (bowling crash vs footsteps vs ambience).

**Sources:** Kenney.nl CC0 packs first (Impact Sounds for footsteps and thuds, Interface Sounds for UI, RPG Audio
for doors and cloth, Casino Audio for cards and wooden pieces). Anything simple gets made in code.
- **Before downloading:** I list each pack's name, source and size and wait for Andrew's OK.
- Trim and encode with the existing `tools/build-audio.mjs` (ffmpeg-static), and add the files to `SOUNDS` there.
- Record each source in `docs/ASSETS.md`.

**Tests:**
- A unit test for `floorAt` at known spots (driveway, lawn, dock, kitchen tile, den carpet).
- An e2e check using `audioState()` / `recent[]`: walking on grass then wood plays the right steps, a door plays its sound for a second bear, and UI clicks play.

## 5.2 Visual polish
Compared against `assets/concepts/style/3-driveway.png` (the look we're aiming for):
1. **Fireflies** (GAME_SPEC §9): a few hundred soft glowing points drifting and blinking over the lawn and stream edges at dusk and night.
   - One instanced draw, fewer on Low.
   - New `world/property/Fireflies.tsx`, driven by the sky clock (`sky/clock.ts`).
2. **Mist and haze:**
   - Low ground mist over the stream and lawn at dawn and dusk: a few soft drifting mist cards, faded by time of day.
   - A light blue distance haze by day so far trees soften like the concept. Tune the existing fog colours in `sky/look.ts`.
3. **Grass and flowers:**
   - Grass on the stream banks, trail edges, round the house foundation and in the clearings, not just the lawn and driveway (`world/property/Grass.tsx` masks).
   - Little wildflowers (white, yellow, purple) mixed into the edges.
   - Flower beds along the front of the house.
4. **Small details:**
   - Chimney smoke when the fire is lit.
   - Butterflies by day near the flowers.
   - Soft contact shading where the house, bushes and rocks meet the ground (cheap painted ground decals, no extra shadow cost).
   - Logs and stumps repainted in flat cartoon colours (the last realistic outdoor props, per `toonTrees.ts`).
   - Faint clapboard lines on the house siding in Cartoon mode.
   - Every new item stays within the Medium budget (under 400 draw calls, 60 fps on the M1).
- Screenshots and a short fly-through video go to Andrew with the sound pass at the Phase 5 review.

## 5.3 Performance on the slowest laptop (this M1 Air, 8 GB)
- Run `e2e/perf.spec.ts` on all 9 spots (plus any new ones for fireflies and mist), on Low and Medium at 1080p, after 5.1 and 5.2.
  - Medium must hold 60 fps and Low 30+.
  - Fix anything that slipped.
  - Check texture memory stays comfortable for 8 GB.
- Add a **Show frame rate** option in Settings: a small corner number, so the Razer and PC friends can tell Andrew how smooth it runs without any tools.
  - It uses `perfStats` from `client/src/game/PerfProbe.tsx`.
- Check that Auto picks High for the Razer's RTX chip (the rule is already in `quality.ts:67`) and that the PC lands sensibly.

## 5.4 Bug bash
- My own sweep:
  - The full e2e suite, three times, to shake out the known flaky ones (two-bear fishing bite wait, alley tour).
  - Two-browser runs of every activity.
  - Leaving or reloading in the middle of fishing, bowling and Catan.
  - Console errors in every spot.
- **[ANDREW APPROVES]** Phase 5 review: Andrew plays the branch locally, or we deploy if he prefers. Fix his notes.
- Deploy: fast-forward `phase-5` → main, check live, then one last game night with friends as the final bug bash.
  - Fixes from that go on a branch, are tested, then go live.

## Verification (every step)
- `npm test` (unit tests) and the full `npm run test:e2e` before each merge.
- Screenshots looked at for every visual change.
- `perf.spec.ts` numbers recorded in `PROGRESS.md`.
- Commit and push after each milestone, ticking `PROGRESS.md` with a 1–3 line note.
