import { expect, type Page, test } from "@playwright/test";
import { BALL_RETURN, HOUSE, LANES, PLATFORM_Y, houseToWorld } from "../shared/src/index.ts";
import { failOnErrors, hostGame } from "./helpers.ts";

// Bowling (GAME_SPEC §15, milestones 3.2–3.3): join a lane at the ball return, bowl, see the ball
// roll and the pins fall, and the score go up.
//   npx playwright test e2e/bowling.spec.ts   (screenshots in test-results/bowling/)

/** Stand next to the ball return on a lane's side. */
async function toTheReturn(page: Page, lane: "1" | "2") {
  const cz = LANES.find((l) => l.id === lane)!.cz;
  const at = houseToWorld(BALL_RETURN.x, (BALL_RETURN.z + cz) / 2);
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [at.x, at.z, PLATFORM_Y * HOUSE.scale] as const);
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-testid=action-prompt]")?.textContent ?? "")).toContain(`Bowl on lane ${lane}`);
}

const mode = (page: Page) => page.evaluate(() => window.__den!.bowl!.me().mode);
const rolls = (page: Page, lane: "1" | "2") => page.evaluate((l) => window.__den!.bowl!.lanes()[l].bowlers[0]?.rolls ?? [], lane);

test("bowl a frame: meters, the roll, the pins, the score", async ({ page }) => {
  test.setTimeout(120_000);
  failOnErrors(page);
  await hostGame(page, "Bowler");
  await toTheReturn(page, "1");
  await page.keyboard.press("e");
  await expect.poll(() => mode(page)).toBe("aim");
  await expect(page.getByTestId("bowling-hud")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/bowling/1-aim.png" });

  // A ball into the pocket (dev helper skips the meters).
  expect(await page.evaluate(() => window.__den!.bowl!.throw({ z: 0.065, aim: 0, power: 0.6, curve: 0 }))).toBe(true);
  await expect.poll(() => mode(page)).toBe("roll");
  await page.waitForTimeout(1300);
  await page.screenshot({ path: "test-results/bowling/2-roll.png" });
  await expect.poll(() => mode(page), { timeout: 10_000 }).toBe("pins");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/bowling/3-pins.png" });
  await expect.poll(() => rolls(page, "1"), { timeout: 10_000 }).toHaveLength(1);
  const first = (await rolls(page, "1"))[0]!;
  expect(first).toBeGreaterThanOrEqual(7);
  await expect(page.getByTestId("bowl-banner")).toBeVisible();
  await page.screenshot({ path: "test-results/bowling/4-result.png" });
  // The pinsetter clears up, then it's our turn again (second ball, or a new frame after a strike).
  await expect.poll(() => mode(page), { timeout: 10_000 }).toBe("aim");

  // A gutter ball counts zero.
  const before = (await rolls(page, "1")).length;
  await page.evaluate(() => window.__den!.bowl!.throw({ z: 0.4, aim: 3, power: 0.5, curve: 0 }));
  await expect.poll(() => rolls(page, "1"), { timeout: 15_000 }).toHaveLength(before + 1);
  expect((await rolls(page, "1"))[before]).toBe(0);
  await expect.poll(() => mode(page), { timeout: 10_000 }).toBe("aim");

  // E leaves the lane; the bear is free again.
  await page.keyboard.press("e");
  await expect.poll(() => mode(page)).toBe("off");
  expect(await page.evaluate(() => window.__den!.camera)).toBeTruthy();
});

test("the meters: click starts power, click stops it, click stops the curve and bowls", async ({ page }) => {
  test.setTimeout(90_000);
  failOnErrors(page);
  await hostGame(page, "Clicker");
  await toTheReturn(page, "2");
  await page.keyboard.press("e");
  await expect.poll(() => mode(page)).toBe("aim");
  // In the game the mouse button does this (once the mouse is captured, which test browsers can't do).
  const click = () => page.evaluate(() => window.__den!.bowl!.click());
  await click();
  await expect.poll(() => mode(page)).toBe("power");
  await expect(page.getByTestId("power-meter")).toBeVisible();
  await page.waitForTimeout(450);
  await click();
  await expect.poll(() => mode(page)).toBe("curve");
  const power = (await page.evaluate(() => window.__den!.bowl!.me().power));
  expect(power).toBeGreaterThan(0.1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/bowling/meters.png" });
  await click();
  await expect.poll(() => mode(page)).toBe("throw");
  await expect.poll(() => rolls(page, "2"), { timeout: 20_000 }).toHaveLength(1);
});
