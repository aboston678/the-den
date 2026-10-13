import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";
import sharp from "sharp";

// Dev tool, not a check (BEARSHOTS=1): the cartoon bear in the turntable viewer, standing (front,
// side, back) and at a telling moment of every clip, plus one contact sheet, in review/bear/.
//   BEARSHOTS=1 npx playwright test e2e/tools-bear-shots.spec.ts
test.skip(!process.env.BEARSHOTS, "dev tool: set BEARSHOTS=1 to run");

const OUT = process.env.OUT ?? "review/bear";
const MODEL = process.env.MODEL ?? "/models/bear-toon.glb";
/** label, clip, seconds in, turntable angle */
const SHOTS: [string, string, number, number][] = [
  ["front", "Idle", 0.5, 0], ["side", "Idle", 0.5, 90], ["back", "Idle", 0.5, 180],
  ["walk", "Walk", 0.3, 60], ["run", "Run", 0.15, 60], ["jump", "Jump", 0.7, 60],
  ["roar", "Roar", 1.6, 20], ["dance", "Dance", 2.0, 20], ["door", "OpenDoor", 2.0, 60],
  ["sit", "SitIdle", 2.0, 60], ["cast", "Cast", 1.6, 60], ["reel", "Reel", 1.5, 60],
  ["bowl", "Bowl", 3.5, 60], ["celebrate", "Celebrate", 0.8, 20], ["stand-up", "StandUp", 3.0, 60],
];

test("cartoon bear shots", async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 800, height: 800 });
  for (const [label, clip, t, angle] of SHOTS) {
    await page.goto(`/viewer.html?model=${MODEL}&spin=0&angle=${angle}&clip=${clip}&t=${t}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${label}.png` });
  }
  const S = 400, cols = 5;
  const tiles = await Promise.all(SHOTS.map(([label]) => sharp(`${OUT}/${label}.png`).resize(S, S).toBuffer()));
  await sharp({ create: { width: S * cols, height: S * Math.ceil(SHOTS.length / cols), channels: 3, background: "#111" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * S, top: Math.floor(i / cols) * S })))
    .png().toFile(`${OUT}/contact-sheet.png`);
});
