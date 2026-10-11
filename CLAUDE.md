# CLAUDE.md: rules for Claude Code on The Den

You are building **The Den**, a private multiplayer 3D browser game, for Andrew. Read this file every session.

## Start of every session
1. Read `GAME_SPEC.md` (what to build), `PROGRESS.md` (where we are), and `docs/floorplan.json` (the house layout).
2. When building anything visual, look at the matching images in `reference/` first.
3. Tell Andrew in 2–3 plain-English sentences what you'll do this session.

## How to work
- **One milestone at a time, in the order in `PROGRESS.md`.** Don't start the next one until the current one works, is verified, and is committed.
- **Verify by actually running it:** start the dev servers, open the game with Playwright (headless Chromium), take screenshots and look at them, and read the browser console for errors. For anything multiplayer, open two browser contexts and check that both see each other. Fix problems before marking a milestone done.
- **Save progress constantly.** After every milestone (and before any long step): tick the box in `PROGRESS.md`, add a 1–3 line note and what's next, `git commit` with a clear message, and `git push`. Andrew's plan has usage limits, so a session can end without warning. Nothing should ever be lost.
- **The spec is the source of truth.** If something in it won't work or there's a clearly better way, stop and explain the change in plain English. Update `GAME_SPEC.md` only after Andrew agrees, and log it in the decision log in `PROGRESS.md`.
- Keep the tech stack in the spec. Don't add a major library without saying why.
- Prefer simple, readable code over clever code. Keep files small and organized by feature.

## Working with Andrew
- Andrew is **not technical**. Never ask him to edit code or config files.
- When he has to do something himself (create an account, click in a dashboard, copy a key, download a file, approve a purchase), give **numbered, click-by-click steps, one action per step**, and wait for him to confirm before continuing.
- Explain results briefly, in plain English. For visual work, show him screenshots.
- Stop for his approval at every **[ANDREW APPROVES]** checkpoint in `PROGRESS.md`.

## Higgsfield credits (about 1,210 to start)
- Before every paid generation, run the same call with `get_cost: true` first and tell Andrew the price.
- Get Andrew's OK for any single job over 25 credits and for any batch. Cheap images (under 1 credit) can run freely during concept work.
- Log every spend in the credit ledger in `PROGRESS.md` (date, what, model, credits, running total).
- Never regenerate or "try again" on a paid job without asking.
- If a generation times out, check the job's status before doing anything; never resubmit blindly.
- Prices verified on 2026-10-11 are in `GAME_SPEC.md` §18.

## Hard rules
- **Never** put the property's street address or town name in code, UI, filenames, commit messages, or generation prompts. It's just "the house".
- Secrets live only in `.env` files (gitignored) and in the hosting dashboards. The Supabase service-role key is server-only.
- No real brand logos or wordmarks in anything generated.
- Record the source and license of every third-party asset in `docs/ASSETS.md`.
- The GitHub repo stays private.
