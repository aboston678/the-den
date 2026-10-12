# THE DEN — Game Spec

Version 1 · 2026-10-11 · Owner: Andrew
This is the source of truth. Build what is written here. If something here won't work, stop and propose a change (see CLAUDE.md). Progress lives in `PROGRESS.md`. The house layout lives in `docs/floorplan.json`.

---

## 1. The game in one paragraph

The Den is a private, browser-based, multiplayer 3D game for Andrew and his friends (max 6 per party). Everyone plays the same realistic upright grizzly bear. You load in at the end of a wooded driveway in summer Maine, walk out of the trees to a big white farmhouse on a lawn, and hang out: open doors, explore every room, roar at each other, dance, pet the three house dogs (Merlin, Raptor, Luna), fish off the dock in the stream, bowl on the two-lane alley in the basement, and play full-rules Catan around the dining-room table. A 30-minute day and 30-minute night cycle runs the whole time. Stats (fish caught, bowling high score, Catan wins) go on a leaderboard you can filter to friends.

**Visual target:** grounded, cinematic, photoreal-leaning, modern indie quality (think the lighting mood of The Long Dark / Sons of the Forest). Not cartoon, not low-poly, not retro. Polish comes from good assets, lighting, post-processing and sound, not from feature count.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Name | **The Den** |
| Platform | Desktop web browser (Chrome, Edge, Safari, Firefox) on laptops. Keyboard + mouse only. No mobile, no controllers. |
| Players | 1–6 per party. Join a party with a room code. |
| Character | ONE character: realistic **upright (two-legged) grizzly bear**, made, rigged and animated with Higgsfield. Everyone looks the same; name tags tell bears apart. |
| Camera | Third-person, behind and slightly above the bear. |
| Map | Real property (see `reference/`): wooded driveway, lawn, house, mixed forest, stream with a dock. Summer. |
| House | Built from `docs/floorplan.json` and the listing photos, at **1.25× real scale** (doors, rooms, stairs, bowling alley, everything). |
| Day/night | 30 min day → 4 min dusk → 30 min night → 4 min dawn (68 min loop), synced for the party. House lights always on inside. Flashlight at night. |
| Accounts | Phase 2: **Sign in with Google** (Supabase). Everyone signs in; no guest mode. Phase 1 uses a temporary nickname box. |
| Leaderboard | Fish caught (total), bowling high score (best game), Catan wins (total). Tabs: All / Friends. |
| Board game | **Catan**, full base-game rules, 2–4 players, in the formal dining room. Private game, so the name stays. Our own art, not the official board art. |
| Bowling | Basement, 2 lanes, ball return, real physics with spin, Wii-Bowling-style scoring and feel. |
| Dogs | Merlin (German Shepherd), Raptor (black Lab), Luna (English Springer Spaniel). Inside the house only. |
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
- **Authority:** Bear movement is client-authoritative (server clamps speed/teleports). Server is authoritative for: time of day, doors, dogs, fishing bite timers and results, bowling turns/scores, the Catan game, and all stat writes.
- **Tests:** Vitest for `/shared` (Catan rules, bowling scoring, fishing rolls) and server logic. Playwright for browser smoke tests and screenshots (see CLAUDE.md).

---

## 4. Units, scale and world layout

- 1 game unit = 1 meter. The house and everything in it are built at **1.25×** the real-world numbers in `floorplan.json` (a real 2.03 m door becomes 2.54 m). Reason: the bear is 2.1 m tall upright and the third-person camera needs room indoors.
- World: **300 m × 300 m**, house roughly in the middle. North = −Z, East = +X (match `floorplan.json`: x west→east, z north→south).
- Reference: `reference/map/google-earth-overhead.jpg` (top-down) and `reference/map/aerial-oblique.jpg` (the real driveway winding in from the northwest, the stream on the east).

**Layout:**
- **House** in a lawn clearing (~70 m × 60 m), more lawn to the south (back) and east than the north. Front of the house faces north.
- **Ground:** the front (north) lawn is level with the main floor; the ground drops toward the back (south) lawn so the basement walks out on the south side: at basement level (~3.4 m down at 1.25×) by the den's doors, rising to ~2 m below the deck at the deck's east end (Andrew, 2026-10-11). It keeps sloping gently east down to the stream.
- **Driveway:** asphalt, ~4 m wide, starts at the **spawn point on the northwest edge of the map** and winds ~170 m through the woods to a paved apron in front of the garage doors (west end of the house). Dry-stacked stone retaining wall along the apron (see `greenhouse-exterior_and_garage-driveway.jpg`).
- **Forest:** dense mixed Maine woods: tall eastern white pines (dominant), red maple, red oak, paper birch, hemlock. Ferns, saplings, fallen logs, mossy boulders. Walkable between trees. Dry-stone walls along parts of the woodline. Full green summer foliage.
- **Yard details:** big boulder on the front lawn, rhododendrons along the front foundation, shrub beds behind the house, a few huge pines near the house (photos).
- **Stream:** ~20 m wide, slow, flowing north→south along the east side, about **110 m east of the house**. Banks 1–2 m above the water. A 3 m shallow strip along our bank is wadeable; beyond that an invisible wall. The far bank is scenery only.
- **Dock:** wooden, 1.8 m wide, 8 m long, straight out from our bank due east of the house. A **bucket of fishing rods** sits at the base of the dock.
- **Trail:** packed dirt + pine needles from the back lawn to the dock (~90 m).
- **Perimeter:** invisible boundary ~10 m inside the map edge, disguised by denser trees, ferns, rocks and fog falloff.
- **Spawn:** the start of the driveway (NW edge). Up to 6 players spawn in a short line. The house should be hidden by trees at spawn; the reveal happens as you walk out of the woods.

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

### 5.2 Animation clips (Higgsfield animation library IDs, verified)

| Action | Clip (id) | Notes |
|---|---|---|
| Idle | Idle (0) | in the base model; alt Idle_02 (11) |
| Walk | Casual_Walk (30) | preview first: Slow_Orc_Walk (119) or Monster_Walk (112) may read heavier and more bear-like |
| Sprint | RunFast (16) | alt Run_02 (14) |
| Jump | Regular_Jump (466) | |
| Roar (Y) | Chest_Pound_Taunt (88) | plus roar sound |
| Dance (B) | All_Night_Dance (64) | Andrew may pick any clip from the Dancing category instead |
| Open door | open_door (285) | |
| Pet a dog | Male_Bend_Over_Pick_Up (276) | use the reach-down portion |
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
- **Roar (Y):** plays the roar clip + loud positional roar (audible ~60 m). Bears within 6 m get a small camera shake. 3 s cooldown.
- **Dance (B):** loops until you move or press B again.
- **Bumping:** bears are solid to each other. When capsules touch, both get pushed apart along the contact (soft shove; stronger if sprinting, with a small stagger). Each client applies the shove to its own bear.
- **Name tags** above every other bear (fade with distance, hidden behind walls).

---

## 6. Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Shift (hold) | Sprint |
| Space | Jump |
| E | Interact: open/close doors, pet dogs, take/return fishing rod, sit at the Catan table, join a bowling lane |
| G | Dog follow / stay (nearest dog) |
| Y | Roar |
| B | Dance |
| F | Flashlight on/off |
| Left mouse | Cast (hold to charge, release) · bowling throw |
| R (spam) | Reel in a hooked fish |
| Scroll | Camera zoom |
| Tab (hold) | Party list |
| Esc | Pause menu (Resume, Settings, Leave to home screen) |

Show a context prompt like `[E] Open door` when an interactable is within ~2 m and in front of the bear.

---

## 7. Multiplayer

- **Party flow:** Home screen → CREATE PARTY generates a 5-character code (letters A–Z without I and O, digits 2–9) → friends pick JOIN PARTY and type the code → everyone's bears line up on the home screen → the host presses PLAY → everyone loads into the map at the spawn.
- Max 6. If the host leaves, the next player becomes host. Joining mid-game is allowed (you spawn at the driveway).
- Reconnect window 30 s (Colyseus reconnection) so a page blip doesn't kick you.
- **Synced state:** players (pose, animation, flags: flashlight, holding rod, sitting, dancing), doors (open/closed), dogs (position, animation, follow target), time of day, fishing (each player's line/bobber/fish state), bowling (lane state, scores, the active roll's ball + pin transforms), Catan (full game state).
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
- **Bowling alley:** basement, see §15. It extends past the house footprint underground.

### 8.3 Greenhouse (bear prepping for winter)
Shelves and benches of plants (tomatoes, herbs, ferns, hanging baskets) plus the winter stockpile:
- Tall stacks of **donut-hole boxes in the Munchkins spirit** (generic box, no real logo or wordmark)
- Stacks of **canned pasta rings in the SpaghettiOs spirit** (generic red label, no real logo)
- **Salmon**: whole salmon on ice in a cooler, plus smoked-salmon packs
- A **canoe** (dark green) resting on two sawhorses
- Filler is fine: crates, jars, firewood.

### 8.4 TVs
TVs in the basement den and the common area. Each shows a slow crossfading slideshow (every ~8 s) of two images generated with `gpt_image_2_5` (16:9, ~0.25 credits each):
1. A big flock of pigeons in flight against the sky.
2. A school of salmon swimming upstream underwater, sunbeams through clear water.

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
- **Sound effects:** footsteps by surface (grass, dirt, asphalt, wood, carpet, tile), roar, doors, garage door, dog barks/panting, cast whoosh, reel clicks, splash, line snap, bowling roll/pin crash/ball return, dice, UI clicks.
- Sources: public-domain (US National Park Service) and CC0 libraries first; simple sounds (wind, room hum, fire crackle) made in code. Higgsfield's sound-effect model only works inside its own website builder, so it isn't an option for loose sound files; anything else missing goes to Andrew.
- Settings: Music, Effects, Ambience volume sliders.

---

## 11. Menus and UI

**Style:** dark and premium, warm cabin-outdoors palette (deep forest green, bark brown, cream, ember orange). Big bold condensed headings, clean body text, smooth transitions, light film grain/vignette. Feels like a real game launcher, not a website.

1. **Splash:** black screen, "Click to start" (browsers only play sound after a click). Every page load, including a refresh.
2. **Intro (lyric video, Andrew 2026-10-12):** the 19-second song clip plays while the camera glides slowly over the 3D property at dusk. The lyrics come on screen one line at a time as they're sung ("There is a bear in [town], Maine" / "and he does not have a coat" / "on purpose"); the THE DEN logo (Higgsfield art, Andrew's pick #2) fades in when the music starts (~14 s); at the end you land in the home screen and the full song carries on from that point and loops. **Skip intro** button bottom right. Plays from the start on every page load; a refreshed player still rejoins their party afterwards.
   **Loading screen** (Play → spawn): the logo, a real progress bar and rotating tips ("Press Y to roar", "Press F for your flashlight", "Merlin, Raptor and Luna live inside. Press E to pet them."), fading into the game. The AI loading video is dropped: Andrew chose the 3D property for the intro instead (saves ~20+ credits).
3. **Home screen (Fortnite-style):** your bear on a slowly rotating round pedestal (drag to spin it) in a moody lit scene; party members' bears stand beside yours with name tags (up to 6). Buttons: PLAY (host), CREATE PARTY, JOIN PARTY, SETTINGS, plus LEADERBOARD, FRIENDS and SIGN OUT from Phase 2. Party code shown big with a copy button.
4. **Settings:** graphics preset (Auto/Low/Medium/High), music/effects/ambience volume, mouse sensitivity, invert Y.
5. **HUD (minimal):** interaction prompt, fishing UI, bowling UI, small time-of-day icon, party list on Tab.
6. **Pause (Esc):** Resume, Settings, Leave to home screen.

---

## 12. Dogs (Phase 2)

- **Merlin** (German Shepherd), **Raptor** (black Labrador), **Luna** (English Springer Spaniel, liver-and-white).
- Higgsfield can only rig two-legged characters, so the dogs must be **realistic, rigged, animated dog models from elsewhere** (needs at least walk, trot, idle, sit, lie down, tail wag). Find free CC-BY/CC0 options first; if none look good enough, give Andrew 2–3 links to buy. **[ANDREW APPROVES]** any purchase (budget ≤ $150 total). Log licenses in `docs/ASSETS.md`.
- **Inside only, main floor only** (no stairs).
- **Wander:** every 10–25 s pick a random spot in a random main-floor room, walk there, then idle/sit/lie down for a while. Keep ~1 m from bears. Occasionally drink from a water bowl in the kitchen. Bark now and then (every 30–90 s at random) and when a bear roars nearby.
- **Pet (E within 1.8 m):** bear plays the pet clip, the dog sits, wags, little heart particles, happy whine. The dog hangs around that bear for ~10 s.
- **Follow (G within 4 m, nearest dog):** dog trots after you 1.5–2.5 m behind. G again = "Stay". If you leave the main floor (outside, upstairs, basement), the dog waits at the doorway/stairs, then goes back to wandering after 20 s.
- Name tag when you look at a dog within 6 m. Server drives the dogs so everyone sees the same thing.

---

## 13. Fishing (Phase 2)

- **Rods:** E at the bucket on the dock takes a rod (unlimited rods). E at the bucket puts it back. Walking into the house puts the rod away automatically.
- **Cast:** hold left mouse to charge a power bar, release to cast where the camera aims (up to ~25 m). The lure must land on stream water. You can fish from the dock or anywhere along our bank.
- **Bite:** server picks a random time **10–45 s** after the lure lands. Recasting resets it. On a bite: the bobber plunges, splash + sound, `FISH ON! Spam R` prompt. You have 2.5 s to start reeling or it gets away.
- **Reeling:** each R press reels in line and raises tension; tension drains when you're not pressing; the fish surges every 1.5–4 s (bigger fish surge harder). Tension hits 100% → line snaps ("Snapped!"). Line in to ~1.5 m → landed. Tune so a big bass takes ~10–15 s and is genuinely tense.
- **Landed:** bear holds the fish up (celebrate clip for big ones), catch card shows species, weight in lb/oz, and "New personal best!" when it is. The fish is released back into the water. The catch counts toward **fish caught**.
- Everyone sees your line, bobber, the fight and the fish.

| Species | Chance | Weight (lb) | Fight |
|---|---|---|---|
| Sunfish (pumpkinseed) | 28% | 0.1 – 1.0 | weak |
| Yellow perch | 24% | 0.1 – 1.5 | weak |
| Crappie | 16% | 0.25 – 2.5 | medium |
| Smallmouth bass | 17% | 0.5 – 8.0 | strong, jumps |
| Largemouth bass | 15% | 0.5 – 8.0 | strong |

Weight = min + (max − min) × r^2.2 (r random 0–1), so big fish are rare. Fish models: one per species via Higgsfield image→3D (9 credits each), static mesh with a code-driven wiggle.

---

## 14. Accounts, friends, leaderboard (Phase 2)

- **Supabase Auth with Google.** First sign-in: pick a unique username (3–16 characters, letters/numbers/underscore). It's the name tag above your bear. Setting up Google sign-in takes Andrew ~15 minutes of clicking in Google Cloud and Supabase; walk him through it.
- **Friends:** search by username → send request → accept/decline. Friends list on the home screen.
- **Leaderboard** (home screen): Fish caught · Bowling high score · Catan wins. Tabs: All players / Friends.
- **Tables (suggested):** `profiles` (id, username), `friendships` (requester, addressee, status), `stats` (user_id, fish_caught, bowling_high_score, catan_wins), `catches` (user_id, species, weight_lb, caught_at), `bowling_games`, `catan_games`. Row-level security on everything.
- **Only the game server writes stats** (service-role key). The browser never writes stats directly.

---

## 15. Bowling alley (Phase 3)

- **Build:** two side-by-side lanes running west→east (bowler at the west end) with gutters, foul line, arrows/dots, ball return between the lanes, ball rack with a few ball colors, pinsetter area with sweep bar, overhead score monitors, lounge seating. Regulation proportions × 1.25. Pins = lathe geometry from a regulation pin profile.
- **Physics (Rapier):** realistic masses (ball ~7 kg, pins ~1.6 kg), low friction on the oiled front ~2/3 of the lane and higher friction on the dry back end so a spinning ball hooks late, like real bowling.
- **Controls (Wii-Bowling feel for a mouse):**
  1. Position: A/D slides the bear left/right on the approach.
  2. Aim: move the mouse left/right to swing the aim arrow (±6°).
  3. Throw: hold left mouse to start the approach/backswing, pull the mouse back then push it forward and release. Forward mouse speed = ball speed. Sideways mouse drift at release = spin direction and amount.
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
- Win → **Catan wins** +1, celebrate clip.

---

## 17. Graphics quality and performance

- Targets: **60 fps on Medium** at 1080p on an M1 MacBook Air or a mid-range Windows laptop; **Low** must hold 30+ fps on older integrated graphics.
- Presets Low/Medium/High + Auto (picks based on the GPU and the first few seconds of frame times).
- Budgets (Medium): under ~400 draw calls, under ~1.5M triangles on screen, texture memory under ~1 GB. Initial download to spawn under ~120 MB; stream the rest after spawning.
- Use: KTX2 textures, meshopt/Draco GLBs (gltf-transform), instancing for trees/grass/rocks, LODs/impostors for far trees, interior vs exterior culling (don't render the forest's detail when deep inside, don't render furniture from far outside), pixel-ratio cap, shadows/SSAO/bloom scaled by preset.
- Trees: a good procedural tree generator for three.js (e.g., EZ-Tree) or CC0 tree models. Grass: instanced blades with wind on Medium/High, a textured ground on Low.

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
| TV images, misc images | ~5 |
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

Voice or text chat · mobile/touch · controllers · other bear species or skins · swimming · vehicles · public matchmaking · monetization · weather.

---

## 22. Phases

Detailed checklist with approval checkpoints: `PROGRESS.md`.

1. **Walk the property with friends** — bear, multiplayer, map, house shell with working doors, day/night, menus, deployed link.
2. **The house comes alive** — furniture, greenhouse, TVs, dogs, fishing, Google sign-in, friends, leaderboard.
3. **Bowling alley.**
4. **Catan.**
5. **Polish** — sound, visuals, performance on the slowest friend's laptop, bug bash.
