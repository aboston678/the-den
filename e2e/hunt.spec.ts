import { expect, type Page, test } from "@playwright/test";
import { GUN_LOCKER, HIDE_SPOTS, HUNT_CIRCLE } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// The bear hunt (Andrew, 2026-10-17): Ann and Bob ready up in the blue circle by the dock, Cal stays
// out. One becomes the bear (moved to a hiding spot), the other a hunter with the sniper. Cal is hidden
// from them; the bear's map shows the hunter, the hunter's never shows the bear. The bear swipes the
// hunter down; the hunter takes the AR from the basement locker and two hits end the hunt, heard by
// Cal too. Second hunt: a wall stops a bullet, and surviving ten minutes is worth 512.
//   npx playwright test e2e/hunt.spec.ts   (screenshots in test-results/hunt/)

test.afterEach(closePlayers);

const hunt = (page: Page) => page.evaluate(() => window.__den!.hunt!.state());
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/hunt/${name}.png` });

/** Move a bear and wait until the server has it there. */
async function goTo(page: Page, x: number, z: number, y = Number.NaN) {
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, Number.isNaN(y!) ? undefined : y), [x, z, y] as const);
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.__den!.serverPosition());
    if (process.env.HUNT_DEBUG) console.log(JSON.stringify({ want: [x, z], srv: p, me: await page.evaluate(() => window.__den!.player.position) }));
    return p ? Math.hypot(p.x - x, p.z - z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(1);
}

/** Into the circle and ready. dz: across the circle, so one bear's server copy gliding in from far off doesn't brush the other. */
async function readyUp(page: Page, dz: number) {
  await goTo(page, HUNT_CIRCLE.x, HUNT_CIRCLE.z + dz);
  await expect(page.getByTestId("action-prompt")).toContainText("Ready for bear hunt", { timeout: 15_000 });
  await page.keyboard.press("e");
}

async function startHunt(ann: Page, bob: Page, spot: string) {
  await ann.evaluate((s) => window.__den!.hunt!.spot(s), spot);
  await readyUp(ann, -2.5);
  await readyUp(bob, 2.5);
  await expect(ann.getByTestId("hunt-countdown")).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await hunt(bob)).phase, { timeout: 15_000 }).toBe("live");
  const s = await hunt(ann);
  const annIsBear = s.roles[s.bearId] === "bear" && s.role === "bear";
  return annIsBear ? { bear: ann, hunter: bob } : { bear: bob, hunter: ann };
}

test("a bear hunt: ready up, a hidden bear, a swipe, the locker, two AR hits; a wall stops a bullet; ten minutes is 512", async ({ page: ann, browser }) => {
  test.setTimeout(420_000);
  failOnErrors(ann);
  const code = await hostGame(ann, "Ann");
  const bob = await newPlayer(browser);
  await joinGame(bob, code, "Bob");
  await waitForBear(bob);
  const cal = await newPlayer(browser);
  await joinGame(cal, code, "Cal");
  await waitForBear(cal);
  // Cal waits by the circle (outside it, and off the line the others' server copies glide along from the garage).
  await goTo(cal, HUNT_CIRCLE.x - 4, HUNT_CIRCLE.z + 9);

  const lawn = HIDE_SPOTS.find((s) => s.name === "the front lawn")!;
  const { bear, hunter } = await startHunt(ann, bob, lawn.name);
  await shot(ann, "1-start-ann");

  // The bear went to its spot (told only to it); the hunter has the scoped sniper.
  await expect.poll(async () => {
    const p = await bear.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - lawn.x, p.z - lawn.z) : 99;
  }, { timeout: 15_000 }).toBeLessThan(3);
  expect((await hunt(bear)).spot).toBe("the front lawn");
  expect((await hunt(hunter)).spot).toBe("");
  const mine = (await hunt(hunter)).me;
  expect(mine.gun).toBe("sniper");
  expect(mine.scoped).toEqual(["sniper"]);
  await expect(hunter.getByTestId("hunt-cross")).toBeVisible();
  await expect(bear.getByTestId("hunt-banner")).toContainText("You're the bear");

  // Cal (not in it) is hidden from both; Cal sees the hunt is on.
  await expect.poll(async () => (await ann.evaluate(() => window.__den!.remotes())).find((r) => r.name === "Cal")?.hidden).toBe(true);
  await expect.poll(async () => (await bob.evaluate(() => window.__den!.remotes())).find((r) => r.name === "Cal")?.hidden).toBe(true);
  await expect(cal.getByTestId("hunt-watching")).toBeVisible();
  // The bear's map shows the hunter (red); the hunter's shows no bear.
  await expect.poll(() => bear.evaluate(() => window.__den!.hunt!.dots().map((d) => d.colour))).toEqual(["red"]);
  expect(await hunter.evaluate(() => window.__den!.hunt!.dots())).toEqual([]);
  await expect(bear.getByTestId("hunt-map")).toBeVisible();

  // The swipe: the bear right next to the hunter knocks him down.
  await goTo(hunter, lawn.x, lawn.z + 8);
  await goTo(bear, lawn.x, lawn.z + 7.3);
  await bear.evaluate(() => window.__den!.hunt!.swipe());
  await expect(hunter.getByTestId("hunt-down")).toBeVisible({ timeout: 5000 });
  await shot(hunter, "2-knocked-down");
  await expect(hunter.getByTestId("hunt-down")).toBeHidden({ timeout: 6000 });

  // The locker in the basement den: take the AR.
  await goTo(hunter, GUN_LOCKER.x, GUN_LOCKER.z + 1.2, GUN_LOCKER.y);
  await expect(hunter.getByTestId("action-prompt")).toContainText("Open the gun locker", { timeout: 15_000 });
  await hunter.keyboard.press("e");
  await expect(hunter.getByTestId("hunt-locker")).toBeVisible();
  await shot(hunter, "3-locker");
  await hunter.getByTestId("locker-ar").click();
  await expect.poll(async () => (await hunt(hunter)).me.gun).toBe("ar");
  await hunter.keyboard.press("e");
  await expect(hunter.getByTestId("hunt-locker")).toBeHidden();

  // Out on the front lawn: two AR hits take the bear down. Cal hears the shots.
  await goTo(hunter, lawn.x, lawn.z + 12);
  await goTo(bear, lawn.x, lawn.z);
  const calShotsBefore = (await cal.evaluate(() => window.__den!.audio().played["shot-ar"] ?? 0));
  const target = await bear.evaluate(() => window.__den!.serverPosition()!);
  await hunter.evaluate(([x, y, z]) => window.__den!.hunt!.fireAt(x!, y! + 1.2, z!), [target.x, target.y, target.z] as const);
  if (process.env.HUNT_DEBUG) console.log("shot", JSON.stringify(await hunter.evaluate(() => (window.__den!.hunt as unknown as { lastRay: () => unknown }).lastRay())), JSON.stringify(target), JSON.stringify(await hunter.evaluate(() => window.__den!.serverPosition())));
  await expect.poll(async () => (await hunt(ann)).bearHealth).toBe(50);
  expect(await hunter.evaluate(() => (window.__den!.hunt!.state() as unknown as { hitAt: number }).hitAt)).toBeGreaterThan(0); // the hit marker flashed
  await shot(bear, "4-bear-hit");
  await hunter.waitForTimeout(200);
  await hunter.evaluate(([x, y, z]) => window.__den!.hunt!.fireAt(x!, y! + 1.2, z!), [target.x, target.y, target.z] as const);
  await expect.poll(async () => (await hunt(cal)).phase).toBe("over");
  const result = (await hunt(cal)).result!;
  expect(result.how).toBe("shot");
  expect(result.byGun).toBe("ar");
  await expect(cal.getByTestId("hunt-result")).toContainText("took the bear down");
  await expect.poll(async () => (await cal.evaluate(() => window.__den!.audio().played["shot-ar"] ?? 0))).toBeGreaterThan(calShotsBefore);
  await shot(cal, "5-result-cal");
  // Cal is back for them once it's over.
  await expect.poll(async () => (await ann.evaluate(() => window.__den!.remotes())).find((r) => r.name === "Cal")?.hidden).toBe(false);

  // Second hunt: the bear in the garage, the hunter outside the closed garage doors.
  await expect.poll(async () => (await hunt(ann)).phase, { timeout: 20_000 }).toBe("idle");
  const garage = HIDE_SPOTS.find((s) => s.name === "the garage")!;
  const two = await startHunt(ann, bob, garage.name);
  await expect.poll(async () => {
    const p = await two.bear.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - garage.x, p.z - garage.z) : 99;
  }, { timeout: 15_000 }).toBeLessThan(3);
  await goTo(two.hunter, -27, garage.z);
  const inside = await two.bear.evaluate(() => window.__den!.serverPosition()!);
  await two.hunter.waitForTimeout(500);
  await two.hunter.evaluate(([x, y, z]) => window.__den!.hunt!.fireAt(x!, y! + 1.2, z!), [inside.x, inside.y, inside.z] as const);
  await two.hunter.waitForTimeout(1500);
  expect((await hunt(ann)).bearHealth).toBe(100);
  // Ten minutes: the bear wins 512.
  await two.hunter.evaluate(() => window.__den!.hunt!.skip(601));
  await expect.poll(async () => (await hunt(cal)).result?.how, { timeout: 10_000 }).toBe("survived");
  await expect(two.bear.getByTestId("hunt-points")).toHaveText("512");
  await shot(two.bear, "6-survived");
});
