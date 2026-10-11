# The Den

A private multiplayer 3D browser game: grizzly bears, a farmhouse in the Maine woods, fishing, bowling and Catan with friends.

## What's in this folder
| File | What it is |
|---|---|
| `CLAUDE.md` | Rules Claude Code follows every session (read automatically) |
| `GAME_SPEC.md` | The full game design: what to build, down to the numbers |
| `PROGRESS.md` | Checklist of every milestone, approval checkpoints, credit ledger |
| `docs/floorplan.json` | The house layout (source of truth) |
| `docs/floorplan.png` | Picture of the layout to check |
| `reference/house-photos/` | Listing photos, named by room |
| `reference/map/` | Google Earth overhead + aerial photo of the property |
| `assets/audio/allen-weiss.mp3` | Loading-screen and menu song |
| `prompts/` | What to paste into Claude Code |

## Start a session
- **First time:** paste `prompts/session-1.md` into Claude Code.
- **Every time after:** paste `prompts/next-session.md`.

## For developers
```
npm install
npm run dev        # game server on :2567 + website on http://localhost:5173
npm test           # unit tests (shared rules, server logic)
npm run test:e2e   # browser smoke tests (first time: npx playwright install chromium)
npm run typecheck
```
Code: `client/` (website + 3D game), `server/` (multiplayer), `shared/` (rules both use). Copy `.env.example` to `.env` only when you need non-default settings.
