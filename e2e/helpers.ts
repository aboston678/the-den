import { type Browser, type BrowserContext, expect, type Page } from "@playwright/test";

/** Fail on browser errors (ignoring the expected one when a server connection drops), including WebGL draw errors. */
export function failOnErrors(page: Page) {
  page.on("pageerror", (e) => {
    throw e;
  });
  page.on("console", (m) => {
    // A failed draw call (e.g. a shadow map that was never rendered) leaves the screen blank without throwing.
    if (m.text().includes("GL_INVALID")) throw new Error(`WebGL error: ${m.text()}`);
  });
}

/**
 * Load the game the way a player does: "Click to start", then skip the lyric intro.
 * (After a reload, call skipIntro on its own: the page is already loading.)
 */
export async function openGame(page: Page, url = "/") {
  await page.goto(url);
  await skipIntro(page);
}

export async function skipIntro(page: Page) {
  await page.getByTestId("start").click();
  await page.getByTestId("skip-intro").click();
}

/**
 * Create a party from the lobby and press Play. Returns the party code.
 * world: "test" plays on the flat 1.6 test field instead of the property.
 */
export async function hostGame(page: Page, name: string, { play = true, world }: { play?: boolean; world?: "test" } = {}) {
  await openGame(page, world ? `/?world=${world}` : "/");
  await page.getByTestId("nickname").fill(name);
  await page.getByTestId("create").click();
  // The party card shows a moment before the server sends the code, so wait for a real one.
  const codeEl = page.getByTestId("party-code");
  await expect(codeEl).toHaveText(/^[A-Z2-9]{5}$/, { timeout: 15_000 });
  const code = (await codeEl.textContent())!.trim();
  if (play) {
    await page.getByTestId("play").click();
    await waitForBear(page);
  }
  return code;
}

/** Join a party by code from the lobby. */
export async function joinGame(page: Page, code: string, name: string) {
  await openGame(page);
  await page.getByTestId("nickname").fill(name);
  await page.getByTestId("join-code").fill(code);
  await page.getByTestId("join").click();
}

/** Wait until we're in the world and our bear has landed. */
export async function waitForBear(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.__den?.player.colliderHandle ?? -1), { timeout: 30_000 }).toBeGreaterThanOrEqual(0);
  await expect.poll(() => page.evaluate(() => window.__den!.player.grounded), { timeout: 15_000 }).toBe(true);
  await page.locator("canvas").focus();
}

const openContexts = new Set<BrowserContext>();

/** A page in its own browser context (separate session, like a second computer). Close with closePlayers(). */
export async function newPlayer(browser: Browser) {
  const context = await browser.newContext();
  openContexts.add(context);
  const page = await context.newPage();
  failOnErrors(page);
  return page;
}

/** Frames per second over `ms` milliseconds. */
export async function fps(page: Page, ms = 2000) {
  return page.evaluate((ms) => new Promise<number>((done) => {
    let n = 0;
    const start = performance.now();
    const tick = () => (performance.now() - start < ms ? (n++, requestAnimationFrame(tick)) : done((n * 1000) / ms));
    requestAnimationFrame(tick);
  }), ms);
}

/** Close every newPlayer() context, so finished tests don't keep rendering in the background. */
export async function closePlayers() {
  await Promise.all([...openContexts].map((c) => c.close()));
  openContexts.clear();
}
