import { expect, type Page, test } from "@playwright/test";
import { hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// Milestone 1.7: two "computers" (separate browser contexts) in one party.

const me = (p: Page) => p.evaluate(() => ({ ...window.__den!.player.position, action: window.__den!.player.action }));
const others = (p: Page) => p.evaluate(() => window.__den!.remotes());

async function twoBears(browser: Parameters<typeof newPlayer>[0]) {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const code = await hostGame(a, "Alpha", { play: false });
  await joinGame(b, code, "Bravo");
  await expect(b.getByTestId("party-list")).toContainText("Alpha");
  await expect(b.getByTestId("play")).toHaveCount(0); // only the host can start
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);
  return { a, b, code };
}

test("a wrong code shows a friendly error", async ({ page }) => {
  await joinGame(page, "ZZZZZ", "Lost");
  await expect(page.getByTestId("lobby-error")).toContainText("No party with code ZZZZZ");
});

test("both bears see each other move, with name tags", async ({ browser }) => {
  const { a, b } = await twoBears(browser);
  // Bears spawn in a line facing away from the camera; Bravo's tag should be in view for Alpha.
  await expect.poll(async () => (await others(a))[0]?.tagVisible).toBe(true);
  await expect(a.getByText("Bravo", { exact: true })).toBeVisible();

  const before = (await others(b))[0]!;
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(1500);
  await a.keyboard.up("KeyW");
  const alpha = await me(a);
  // Bravo sees Alpha arrive where Alpha really is (within interpolation lag).
  await expect.poll(async () => {
    const seen = (await others(b))[0]!;
    return Math.hypot(seen.x - alpha.x, seen.z - alpha.z);
  }).toBeLessThan(0.3);
  expect(Math.abs((await others(b))[0]!.z - before.z)).toBeGreaterThan(1.5);

  await a.keyboard.press("KeyB");
  await expect.poll(async () => (await others(b))[0]!.action).toBe("dance");
  await b.screenshot({ path: "test-results/mp-bravo-sees-alpha.png" });
});

test("bears are solid and shove each other", async ({ browser }) => {
  const { a, b } = await twoBears(browser);
  // Put Bravo 2 m in front of Alpha (Alpha faces −z), then Alpha walks into Bravo.
  const alpha = await me(a);
  await b.evaluate(([x, z]) => window.__den!.teleport(x, z), [alpha.x, alpha.z - 2] as const);
  await b.waitForTimeout(500);
  const bravoBefore = await me(b);
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(2000);
  await a.keyboard.up("KeyW");
  const alphaAfter = await me(a);
  const bravoAfter = await me(b);
  // Alpha can't walk through Bravo...
  expect(alphaAfter.z).toBeGreaterThan(bravoAfter.z);
  // ...and Bravo got shoved away (without pressing anything).
  expect(Math.hypot(bravoAfter.x - bravoBefore.x, bravoAfter.z - bravoBefore.z)).toBeGreaterThan(0.3);
});

test("a roar shakes nearby bears' cameras", async ({ browser }) => {
  const { a, b } = await twoBears(browser);
  await a.keyboard.press("KeyY");
  await expect.poll(() => b.evaluate(() => window.__den!.camera.shake), { timeout: 3000 }).toBeGreaterThan(0);
});

test("reloading the page rejoins the party", async ({ browser }) => {
  const { a, b, code } = await twoBears(browser);
  await b.reload();
  await waitForBear(b);
  await expect(b.getByTestId("connection-status")).toContainText(code);
  await expect.poll(async () => (await others(a)).length).toBe(1);
  await expect.poll(async () => (await others(a))[0]!.connected).toBe(true);
});

test("the host role passes on when the host leaves", async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const code = await hostGame(a, "Alpha", { play: false });
  await joinGame(b, code, "Bravo");
  await expect(b.getByTestId("play")).toHaveCount(0);
  await a.getByTestId("leave").click();
  await expect(b.getByTestId("play")).toBeVisible();
  await expect(b.getByTestId("party-list")).not.toContainText("Alpha");
});
