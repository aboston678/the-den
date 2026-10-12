import { expect, test, type Page } from "@playwright/test";
import { HOUSE, doorById, houseToWorld } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// Milestone 1.9: the house (GAME_SPEC §8): doors open with E for everyone, rooms are walkable.

test.afterEach(closePlayers);

const me = (p: Page) => p.evaluate(() => ({ ...window.__den!.player.position }));
const UPPER_Y = 2.7 * HOUSE.scale;

/**
 * Stand at floorplan (x, z) on floor height y (world), with W walking toward floorplan (tx, tz).
 * (The server only moves its copy of a bear at sprint speed, so after a long teleport it takes a
 * few seconds to catch up; tests that need the server to agree wait for that.)
 */
async function standAt(p: Page, [x, z]: [number, number], [tx, tz]: [number, number], y?: number) {
  const a = houseToWorld(x, z), b = houseToWorld(tx, tz);
  await p.evaluate(([ax, az, bx, bz, y]) => {
    const d = window.__den!;
    d.teleport(ax!, az!, y ?? undefined);
    d.camera.yaw = Math.atan2(-(bx! - ax!), -(bz! - az!));
  }, [a.x, a.z, b.x, b.z, y ?? null] as const);
  await p.waitForTimeout(600);
}

async function walk(p: Page, ms: number, keys = ["KeyW"]) {
  for (const k of keys) await p.keyboard.down(k);
  await p.waitForTimeout(ms);
  for (const k of keys) await p.keyboard.up(k);
}

test("the front door opens with E for everyone, and you can walk in", async ({ browser }) => {
  const a = await newPlayer(browser), b = await newPlayer(browser);
  const code = await hostGame(a, "Alpha", { play: false });
  await joinGame(b, code, "Bravo");
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);
  const door = doorById("main:foyer-porch")!;

  await standAt(a, [27.5, -1], [27.5, 2]); // on the porch, facing the front door
  // Wait until the server has Alpha at the door too (it moves its copy at sprint speed): Bravo sees it there.
  await expect.poll(async () => {
    const seen = (await b.evaluate(() => window.__den!.remotes()))[0];
    return seen ? Math.hypot(seen.x - door.world.x, seen.z - door.world.z) : 999;
  }, { timeout: 20_000 }).toBeLessThan(2.5);
  await expect(a.getByTestId("action-prompt")).toContainText("Open door");
  await a.keyboard.press("KeyE");
  await expect.poll(() => b.evaluate((id) => window.__den!.doors()[id], door.id)).toBe(true); // Bravo sees it open
  await a.waitForTimeout(1000);
  await walk(a, 2500);
  const inside = await me(a);
  expect(inside.z).toBeGreaterThan(door.world.z + 0.8); // through the doorway into the foyer
  expect(Math.abs(inside.y)).toBeLessThan(0.1);
  await a.screenshot({ path: "test-results/house-foyer-from-door.png" });
});

test("a closed door is solid; the utility room is locked", async ({ page }) => {
  failOnErrors(page);
  await hostGame(page, "Ranger");
  // In the basement den, facing the utility room's door.
  await standAt(page, [17.5, 6], [17.5, 2], level("basement"));
  await expect(page.getByTestId("action-prompt")).toHaveText("Locked");
  await page.keyboard.press("KeyE");
  await walk(page, 2000);
  const p = await me(page);
  expect(p.z).toBeGreaterThan(houseToWorld(17.5, 5).z); // still in the den
  expect(await page.evaluate(() => Object.keys(window.__den!.doors()).some((id) => id.includes("utility")))).toBe(false);
});

test("the garage door tilts up and you can walk into the garage", async ({ page }) => {
  failOnErrors(page);
  await hostGame(page, "Ranger");
  await standAt(page, [-1.4, 2.2], [3, 2.2], undefined, true); // on the apron, facing the first garage door
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1300);
  await walk(page, 2500);
  expect((await me(page)).x).toBeGreaterThan(houseToWorld(1, 0).x);
});

test("the main stairs go up to the balcony", async ({ page }) => {
  failOnErrors(page);
  await hostGame(page, "Ranger");
  // In the foyer beside the bottom step, step onto the stairs, then climb south.
  await standAt(page, [27.4, 0.5], [25, 0.5], 0);
  await walk(page, 700);
  await standAt(page, [26.2, 0.5], [26.2, 5], (await me(page)).y + 0.05);
  await walk(page, 4500);
  const p = await me(page);
  expect(p.y).toBeGreaterThan(UPPER_Y - 0.1);
  await page.screenshot({ path: "test-results/house-top-of-stairs.png" });
});

test("the basement den walks out onto the back lawn", async ({ page }) => {
  failOnErrors(page);
  await hostGame(page, "Ranger");
  await standAt(page, [17.5, 11], [17.5, 7], level("basement"), true); // on the lawn under the deck
  await expect(page.getByTestId("action-prompt")).toContainText("Open door");
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1200);
  await walk(page, 2500);
  const p = await me(page);
  expect(p.z).toBeLessThan(houseToWorld(17.5, 9.2).z); // inside the den
  expect(Math.abs(p.y - level("basement"))).toBeLessThan(0.1);
});

function level(id: "basement") {
  return id === "basement" ? HOUSE.basementFloorY : 0;
}
