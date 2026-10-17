# THE DEN — Game Spec

Version 1 · 2026-10-11 · Owner: Andrew
This is the source of truth. Build what is written here. If something here won't work, stop and propose a change (see CLAUDE.md). Progress lives in `PROGRESS.md`. The house layout lives in `docs/floorplan.json`.

---

## 1. The game in one paragraph

The Den is a private, browser-based, multiplayer 3D game for Andrew and his friends (max 6 per party). Everyone plays the same big upright grizzly bear. You load in on the driveway in front of the garage of a big white farmhouse in the summer Maine woods, and hang out: open doors, explore every room, roar at each other, dance, fish off the dock in the stream, bowl on the two-lane alley in the basement, and play full-rules Catan around the dining-room table. A 30-minute day and 30-minute night cycle runs the whole time. Stats (fish caught, bowling high score, Catan wins) go on a leaderboard you can filter to friends.

**Visual target (changed back 2026-10-16, Andrew, round 3):** the realistic look (The Long Dark mood): PBR textures, the realistic grizzly, EZ-Tree forest, photographic sky. The cartoon look of 2026-10-13 is retired and no longer offered in Settings (its code is switched off in `client/src/game/artStyle.ts`, to tidy away later). Keep the real property's layout: no invented landmarks (no fence, lake or mountains). The one exception is Andrew's racetrack (2026-10-16, §4.1), out past the end of the driveway, beyond the property.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Name | **The Den** |
| Platform | Desktop web browser (Chrome, Edge, Safari, Firefox) on laptops. Keyboard + mouse only. No mobile, no controllers. |
| Players | 1–6 per party. Join a party with a room code. |
| Character | ONE character: an **upright (two-legged) grizzly bear**, photoreal (§5.1), made and rigged with Higgsfield. Everyone looks the same; name tags tell bears apart. (The cartoon bear of §5.1b is retired with the cartoon look, round 3.) |
| Camera | Third-person, behind and slightly above the bear. |
| Map | Real property (see `reference/`): wooded driveway, lawn, house, mixed forest, stream with a dock. Summer. |
| House | Built from `docs/floorplan.json` and the listing photos, at **1.25× real scale** (doors, rooms, stairs, bowling alley, everything). |
| Day/night | 30 min day → 4 min dusk → 30 min night → 4 min dawn (68 min loop), synced for the party. House lights always on inside. Flashlight at night. |
| Accounts | Phase 2: **Sign in with Google** (Supabase). Everyone signs in; no guest mode (the server refuses players who aren't signed in). Development builds keep a name box for testing. |
| Leaderboard | Fish caught (total), bowling high score (best game), Catan wins (total), Connect Four wins (total, 2026-10-16), bear hunt points (total) and bears taken down (total) (2026-10-17). Tabs: All / Friends. |
| Board game | **Catan**, full base-game rules, 2–4 players, in the formal dining room. Private game, so the name stays. Our own art, not the official board art. |
| Connect Four | Two bears at a games table in the basement stair landing, next to the bowling alley (Andrew, 2026-10-16; §16b). |
| Bear hunt | A hide-and-hunt party game (Andrew, 2026-10-17; §16c): ready up in a blue circle by the dock, one random player is the bear, the rest are human hunters with guns from a basement locker. |
| Bowling | Basement, 2 lanes, ball return, real physics with spin, Wii-Bowling-style scoring and feel. |
| Dogs | None (dropped by Andrew, 2026-10-12; see §12). |
| Fishing | From the dock or anywhere on the stream bank. Bite after 10–45 s. Spam R to reel against a tension meter. |
| Voice/text chat | None. |
| Hosting | Game website on **Vercel**; multiplayer server on **Railway**; accounts + database on **Supabase**. |
| Repo | Private GitHub repo `the-den`. |

---

## 3. Tech stack and architecture

**Monorepo (npm workspaces), TypeScript everywhere:**

```
/client   Vite + React + React Three Fiber (three.js) + drei + @react-three/rapier + postprocessing + zustand
/server   Node + Colyseus (rooms, room codes, state sync), talks to Supabase with the service-role key
/shared   Types, constants, Catan rules engine, bowling scoring, fishing tables (imported by client AND server, unit-tested)
/docs     floorplan.json, ASSETS.md (every third-party asset + license), notes
/reference  Listing photos + map images (read-only inputs)
/assets   Source assets (song, etc.) before they're processed into /client/public
```

- **Rendering:** three.js via React Three Fiber. WebGL2. PBR materials, HDRI-based sky/environment, AgX or ACES tone mapping, cascaded shadow maps for the sun/moon, SSAO + bloom + subtle vignette (Medium/High), fog for forest depth.
- **Physics/collision:** Rapier. Bear = kinematic character controller (capsule). Bowling ball + pins = dynamic rigid bodies.
- **UI:** React DOM overlays (menus, HUD). Fonts self-hosted via @fontsource (display: a bold condensed face like Bebas Neue or Oswald; body: Inter).
- **Networking:** Colyseus. One room per party. Room has `phase: "lobby" | "playing"`. Client sends inputs/pose at 20 Hz; server patches state at 20 Hz; clients interpolate remote players with a ~100 ms buffer.
- **Authority:** Bear movement is client-authoritative (server clamps speed/teleports). Server is authoritative for: time of day, doors, fishing bite timers and results, bowling turns/scores, the Catan game, and all stat writes.
- **Tests:** Vitest for `/shared` (Catan rules, bowling scoring, fishing rolls) and server logic. Playwright for browser smoke tests and screenshots (see CLAUDE.md).

---

## 4. Units, scale and world layout

- 1 game unit = 1 meter. The house and everything in it are built at **1.25×** the real-world numbers in `floorplan.json` (a real 2.03 m door becomes 2.54 m). Reason: the bear is 2.1 m tall upright and the third-person camera needs room indoors.
- World: walkable area about **250 m × 210 m** (Andrew asked for a smaller map, 2026-10-12; was 280 × 280): ~110 m west of the house, ~105 m north and south, and on the east out past the stream. Trees and ground carry on ~30 m past the edge. House roughly in the middle. North = −Z, East = +X (match `floorplan.json`: x west→east, z north→south).
- Reference: `reference/map/google-earth-overhead.jpg` (top-down) and `reference/map/aerial-oblique.jpg` (the real driveway winding in from the northwest, the stream on the east).

**Layout:**
- **House** in a lawn clearing (~70 m × 60 m), more lawn to the south (back) and east than the north. Front of the house faces north.
- **Ground:** the front (north) lawn is level with the main floor; the ground drops toward the back (south) lawn so the basement walks out on the south side: at basement level (~3.4 m down at 1.25×) by the den's doors, rising to ~2 m below the deck at the deck's east end (Andrew, 2026-10-11). It keeps sloping gently east down to the stream.
- **Driveway:** asphalt, ~4 m wide, starts at the **spawn point on the west edge of the map** and winds ~105 m through the woods to a paved apron in front of the garage doors (west end of the house). Dry-stacked stone retaining wall along the apron (see `greenhouse-exterior_and_garage-driveway.jpg`).
- **Forest:** dense mixed Maine woods: tall eastern white pines (dominant), red maple, red oak, paper birch, hemlock. Ferns, saplings, fallen logs, mossy boulders. Walkable between trees. Dry-stone walls along parts of the woodline. Full green summer foliage.
- **Yard details:** big boulder on the front lawn, rhododendrons along the front foundation, shrub beds behind the house, a few huge pines near the house (photos).
- **Stream:** ~20 m wide, slow, flowing north→south along the east side, about **110 m east of the house**. Banks 1–2 m above the water. A 3 m shallow strip along our bank is wadeable; beyond that an invisible wall. The far bank is scenery only.
- **Dock:** wooden, 1.8 m wide, 8 m long, straight out from our bank due east of the house. A **bucket of fishing rods** sits at the base of the dock. **Andrew's wakeboard boat** (blue/orange/white hull, black tower, no brand name; Higgsfield image→3D from his photo) is tied alongside the dock with lines and fenders, gently bobbing (Andrew, 2026-10-12). Scenery only, not drivable.
- **Trail:** packed dirt + pine needles from the back lawn to the dock (~90 m).
- **Perimeter:** invisible boundary ~10 m inside the map edge, disguised by denser trees, ferns, rocks and fog falloff.
- **The way out (2026-10-16):** the driveway now carries on past the old map edge: through the strip of woods, out onto open farmland, and along a road to the racetrack (§4.1). The invisible boundary has a gap there, and walls run along both sides of the road.
- **Spawn:** on the paved apron in front of the garage doors, two rows of three facing the doors (Andrew, 2026-10-16; was the start of the driveway at the NW edge).

### 4.1 The racetrack (Andrew, 2026-10-16)

Joined to the map, no loading or fade: the driveway leaves the woods at its far (north-west) end and a road (same paving, ~120 m) crosses gently rolling patchwork farmland to a gate in the east fence of the track grounds (~845 × 555 m, x −1060…−215, z −760…−205 since round 4, all flat at 6.5 m, the driveway's height there). Modelled on Andrew's photo (`reference/motorcycle/racetrack.jpg`), built in code (`shared/src/track.ts`, `client/src/game/track/`):
- A ~3.2 km circuit (round 4, Andrew: more straights), 12 m of dark asphalt with white edge lines: a ~670 m start/finish straight heading west along the south side, a sweeping turn 1, a straight up the west side, a ~500 m back straight east along the north, esses, a ~380 m middle straight heading west, a hairpin, a kink and a last corner onto the straight. Long enough to reach 155 mph.
- Red/white kerbs on both edges through the corners; blue then red painted run-off on the outside of them; blue air-fence cushions (a red one every few) past the run-off of the corners, solid; grass inside the fence textured like the property's lawn, with mowing stripes; patchwork pasture, hay and ploughed fields outside (round 4); a chequered start/finish line under a gantry.
- A paved paddock just inside the gate, beside the straight, with a long white pit building; a grandstand with red and blue seats facing the straight; round the grounds and in front of the grandstand a concrete wall with a 4 m chain-link catch fence on posts; a belt of the forest's trees 8–50 m outside the fence on every side (round 4).
- Out here the haze opens up (to ~1,100 m since round 4) so you can see across the circuit; the track is only drawn when it could be seen.
- **Lap timer** (on the bike): cross the start/finish line to start a lap; it counts when you come round again having passed two sector points (no cutting across). Screen: current, last and best lap. The server checks a lap (on a bike, at the track, not impossibly fast) and the party gets a note for each personal best and party best. Session only (not on the leaderboard).

---

## 5. The bear

### 5.1 Making it (Higgsfield, inside Claude Code)

1. **Concept image** — `generate_image`, model `gpt_image_2_5` (~0.25 credits each), count 4. Prompt:
   > Photorealistic adult grizzly bear standing fully upright on its hind legs like a person, full body from head to toe, front view, A-pose: arms held slightly away from the body with clear space between arms and torso, paws open and empty, feet flat on the ground, mouth closed, calm expression. Thick brown fur with silver-tipped guard hairs, pronounced shoulder hump, dished face, small rounded ears, long pale claws. Proportions slightly adapted for walking upright. Even soft studio lighting, plain light-gray seamless background, no props, no text. Entire body centered in frame.

   **[ANDREW APPROVES]** the pick.
2. **3D model** — `generate_3d`, model `meshy_v7_image_to_3d`, with `should_texture: true`, `enable_pbr: true`, `pose_mode: "a-pose"`, `enable_rigging: true`, `rigging_height_meters: 2.1`, `enable_animation: true`, `animation_action_id: 0` (Idle). Verified cost: **47.5 credits**. **[ANDREW APPROVES]** the look in a simple turntable viewer page.
3. **Rig test before spending more** — use model `meshy_rigging` (verified cost **8 credits per clip**) on the same mesh for 2 clips (Casual_Walk 30, RunFast 16). Load all three GLBs in three.js and confirm the clips play correctly on ONE skinned mesh (bone names/hierarchy match). If they don't match, stop and tell Andrew before generating more. *(Result 2026-10-11: names/hierarchy match but every re-rig places joints differently, so each clip is converted onto the base bear's skeleton with `tools/retarget-clip.mjs`. Andrew approved.)*
4. **Remaining clips** (table below). Show Andrew the preview GIF links for any clip marked "preview first" and let him pick.
5. **Process:** fatten the base mesh (`tools/fatten-bear.mjs`, torso +22%, belly +15%; Andrew's request), retarget every clip onto its skeleton (`tools/retarget-clip.mjs`), merge into one `bear.glb` (mesh + all clips) with gltf-transform; meshopt/Draco + KTX2 textures; target under 25 MB.

### 5.1b The cartoon bear (2026-10-13; retired 2026-10-16 with the cartoon look)

The game's bear since the cartoon remake: concept `assets/concepts/bear-v2/bear-1.png` (job 01e1151d; original design, not a copy of any film character), `meshy_v7_image_to_3d` with the same settings as above (47.5 credits). Not fattened. The realistic bear's clips below are reused: `tools/transfer-clips.mjs` turns each joint from the new bear's A-pose by the same world-space amount as the clip's joint, keeping the new bear's bone lengths and scaling the hips' movement by leg length (no clips bought). Build: `node tools/build-bear.mjs --toon` → `client/public/models/bear-toon.glb`. If a clip ever looks wrong on him, buy that one clip with `meshy_rigging` on his mesh (8 credits) and use `retarget-clip.mjs`.

### 5.2 Animation clips (Higgsfield animation library IDs, verified)

| Action | Clip (id) | Notes |
|---|---|---|
| Idle | Idle (0) | in the base model; alt Idle_02 (11) |
| Walk | walking_2 (566) | Andrew's pick 2026-10-12 from a side-by-side test of Casual_Walk (30), Slow_Orc_Walk (119), Monster_Walk (112), walking_2 (566): closest to its natural pace at 1.8 m/s. Its built-in forward travel is removed in `tools/build-bear.mjs` |
| Sprint | RunFast (16) | alt Run_02 (14) |
| Jump | Regular_Jump (466) | |
| Roar (Y) | Chest_Pound_Taunt (88) | plus roar sound |
| Dance (B) | All_Night_Dance (64) | Andrew may pick any clip from the Dancing category instead |
| Open door | open_door (285) | |
| (unused) | Male_Bend_Over_Pick_Up (276) | was for petting dogs; dogs dropped 2026-10-12 |
| Sit down | Stand_to_Sit_Transition_M (57) | Catan chair |
| Sitting idle | Chair_Sit_Idle_M (33) | |
| Stand up | Sit_to_Stand_Transition_M (53) | |
| Cast rod | Over_Shoulder_Throw (421) | |
| Reel / fight fish | Pull_Radish (283) | preview first; fallback = Idle with rod |
| Bowling throw | Crouch_Charge_and_Throw (398) | preview first; may need trimming |
| Celebrate | Cheer_with_Both_Hands_Up (298) | big catch, strike, Catan win |

Base + 14 extra clips ≈ 47.5 + 112 = **~160 credits**.

### 5.3 Movement feel

- Camera-relative movement: W/A/S/D move forward/left/back/right relative to the camera; the bear turns to face where it's going (no strafe clips needed).
- Walk 1.8 m/s (was 2.4; Andrew 2026-10-11, the walk clip looked hurried) · Sprint (hold Shift) 6.0 m/s · Jump apex ~1.1 m · gravity ~20 m/s² (snappy, not floaty).
- Smooth animation blending (idle↔walk↔sprint by speed; ~0.15 s crossfades). Feet should not visibly slide: match clip playback speed to movement speed.
- Camera: ~3.5 m behind outdoors, mouse look with pointer lock, scroll to zoom 2–6 m, pulls in automatically to avoid walls (essential indoors), FOV ~70.
- **Roar (Y):** plays the roar clip + loud positional roar (audible ~60 m). The sound is Andrew's "I'm shaving here" clip (2026-10-15; was a grizzly growl). The bear stops to roar (pressing Y while walking works; moving cancels it after ~1 s). Bears within 6 m get a small camera shake. 3 s cooldown.
- **Crouch (C, game-night fixes 2026-10-15):** toggles a hunched sneak (Cautious_Crouch_Walk clip, 8 credits) at 1.0 m/s; the bear is 1.4 m tall instead of 2.1. Sprinting, jumping or C stand it up again, only where there's room overhead. Synced to the party.
- **Dance (B):** loops until you move or press B again.
- **Bumping:** bears are solid to each other. When capsules touch, both get pushed apart along the contact (soft shove; stronger if sprinting, with a small stagger). Each client applies the shove to its own bear.
- **Name tags** above every other bear (fade with distance, hidden behind walls).

### 5.4 The motorcycle (Andrew, 2026-10-16)

- **The bike:** a realistic red sport bike with a black frame and red-striped wheels in the ZX-6R spirit, like Andrew's clean all-red photos (no logos or lettering). Round 4: front/side/back views made from concept #4, then a detailed Higgsfield multiview→3D model (`assets/concepts/motorcycle/v2-*.png`); `npm run build:bike` (`tools/build-bike.mjs`) → `bike.glb` (~110k triangles, 2K PBR textures, glossy clearcoat on the red paint), sized ~2.45 m long for the chunky bear. The wheels are separate parts that roll with the bike's speed (yours and everyone else's).
- **The rider (round 4):** sits on the seat centred over the bike, in a racing tuck (back bent over the tank, head up), paws on the grips, feet on the pegs with the knees out round the tank, soles level.
- **One per bear:** a bike always waits in the garage, lined up with the south garage door. E next to it ("Ride the motorcycle") gives you your own; E while riding slowly ("Get off") parks it where you are and steps you off beside it, and everyone sees it parked there; E next to your parked bike gets back on. Taking a new one from the garage replaces your old one; leaving the party removes it. No riding with a fishing rod in your paw. The server checks you're next to the bike, and only a riding bear may move at bike speeds.
- **Riding** (arcade, on the bear's own collision capsule): W throttle, S brake (held when stopped: back up slowly), A/D steer (tight when slow, wider when fast, sharpened at speed on 2026-10-17: a ~33 m circle at 58 mph, ~95 m at 112 mph; it only turns while rolling), Shift tuck (+12% top speed on the property; at the track sixth gear's limiter is the top). Top speeds: grass is as fast as the nearby pavement (round 3): 26 m/s (~58 mph) anywhere on the property, 69.3 m/s (**155 mph**, Andrew round 4) anywhere inside the racetrack's fence, 6 m/s in the garage. Anything in front of the wheel (trees, walls, the edge of the map) stops it dead with a crunch; it can't go into the house except the garage. Doors still open with E as you ride up.
- **Gears (round 3):** six gears topping out at ~22 / 40 / 63 / 87 / 116 / 155 mph (round 4; 155 is reached flat out in ~500 m); each pulls hardest mid-revs, lugs in too high a gear and holds at its rev limiter. Automatic (default: up near the redline, down as it slows) or manual: Q up, Z down (a downshift that would over-rev is refused and the gear flashes red); M switches while riding, also Settings → Motorcycle gears. The engine note follows the revs, so you hear each shift.
- **Wheelies (Andrew, 2026-10-17):** hold Space with the throttle in 1st to 3rd gear and the front wheel comes up to ~30° and stays there (it never flips over); let go, slow under 2 m/s or lose the throttle and it drops back with a thump. With the front up it steers at about a third of the usual rate. Bike and bear pivot on the rear tyre; everyone sees it (the pose carries a `wheelie` angle).
- **Speedometer (round 3):** while riding, bottom right: an mph dial with a needle, the speed in big numbers, the gear (R when backing up), a rev bar with a red zone, Auto/Manual and the keys.
- **Looks:** the bear sits in the held sitting pose, raised onto the seat, hunched over the tank with both paws on the grips (`bike/rider.ts`); bike and bear lean into turns and tip with the slope. Under way, the camera swings behind the bike and pulls back to 6 m, and the view widens with speed. Engine sound (2026-10-17, second pass after Andrew heard the stitched recordings): one continuous inline-four made in code (`bike/engineSynth.ts`, run on the audio thread by `engineWorklet.ts`, one per bike): each cylinder firing rung through fixed exhaust resonances so the note glides and changes colour with the revs (rpm = revs × 16,000, firing at rpm / 30), louder and brighter on the throttle with intake roar, burble and the odd pop on the overrun, an ignition cut and pop on each upshift, a throttle blip and a couple of crackles on each downshift, the rev limiter bouncing at the redline. At the bottom of the revs it blends into Andrew's real idle recording; his revving and shifting clips were the reference it was tuned against. Loud (heard ~10 m at full volume, carrying across the property), heard by everyone nearby; `npx tsx tools/render-engine.mts` renders a demo ride to listen to.

---

## 6. Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Shift (hold) | Sprint |
| Space | Jump |
| C | Crouch / stand up |
| E | Interact: open/close doors, take/return fishing rod, sit at the Catan or Connect Four table, join a bowling lane, get on / off the motorcycle, ready up for a bear hunt, open the gun locker |
| Bear hunt | Hunter: left mouse fire (hold for the AR) · right mouse aim (through the scope if fitted) · R reload · 1–4 sniper, pistol, AR, shotgun. Bear: left mouse swipe · Y roar |
| On the motorcycle | W throttle · S brake / back up · A/D steer · Shift tuck · Q/Z gear up/down (manual) · M automatic/manual · E get off (when slow) |
| Y | Roar |
| B | Dance |
| F | Flashlight on/off |
| Left mouse | Cast (hold to charge, release) · bowling: click to stop the power meter, then the curve meter |
| R (spam) | Reel in a hooked fish · R again lets a landed fish go |
| Scroll | Camera zoom |
| Tab (hold) | Party list |
| Esc | Pause menu (Resume, Full screen, Settings, Leave to home screen) |

Show a context prompt like `[E] Open door` when an interactable is within ~2 m and in front of the bear.

---

## 7. Multiplayer

- **Party flow:** Home screen → CREATE PARTY generates a 5-character code (letters A–Z without I and O, digits 2–9) → friends pick JOIN PARTY and type the code → everyone's bears line up on the home screen → the host presses PLAY → everyone loads into the map at the spawn.
- Max 6. If the host leaves, the next player becomes host. Joining mid-game is allowed (you spawn in front of the garage).
- Reconnect window 30 s (Colyseus reconnection) so a page blip doesn't kick you.
- **Synced state:** players (pose, animation, flags: flashlight, holding rod, sitting, dancing), doors (open/closed), time of day, fishing (each player's line/bobber/fish state), bowling (lane state, scores, the active roll's ball + pin transforms), Catan (full game state).
- Test with at least two browser contexts on every multiplayer milestone.

---

## 8. The house

Use `docs/floorplan.json` for the layout (rooms, doors, stairs) and the listing photos for how everything looks. Each room in the JSON lists its reference photos.

### 8.1 Exterior (match `reference/house-photos/exterior-*.jpg`)
White clapboard siding, black shutters, dark gray architectural shingle roof, **five gabled dormers** on the front roof, **farmer's porch** with white square columns across the front of the east block, two-story gable at the garage end with a shuttered window, two white raised-panel **garage doors** facing west (driveway), red-brick chimney on the east side of the great room, rear gable with **two big half-round arched windows** over transoms over glass doors, the **deck** with a green market umbrella, and the long curved-glass **greenhouse** on the back of the garage wing. Gutters, coach lights by the garage, porch lights.

### 8.2 Interior
- Build walls (with door and window openings), floors, ceilings (flat; sloped attic ceilings upstairs; two-story cathedral ceiling in the great room), stairs with railings, trim (baseboards, door/window casings) from `floorplan.json` at 1.25×.
- Materials per room come from the photos: honey-oak floors, cream carpet, burgundy carpet (office), terracotta tile + knotty pine + exposed timber beams (kitchen/mudroom), red brick fireplace, painted walls in each room's color, speckled and swirl wallpapers.
- **Doors:** every hinged, french, exterior and garage door opens and closes with E, synced for everyone. The utility-room door is locked (prompt: "Locked"). Garage doors roll up.
- **Furniture (Phase 2):** recreate what's in each photo (piano, harp, wingback chairs, camelback sofas, dining sets, four-poster bed, bookshelves, leather Chesterfield, recliner, pot rack, etc.). Source order: CC0 models (Poly Haven) → Higgsfield image→3D (`tripo_h3_1_image_to_3d`, verified **9 credits** each) for specific hero pieces → simple code-built pieces for boxes, shelves, books, frames, rugs, curtains.
- **Lights:** always on inside, warm (~2700K). A glowing fixture in every room plus a small pool of real lights that follow the fixtures nearest you. Indoor lights don't cast shadows for now (too slow); the sun, moon and your own flashlight do. Revisit with the graphics presets in 1.12 (Andrew, 2026-10-12). Fireplace has a real-looking fire at night (flicker + glow + crackle).
- **Windows** glow warmly from outside at night.
- **Catan room = formal dining room:** table with exactly 4 chairs.
- **Basement stair landing:** the games table with 2 chairs for Connect Four (§16b), west of the stairs' foot.
- **Bowling alley:** basement, see §15. It extends past the house footprint underground.

### 8.3 Greenhouse (bear prepping for winter)
It stands on a concrete foundation down to the back lawn (the ground drops ~2.7 m under its east end), with concrete steps from its east door down to the lawn by the den (round 3).
Shelves and benches of plants (tomatoes, herbs, ferns, hanging baskets) plus the winter stockpile:
- Tall stacks of **donut-hole boxes in the Munchkins spirit** (generic box, no real logo or wordmark)
- Stacks of **canned pasta rings in the SpaghettiOs spirit** (generic red label, no real logo)
- **Salmon**: whole salmon on ice in a cooler, plus smoked-salmon packs
- A **canoe** (dark green) resting on two sawhorses
- Filler is fine: crates, jars, firewood.

### 8.4 TVs
TVs in the basement den and the common area. Both loop **Andrew's three home video clips** (Andrew, 2026-10-12; replaces the AI pigeon/salmon slideshow): `assets/video/`, joined into one ~14 s loop by `tools/build-tv.mjs`. The clips are filmed tall, so each sits centred on the 16:9 screen with a blurred copy of itself filling the sides. Sound plays from the TV and is only heard up close in that room.
**The clips are private** (Andrew, 2026-10-12): they show his friends, so they are never in git or the public website files. The loop is uploaded to a private Supabase Storage bucket and the game fetches a short-lived signed link only for signed-in players (so the TVs light up once 2.5 sign-in exists; until then they show a dark screen).

---

## 9. Day/night, lighting and weather

- Loop: day 30 min → dusk 4 min → night 30 min → dawn 4 min. Server owns the clock; a new party starts mid-morning.
- Sun arcs east→west across the southern sky. Dusk/dawn: warm orange-pink sky, long shadows. Night: moon light (cool, dim), stars, darker sky, but shapes stay readable (auto exposure). Fireflies over the lawn at night (polish phase).
- Exterior house lights turn on at dusk. Interior lights are always on.
- **Flashlight (F):** spotlight from the bear's chest/paw. Others see your beam (visible cone + light). Only your own flashlight casts shadows.
- Always clear summer weather in v1.

---

## 10. Audio

- **Menu/loading music:** `assets/audio/allen-weiss.mp3` (3:13, original Suno track Andrew made). Starts after the "Click to enter" splash (browsers block sound until the first click), plays through the loading screen and home screen (loops), fades out over ~3 s when the match loads.
- **Ambience:** day: birds, wind in the pines, distant woodpecker (northern flicker), hermit thrush; dawn chorus at sunrise. Night: crickets, tree frogs (no free spring-peeper recording exists; Andrew chose tree frogs, 2026-10-12), the occasional loon call from the stream. Positional stream water near the stream. Inside: quiet room tone, fireplace crackle.
- **Sound effects:** footsteps by surface (grass, dirt, asphalt, wood, carpet, tile), roar, doors, garage door, cast whoosh, reel clicks, splash, line snap, bowling roll/pin crash/ball return, dice, UI clicks.
- Sources: public-domain (US National Park Service) and CC0 libraries first; simple sounds (wind, room hum, fire crackle) made in code. Higgsfield's sound-effect model only works inside its own website builder, so it isn't an option for loose sound files; anything else missing goes to Andrew.
- Settings: Music, Effects, Ambience volume sliders.

---

## 11. Menus and UI

**Style:** dark and premium, warm cabin-outdoors palette (deep forest green, bark brown, cream, ember orange). Big bold condensed headings, clean body text, smooth transitions, light film grain/vignette. Feels like a real game launcher, not a website.

1. **Splash:** black screen, "Click to start" (browsers only play sound after a click). Every page load, including a refresh.
2. **Intro (lyric video, Andrew 2026-10-12):** the 19-second song clip plays while the camera glides slowly over the 3D property at dusk. The lyrics come on screen one line at a time as they're sung ("There is a bear in [town], Maine" / "and he does not have a coat" / "on purpose"); the THE DEN logo (Higgsfield art, Andrew's pick #2) fades in when the music starts (~14 s); at the end you land in the home screen and the full song carries on from that point and loops. **Skip intro** button bottom right. Plays from the start on every page load; a refreshed player still rejoins their party afterwards.
   **Loading screen** (Play → spawn): the logo, a real progress bar and rotating tips ("Press Y to roar", "Press F for your flashlight"), fading into the game. The AI loading video is dropped: Andrew chose the 3D property for the intro instead (saves ~20+ credits).
3. **Home screen (Fortnite-style):** your bear on a slowly rotating round pedestal (drag to spin it) in a moody lit scene; party members' bears stand beside yours with name tags (up to 6). Buttons: PLAY (host), CREATE PARTY, JOIN PARTY, SETTINGS, plus LEADERBOARD, FRIENDS and SIGN OUT from Phase 2. Party code shown big with a copy button.
4. **Settings:** graphics preset (Auto/Low/Medium/High; **Medium by default**, round 3), music/effects/ambience volume, mouse sensitivity, invert Y, show frame rate (a small "60 fps · Medium" in the party badge, so friends can say how smooth it runs; Phase 5), motorcycle gears (Automatic/Manual, round 3), play in full screen (**on by default**, round 3: goes full screen on the first "Click to start", Create/Join, Play, Resume or a click on the game; a Full screen button is also on the home screen and pause menu; Esc always leaves full screen, a browser rule). Settings saved before round 3 were moved onto Medium and full screen once. No art style choice (realistic only).
5. **HUD (minimal):** interaction prompt, fishing UI, bowling UI, small time-of-day icon, party list on Tab.
6. **Pause (Esc):** Resume, Settings, Leave to home screen.

---

## 12. Dogs: dropped (Andrew, 2026-10-12)

The house dogs (Merlin, Raptor, Luna) are out of the game. No free realistic animated dog models were good enough and Andrew chose not to buy any (~$155). Could be revisited later.

---

## 13. Fishing (Phase 2)

- **Rods:** E at the bucket on the dock takes a rod (unlimited rods). E at the bucket puts it back. Walking into the house puts the rod away automatically.
- **Cast:** hold left mouse to charge a power bar, release to cast where the camera aims (up to ~25 m). The lure must land on stream water. You can fish from the dock or anywhere along our bank.
- **Bite:** server picks a random time **10–45 s** after the lure lands. Recasting resets it. On a bite: the bobber plunges, splash + sound, `FISH ON! Spam R` prompt. You have 2.5 s to start reeling or it gets away.
- **Reeling:** each R press reels in line and raises tension; tension drains when you're not pressing; the fish surges every 1.5–4 s (bigger fish surge harder). Tension hits 100% → line snaps ("Snapped!"). Line in to ~1.5 m → landed. Tune so a big bass takes ~10–15 s and is genuinely tense.
- **Landed:** the bear holds the fish up **by its lip** in the left paw, arm out to the side (celebrate clip first for big ones), for as long as the angler likes (R lets it go, at most 60 s; the first 1.5 s of R presses are ignored so mashing doesn't drop it). Catch card shows species, weight in lb/oz, and "New personal best!" when it is. Released, the fish drops back into the water with a splash for everyone to see (game-night fixes 2026-10-15). The catch counts toward **fish caught**.
- Everyone sees your line, bobber, the fight and the fish.

| Species | Chance | Weight (lb) | Fight |
|---|---|---|---|
| Sunfish (pumpkinseed) | 28% | 0.1 – 1.0 | weak |
| Yellow perch | 24% | 0.1 – 1.5 | weak |
| Crappie | 16% | 0.25 – 2.5 | medium |
| Smallmouth bass | 17% | 0.5 – 8.0 | strong |
| Largemouth bass | 15% | 0.5 – 8.0 | strong |
| **Jenna Catfish** (Andrew, 2026-10-16) | **1 cast in every 4** (round 3): a random cast in each run of four is hers, kept owed until she's landed, so a snap, a missed bite or winding in brings her back on the next cast; the other chances are for the other three casts | 200 – 400, evenly spread | a long fight (~14 s at 200 lb, ~28 s at 400 lb for a careful reeler); mashing snaps her |

Weight = min + (max − min) × r^2.2 (r random 0–1), so big fish are rare (the catfish is an even spread). The catfish's line tension counts her as 2% of her weight, and a surge's yank tops out at a bass's, so she runs further instead of snapping the line on the first press.
**Jumps (2026-10-16):** every hooked fish leaps clear of the water while you reel it in (on every surge, plus every few seconds), across the line at the lure, so everyone can see what's on; the server shares the species and weight from the strike. Small fish hop ~1–1.6 m (drawn a little bigger in the air), the catfish breaches ~2.4–3.2 m with a big splash. She is held up by the lip like the rest, leaning out with her tail on the ground.
Fish models: one per species via Higgsfield image→3D (9 credits each; the catfish from Andrew's own picture), static mesh with a code-driven wiggle.

---

## 14. Accounts, friends, leaderboard (Phase 2)

- **Supabase Auth with Google.** First sign-in: pick a unique username (3–16 characters, letters/numbers/underscore). It's the name tag above your bear. Setting up Google sign-in takes Andrew ~15 minutes of clicking in Google Cloud and Supabase; walk him through it.
- **Friends:** search by username → send request → accept/decline. Friends list on the home screen.
- **Leaderboard** (home screen): Fish caught · Bowling high score · Catan wins · Connect Four wins · Bear hunt (points as the bear) · Takedowns (bears taken down as a hunter). Tabs: All players / Friends.
- **Tables (suggested):** `profiles` (id, username), `friendships` (requester, addressee, status), `stats` (user_id, fish_caught, bowling_high_score, catan_wins), `catches` (user_id, species, weight_lb, caught_at), `bowling_games`, `catan_games`. Row-level security on everything.
- **Only the game server writes stats** (service-role key). The browser never writes stats directly.

---

## 15. Bowling alley (Phase 3)

- **Build:** two side-by-side lanes running west→east (bowler at the west end) with gutters, foul line, arrows/dots, ball return between the lanes, ball rack with a few ball colors, pinsetter area with sweep bar, overhead score monitors, lounge seating. Regulation proportions × 1.25. Pins = lathe geometry from a regulation pin profile.
- **Look:** modelled on Andrew's reference photo (`reference/bowling/alley-inspiration.jpg`; look only, none of its names or wordmarks): wood lanes on a platform one step up, a ball return with a twin-screen kiosk between the lanes, three screens hung over the foul line (left and right = each lane's scorecard, middle = a painted summer-woods picture, also used as the mural behind the pins), a glowing blue strip under the pin decks, and a lounge with shoe cubbies + ball shelves, a leather sofa, a navy armchair and a copper high-top table with stools.
- **Physics:** the ball's trip down the lane uses a small hand-written ball model (slide → hook → roll): low friction on the oiled front ~2/3 and higher friction on the dry back end, so a spinning ball hooks late. At the pins a separate Rapier world takes over for the crash (ball ~7 kg, pins ~1.6 kg, fixed 120 Hz steps so it doesn't depend on frame rate). Both run in unit tests so strike rates can be tuned (changed 2026-10-13: a reliable, tunable hook).
- **Controls (meters, golf-game style; Andrew 2026-10-13):**
  1. Position: A/D slides the bear left/right on the approach.
  2. Aim: move the mouse left/right to swing the aim arrow (±3°: that already spans gutter to gutter at the pins; ±6° was mostly gutter).
  3. Power: click to start a bouncing POWER meter, click again to stop it.
  4. Curve: a CURVE meter then swings left ↔ right; click to stop it (middle = straight, ends = big hook either way).
  - **Variability:** where you stop the meters is the skill; on top of that there's a small random scatter in aim (about ±5 cm at the pins for a gentle ball up to ±14 cm flat out, against a ~6 cm pocket), a little wobble on the curve, and tiny random nudges to the pins, so the same throw doesn't always leave the same pins.
- **Pinsetter:** after the first ball, sweep fallen pins; after the frame, reset all 10. Ball comes back on the return ~5 s later.
- **Scoring:** standard ten-pin, 10 frames, strike/spare bonuses, 10th frame up to 3 balls, max 300. Overhead monitor shows each lane's scorecard. Big "STRIKE!" / "SPARE!" banners and sounds; bear celebrates on a strike.
- **Turns:** 1–4 bears per lane (E at that lane's ball rack to join before or between games). Others can watch.
- **Sync:** the bowler's browser runs the physics and streams ball + pin positions (20 Hz). When the roll ends it reports standing pins; the server owns the score.
- Best single-game score → **bowling high score**. Scoring logic lives in `/shared` with unit tests (all-strikes 300, all-spares, 10th-frame cases).

---

## 16. Catan (Phase 4)

- **Where:** formal dining room table, 4 chairs. Walk up to a chair, E to sit (sit clips), E again to stand. When 2–4 bears are seated, any seated player can start a game. Others can stand around and watch.
- **View:** seated players switch to a board camera above the table; the 3D board sits on the table and everyone in the room can see it. Our own clean, high-quality art (wood-and-felt look): hex tiles, number tokens, harbors, roads, settlements, cities, robber, two dice with physics or a nice roll animation.
- **Full base-game rules (implemented in `/shared`, server-authoritative, unit-tested):**
  - Board: 19 hexes (4 forest, 4 pasture, 4 fields, 3 hills, 3 mountains, 1 desert), 18 number tokens (2, 12 once; 3–6 and 8–11 twice), 9 harbors (4 generic 3:1, 5 resource 2:1). Random board each game, with the official rule that 6s and 8s can't touch; a "beginner layout" toggle is a nice-to-have.
  - Setup: snake-order placement of 2 settlements + 2 roads each; second settlement grants starting resources.
  - Turn: roll → produce → trade → build/buy → play at most one development card (any time in the turn, not one bought this turn; VP cards excepted).
  - Costs: road = brick + lumber · settlement = brick + lumber + wool + grain · city = 3 ore + 2 grain · development card = ore + wool + grain.
  - Pieces per player: 15 roads, 5 settlements, 4 cities. Distance rule for settlements.
  - Rolling 7: everyone with more than 7 cards discards half (rounded down); roller moves the robber and steals 1 random card from an adjacent player.
  - Development deck (25): 14 knights, 5 victory points, 2 road building, 2 year of plenty, 2 monopoly.
  - Longest road (5+ continuous, broken by opponents' settlements) = 2 VP; largest army (3+ knights) = 2 VP; ties keep the current holder.
  - Trading: player-to-player offers (propose, accept, decline, counter) on your turn; bank 4:1; harbors 3:1 / 2:1.
  - Win at 10 VP on your own turn.
- If a player disconnects: pause up to 60 s for reconnect, then remove them and continue (end the game if fewer than 2 remain).
- **Leaving and ending early (Andrew, 2026-10-14).** Any player can leave mid-game (Leave game, or E to get up, with a confirm): their cards go back to the bank, their pieces stay, play continues (ends with no winner if fewer than 2 remain). Any player can call a **vote to end the game**: if more than half of the players still in vote yes, the game ends for everyone with no winner and no leaderboard change; a vote lapses after 30 s.
- **House dice (Andrew, 2026-10-14).** A secret switch for a prank: hold **H** while clicking Start game. The board, number tokens, dots and the 6/8 rule stay standard; only the dice change, to a flipped table (out of 36 rolls: 2→5, 3→4, 4→3, 5→2, 6→1, 7→6, 8→1, 9→2, 10→3, 11→4, 12→5). Off by default and off again when the game ends. Only the person who flipped it sees a brief tiny tick; the flag and the weights stay on the server and never reach any browser. No reveal at the end; wins count on the leaderboard as normal.
- Win → **Catan wins** +1, celebrate clip.

---

## 16b. Connect Four (Andrew, 2026-10-16)

- **Where:** a games table (honey wood, green felt) with 2 chairs in the basement stair landing, next to the bowling alley. A blue upright 7 × 6 grid stands across the table between the chairs.
- **Sitting:** like Catan: E next to a free chair sits, E gets up. Seated, the camera looks over your shoulder at the grid with the mouse free. Your own bear hides; the other player shows faded through the holes.
- **Play:** when both chairs are taken either player presses Start; a random bear goes first as red, then yellow. On your turn a see-through disc follows the column you point at; click to drop. Discs fall with a bounce and a clack. Four in a row across, up or diagonally wins (the four pulse, fanfare, the winner jumps up and cheers); a full grid is a draw. Rematch from the same panel.
- **Leaving:** E mid-game asks first; leaving ends the game with no winner. A dropped player gets 60 s to reconnect while the game waits.
- **Server-authoritative** (`shared/src/connect4/`, `server/src/rooms/connect4.ts`); nothing is secret, so the whole game is synced. A win → **Connect Four wins** +1 on the leaderboard.

---

## 16c. Bear hunt (Andrew, 2026-10-17)

- **Getting in:** a glowing blue circle on the trail just west of the rod bucket at the dock. Standing in it, E readies up (E again stands down; stepping out unreadies you). When everyone standing in the circle (2–6) is ready, a 5 s countdown, then one of them at random is **the bear** and the rest are **hunters**. Bears not in the hunt carry on as normal; players in the hunt don't see them (or bump into them), and they hear every gunshot.
- **The bear** (the normal bear) is moved to a random hiding spot anywhere on the map (26 spots: rooms of the house, the lawns, the woods, the road and the racetrack; never the same twice running, never near the circle); only the bear's screen says where. It sees every hunter as a red dot on a mini-map and as a glowing orange outline through walls and trees. Its name tag is hidden from hunters. It can swipe (left mouse): a hunter within ~2.5 m in front is knocked flat for 3 s (5 s between swipes). It can roar, but every hunter hears where.
- **Hunters** are Andrew's own hunter (orange camo vest, camo jacket, cargo pants; Higgsfield model from his character sheet). They start at the circle with the scoped sniper; a gun locker in the basement den (north wall) has the rest. They carry every gun they take and switch with 1–4; at the locker any gun can have a scope put on or taken off. Their mini-map shows only each other, never the bear. Right mouse aims over the shoulder (through the scope if one's fitted: sniper 6×, AR 3×, pistol/shotgun 2×). No shooting from a motorcycle (both paws are on the grips); everyone may ride.

| Gun | Hits to take the bear down | Magazine | Fire | Reload |
|---|---|---|---|---|
| Sniper rifle | 1 | 1 | bolt (1.2 s) | 2.5 s |
| Pistol | 3 | 12 | semi-automatic | 1.5 s |
| AR | 2 | 30 | automatic (~10 a second) | 2 s |
| Shotgun | 1 (within ~30 m) | 6 | pump, 8 pellets | 3 s |

- Ammo in reserve is unlimited. The bear has a health bar everyone in the hunt sees.
- **Points:** the bear banks points for every full minute it survives: 1, 2, 4, 8, 16 … (2^(minutes−1)). At 10 minutes the bear wins with **512**. Taken down, the bear keeps what it had banked; the hunter who landed the final hit gets a takedown. If the bear leaves it keeps its points; if every hunter leaves the bear keeps its points.
- **Gunshots** are loud and different for each gun (made in code), heard by everyone in the party anywhere on the map; tracers and muzzle flashes are seen by everyone.
- **Server-checked** (`shared/src/hunt/`, `server/src/rooms/hunt.ts`): the hunter's browser casts each shot (walls, trees and the ground stop it) and says where it hit the bear; the server checks the shooter, gun, ammo, fire rate, range and that the hit lies on the ray inside the bear, and owns health, the clock, roles and the end. Results go to the leaderboard (`record_hunt`).

---

## 17. Graphics quality and performance

- Targets: **60 fps on Medium** at 1080p on an M1 MacBook Air or a mid-range Windows laptop; **Low** must hold 30+ fps on older integrated graphics.
- **Realistic speed pass (round 3, 2026-10-17):** every lamp light costs every lit pixel, day or night, so the indoor and outdoor lamps share one small pool; Medium @1080p on the M1 went from 36–47 fps at the heavy spots to 60 at every perf spot (map-edge forest ~56), ≤373 draw calls (indoor doors no longer cast sun shadows).
- Presets Low/Medium/High + Auto (picks from the graphics chip's name, then steps down a level if the first ~10 s of play average too slow; remembered per computer). Measured on an M1 at 1080p (`e2e/perf.spec.ts`, 2026-10-12): Low and Medium 60 fps nearly everywhere (Medium ~50 at the deepest forest edge); High ~18 fps on an M1, it's for gaming PCs and Pro/Max Macs.
  - **Low:** 75% render resolution, 1024 shadows over 30 m, trees detailed to 18 m, 3 shared lamp lights, no flashlight shadow, no screen effects.
  - **Medium:** full resolution, 2048 shadows over 55 m (near and mid-distance trees cast shadows from a simpler stand-in shape, round 3), trees detailed to 22 m and medium detail to 48 m, sharper far-tree cards, 4 lamp lights shared indoors and out (they follow the nearest lamps that are on; round 3, was 4 indoor + 2 outdoor), flashlight shadow. **No bloom/SSAO/vignette on Medium** (Andrew, 2026-10-12): on an M1 they cost ~15 fps at 1080p.
  - **High:** 1.25× resolution, 4096 shadows over 55 m, trees detailed to 35 m, 9 shared lamp lights, bloom + ambient occlusion + vignette, and the lamp of the room you're in casts shadows.
- Budgets (Medium): under ~400 draw calls, under ~1.5M triangles on screen (the deep forest goes a little over), texture memory under ~1 GB (measured ~320 MB). Initial download to spawn under ~120 MB (measured ~25–35 MB); stream the rest after spawning.
- Use: meshopt GLBs (gltf-transform), instancing for trees/rocks/ferns, LODs plus **impostor cards** for far trees (copies **dissolve** between detail levels over a short band instead of swapping, so nothing pops; the sun's shadow box sits ahead of where you look; furniture shows through the windows from 12/15/30 m by preset, its shaders prepared at load) (each tree kind photographed once at load; ~2 triangles per far tree), interior vs exterior culling (inside the house the forest drops to its cheap levels), merged meshes, pixel-ratio cap, shadows and screen effects scaled by preset. Textures stay WebP: KTX2 isn't needed for the memory budget (revisit if a friend's laptop runs short of GPU memory).
- Trees: a good procedural tree generator for three.js (e.g., EZ-Tree) or CC0 tree models. Grass: instanced blades with wind on Medium/High, a textured ground on Low.
- **Cartoon look (2026-10-13 to 2026-10-16, retired; code switched off):** the forest keeps the realistic layout and LOD system, but each tree, bush, fern and rock is drawn with a Higgsfield cartoon model (pine, birch, maple, bush, fern, 2 rocks; `npm run build:toon` → `toon-scenery.glb`, ~6k / ~1.4k / ~250 triangles per tree level; the far levels carry the texture's colours on their corners so the sloppy simplifier can't smear them), and trees cast shadows from their simplest level. Grass blades on the lawn and driveway edges (draw distance 16/26/38 m by preset). Measured on the M1 at 1080p, Medium: 60 fps at every perf spot.

---

## 18. Assets and the Higgsfield budget

**Source order:** CC0 (Poly Haven models/textures/HDRIs, ambientCG) → Higgsfield → paid (Andrew approves). Every third-party asset goes in `docs/ASSETS.md` with its source and license.

**Rules:** no real brand logos/wordmarks; no copied artwork; all GLBs compressed; textures 2K max (4K only for the bear).

**Verified Higgsfield prices (2026-10-11):**

| Job | Model | Credits |
|---|---|---|
| Concept/TV/keyframe image | `gpt_image_2_5` | ~0.25 |
| Bear: image→3D + texture + PBR + rig + 1 clip | `meshy_v7_image_to_3d` | 47.5 |
| Each extra animation clip (re-rig + clip) | `meshy_rigging` | 8 |
| Prop / fish image→3D (textured, PBR) | `tripo_h3_1_image_to_3d` | 9 |
| 10 s video, 16:9 | `kling3_0` | 20 |
| 10 s video (pricier alternative) | `seedance_2_5` | 70 |

**Plan (~1,210 credits available):**

| Bucket | Estimate |
|---|---|
| Bear (concepts, model, 14 clips) | ~160 |
| One bear re-do if needed | ~50 |
| Loading video (keyframes + up to 3 tries) | ~60 |
| Props + 5 fish (~40 models) | ~360 |
| TV videos are Andrew's own clips (no credits); misc images | ~2 |
| Andrew's boat at the dock (concept + image→3D) | ~9 |
| **Reserve** (retries, sound effects, surprises) | ~575 |

---

## 19. Hosting and environments

- **Client → Vercel** (free Hobby plan): builds `/client`. Env: `VITE_SERVER_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Server → Railway** (~$5/month): runs `/server` (Colyseus over WebSockets; Vercel can't host an always-on game server). Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`.
- **Supabase** (free plan): auth + Postgres.
- Big assets ship from `/client/public`. If Vercel size limits become a problem, move them to Supabase Storage.
- `npm run dev` starts client + server locally. `.env.example` lists every variable.

---

## 20. Privacy and security

- **Never** put the property's street address or town name in code, UI, filenames, commit messages or generation prompts. It's just "the house".
- Secrets only in `.env` (gitignored) and hosting dashboards. The Supabase service-role key never reaches the browser.
- Validate everything the server receives (room codes, usernames, moves in Catan, bowling results within sane limits).
- The repo stays private.

---

## 21. Not in v1

Voice or text chat · mobile/touch · controllers · other bear species or skins (the bear hunt's human hunter, §16c, is the one other character) · swimming · vehicles other than the motorcycle (§5.4, added 2026-10-16) · weapons outside the bear hunt · public matchmaking · monetization · weather.

---

## 22. Phases

Detailed checklist with approval checkpoints: `PROGRESS.md`.

1. **Walk the property with friends** — bear, multiplayer, map, house shell with working doors, day/night, menus, deployed link.
2. **The house comes alive** — furniture, greenhouse, TVs, fishing, Google sign-in, friends, leaderboard.
3. **Bowling alley.**
4. **Catan.**
5. **Polish** — sound, visuals, performance on the slowest friend's laptop, bug bash.
