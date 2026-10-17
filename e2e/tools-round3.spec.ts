import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { HOUSE, START_S, TRACK, houseToWorld } from "../shared/src/index.ts";
import { failOnErrors, hostGame, waitForBear } from "./helpers.ts";

// Dev tool, not a check (ROUND3=1): views of Andrew's round-3 fixes, matching his photos, in
// review/round3/ (not kept in git).
//   ROUND3=1 npx playwright test e2e/tools-round3.spec.ts   (ONLY=gantry,greenhouse for some views)
test.skip(!process.env.ROUND3, "dev tool: set ROUND3=1 to run");

type V = { x: number; y: number; z: number };
const h = (x: number, z: number, y: number): V => ({ ...houseToWorld(x, z), y });
const UP = 2.7 * HOUSE.scale; // the upstairs floor
const s = TRACK.pointAt(START_S);

/** name, bear spot (y NaN = drop onto the ground), then either a fixed camera (from, look) or the orbit camera (yaw toward look, pitch, distance). */
const VIEWS: { name: string; bear: V; from?: V; look: V; pitch?: number; dist?: number }[] = [
  { name: "gantry", bear: { x: s.x + 30, y: Number.NaN, z: s.z }, from: { x: s.x + 40, y: 10, z: s.z + 4 }, look: { x: s.x - 60, y: 6.5, z: s.z - 4 } },
  { name: "gantry-rider", bear: { x: s.x + 25, y: Number.NaN, z: s.z }, look: { x: s.x, y: 0, z: s.z }, pitch: 0.05, dist: 6 },
  // Andrew's photo: on the back lawn by the den, looking west under the greenhouse.
  { name: "greenhouse", bear: h(13, 11.6, Number.NaN), look: h(6, 10.5, 0), pitch: 0.1, dist: 5 },
  { name: "greenhouse-wide", bear: h(14, 15, Number.NaN), from: h(17, 17, 1.5), look: h(8, 10.5, -1) },
  { name: "greenhouse-steps", bear: h(13, 10.5, Number.NaN), from: h(16, 13.5, 1), look: h(11, 10.5, -1.5) },
  // Andrew's photo: on the balcony hallway, the camera out over the great room looking down at the bear.
  { name: "balcony", bear: h(25, 4.3, UP), look: h(25, 0, UP), pitch: 0.55, dist: 6 },
  { name: "balcony-high", bear: h(25, 4.3, UP), from: h(25.5, 9.5, UP + 4.2), look: h(25, 3, UP + 1) },
  { name: "balcony-west", bear: h(19, 4.3, UP), look: h(19, 0, UP), pitch: 0.55, dist: 6 },
];

async function shoot(page: Page, out: string) {
  const only = process.env.ONLY?.split(",");
  for (const v of VIEWS) {
    if (only && !only.includes(v.name)) continue;
    await page.evaluate((v) => {
      const d = window.__den!;
      d.teleport(v.bear.x, v.bear.z, v.bear.y ?? Number.NaN);
      d.camera.override = v.from ? ({ from: v.from, look: v.look } as never) : null;
      d.camera.yaw = Math.atan2(-(v.look.x - v.bear.x), -(v.look.z - v.bear.z));
      d.camera.pitch = v.pitch ?? 0.12;
      d.camera.distance = v.dist ?? 5;
    }, v);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${v.name}.png` });
  }
}

test("round 3 views", async ({ page }) => {
  test.setTimeout(300_000);
  failOnErrors(page);
  const out = "review/round3";
  mkdirSync(out, { recursive: true });
  await hostGame(page, "Look");
  await waitForBear(page);
  await page.evaluate(() => window.__den!.setTime("noon"));
  await shoot(page, out);
});
