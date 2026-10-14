import { expect, type Page, test } from "@playwright/test";
import { BALL_RETURN, HOUSE, LANES, PLATFORM_Y, houseToWorld } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// Bowling (GAME_SPEC §15, milestones 3.2–3.3): join a lane at the ball return, bowl, see the ball
// roll and the pins fall, and the score go up; two bears take turns and see each other's balls.
//   npx playwright test e2e/bowling.spec.ts   (screenshots in test-results/bowling/)

test.afterEach(closePlayers);

/** Stand next to the ball return on a lane's side (`back` metres further from the lanes). */
async function toTheReturn(page: Page, lane: "1" | "2", back = 0) {
  const cz = LANES.find((l) => l.id === lane)!.cz;
  const at = houseToWorld(BALL_RETURN.x - back, (BALL_RETURN.z + cz) / 2);
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [at.x, at.z, PLATFORM_Y * HOUSE.scale] as const);
  // The server walks its copy of a teleported bear over at running pace; wait for it to arrive.
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - at.x, p.z - at.z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(1);
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-testid=action-prompt]")?.textContent ?? "")).toContain(`Bowl on lane ${lane}`);
}

const mode = (page: Page) => page.evaluate(() => window.__den!.bowl!.me().mode);
const rolls = (page: Page, lane: "1" | "2", who = 0) => page.evaluate(([l, w]) => window.__den!.bowl!.lanes()[l as "1"].bowlers[w as number]?.rolls ?? [], [lane, who] as const);
const gutterBall = { z: 0.4, aim: 3, power: 0.5, curve: 0 };
const pocketBall = { z: 0.065, aim: 0, power: 0.6, curve: 0 };

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

test("two bears share a lane: turns pass, both see every ball and the same scores", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const code = await hostGame(a, "Bowler1", { play: false });
  await joinGame(b, code, "Bowler2");
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);
  await toTheReturn(a, "1");
  await a.keyboard.press("e");
  await expect.poll(() => mode(a)).toBe("aim");
  await toTheReturn(b, "1", 0.6);
  await b.keyboard.press("e");
  await expect.poll(() => b.evaluate(() => window.__den!.bowl!.lanes()["1"].bowlers.map((x) => x.name))).toEqual(["Bowler1", "Bowler2"]);
  expect(await mode(b)).toBe("wait");

  // Bowler1 rolls two gutter balls; Bowler2 watches the ball go down the lane.
  for (let ball = 0; ball < 2; ball++) {
    await expect.poll(() => mode(a), { timeout: 15_000 }).toBe("aim");
    expect(await a.evaluate((t) => window.__den!.bowl!.throw(t), gutterBall)).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__den!.bowl!.seen("1").ball), { timeout: 10_000 }).toBe(true);
    if (ball === 0) await b.screenshot({ path: "test-results/bowling/watching.png" });
    await expect.poll(() => rolls(b, "1", 0), { timeout: 15_000 }).toHaveLength(ball + 1);
  }
  // Frame over: Bowler2's turn. Their ball into the pocket is seen by Bowler1, pins and all.
  await expect.poll(() => mode(b), { timeout: 15_000 }).toBe("aim");
  expect(await mode(a)).toBe("wait");
  expect(await b.evaluate((t) => window.__den!.bowl!.throw(t), pocketBall)).toBe(true);
  await expect.poll(() => a.evaluate(() => window.__den!.bowl!.seen("1").ball), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => a.evaluate(() => window.__den!.bowl!.seen("1").gone), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => rolls(a, "1", 1), { timeout: 15_000 }).toHaveLength(1);
  // Both browsers agree on the scoreboard.
  expect(await rolls(a, "1", 0)).toEqual(await rolls(b, "1", 0));
  expect(await rolls(a, "1", 1)).toEqual(await rolls(b, "1", 1));
  expect((await rolls(a, "1", 1))[0]).toBeGreaterThanOrEqual(7);
  await a.screenshot({ path: "test-results/bowling/two-bears.png" });
});

test("the 10th frame ends the game: final score card", async ({ page }) => {
  test.setTimeout(120_000);
  failOnErrors(page);
  await hostGame(page, "Finisher");
  await toTheReturn(page, "2");
  await page.keyboard.press("e");
  await expect.poll(() => mode(page)).toBe("aim");
  // Nine frames already bowled (dev shortcut), then two balls in the 10th.
  await page.evaluate(() => window.__den!.bowl!.devRolls("2", Array(18).fill(0)));
  await expect.poll(() => rolls(page, "2")).toHaveLength(18);
  for (let ball = 0; ball < 2; ball++) {
    await expect.poll(() => mode(page), { timeout: 15_000 }).toBe("aim");
    await page.evaluate((t) => window.__den!.bowl!.throw(t), gutterBall);
    await expect.poll(() => rolls(page, "2"), { timeout: 15_000 }).toHaveLength(19 + ball);
  }
  await expect(page.getByTestId("bowl-final")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("bowl-final")).toContainText("Game over");
  expect(await page.evaluate(() => window.__den!.bowl!.lanes()["2"].phase)).toBe("over");
  await expect(page.getByTestId("action-prompt")).toContainText("New game");
  await page.screenshot({ path: "test-results/bowling/game-over.png" });
  await page.keyboard.press("e");
  await expect.poll(() => rolls(page, "2")).toHaveLength(0);
  await expect.poll(() => mode(page)).toBe("aim");
});
