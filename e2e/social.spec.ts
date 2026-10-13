import { expect, test } from "@playwright/test";
import { openGame } from "./helpers.ts";

// Milestone 2.6 (GAME_SPEC §14): the Leaderboard and Friends panels on the home screen. Real
// accounts need a person signing in with Google, so this uses the dev preview (?mocksocial):
// made-up bears, same panels. Rank and friends rules are unit-tested in client/src/net/socialRules.test.ts.

test("leaderboard: fish caught, all players or friends; bowling and Catan ready for later", async ({ page }) => {
  await openGame(page, "/?mocksocial");
  await page.getByTestId("open-leaderboard").click();
  const board = page.getByTestId("leaderboard");
  await expect(board.getByTestId("board-rows").locator("li")).toHaveCount(5);
  await expect(board.getByTestId("board-rows").locator("li").first()).toContainText("BassMaster");
  await expect(board.locator("li.you")).toContainText("DevBear");
  await page.screenshot({ path: "test-results/social/leaderboard-all.png" });
  await board.getByTestId("scope-friends").click();
  await expect(board.getByTestId("board-rows").locator("li")).toHaveCount(3); // you + 2 friends
  await page.screenshot({ path: "test-results/social/leaderboard-friends.png" });
  await board.getByTestId("board-bowling").click();
  await expect(board.getByTestId("board-empty")).toContainText("Phase 3");
  await board.getByTestId("board-catan").click();
  await expect(board.getByTestId("board-empty")).toContainText("Phase 4");
});

test("friends: a request waiting, friends listed, search by username", async ({ page }) => {
  await openGame(page, "/?mocksocial");
  await expect(page.getByTestId("request-count")).toHaveText("1");
  await page.getByTestId("open-friends").click();
  const panel = page.getByTestId("friends");
  await expect(panel.getByTestId("incoming")).toContainText("BassMaster");
  await expect(panel.getByTestId("friend-list")).toContainText("LunaLover");
  await expect(panel.getByTestId("friend-list")).toContainText("RaptorFan");
  await panel.getByTestId("friend-search").fill("he");
  await expect(panel.getByText("Hemlock")).toBeVisible();
  await page.screenshot({ path: "test-results/social/friends.png" });
});
