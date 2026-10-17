import { expect, type Page, test } from "@playwright/test";
import { GUN_LOCKER, HIDE_SPOTS, HUNT_CIRCLE } from "../shared/src/index.ts";
import { closePlayers, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// Dev tool, not a check (HUNTSHOTS=1): pictures of the bear hunt for Andrew's review, in review/hunt/
// (not in git): the circle, the hunter with each gun, aiming over the shoulder, the scope, the bear's
// view of a hunter glowing through a wall, a knock-down, and the locker.
test.skip(!process.env.HUNTSHOTS, "dev tool: set HUNTSHOTS=1 to run");
test.afterEach(closePlayers);

const hunt = (page: Page) => page.evaluate(() => window.__den!.hunt!.state());
const pic = (page: Page, name: string) => page.screenshot({ path: `review/hunt/${name}.png` });
const cam = (page: Page, from: [number, number, number], look: [number, number, number]) =>
  page.evaluate(([f, l]) => {
    window.__den!.camera.override = { from: { x: f![0], y: f![1], z: f![2] }, look: { x: l![0], y: l![1], z: l![2] } } as never;
  }, [from, look] as const);
const free = (page: Page) => page.evaluate(() => {
  window.__den!.camera.override = null;
});

async function goTo(page: Page, x: number, z: number, y?: number) {
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y ?? undefined), [x, z, y ?? null] as const);
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - x, p.z - z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(1);
}

test("bear hunt pictures", async ({ page: ann, browser }) => {
  test.setTimeout(300_000);
  const code = await hostGame(ann, "Ann");
  const bob = await newPlayer(browser);
  await joinGame(bob, code, "Bob");
  await waitForBear(bob);

  // The circle, with both bears ready in it.
  await goTo(ann, HUNT_CIRCLE.x, HUNT_CIRCLE.z - 2.5);
  await goTo(bob, HUNT_CIRCLE.x, HUNT_CIRCLE.z + 2.5);
  await cam(ann, [HUNT_CIRCLE.x - 9, -3.2, HUNT_CIRCLE.z - 6], [HUNT_CIRCLE.x + 1, -6.2, HUNT_CIRCLE.z]);
  await ann.waitForTimeout(2000);
  await pic(ann, "a-circle");
  await free(ann);
  await ann.evaluate(() => window.__den!.hunt!.spot("the front lawn"));
  await ann.evaluate(() => window.__den!.hunt!.ready(true));
  await bob.evaluate(() => window.__den!.hunt!.ready(true));
  await expect.poll(async () => (await hunt(ann)).phase, { timeout: 15_000 }).toBe("countdown");
  await pic(ann, "b-countdown");
  await expect.poll(async () => (await hunt(ann)).phase, { timeout: 15_000 }).toBe("live");
  const annBear = (await hunt(ann)).role === "bear";
  const bear = annBear ? ann : bob, hunter = annBear ? bob : ann;
  await pic(hunter, "c-hunter-start");

  // Every gun from the locker, a scope on the AR.
  await goTo(hunter, GUN_LOCKER.x, GUN_LOCKER.z + 1.2, GUN_LOCKER.y);
  await cam(hunter, [GUN_LOCKER.x + 1.2, GUN_LOCKER.y + 1.7, GUN_LOCKER.z + 2.6], [GUN_LOCKER.x, GUN_LOCKER.y + 1.2, GUN_LOCKER.z]);
  await hunter.evaluate(() => { window.__den!.player.hidden = true; });
  await hunter.waitForTimeout(1500);
  await pic(hunter, "d-locker");
  await hunter.evaluate(() => { window.__den!.player.hidden = false; });
  await free(hunter);
  for (const g of ["pistol", "ar", "shotgun"]) await hunter.evaluate((g) => window.__den!.hunt!.locker("take", g), g);
  await hunter.evaluate(() => window.__den!.hunt!.locker("scope", "ar", true));
  await expect.poll(async () => (await hunt(hunter)).me.guns.length).toBe(4);

  // On the front lawn: the hunter with each gun, from his right side and from in front.
  const lawn = HIDE_SPOTS.find((s) => s.name === "the front lawn")!;
  await goTo(hunter, lawn.x, lawn.z + 14);
  await goTo(bear, lawn.x - 3, lawn.z - 6);
  for (const g of ["sniper", "pistol", "ar", "shotgun"]) {
    await hunter.evaluate((g) => window.__den!.hunt!.gun(g), g);
    await expect.poll(async () => (await hunt(hunter)).me.gun).toBe(g);
    const p = await hunter.evaluate(() => window.__den!.player.position);
    const yaw = await hunter.evaluate(() => window.__den!.player.yaw);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    await cam(hunter, [p.x + fx * 2.2 - fz * 1.8, p.y + 1.6, p.z + fz * 2.2 + fx * 1.8], [p.x, p.y + 1.25, p.z]);
    await hunter.waitForTimeout(1200);
    await pic(hunter, `e-hold-${g}`);
  }
  await free(hunter);

  // Aiming over the shoulder (the pistol), then through the AR's scope, at the bear.
  await hunter.evaluate(() => {
    const d = window.__den!;
    d.camera.yaw = 0; // looking north, toward the bear
    d.camera.pitch = 0.05;
  });
  await hunter.evaluate(() => window.__den!.hunt!.gun("pistol"));
  await hunter.evaluate(() => window.__den!.hunt!.aim(true));
  await hunter.waitForTimeout(1500);
  await pic(hunter, "f-aim-shoulder");
  await hunter.evaluate(() => window.__den!.hunt!.gun("ar"));
  await hunter.waitForTimeout(1500);
  await pic(hunter, "g-scope");
  await hunter.evaluate(() => window.__den!.hunt!.aim(false));
  // A burst: tracers and muzzle flash, seen from the side.
  const t = await bear.evaluate(() => window.__den!.serverPosition()!);
  const hp = await hunter.evaluate(() => window.__den!.player.position);
  await cam(hunter, [hp.x + 4, hp.y + 1.8, hp.z - 3], [hp.x - 1, hp.y + 1.3, hp.z - 7]);
  await hunter.waitForTimeout(800);
  await hunter.evaluate(([x, y, z]) => window.__den!.hunt!.fireAt(x!, y! + 3, z!), [t.x, t.y, t.z] as const); // over its head
  await hunter.waitForTimeout(40);
  await pic(hunter, "h-shot");
  await free(hunter);

  // The bear's view: the hunter glowing through the house (bear in the garage, hunter outside to the west).
  const garage = HIDE_SPOTS.find((s) => s.name === "the garage")!;
  await goTo(bear, garage.x, garage.z, garage.y ?? undefined);
  await goTo(hunter, garage.x - 14, garage.z);
  await bear.evaluate(() => {
    const d = window.__den!;
    d.camera.yaw = Math.PI / 2; // looking west
    d.camera.pitch = 0.1;
  });
  await bear.waitForTimeout(1500);
  await pic(bear, "i-bear-sees-hunter");

  // A knock-down: the bear swipes the hunter on the lawn.
  await goTo(hunter, lawn.x, lawn.z + 8);
  await goTo(bear, lawn.x, lawn.z + 7.3);
  await bear.evaluate(() => window.__den!.hunt!.swipe());
  await bear.waitForTimeout(400);
  await pic(bear, "j-swipe");
  await hunter.waitForTimeout(800);
  const hp2 = await hunter.evaluate(() => window.__den!.player.position);
  await cam(hunter, [hp2.x + 3.5, hp2.y + 1.4, hp2.z + 1], [hp2.x, hp2.y + 0.5, hp2.z]);
  await hunter.waitForTimeout(500);
  await pic(hunter, "k-knocked-down");
});
