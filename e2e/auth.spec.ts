import { expect, test } from "@playwright/test";
import { openGame } from "./helpers.ts";

// Milestone 2.5 (GAME_SPEC §14): the home screen offers Google sign-in, and it hands you to Google.
// (Signing in for real needs a person at a Google account; Andrew checks that at the review.
// The server's side of it is unit-tested in server/src/auth.test.ts.)

test("the home screen offers Sign in with Google, which goes to Google", async ({ page }) => {
  await openGame(page);
  const button = page.getByTestId("google-sign-in");
  await expect(button).toBeVisible();
  await expect(page.getByTestId("lobby")).toContainText("Your Google account is only used to log you in");
  await button.click();
  await page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 });
  expect(page.url()).toContain("client_id=");
});
