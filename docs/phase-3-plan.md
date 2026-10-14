# Phase 3 plan: the bowling alley (approved by Andrew 2026-10-13)

## Context
Andrew wants Phase 3 started: a two-lane basement bowling alley modelled on his reference photo (raised wood
lanes, ball return + twin kiosk between the lanes, three overhead screens, shoe cubbies + ball shelves, leather
sofa, copper high-top table with stools). He wants a way to curve the ball or roll it straight, some
variability, and an overhead scoreboard showing who's bowling with real ten-pin scoring.
2.7's two-computer friend test is still open (it's Andrew's to do). It doesn't block this work because Phase 3
is built on a branch and only goes live at 3.4.

**Andrew's answers (2026-10-13):**
- **Throw = meters, golf-game style.** A/D slides the bear, the mouse swings the aim arrow, the first click
  stops a bouncing POWER meter, and the second click stops a swinging CURVE meter. This replaces GAME_SPEC
  §15's mouse-swing gesture, so §15 gets updated and the change is logged in the decision log.
- **Check-ins:** build 3.1 → 3.3 straight through, send screenshots once the alley is built, then one
  play-test review at 3.4 before it goes live.

What exists today: the basement rooms `bowling_alley` (floorplan x 28–56, z 0–6), `bowling_lounge`, and
`stair_landing` are an empty shell (floor, walls, 3.0 m ceiling in game, plain ceiling lights). There are no
dynamic physics bodies anywhere in the game. `bear-toon.glb` already contains the `Bowl` clip, but nothing
uses it. The leaderboard has a bowling column that reads "Bowling opens in Phase 3". The database already
has `bowling_games` and `stats.bowling_high_score`.

## Step 0: Housekeeping
- Copy the photo into `reference/bowling/alley-inspiration.jpg`. It's a look reference only: its lane name,
  watermark and wordmarks are never copied.
- Create branch `phase-3` from `phase-2`; it merges to main at 3.4.
- PROGRESS: status line → Phase 3. Decision log: meter throw controls; Phase 3 runs as one batch.
- GAME_SPEC §15 Controls: replace with the meter scheme (plus the physics note below).

## 3.1 Build the alley (no credits, except an optional mural image of about 0.25)
**Layout** (floorplan metres; the game builds it 1.25× bigger, so regulation proportions are kept). Under the
great room the ceiling is low (x < 29.5), so the approach starts just east of that:
- Approach x 29.6 → foul line x 34.2. Head pin x 52.5 (18.29 m). Pin deck to ~53.4. Pit, sweep bar and
  pinsetter hood out to 56. Back wall: a painted mural.
- Two lanes, each 1.054 m wide plus 0.235 m gutters, side by side. The ball-return hood and twin kiosk sit
  between them. The whole lane bed sits on a platform one step up, like the photo.
- Lane details: wood boards, foul line, approach dots, target arrows, pin spots, gutters, a glowing blue
  strip under the pin deck (from the photo).
- `docs/floorplan.json`: add an `opening` between the lounge and the alley (z = 6, x 28–34) so the lounge
  looks onto the lanes. In `shared/src/house/furniture.test.ts`, narrow `KEEP_CLEAR` for the landing.

**Code:**
- New `shared/src/bowling/lane.ts`: every dimension, pin spots, the oil length, and lane ↔ floorplan ↔ world
  conversions. Shared by the client, the server (for validation) and the tests.
- New `client/src/game/bowling/Alley.tsx` + `alleyGeometry.ts`: static lane geometry built with the house's
  `GeoBuckets`/`boxFaces` (`client/src/game/house/geometry.ts`) and `HouseMaterials` keys
  (`house/style.ts`), merged per material. Fixed Rapier colliders like `House.tsx`. Mounted inside the house
  group.
- Pins: a lathe from the regulation pin profile (white with red neck stripes). Balls: spheres with a swirl
  pattern drawn on a canvas, one colour per bowler slot (blue, red, green, purple). All pins and balls drawn
  with `InstancedMesh`.
- Lounge furniture through the existing furniture system (`shared/src/house/furniture.ts` placements and the
  `client/src/game/house/furniture/` builders), in a new `pieces/bowling.ts`:
  - shoe cubbies + ball shelves unit, with display pins on top
  - copper high-top table + 4 stools
  - navy velvet armchair
  - geometric cube stools
  - framed prints
  - the leather sofa reuses the existing Chesterfield hero model
- **Overhead screens** (new `client/src/game/bowling/Monitors.tsx`): three screens hung over the foul line.
  The left and right screens are each lane's scorecard (bowler names, 10 frames, X / − marks, running
  totals, the current bowler highlighted). They're drawn on a `CanvasTexture`, redrawn only when the score
  changes, on an unlit, non-tone-mapped material (same approach as `furniture/Tvs.tsx`). The middle screen
  shows the woods mural. The kiosk's small screens show the same scorecard.
- Lights: add fixtures to `INTERIOR_FIXTURES` (`house/lights.ts`) over the approach and pin decks. The real
  light pool stays the same size, so no shader rebuilds.
- Optional cheap art: one `gpt_image_2_5` painted summer-Maine-woods mural for the back wall and the middle
  screen. Price-check with `get_cost` first, tell Andrew the price, log it in the ledger. No wordmarks; the
  prompt never names the town.
- **Checkpoint:** screenshots (lounge view like the photo, approach, pin deck, scoreboard) sent to Andrew.
  Then commit and push.

## 3.2 Physics + meter throw controls
**Physics design** (a small, plain-English spec note to log):
- The ball's trip down the lane runs on a hand-written ball model: slide, then hook, then roll. It uses low
  friction on the oiled front ~2/3 and higher friction on the dry back end, so a spinning ball hooks late.
- When the ball reaches the pins, a separate Rapier world (`@dimforge/rapier3d-compat`, already installed)
  takes over for the ball-and-pin crash: ball ~7 kg, pins ~1.6 kg, fixed 120 Hz steps, independent of the
  frame rate.
- Why: the hook stays reliable and tunable, the pin crash looks real, and both run in Vitest, so strike
  rates can be tuned by tests.

**Code:**
- New `shared/src/bowling/ball.ts`: `stepBall` (skid/hook/roll, gutter capture), pure and tested.
  - With no curve the ball rolls straight.
  - With curve it goes straight through the oil, then hooks in the back end.
  - A gutter ball scores zero.
- New `shared/src/bowling/throw.ts`: `throwFrom({ x, aim, power, curve }, rand)` returns the starting state
  of the ball, with the variability built in:
  - The meter's own timing error.
  - A small random scatter in aim (±0.4° at low power, up to about ±1.2° at full power). Throwing harder is
    riskier.
  - A ±10% wobble on the curve.
  - Tiny random nudges to the pin set, so the same throw doesn't always leave the same pins.
  - One tuning constant, `VARIABILITY`, adjusts all of the above.
- New `client/src/game/bowling/pinSim.ts`: the Rapier pin-deck world (pin shape from a convex hull of the
  lathe profile), plus "standing" detection (tilt < ~15° and still on the deck after it settles).
  - Test `pinSim.test.ts` (Rapier in node), with seeded runs:
    - a pocket hook strikes often
    - a dead-centre straight ball often leaves splits
    - a light ball hitting the side leaves pins standing
- New `client/src/game/bowling/BowlingControls.tsx`, the turn flow:
  - join prompt
  - walk the bear to the approach (`playerState.teleportTo`)
  - A/D slide (limited to the approach)
  - mouse aim arrow ±6°
  - click 1 → power meter bounces, click 2 → curve meter swings, both drawn in the HUD
  - Bowl clip → release → the camera follows the ball → pin view → back to the approach
- `client/src/game/player/BearAnimator.ts`: add `Bowl` to `ONE_SHOT` with trim/speed/release-time constants
  (like `CAST`), and a `"bowl"` action.
  - Add `"bowl"` to `BEAR_ACTIONS` in `shared/src/party.ts`.
  - Attach the ball to the `RightHand` bone the way `fishing/rig.ts` attaches the rod.
  - If the Crouch_Charge_and_Throw clip looks bad on the cartoon bear even after trimming, stop and ask
    Andrew before buying another clip (8 credits).
- `client/src/game/player/Player.tsx`: a bowling mode. WASD movement is locked; A/D slides along the
  approach; the bear faces down the lane.
- `client/src/game/camera/ThirdPersonCamera.tsx`: add a `cameraState.override` (position + look-at, eased),
  which the bowling flow sets. Phase 4's board camera will reuse it.
- Pinsetter (`client/src/game/bowling/pinsetter.ts`):
  - after ball 1: lift the standing pins, sweep the fallen ones, put the standing ones back where they stood
  - after the frame: set all 10
  - the ball comes back up the return about 5 s later
- Sounds made in code, in `audio/synth.ts` like the fishing sounds: rolling rumble, pin crash scaled by how
  many pins fall, sweep, the ball-return clunk.
- Tune by playing in the browser until it feels like Wii Bowling. Strikes need a good pocket hit; straight
  balls work but carry worse.

## 3.3 Turns, scoring, sync, celebrations
- New `shared/src/bowling/scoring.ts` + tests:
  - frames from rolls, strike/spare bonuses, the 10th frame (up to 3 balls)
  - marks (X, /, −), running totals, `isGameOver`, `validRoll(pinsStandingBefore, knocked)`
  - tests: 300 game, all spares, all 9s, gutter game, 10th-frame strike/spare/open cases, illegal inputs
- `server/src/rooms/PartyState.ts`: new `Lane` schema with:
  - `bowlers` (ids, up to 4)
  - `turn`, `frame`, `ball`
  - `rolls` per bowler (a string), `standing` (a 10-bit mask)
  - `phase`: idle / aim / rolling / reset
  - `PartyState.lanes: t.map(Lane)`, with keys "1" and "2"
- New `server/src/rooms/bowling.ts`, a `Bowling` class modelled on `rooms/fishing.ts` (injectable clock,
  plain methods, `tick`):
  - **join/leave:** E at that lane's ball return; only before or between games, max 4 per lane.
  - **The turn:** the bowler has 60 s to throw; while they're still aiming, the kiosk "Skip" goes to the next
    bowler.
  - **Roll results the server accepts:** only from the current bowler, as a knocked-pin mask that is a
    subset of the pins standing. Rate-limited.
  - **Scoring:** the server owns it and advances turns.
  - **End of game:** returns final scores.
  - **Clean-up:** walking away or leaving the party removes you from the lane.
  - Tests in `bowling.test.ts`.
- `server/src/rooms/PartyRoom.ts`: message handlers (`MSG.bowlJoin`, `bowlLeave`, `bowlThrow`,
  `bowlState`, `bowlResult` in `shared/src/party.ts`) with `playing()`/`num()` checks, and the lane tick.
  - Ball + pin positions (the bowler's browser runs the physics) are relayed by the server to the other
    players at 20 Hz as a compact message, not stored in the schema. Remote browsers interpolate them.
- Client:
  - `client/src/net/party.ts`: a `useBowlingStore` (lanes from the schema, plus the streamed positions);
    senders.
  - New `client/src/ui/BowlingHud.tsx`:
    - controls help and the meters
    - a compact scorecard (the camera can't always see the overhead screens)
    - big **STRIKE!** / **SPARE!** / **GUTTER** banners
    - toasts for other bowlers' strikes
  - The bear celebrates (Celebrate clip) on a strike.
  - Add a third prompt store to `ui/ActionPrompt.tsx` ("[E] Bowl on lane 1" / "[E] Leave lane").
  - `window.__den.bowl` dev helpers: `join`, `throw(power, curve, aim, x)`, `state()`, `forceRoll(mask)`.

## 3.4 Leaderboard, deploy, friend test **[ANDREW APPROVES]**
- `server/src/stats.ts` gets `recordBowlingGame(userId, score)`. It uses the service role over REST: insert
  into `bowling_games`, read `stats`, and upsert `bowling_high_score` if the new score is higher. No new SQL
  for Andrew to run. It's tested with a fake `call`, like `recordCatch`.
- The server announces "New high score!".
- `client/src/net/social.ts`: drop the bowling `soon` text. Update `e2e/social.spec.ts`. The leaderboard
  refreshes after a game.
- Performance check: `e2e/perf.spec.ts` gets an alley spot. Medium must stay at 60 fps and ≤400 draw calls.
- Full test suite, then review with Andrew: screenshots + a short screen recording. Then merge `phase-3` →
  main (it auto-deploys) and run the friend test.

## Verification (each milestone)
- `npm test`: scoring, ball model, throw variability, pin sim, `Bowling` server class, stats.
- `npm run typecheck`.
- New `e2e/bowling.spec.ts` (Playwright, two browser contexts):
  1. Both bears join lane 1.
  2. Bear A throws via `__den.bowl.throw`.
  3. Bear B sees the ball and pins move and the score update.
  4. Turns alternate.
  5. A forced strike shows the banner, the 10th frame works, and the game ends with final totals.
  - Screenshots go to `docs/screenshots/3.x/`.
- The browser console must have no errors; WebGL errors fail the tests (existing rule).
- Look at the screenshots myself before sending them to Andrew. Close the in-app browser game before
  measuring frame rates.
- After each milestone: tick PROGRESS, add a note, commit, push.
