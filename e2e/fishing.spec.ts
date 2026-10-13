import { expect, type Page, test } from "@playwright/test";
import { dockStartX, rodBucket, streamCenter } from "../shared/src/index.ts";
import { closePlayers, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

test.afterEach(closePlayers);

// Milestone 2.4 (GAME_SPEC §13): take a rod at the bucket, cast onto the stream, a bite, the
// fight with R, the catch card, and a second bear seeing the line, the fight and the catch.

const fish = (p: Page) => p.evaluate(() => window.__den!.fish.me());

/** Stand by the rod bucket looking out over the water (east). */
async function toTheBucket(p: Page, dz = 0) {
  const b = rodBucket();
  await p.evaluate(([x, z]) => {
    const d = window.__den!;
    d.teleport(x!, z!);
    d.camera.yaw = -Math.PI / 2; // camera looks east, over the stream
    d.camera.pitch = 0.25;
  }, [b.x + 0.6, b.z + dz] as const);
  // The server moves its copy of a teleported bear at sprint speed (anti-cheat): wait for it to arrive.
  await expect.poll(() => p.evaluate(([x, z]) => {
    const s = window.__den!.serverPosition();
    return s ? Math.hypot(s.x - x!, s.z - z!) : 99;
  }, [b.x + 0.6, b.z + dz] as const), { timeout: 60_000 }).toBeLessThan(0.5);
}

test("take a rod, cast, hook a fish, reel it in: the whole party sees it", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  const code = await hostGame(a, "Angler", { play: false });
  await joinGame(b, code, "Watcher");
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);

  await toTheBucket(a);
  await toTheBucket(b, -3.5);
  await expect(a.getByTestId("action-prompt")).toContainText("Take a fishing rod");
  await a.keyboard.press("KeyE");
  await expect.poll(async () => (await fish(a)).rod).toBe(true);
  await expect.poll(() => b.evaluate(() => window.__den!.remotes()[0]?.fish.rod)).toBe(true);

  // A cast onto the bank is refused with a hint; a cast onto the water goes out.
  const toWater = (streamCenter(0) - 6 - (rodBucket().x + 0.6) - 3) / 22;
  await a.evaluate(() => window.__den!.fish.quickBite(1.5, "largemouth", 3.2));
  expect(await a.evaluate((p) => window.__den!.fish.cast(p), toWater)).toBe(true);
  await expect.poll(async () => (await fish(a)).state, { timeout: 8000 }).toBe("cast");
  const lure = await fish(a);
  expect(lure.lureX).toBeGreaterThan(dockStartX()); // out past the bank
  await a.screenshot({ path: "test-results/fishing/1-cast.png" });

  // The bite.
  await expect(a.getByTestId("fish-on")).toBeVisible({ timeout: 8000 });
  await a.screenshot({ path: "test-results/fishing/2-bite.png" });
  await expect.poll(() => b.evaluate(() => window.__den!.remotes()[0]?.fish.state)).toBe("bite");

  // Strike and fight: reel steadily, easing off when the tension climbs.
  await a.keyboard.press("KeyR");
  await expect.poll(async () => (await fish(a)).state).toBe("fight");
  await expect(a.getByTestId("tension")).toBeVisible();
  let shot = false;
  for (let i = 0; i < 200 && (await fish(a)).state === "fight"; i++) {
    const f = await fish(a);
    if (f.tension < 0.55) await a.keyboard.press("KeyR");
    if (!shot && i === 6) {
      await a.screenshot({ path: "test-results/fishing/3-fight.png" });
      await b.screenshot({ path: "test-results/fishing/3-fight-other-bear.png" });
      shot = true;
    }
    await a.waitForTimeout(220);
  }
  expect((await fish(a)).state).toBe("landed");
  await expect(a.getByTestId("catch-card")).toContainText("Largemouth bass");
  await expect(a.getByTestId("catch-card")).toContainText("3 lb 3 oz");
  await expect(a.getByTestId("catch-card")).toContainText("New personal best!");
  await a.screenshot({ path: "test-results/fishing/4-landed.png" });
  // Close-up from in front of the bear: the rod in its paw and the fish held up.
  await a.evaluate(() => {
    const d = window.__den!;
    d.camera.yaw = d.player.yaw;
    d.camera.pitch = 0.1;
    d.camera.distance = 2.4;
  });
  await a.waitForTimeout(400);
  await a.screenshot({ path: "test-results/fishing/5-landed-front.png" });
  await expect(b.getByTestId("catch-toast")).toContainText("Angler caught a 3 lb 3 oz largemouth bass");
  await b.screenshot({ path: "test-results/fishing/4-landed-other-bear.png" });

  // Back to waiting with the rod; putting it back at the bucket.
  await expect.poll(async () => (await fish(a)).state, { timeout: 8000 }).toBe("");
  await a.keyboard.press("KeyE");
  await expect.poll(async () => (await fish(a)).rod).toBe(false);
});

test("a bite nobody strikes gets away; a cast onto dry land is refused", async ({ page }) => {
  test.setTimeout(90_000);
  await hostGame(page, "Dozy");
  await toTheBucket(page);
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await fish(page)).rod).toBe(true);
  expect(await page.evaluate(() => window.__den!.fish.cast(0))).toBe(false); // 3 m: still on the bank
  const toWater = (streamCenter(0) - 6 - (rodBucket().x + 0.6) - 3) / 22;
  await page.evaluate(() => window.__den!.fish.quickBite(1));
  expect(await page.evaluate((p) => window.__den!.fish.cast(p), toWater)).toBe(true);
  await expect.poll(async () => (await fish(page)).state, { timeout: 8000 }).toBe("bite");
  await expect.poll(async () => (await fish(page)).state, { timeout: 6000 }).toBe("missed");
});
