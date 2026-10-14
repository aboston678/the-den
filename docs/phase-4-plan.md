# Phase 4 plan: Catan with "house dice" (approved by Andrew 2026-10-14)

## Context
Phase 4 builds full base-game Catan at the dining-room table (GAME_SPEC §16), the same way bowling was built:
rules in `/shared` with thorough tests, the game server in charge, the board on the real table for everyone in
the room to see.

**The twist (Andrew, 2026-10-14):** a secret **house dice** mode for a prank on a friend.
- The board stays exactly standard: same number tokens, same dots (6 and 8 still show 5 red dots), same
  "6s and 8s can't touch" rule. Only the dice are weighted.
- **Flipped** weighting. How often each total comes up out of every 36 rolls:

  | Total | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | Fair dice | 1 | 2 | 3 | 4 | 5 | 6 | 5 | 4 | 3 | 2 | 1 |
  | House dice | 5 | 4 | 3 | 2 | 1 | 6 | 1 | 2 | 3 | 4 | 5 |

  7 keeps its normal 1-in-6, so the robber shows up as usual and nothing about 7s looks off.
- **Secret switch.** Dice are fair by default. To turn on house dice, **hold H while clicking Start game**.
  Only the person who did it sees a tiny 1.5-second tick in the corner of their screen; nobody else's screen
  shows anything. It switches off again when that game ends.
- **No reveal** at the end (no dice stats anywhere in the game; that would give it away).
- **Wins count** on the leaderboard as normal.
- The prank works because the dice hit everyone at the table the same way: whoever builds on 6s and 8s (the
  normal smart move) gets starved, and whoever is in on it builds on 2s, 3s, 11s and 12s.

**Keeping it secret:** the on/off flag lives only in the game server's memory. It's never sent to anyone's
browser, so a curious friend poking at the game in their browser can't find it. The weight table lives in
server-only code that never goes to the browser either, and before going live we'll check the website's files
to make sure it isn't there. The dice animation always lands on the faces the server picked.

**Two small spec fixes found while planning:**
- A disconnected Catan player gets 60 s to come back (spec §16), longer than the 30 s everyone else gets today.
- The board is about 1.2 m across to fit the table (1.9 × 1.4 m in game).

## How we run it
Same as Phase 3: a `phase-4` branch from main, build 4.1 → 4.3 straight through with a commit + push after
each, screenshots to Andrew once the table and board are built, then one play-test review at 4.4 before it
goes live. No Higgsfield credits are planned (board, pieces and dice are built in code); if a texture would
clearly help, it's ~0.25 credits and I'll ask first.

## 4.1 Rules engine (`shared/src/catan/`)
- `topology.ts`: the board's shape: 19 hexes, 54 corners, 72 edges, the coast, and what touches what.
- `board.ts`: random board each game (terrain, tokens, 9 harbors), 6/8 can't touch, robber on the desert.
- `rules.ts`: every move checked: setup snake order, roll and produce, 7 (discard half, robber, steal),
  roads/settlements/cities with the distance rule and piece limits, bank 4:1, harbors 3:1/2:1, player
  trades (offer, accept, decline, counter), development cards and their limits, longest road (broken by
  opponents), largest army, win at 10 on your own turn. The rules never know which dice are in use.
- `view.ts`: what everyone sees (card counts) vs. what only you see (your hand, your development cards).
- `dice.ts` (fair + house). It is imported only by the server, through its own entry in
  `shared/package.json`, so it never gets bundled into the website.
- Tests: every rule above, plus dice checked statistically over 360,000 seeded rolls (fair matches 1-2-3-4-5-6,
  house matches the flipped table, 7 stays at 1 in 6), and 200 random full games that all finish without
  losing or inventing a card.

## 4.2 Table, board, sitting, board camera
- Seats from the 4 dining chairs; E to sit (SitDown → SitIdle), E to stand (StandUp).
- Wood-and-felt board on the table: hex tiles, number tokens with dots, harbors, roads, settlements, cities,
  robber, two dice with a tumble that lands on the server's numbers, and the same tumble on every screen.
- Seated players switch to a board camera from their side of the table; click spots light up only where a
  move is legal. Everyone else in the room sees the board in 3D.
- **Checkpoint:** screenshots to Andrew.

## 4.3 Turn controls
Hand bar, build buttons with costs, Roll / End turn, discard picker, robber and steal picker, bank and harbor
trade, player trade (propose, accept, decline, counter), development cards (Year of Plenty and Monopoly
pickers), scoreboard (points, longest road, largest army), game log, winner banner with the Celebrate clip,
dice sound. The secret switch is wired here.

## 4.4 Online play, leaderboard, deploy
- Dropped player: game pauses with "waiting for X (52 s)"; after 60 s they're removed, their cards go back
  to the bank, and the game ends with no winner if fewer than 2 are left. Coming back restores your hand.
- Bears standing nearby see a compact scoreboard.
- Wins saved for signed-in players (`catan_games` + `stats.catan_wins`; no database setup needed from Andrew).
  Leaderboard's Catan tab goes live.
- Browser test with three bears (two playing, one watching): setup, rolls, building, trades, a 7, a reload
  mid-game, a win and the leaderboard. Plus a server test that the game looks identical to other players with
  house dice on or off.
- Deploy, then the friend test (and the prank). **[ANDREW APPROVES]**

## Paperwork
GAME_SPEC §16 gets the house-dice section and the 60 s reconnect. Decision log entries: house dice
(flipped, secret switch, no reveal, wins count); Phase 4 runs as one batch.
