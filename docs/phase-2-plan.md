# Phase 2 plan: "The house comes alive"

## Context
Phase 1 is finished: Andrew confirmed the two-computer friend test (1.13) on 2026-10-12, so 1.13 gets ticked.
Phase 2 (GAME_SPEC §8.2–8.4, §13, §14) adds furniture, greenhouse, TVs (Andrew's private clips), his boat, fishing,
Google sign-in, friends and the leaderboard. **Andrew's call (2026-10-12): run Phase 2 as one batch, not
stop-and-approve per milestone.** So every decision, credit spend and dashboard task is pulled to the
**start**, then I build 2.1 → 2.6 straight through (still committing + pushing after each milestone so
nothing is lost), then **one combined review** with Andrew, then deploy + friend test (2.7).
Answers so far: ~10 paid hero furniture pieces for the main floor (~90 credits); keep the milestone order.

## Step 0: Housekeeping (no approval needed)
- PROGRESS.md: tick 1.13 (Andrew confirmed), status line → Phase 2; decision log row: "Phase 2 run as one
  batch: approvals up front, one review at the end (Andrew)". CLAUDE.md "one milestone at a time" still
  applies to commit/verify order; only the stop-for-approval points move.
- Work on branch `phase-2` (main auto-deploys to the live site); merge at 2.7.

## Step 1: The one up-front approval round (Andrew, ~1 sitting)
1. **Credit batch** (price-check each with `get_cost: true` first; log every spend in the ledger):
   - ~10 main-floor hero pieces: a clean product-shot concept image each (`gpt_image_2_5`, ~0.25) shown as
     one contact sheet → Andrew OKs the set → `tripo_h3_1_image_to_3d` (9 each, ~90).
     Candidates: grand piano, harp, striped wingback chair, blue camelback sofa, mahogany china cabinet,
     Chippendale dining chair, cream leather armchair + ottoman, pot rack with pans, Tiffany floor lamp,
     black spindle bench.
   - Optional ~4 more for 2.2 (four-poster bed, tufted Chesterfield, leather recliner, canoe) ~36.
   - 5 fish (sunfish, perch, crappie, smallmouth, largemouth) via concept → Tripo: ~46.
   - 2 TV images (pigeons, salmon) `gpt_image_2_5` 16:9: ~0.5.
   - Total ask ≈ 175 credits (1,024.5 available). No retries without asking.
2. ~~Dogs~~: dropped.
3. **Supabase + Google setup (§14, ~15 min of clicking):** numbered click-by-click steps, one action per
   step: create Supabase project, Google Cloud OAuth client, enable Google in Supabase, add redirect URLs
   (localhost + the Vercel site), paste the table SQL I give him into the SQL editor, put keys in the
   Vercel + Railway dashboards and give me the public URL/anon key for local `.env`. He can do this while I
   build furniture.

## Step 2: Build straight through (commit + push + PROGRESS note after each)

### 2.1 Furnish the main floor
- **Placement data in `/shared`**: `shared/src/house/furniture.ts` — per room: piece id, model, floorplan
  x/z, rotation, footprint box.  Unit test:
  nothing overlaps walls/doorways/stairs, every door swing stays clear.
- **Models**: hero GLBs + Poly Haven CC0 furniture (audit the catalog first; extend `tools/fetch-polyhaven.mjs`)
  packed by a new `tools/build-furniture.mjs` (same pattern as `tools/build-outdoor-props.mjs`: simplify,
  meshopt, WebP ≤1K) → `client/public/models/furniture.glb`.
- **Code-built pieces** in `client/src/game/house/furniture/` (small files by kind): bookshelves full of books
  (office), kitchen cabinets/island/counters, rugs (braided, oriental), curtains (floral swags, plaid, tie-back),
  picture frames, side tables, ceiling fan, candle chandelier, appliances (range, fridge, microwave).
- **Collision**: one Rapier box per footprint, added like `House.tsx` does for walls.
- **Performance** (Medium is at ~353 of the 400 draw-call budget): merge all static furniture per material
  per level; hide a level's furniture when you're outside and far away (reuse `insideHouse()` /
  `indoor` from `client/src/game/house/lights.ts`). `e2e/perf.spec.ts` must stay green.
- Formal dining room keeps exactly 4 chairs (Catan), though the photo shows more. Leave chair "seat anchors"
  for Phase 4.

### 2.2 Upstairs, basement den, greenhouse, TVs
- Same system for the 5 upstairs rooms + basement den (Chesterfield, recliner, globe table, nautical chart,
  pine armoire).
- Greenhouse: plant benches/shelves, hanging baskets, stacks of generic donut-hole boxes and red-label pasta-ring
  cans (labels drawn in code, no logos), cooler with salmon on ice + smoked packs, dark-green canoe on
  sawhorses, crates/jars/firewood.
- TVs (den + common area): screen material crossfades the two images every ~8 s.

### 2.3 Dogs: dropped (Andrew, 2026-10-12)
No good free dogs; he chose not to buy any. Skip straight to 2.4.

### 2.4 Fishing
- `shared/src/fishing.ts`: species table, weight = min + (max−min)·r^2.2, bite 10–45 s, tension/surge model,
  "is this point stream water" (from `shared/src/world/layout.ts`). Unit-tested.
- Server owns rods, bite timers, the fight (tension at 20 Hz from rate-limited R presses) and results.
  Player schema gains fishing fields (rod held, lure x/z, state, tension) so everyone sees line + bobber + fight.
- Client: rod bucket at the dock (E take/return; rod put away on entering the house), hold-LMB charge + release
  cast up to ~25 m using the Cast clip, bobber + line, `FISH ON! Spam R`, tension meter, Reel clip, snap,
  catch card (species, lb/oz, personal best), Celebrate for big fish, fish models with a code wiggle.
  Personal best kept per session until 2.6 saves it. CC0 sounds (whoosh, clicks, splash, snap).

### 2.5 Google sign-in
- Add `@supabase/supabase-js` (the spec's stack). Sign-in replaces the nickname box (no guest mode);
  first sign-in picks a username (3–16, letters/numbers/underscore; validator in `/shared`, unit-tested).
- Server verifies the Supabase token on join; name tag = username; user id stays server-side.
- **Dev/test bypass** (dev tools only, like `devToolsOn()`): fake users so Playwright tests run without Google.

### 2.6 Friends + leaderboard
- Tables `profiles`, `friendships`, `stats`, `catches` (+ empty `bowling_games`, `catan_games`) with row-level
  security; only the game server writes stats/catches (service-role key, Railway only).
- Home screen: FRIENDS (search, request, accept/decline, list), LEADERBOARD (Fish / Bowling / Catan; All /
  Friends tabs; refreshes when a party member lands a fish), SIGN OUT.

## Step 3: One combined review [ANDREW APPROVES]
Screenshot tour of every furnished room + greenhouse + TVs, a short clip of a catch, sign-in and
leaderboard screens. Fix what he flags.

## Step 4: 2.7 Deploy + friend test
Merge `phase-2` → main (auto-deploys Vercel + Railway), check `/health` commit, run e2e against the live site,
Andrew + a friend sign in, fish, see each other on the leaderboard. 🎉

## Still a hard stop mid-batch (CLAUDE.md rules)
Any credit spend beyond the approved batch or any retry; any purchase; any spec change that turns out
necessary (explain, then log in the decision log).

## Verification (every milestone)
- `npm test` (new unit tests: furniture placement, fishing tables/fight, username) and
  `npm run typecheck`.
- Playwright: new `e2e/furniture.spec.ts` (can't walk through furniture, doors still clear)
  and `e2e/fishing.spec.ts` with **two browser contexts** seeing the same line / catch (dev-only
  quick-bite), `e2e/auth.spec.ts` with the dev bypass; tours with screenshots; console must be free of WebGL
  errors; `e2e/perf.spec.ts` stays inside Medium's budgets (close the browser pane before measuring).
