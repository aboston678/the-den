import { expect, type Page, test } from "@playwright/test";
import { GARAGE_BIKE } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// The motorcycle (round 2, Andrew 2026-10-16): open the garage door, get on the garage bike, ride out
// onto the driveway and steer, a second bear sees (and hears) you riding, stop and park, get back on.
//   npx playwright test e2e/bike.spec.ts   (screenshots in test-results/bike/)

test.afterEach(closePlayers);

const bike = (p: Page) => p.evaluate(() => window.__den!.bike!.state());
const me = (p: Page) => p.evaluate(() => ({ ...window.__den!.player.position, yaw: window.__den!.player.yaw }));
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/bike/${name}.png` });

async function hold(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

/** Teleport and wait for the server's copy of the bear to catch up. */
async function goTo(page: Page, x: number, z: number, yaw?: number, y?: number) {
  await page.evaluate(([x, z, yaw, y]) => {
    const d = window.__den!;
    d.teleport(x!, z!, y ?? undefined);
    if (yaw !== null) d.camera.yaw = yaw! + Math.PI;
  }, [x, z, yaw ?? null, y ?? null] as const);
  await expect.poll(async () => {
    const s = await page.evaluate(() => window.__den!.serverPosition());
    return s ? Math.hypot(s.x - x, s.z - z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(0.6);
}

test("ride the garage motorcycle out onto the driveway; another bear sees it; park and get back on", async ({ page: ann, browser }) => {
  test.setTimeout(240_000);
  failOnErrors(ann);
  const code = await hostGame(ann, "Ann");
  const bob = await newPlayer(browser);
  await joinGame(bob, code, "Bob");
  await waitForBear(bob);

  // Open the south garage door from outside (the bike faces it).
  await goTo(ann, -22.6, GARAGE_BIKE.z, Math.PI / 2);
  await expect(ann.getByTestId("action-prompt")).toContainText("Open garage door");
  await ann.keyboard.press("KeyE");
  await expect.poll(() => ann.evaluate(() => window.__den!.doors()["main:garage-outside:2"])).toBe(true);

  // Bob watches from the apron; Ann gets on the bike.
  await goTo(bob, -27, GARAGE_BIKE.z - 4, Math.PI / 2 + 0.5);
  await goTo(ann, GARAGE_BIKE.x + 1.4, GARAGE_BIKE.z, undefined, GARAGE_BIKE.y); // on the garage floor, not the roof
  await expect.poll(async () => (await bike(ann)).prompt).toBe("Ride the motorcycle");
  await ann.keyboard.press("KeyE");
  await expect.poll(async () => (await bike(ann)).riding).toBe(true);
  await expect.poll(async () => (await bike(ann)).me.state).toBe("riding");
  await ann.waitForTimeout(1200);
  await shot(ann, "1-on-the-bike");
  await expect.poll(() => bob.evaluate(() => window.__den!.remotes()[0]?.action)).toBe("ride");

  // Ride out of the garage (west) and down the driveway a little, then steer.
  const start = await me(ann);
  await hold(ann, ["KeyW"], 1800);
  const out = await me(ann);
  expect(out.x).toBeLessThan(start.x - 8); // out through the door onto the apron
  expect((await bike(ann)).speed).toBeGreaterThan(5);
  await shot(ann, "2-riding-out");
  await bob.screenshot({ path: "test-results/bike/2-bob-watching.png" });
  await hold(ann, ["KeyW", "KeyA"], 900);
  const turned = await me(ann);
  expect(Math.abs(turned.yaw - out.yaw)).toBeGreaterThan(0.3);
  await shot(ann, "3-leaning");

  // Can't get off at speed; stop, then park.
  await ann.keyboard.down("KeyW");
  await expect.poll(async () => (await bike(ann)).prompt).toBe("Slow down to get off");
  await ann.keyboard.up("KeyW");
  await hold(ann, ["KeyS"], 1500);
  await expect.poll(async () => (await bike(ann)).prompt, { timeout: 10_000 }).toBe("Get off");
  const stop = await me(ann);
  await ann.keyboard.press("KeyE");
  await expect.poll(async () => (await bike(ann)).riding).toBe(false);
  await expect.poll(async () => (await bike(ann)).me.state).toBe("parked");
  const parked = (await bike(ann)).me;
  expect(Math.hypot(parked.x - stop.x, parked.z - stop.z)).toBeLessThan(1);
  await expect.poll(async () => Object.values((await bike(bob)).others).some((b) => b.state === "parked")).toBe(true);
  await expect.poll(() => bob.evaluate(() => window.__den!.remotes()[0]?.action)).not.toBe("ride");
  await ann.waitForTimeout(800);
  await shot(ann, "4-parked");

  // Back on.
  await expect.poll(async () => (await bike(ann)).prompt).toBe("Get on your motorcycle");
  await ann.keyboard.press("KeyE");
  await expect.poll(async () => (await bike(ann)).riding).toBe(true);
});
