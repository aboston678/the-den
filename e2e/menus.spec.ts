import { expect, type Page, test } from "@playwright/test";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, openGame, skipIntro, waitForBear } from "./helpers.ts";

test.afterEach(closePlayers);

// Milestone 1.11: "Click to start" → the lyric intro (words in time with the song, logo at ~14 s,
// Skip in the corner) → the lobby; it plays again on every page load.

const opacity = (p: Page, id: string) => p.getByTestId(id).evaluate((el) => Number(getComputedStyle(el).opacity));

test("the lyric intro plays in time and lands in the lobby", async ({ page }) => {
  test.setTimeout(60_000);
  failOnErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("splash-loading")).toBeVisible(); // the world loads behind the start screen first
  await expect(page.getByTestId("start")).toContainText("Click to start", { timeout: 30_000 });
  await page.getByTestId("start").click();
  await expect(page.getByTestId("intro")).toBeVisible();
  await expect(page.getByTestId("skip-intro")).toBeVisible();
  // Wait for a moment in the song (the intro's own clock, which starts once the song is playing).
  const at = (s: number) => page.waitForFunction((s) => Number(document.querySelector<HTMLElement>("[data-testid=intro]")?.dataset.t ?? 0) >= s, s, { polling: 50 });
  const t0 = Date.now();

  await at(2.2);
  expect(await opacity(page, "lyric-0")).toBeGreaterThan(0.9);
  expect(await opacity(page, "lyric-1")).toBe(0);
  await page.screenshot({ path: "test-results/menus/intro-1.png" });
  await at(6.8);
  expect(await opacity(page, "lyric-0")).toBe(0);
  expect(await opacity(page, "lyric-1")).toBeGreaterThan(0.9);
  await page.screenshot({ path: "test-results/menus/intro-2.png" });
  await at(12.2);
  expect(await opacity(page, "lyric-2")).toBeGreaterThan(0.9);
  await page.screenshot({ path: "test-results/menus/intro-3.png" });
  await at(16.5);
  expect(await opacity(page, "intro-logo")).toBeGreaterThan(0.9);
  await page.screenshot({ path: "test-results/menus/intro-logo.png" });
  await expect(page.getByTestId("lobby")).toBeVisible({ timeout: 6000 });
  expect((Date.now() - t0) / 1000).toBeLessThan(23); // 18.6 s of song, plus loading it
  await page.screenshot({ path: "test-results/menus/after-intro.png" });
});

test("Skip goes straight to the lobby, and a reload plays the intro again", async ({ page }) => {
  failOnErrors(page);
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("skip-intro").click();
  await expect(page.getByTestId("lobby")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("start")).toBeVisible();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("intro")).toBeVisible();
});

test("reloading mid-game plays the intro, then puts you back in your game", async ({ page }) => {
  test.setTimeout(90_000);
  failOnErrors(page);
  const code = await hostGame(page, "Reloader");
  await page.reload();
  await skipIntro(page);
  await waitForBear(page);
  await expect(page.getByTestId("connection-status")).toContainText(code);
});

test("home screen: your bear on the pedestal, then your party beside you", async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await openGame(a);
  await expect(a.getByTestId("home-stage")).toBeVisible();
  await a.getByTestId("nickname").fill("Alpha");
  await a.waitForTimeout(2500); // the bear model loads
  await a.screenshot({ path: "test-results/menus/home-alone.png" });
  const code = await hostGame(a, "Alpha", { play: false });
  await joinGame(b, code, "Bravo");
  await expect(a.getByTestId("party-list")).toContainText("Bravo");
  await a.waitForTimeout(2500);
  await a.screenshot({ path: "test-results/menus/home-party.png" });
  // The game starts behind a loading screen that fades once your bear has landed.
  await a.getByTestId("play").click();
  await expect(a.getByTestId("loading-screen")).toBeVisible();
  await a.screenshot({ path: "test-results/menus/loading.png" });
  await waitForBear(a);
  await expect(a.getByTestId("loading-screen")).toHaveCount(0, { timeout: 5000 });
  await expect(a.getByTestId("time-of-day")).toContainText("Morning");
});

test("settings are remembered, and Esc opens the pause menu", async ({ page }) => {
  test.setTimeout(90_000);
  failOnErrors(page);
  await openGame(page);
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings")).toBeVisible();
  await page.getByTestId("setting-music").fill("0.3");
  await page.getByTestId("setting-invert").check();
  await page.screenshot({ path: "test-results/menus/settings.png" });
  await page.getByTestId("settings-done").click();
  await page.reload();
  await skipIntro(page);
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("setting-music")).toHaveValue("0.3");
  await expect(page.getByTestId("setting-invert")).toBeChecked();
  await page.getByTestId("settings-done").click();

  await hostGame(page, "Pauser");
  await expect(page.getByTestId("loading-screen")).toHaveCount(0, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause")).toBeVisible();
  await page.screenshot({ path: "test-results/menus/pause.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause")).toHaveCount(0);
  await page.keyboard.down("Tab");
  await expect(page.getByTestId("party-overlay")).toContainText("Pauser");
  await page.keyboard.up("Tab");
  await page.keyboard.press("Escape");
  await page.getByTestId("leave-game").click();
  await expect(page.getByTestId("home-stage")).toBeVisible();
});

// Phase 5.3: friends can turn on a frame-rate readout to say how smooth the game runs on their laptop.
test("Show frame rate puts the frame rate and graphics level in the party badge", async ({ page }) => {
  test.setTimeout(90_000);
  failOnErrors(page);
  await hostGame(page, "Counter");
  await expect(page.getByTestId("fps")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByTestId("pause-settings").click();
  await page.getByTestId("setting-fps").check();
  await page.getByTestId("settings-done").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("fps")).toHaveText(/^\d+ fps · (Low|Medium|High)$/);
  await expect.poll(async () => Number((await page.getByTestId("fps").textContent())!.split(" ")[0])).toBeGreaterThan(40);
  await page.screenshot({ path: "test-results/menus/fps.png", clip: { x: 0, y: 0, width: 520, height: 60 } });
});

// Game-night fixes: play without the browser's address bar and tabs. Round 3: on by default, from the first click.
test("full screen from the first click by default, the pause menu button, and the Play in full screen setting is remembered", async ({ page }) => {
  test.setTimeout(90_000);
  failOnErrors(page);
  await hostGame(page, "Wide");
  const full = () => page.evaluate(() => !!document.fullscreenElement);
  await expect.poll(full).toBe(true); // "Click to start" already went full screen
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-fullscreen")).toHaveText("Leave full screen");
  await page.getByTestId("pause-fullscreen").click();
  await expect.poll(full).toBe(false);
  await page.getByTestId("pause-fullscreen").click();
  await expect.poll(full).toBe(true);

  // Turned off, Resume stays in the window; turned back on, it goes full screen again.
  await page.getByTestId("pause-settings").click();
  await expect(page.getByTestId("setting-fullscreen")).toBeChecked();
  await expect(page.getByTestId("setting-graphics")).toHaveValue("medium"); // Medium by default (round 3)
  await page.getByTestId("setting-fullscreen").uncheck();
  await expect.poll(full).toBe(false);
  await page.getByTestId("settings-done").click();
  await page.getByTestId("resume").click();
  await page.waitForTimeout(300);
  expect(await full()).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("den.settings")!).fullscreen)).toBe(false);
  await page.keyboard.press("Escape");
  await page.getByTestId("pause-settings").click();
  await page.getByTestId("setting-fullscreen").check();
  await page.getByTestId("settings-done").click();
  await expect.poll(full).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(full).toBe(false);
  await page.getByTestId("resume").click(); // with the setting on, Resume goes back to full screen
  await expect.poll(full).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("den.settings")!).fullscreen)).toBe(true);
});
