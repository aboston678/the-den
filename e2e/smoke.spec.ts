import { expect, test } from "@playwright/test";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

test.afterEach(closePlayers);

test("lobby loads, a party starts, the 3D world renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  failOnErrors(page);

  await page.goto("/");
  await expect(page.getByTestId("lobby")).toBeVisible();
  await page.screenshot({ path: "test-results/smoke-lobby.png" });
  const code = await hostGame(page, "Smokey");
  await expect(page.getByTestId("connection-status")).toContainText(code);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/smoke.png" });
  expect(errors).toEqual([]);
});

test("two browsers end up in the same party", async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const code = await hostGame(a, "Alpha", { play: false });
  await joinGame(b, code, "Bravo");
  await expect(a.getByTestId("party-list")).toContainText("Bravo");
  await expect(b.getByTestId("party-list")).toContainText("Alpha");
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);
  await expect.poll(() => b.evaluate(() => window.__den!.remotes().map((r) => r.name))).toEqual(["Alpha"]);
});
