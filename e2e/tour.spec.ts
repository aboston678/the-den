import { expect, test, type Page } from "@playwright/test";
import { failOnErrors, fps, hostGame } from "./helpers.ts";

// Milestone 1.8 screenshot tour of the property. Run on its own:
//   npx playwright test e2e/tour.spec.ts      -> test-results/tour/*.png
// Each stop: [name, bear x, bear z, look-at x, look-at z, camera pitch?, camera distance?]
type Stop = [string, number, number, number, number, number?, number?];

async function stopAt(page: Page, [, x, z, lx, lz, pitch = 0.18, dist = 4.5]: Stop) {
  await page.evaluate(([x, z, lx, lz, pitch, dist]) => {
    const d = window.__den!;
    d.teleport(x, z);
    // Camera orbit angle that puts the camera behind the bear, looking toward (lx, lz).
    d.camera.yaw = Math.atan2(-(lx - x), -(lz - z));
    d.camera.pitch = pitch;
    d.camera.distance = dist;
  }, [x, z, lx, lz, pitch, dist] as const);
  await page.waitForTimeout(1600); // let the forest's detail levels and shadows catch up
}

test("screenshot tour of the property", async ({ page }) => {
  test.setTimeout(180_000);
  failOnErrors(page);
  await hostGame(page, "Tour");
  const stops: Stop[] = await page.evaluate(() => {
    const d = window.__den!;
    const p = d.player.position;
    return [
      ["01-spawn", p.x - 4, p.z - 3, p.x + 6, p.z],
      ["02-driveway-woods", -92, -60, -80, -50],
      ["03-driveway-reveal", -58, -26, -20, 0],
      ["04-garage-apron", -40, -4, -18, -2, 0.12, 5],
      ["05-front-lawn", 8, -34, 2, 0, 0.12, 5],
      ["06-front-boulder", 20, -28, 13, -20, 0.2, 4],
      ["07-back-lawn", 8, 24, 4, 0, 0.15, 6],
      ["08-trail", 50, 22, 80, 9],
      ["09-dock", 106, 0, 125, 0, 0.25, 5],
      ["10-dock-end-upstream", 117, 0, 117, -40, 0.15, 4],
      ["11-forest", -80, 40, -60, 60],
      ["12-stone-wall", -24, 32, -30, 30, 0.3, 4],
      ["13-map-edge", -96, 10, -130, 10],
    ];
  });
  for (const stop of stops.filter((s) => !process.env.STOPS || process.env.STOPS.split(",").some((p) => s[0].startsWith(p)))) {
    await stopAt(page, stop);
    await page.screenshot({ path: `test-results/tour/${stop[0]}.png` });
  }
  const rate = await fps(page);
  console.log(`frame rate at the last stop: ${rate.toFixed(0)} fps`);
  expect(rate).toBeGreaterThan(20);
});
