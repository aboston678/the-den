import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { DOCK, DRIVEWAY, dockStartX, houseToWorld, streamCenter } from "../shared/src/index.ts";
import { failOnErrors, hostGame, waitForBear } from "./helpers.ts";

// Dev tool, not a check (POLISH=before|after): the same outdoor views for the Phase 5 visual polish,
// in review/polish/<POLISH>/ (not kept in git).
//   POLISH=after npx playwright test e2e/tools-polish.spec.ts   (ONLY=dock,woods for some views)
test.skip(!process.env.POLISH, "dev tool: set POLISH=before or after to run");

const near = DRIVEWAY.pointAt(DRIVEWAY.length - 45), ahead = DRIVEWAY.pointAt(DRIVEWAY.length - 30);
const back = houseToWorld(22, 22), dock = dockStartX();
const bank = { x: streamCenter(-10) - 9, z: -10 };
/** name, time of day, bear x/z, where the camera looks (x/z), camera distance, pitch, floor height */
export const VIEWS: [string, string, number, number, number, number, number, number, number?][] = [
  ["driveway", "noon", near.x, near.z, ahead.x, ahead.z, 4.5, 0.12],
  ["house", "noon", 0, -19, 2, 0, 6, 0.0],
  ["dock", "noon", dock + 2, 0, dock + 12, 1.5, 5, 0.12, DOCK.deckY + 0.3],
  ["woods", "noon", -92, -60, -80, -50, 4.5, 0.1],
  ["bank-dawn", "dawn", bank.x, bank.z, bank.x + 9, bank.z + 14, 4, 0.18],
  ["back-lawn-dusk", "dusk", back.x, back.z, back.x - 6, back.z + 20, 5, 0.12],
  ["back-lawn-night", "night", back.x, back.z, back.x - 6, back.z + 20, 5, 0.12],
  ["house-dusk", "dusk", 0, -19, 2, 0, 6, 0.08],
  ["flower-bed", "noon", 8, -13, 8, 0, 3.5, 0.15],
];

async function shoot(page: Page, out: string) {
  const only = process.env.ONLY?.split(",");
  for (const [name, time, x, z, lx, lz, dist, pitch, y] of VIEWS) {
    if (only && !only.includes(name)) continue;
    await page.evaluate((t) => window.__den!.setTime(t), time);
    await page.evaluate(([x, z, lx, lz, dist, pitch, y]) => {
      const d = window.__den!;
      d.teleport(x!, z!, y ?? Number.NaN);
      d.camera.yaw = Math.atan2(-(lx! - x!), -(lz! - z!));
      d.camera.pitch = pitch!;
      d.camera.distance = dist!;
    }, [x, z, lx, lz, dist, pitch, y ?? null] as const);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
}

test("polish views", async ({ page }) => {
  test.setTimeout(240_000);
  failOnErrors(page);
  const out = `review/polish/${process.env.POLISH}`;
  mkdirSync(out, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await hostGame(page, "Look");
  await waitForBear(page);
  await shoot(page, out);
});
