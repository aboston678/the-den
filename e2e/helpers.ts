import { type Browser, expect, type Page } from "@playwright/test";

/** Fail on browser errors (ignoring the expected one when a server connection drops). */
export function failOnErrors(page: Page) {
  page.on("pageerror", (e) => {
    throw e;
  });
}

/** Create a party from the lobby and press Play. Returns the party code. */
export async function hostGame(page: Page, name: string, { play = true } = {}) {
  await page.goto("/");
  await page.getByTestId("nickname").fill(name);
  await page.getByTestId("create").click();
  const code = (await page.getByTestId("party-code").textContent({ timeout: 15_000 }))!.trim();
  if (play) {
    await page.getByTestId("play").click();
    await waitForBear(page);
  }
  return code;
}

/** Join a party by code from the lobby. */
export async function joinGame(page: Page, code: string, name: string) {
  await page.goto("/");
  await page.getByTestId("nickname").fill(name);
  await page.getByTestId("join-code").fill(code);
  await page.getByTestId("join").click();
}

/** Wait until we're in the world and our bear has landed. */
export async function waitForBear(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.__den?.player.colliderHandle ?? -1), { timeout: 30_000 }).toBeGreaterThanOrEqual(0);
  await expect.poll(() => page.evaluate(() => window.__den!.player.grounded)).toBe(true);
  await page.locator("canvas").focus();
}

/** A page in its own browser context (separate session, like a second computer). */
export async function newPlayer(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  failOnErrors(page);
  return page;
}
