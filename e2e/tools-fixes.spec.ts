import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { HOUSE, houseToWorld } from "../shared/src/index.ts";
import { failOnErrors, hostGame, waitForBear } from "./helpers.ts";

// Dev tool, not a check (FIXES=1): views of Andrew's game-night fixes, in review/fixes/ (not kept in git).
//   FIXES=1 npx playwright test e2e/tools-fixes.spec.ts   (ONLY=garage,roof-east for some views)
test.skip(!process.env.FIXES, "dev tool: set FIXES=1 to run");

const h = (x: number, z: number) => houseToWorld(x, z);
/** name, bear floorplan x/z, look-at floorplan x/z, camera distance, pitch, floor height (world; NaN = ground) */
const VIEWS: [string, number, number, number, number, number, number, number?][] = [
  ["apron", -9, 4.2, 0, 4.2, 6, 0.25],
  ["garage", -4, 4.2, 0, 4.2, 5, 0.05],
  ["roof-east", 46, 2, 30, 2, 7, 0.0],
  ["roof-north", 31, -12, 31, 2, 7, 0.05],
  ["basement-den", 15, 8, 23, 8, 4, 0.1, HOUSE.basementFloorY],
  ["basement-landing", 23, 3, 28, 3, 4, 0.1, HOUSE.basementFloorY],
  ["basement-lounge", 25, 8, 25, 4, 4, 0.1, HOUSE.basementFloorY],
];

async function shoot(page: Page, out: string) {
  const only = process.env.ONLY?.split(",");
  for (const [name, x, z, lx, lz, dist, pitch, y] of VIEWS) {
    if (only && !only.includes(name)) continue;
    const a = h(x, z), b = h(lx, lz);
    await page.evaluate(([x, z, lx, lz, dist, pitch, y]) => {
      const d = window.__den!;
      d.teleport(x!, z!, y ?? Number.NaN);
      d.camera.yaw = Math.atan2(-(lx! - x!), -(lz! - z!));
      d.camera.pitch = pitch!;
      d.camera.distance = dist!;
    }, [a.x, a.z, b.x, b.z, dist, pitch, y ?? null] as const);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
}

test("fix views", async ({ page }) => {
  test.setTimeout(240_000);
  failOnErrors(page);
  const out = "review/fixes";
  mkdirSync(out, { recursive: true });
  await hostGame(page, "Look");
  await waitForBear(page);
  await page.evaluate(() => window.__den!.setTime("noon"));
  await shoot(page, out);
});
