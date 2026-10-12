import { expect, test, type Page } from "@playwright/test";
import { failOnErrors, fps, hostGame } from "./helpers.ts";

// Milestone 1.10 screenshot tour: the same views at different times of day. Run on its own:
//   npx playwright test e2e/daynight-tour.spec.ts   -> test-results/daynight/*.png
// TIMES=dusk,night (preset names or seconds into the cycle) and STOPS=front limit what's shot.
type Stop = [string, number, number, number, number, number?, number?];

async function stopAt(page: Page, [, x, z, lx, lz, pitch = 0.18, dist = 4.5]: Stop) {
  await page.evaluate(([x, z, lx, lz, pitch, dist]) => {
    const d = window.__den!;
    d.teleport(x, z);
    d.camera.yaw = Math.atan2(-(lx - x), -(lz - z));
    d.camera.pitch = pitch;
    d.camera.distance = dist;
  }, [x, z, lx, lz, pitch, dist] as const);
  await page.waitForTimeout(1800); // detail levels, shadows and the sky reflection catch up
}

const STOPS: Stop[] = [
  ["front", 8, -34, 2, 0, 0.1, 5],
  ["back", 8, 26, 4, 0, 0.12, 6],
  ["garage", -40, -4, -18, -2, 0.12, 5],
  ["dock", 106, 0, 125, 0, 0.25, 5],
  ["woods", -110, -86, -100, -66],
];
const TIMES = ["morning", "noon", "evening", "dusk", "night", "dawn"];

test("day/night screenshot tour", async ({ page }) => {
  test.setTimeout(300_000);
  failOnErrors(page);
  await hostGame(page, "Tour");
  const pick = <T extends string | Stop>(list: T[], env?: string) =>
    list.filter((s) => !env || env.split(",").some((p) => (typeof s === "string" ? s : s[0]).startsWith(p)));
  for (const time of process.env.TIMES?.split(",") ?? TIMES) {
    await page.evaluate((t) => window.__den!.setTime(t), time);
    await page.waitForTimeout(300);
    for (const stop of pick(STOPS, process.env.STOPS)) {
      await stopAt(page, stop);
      await page.screenshot({ path: `test-results/daynight/${time}-${stop[0]}.png` });
    }
  }
  const rate = await fps(page);
  console.log(`frame rate at the last stop: ${rate.toFixed(0)} fps`);
  expect(rate).toBeGreaterThan(20);
});
