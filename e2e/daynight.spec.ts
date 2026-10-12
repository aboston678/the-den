import { expect, type Page, test } from "@playwright/test";
import { HOUSE, houseToWorld } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, fps, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

test.afterEach(closePlayers);

// Milestone 1.10: the day/night clock is the same for the whole party, the outdoor lights come on
// at dusk, flashlights are seen by everyone, and it all keeps a good frame rate.

const sky = (p: Page) => p.evaluate(() => window.__den!.sky());
const time = (p: Page) => p.evaluate(() => window.__den!.time());

async function twoBears(browser: Parameters<typeof newPlayer>[0]) {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const code = await hostGame(a, "Alpha", { play: false });
  await joinGame(b, code, "Bravo");
  await expect(b.getByTestId("party-list")).toContainText("Alpha");
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);
  return { a, b };
}

/** Put a bear at (x, z) with the camera looking toward (lx, lz). */
async function stand(p: Page, x: number, z: number, lx: number, lz: number, pitch = 0.15, dist = 4) {
  await p.evaluate(([x, z, lx, lz, pitch, dist]) => {
    const d = window.__den!;
    d.teleport(x!, z!);
    d.camera.yaw = Math.atan2(-(lx! - x!), -(lz! - z!));
    d.camera.pitch = pitch!;
    d.camera.distance = dist!;
  }, [x, z, lx, lz, pitch, dist]);
}

test("the whole party shares one clock, and the outdoor lights come on at dusk", async ({ browser }) => {
  test.setTimeout(90_000);
  const { a, b } = await twoBears(browser);
  // A new party starts mid-morning, in daylight, lights off.
  expect((await sky(a)).phase).toBe("day");
  expect((await sky(a)).exteriorLights).toBe(0);
  const [ta, tb] = await Promise.all([time(a), time(b)]);
  expect(Math.abs(ta - tb)).toBeLessThan(1);

  await a.evaluate(() => window.__den!.setTime("night"));
  for (const p of [a, b]) {
    await expect.poll(async () => (await sky(p)).phase).toBe("night");
    expect((await sky(p)).exteriorLights).toBe(1);
    expect((await sky(p)).daylight).toBeLessThan(0.05);
  }
  const [na, nb] = await Promise.all([time(a), time(b)]);
  expect(Math.abs(na - nb)).toBeLessThan(1);
  // The clock keeps running.
  await a.waitForTimeout(1500);
  expect(await time(a)).toBeGreaterThan(na + 1);
});

test("a flashlight is seen by the rest of the party", async ({ browser }) => {
  test.setTimeout(90_000);
  const { a, b } = await twoBears(browser);
  await a.evaluate(() => window.__den!.setTime("night"));
  await expect.poll(async () => (await sky(b)).phase).toBe("night");
  // Alpha on the back lawn shining at the house; Bravo behind and to the side, watching.
  await stand(a, 6, 30, 6, 10, 0.1);
  await stand(b, 15, 33, 6, 26, 0.12, 3);
  await a.locator("canvas").focus();
  await a.keyboard.press("KeyF");
  await expect.poll(() => a.evaluate(() => window.__den!.player.flashlight)).toBe(true);
  await expect.poll(async () => (await b.evaluate(() => window.__den!.remotes()))[0]?.flashlight).toBe(true);
  await b.waitForTimeout(1500);
  await b.screenshot({ path: "test-results/daynight/flashlight-seen-by-bravo.png" });
  await a.screenshot({ path: "test-results/daynight/flashlight-alpha.png" });
  await a.keyboard.press("KeyF");
  await expect.poll(async () => (await b.evaluate(() => window.__den!.remotes()))[0]?.flashlight).toBe(false);
});

test("keeps a good frame rate by day, at night, and indoors at night", async ({ page }) => {
  test.setTimeout(90_000);
  failOnErrors(page);
  await hostGame(page, "Speedy");
  const greatRoom = houseToWorld(24, 8);
  const rates: Record<string, number> = {};
  for (const [name, t, x, z, lx, lz, y] of [
    ["day-lawn", "noon", 8, 26, 4, 0, undefined],
    ["night-lawn", "night", 8, 26, 4, 0, undefined],
    ["night-great-room", "night", greatRoom.x, greatRoom.z, greatRoom.x + 5, greatRoom.z, -0.5 * HOUSE.scale],
  ] as const) {
    await page.evaluate((t) => window.__den!.setTime(t), t);
    await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y ?? Number.NaN), [x, z, y] as const);
    await stand(page, x, z, lx, lz);
    if (y !== undefined) await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [x, z, y] as const);
    await page.waitForTimeout(1500);
    rates[name] = await fps(page);
    await page.screenshot({ path: `test-results/daynight/fps-${name}.png` });
  }
  console.log("frame rates:", Object.entries(rates).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(", "));
  for (const v of Object.values(rates)) expect(v).toBeGreaterThan(30);
});

test("sound starts after the first click: ambience loads, and a roar is heard", async ({ page }) => {
  test.setTimeout(60_000);
  failOnErrors(page);
  const sounds: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/audio/")) sounds.push(`${r.status()} ${r.url().split("/audio/")[1]}`);
  });
  await hostGame(page, "Loud");
  // The lobby's Create and Play clicks count as the first click that browsers require.
  await expect.poll(() => page.evaluate(() => window.__den!.audio().state)).toBe("running");
  await expect.poll(() => sounds.length).toBeGreaterThanOrEqual(5); // day birds, dawn chorus, crickets, frogs, stream
  expect(sounds.every((s) => s.startsWith("200"))).toBe(true);
  // The morning birds and wind are actually coming out (not silent).
  await expect.poll(() => page.evaluate(() => window.__den!.audioLevel().rms), { timeout: 15_000 }).toBeGreaterThan(-40);
  await page.keyboard.press("KeyY");
  await expect.poll(() => page.evaluate(() => window.__den!.audio().recent)).toContain("roar");
});
