import { expect, test } from "@playwright/test";
import { BALL_RETURN, HOUSE, LANES, PLATFORM_Y, houseToWorld } from "../shared/src/index.ts";
import { failOnErrors, hostGame } from "./helpers.ts";

// Tool, not a test: a short video of a frame of bowling for Andrew's review (milestone 3.4).
//   npx playwright test e2e/tools-bowling-video.spec.ts   -> test-results/…/video.webm
// (THROWS=z,aim,power,curve;… to choose the balls.)

test.use({ video: { mode: "on", size: { width: 1280, height: 720 } }, viewport: { width: 1280, height: 720 } });

test("video: a frame of bowling", async ({ page }) => {
  test.setTimeout(180_000);
  failOnErrors(page);
  await hostGame(page, "Andrew");
  const at = houseToWorld(BALL_RETURN.x, (BALL_RETURN.z + LANES[0]!.cz) / 2);
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [at.x, at.z, PLATFORM_Y * HOUSE.scale] as const);
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - at.x, p.z - at.z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(1);
  await page.keyboard.press("e");
  const mode = () => page.evaluate(() => window.__den!.bowl!.me().mode);
  await expect.poll(mode).toBe("aim");
  const throws = (process.env.THROWS ?? "0.4,0.65,0.65,-1;0.1,0.3,0.55,0").split(";").map((t) => t.split(",").map(Number));
  const rolls = () => page.evaluate(() => window.__den!.bowl!.lanes()["1"].bowlers[0]?.rolls.length ?? 0);
  for (const [z, aim, power, curve] of throws) {
    const before = await rolls();
    await expect.poll(mode, { timeout: 20_000 }).toBe("aim");
    // Show the meters the way a player sees them, then bowl with the chosen settings.
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__den!.bowl!.click());
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__den!.bowl!.click());
    await page.waitForTimeout(1100);
    await page.evaluate((t) => window.__den!.bowl!.throw(t), { z: z!, aim: aim!, power: power!, curve: curve! }); // the last click, with the chosen settings
    await expect.poll(rolls, { timeout: 20_000 }).toBe(before + 1);
  }
  await expect.poll(mode, { timeout: 20_000 }).not.toBe("sweep");
  await page.waitForTimeout(1500);
});
