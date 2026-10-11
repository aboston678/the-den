import { expect, test, type Page } from "@playwright/test";

/** Fail the test on any browser console error or uncaught exception. */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("page loads, renders 3D and connects to the game server", async ({ page }) => {
  const errors = trackErrors(page);

  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected", {
    timeout: 15_000,
  });

  // Let the physics capsule fall and settle before the screenshot.
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "test-results/smoke.png" });

  expect(errors).toEqual([]);
});

test("two browsers end up in the same party", async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  const errors = [...trackErrors(a), ...trackErrors(b)];

  await a.goto("/");
  await expect(a.getByTestId("connection-status")).toHaveAttribute("data-status", "connected", {
    timeout: 15_000,
  });
  await b.goto("/");
  await expect(b.getByTestId("connection-status")).toHaveAttribute("data-status", "connected", {
    timeout: 15_000,
  });

  await expect(a.getByTestId("connection-status")).toContainText("2 in party");
  await expect(b.getByTestId("connection-status")).toContainText("2 in party");

  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
