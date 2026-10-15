import { expect, type Page, test } from "@playwright/test";
import { BALL_RETURN, HOUSE, LANES, PLATFORM_Y, houseToWorld, rodBucket, streamCenter } from "../shared/src/index.ts";
import { closePlayers, hostGame, joinGame, newPlayer, skipIntro, waitForBear } from "./helpers.ts";

// Phase 5.4 bug bash: a friend reloading the page (or their Wi-Fi dropping) in the middle of
// fishing or bowling mustn't leave anything stuck for them or for anyone else.
// (Catan's version is in catan.spec.ts.)

test.afterEach(closePlayers);

async function goTo(p: Page, x: number, z: number, y?: number) {
  await p.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y ?? undefined), [x, z, y ?? null] as const);
  await expect.poll(async () => {
    const s = await p.evaluate(() => window.__den!.serverPosition());
    return s ? Math.hypot(s.x - x, s.z - z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(1);
}

async function reload(p: Page) {
  await p.reload();
  await skipIntro(p);
  await waitForBear(p);
}

test("reloading mid-fight: the fish is let go, nobody sees a stuck line, and you can fish again", async ({ browser }) => {
  test.setTimeout(200_000);
  const a = await newPlayer(browser), b = await newPlayer(browser);
  const code = await hostGame(a, "Angler", { play: false });
  await joinGame(b, code, "Watcher");
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);
  const bucket = rodBucket();
  await goTo(a, bucket.x + 0.6, bucket.z);
  await goTo(b, bucket.x + 0.6, bucket.z - 3.5);
  await a.evaluate(() => {
    window.__den!.camera.yaw = -Math.PI / 2;
    window.__den!.camera.pitch = 0.25;
  });
  await a.keyboard.press("KeyE");
  await expect.poll(() => a.evaluate(() => window.__den!.fish.me().rod)).toBe(true);
  const toWater = (streamCenter(0) - 6 - (bucket.x + 0.6) - 3) / 22;
  await a.evaluate(() => window.__den!.fish.quickBite(1.5, "largemouth", 3.2));
  expect(await a.evaluate((p) => window.__den!.fish.cast(p), toWater)).toBe(true);
  await expect.poll(() => a.evaluate(() => window.__den!.fish.me().state), { timeout: 10_000 }).toBe("bite");
  await a.keyboard.press("KeyR");
  await expect.poll(() => b.evaluate(() => window.__den!.remotes()[0]?.fish.state), { timeout: 10_000 }).toBe("fight");

  await reload(a);
  // The watcher no longer sees a fight going on.
  await expect.poll(() => b.evaluate(() => window.__den!.remotes()[0]?.fish.state ?? "none"), { timeout: 30_000 }).not.toBe("fight");
  // Back at the bucket, the angler can take a rod and cast again.
  await goTo(a, bucket.x + 0.6, bucket.z);
  await a.evaluate(() => {
    window.__den!.camera.yaw = -Math.PI / 2;
    window.__den!.camera.pitch = 0.25;
  });
  if (!(await a.evaluate(() => window.__den!.fish.me().rod))) {
    await expect(a.getByTestId("action-prompt")).toContainText("Take a fishing rod");
    await a.keyboard.press("KeyE");
    await expect.poll(() => a.evaluate(() => window.__den!.fish.me().rod)).toBe(true);
  }
  expect(await a.evaluate(() => window.__den!.fish.me().state)).toBe("");
  expect(await a.evaluate((p) => window.__den!.fish.cast(p), toWater)).toBe(true);
  await expect.poll(() => a.evaluate(() => window.__den!.fish.me().state), { timeout: 10_000 }).toBe("cast");
});

test("a bowler reloading on their turn doesn't stall the lane", async ({ browser }) => {
  test.setTimeout(200_000);
  const a = await newPlayer(browser), b = await newPlayer(browser);
  const code = await hostGame(a, "Bowler1", { play: false });
  await joinGame(b, code, "Bowler2");
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);
  const cz = LANES.find((l) => l.id === "1")!.cz;
  const at = houseToWorld(BALL_RETURN.x, (BALL_RETURN.z + cz) / 2), at2 = houseToWorld(BALL_RETURN.x - 0.6, (BALL_RETURN.z + cz) / 2);
  await goTo(a, at.x, at.z, PLATFORM_Y * HOUSE.scale);
  await expect.poll(() => a.evaluate(() => document.querySelector("[data-testid=action-prompt]")?.textContent ?? "")).toContain("Bowl on lane 1");
  await a.keyboard.press("e");
  await goTo(b, at2.x, at2.z, PLATFORM_Y * HOUSE.scale);
  await expect.poll(() => b.evaluate(() => document.querySelector("[data-testid=action-prompt]")?.textContent ?? "")).toContain("Bowl on lane 1");
  await b.keyboard.press("e");
  await expect.poll(() => b.evaluate(() => window.__den!.bowl!.lanes()["1"].bowlers.length)).toBe(2);
  await expect.poll(() => a.evaluate(() => window.__den!.bowl!.me().mode)).toBe("aim");

  await reload(a);
  // Either Bowler1 is back with their turn, or the lane has moved on to Bowler2: never stuck.
  await expect.poll(async () => {
    const lane = await b.evaluate(() => window.__den!.bowl!.lanes()["1"]);
    const bMode = await b.evaluate(() => window.__den!.bowl!.me().mode);
    const aMode = await a.evaluate(() => window.__den!.bowl!.me().mode).catch(() => "?");
    return bMode === "aim" || aMode === "aim" || lane.bowlers.length < 2 ? "moving" : `${aMode}/${bMode}/${lane.bowlers.map((x) => x.name).join()}`;
  }, { timeout: 60_000 }).toBe("moving");
  // And Bowler2 can still bowl when it's their turn (or straight away if Bowler1 is gone).
  const names = await b.evaluate(() => window.__den!.bowl!.lanes()["1"].bowlers.map((x) => x.name));
  if (!names.includes("Bowler1") || (await b.evaluate(() => window.__den!.bowl!.me().mode)) === "aim") {
    await expect.poll(() => b.evaluate(() => window.__den!.bowl!.me().mode), { timeout: 30_000 }).toBe("aim");
    expect(await b.evaluate((t) => window.__den!.bowl!.throw(t), { z: 0.4, aim: 3, power: 0.5, curve: 0 })).toBe(true);
  }
});
