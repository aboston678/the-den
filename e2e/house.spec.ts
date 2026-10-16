import { expect, test, type Page } from "@playwright/test";
import { GREAT_ROOM_FLOOR, HOUSE, doorById, houseToWorld } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// Milestone 1.9: the house (GAME_SPEC §8): doors open with E for everyone, rooms are walkable.

test.afterEach(closePlayers);

const me = (p: Page) => p.evaluate(() => ({ ...window.__den!.player.position }));
const UPPER_Y = 2.7 * HOUSE.scale;

/**
 * Stand at floorplan (x, z) on floor height y (world), with W walking toward floorplan (tx, tz).
 * The server only moves its copy of a bear at sprint speed (and only opens doors for bears next to
 * them), so with `settle` wait until the server has the bear there too.
 */
async function standAt(p: Page, [x, z]: [number, number], [tx, tz]: [number, number], y?: number, settle = false) {
  const a = houseToWorld(x, z), b = houseToWorld(tx, tz);
  await p.evaluate(([ax, az, bx, bz, y]) => {
    const d = window.__den!;
    d.teleport(ax!, az!, y ?? undefined);
    d.camera.yaw = Math.atan2(-(bx! - ax!), -(bz! - az!));
  }, [a.x, a.z, b.x, b.z, y ?? null] as const);
  await p.waitForTimeout(600);
  if (!settle) return;
  await expect.poll(async () => {
    const s = await p.evaluate(() => window.__den!.serverPosition());
    return s ? Math.hypot(s.x - a.x, s.z - a.z) : 999;
  }, { timeout: 20_000 }).toBeLessThan(1);
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

  await standAt(a, [27.5, -1], [27.5, 2], undefined, true); // on the porch, facing the front door
  await expect(a.getByTestId("action-prompt")).toContainText("Open door");
  await a.keyboard.press("KeyE");
  await expect.poll(() => b.evaluate((id) => window.__den!.doors()[id], door.id)).toBe(true); // Bravo sees it open
  // Walk in once the door has swung open (it can take longer than its 0.9 s when frames are slow).
  await a.waitForTimeout(1500);
  for (let tries = 0; tries < 3 && (await me(a)).z <= door.world.z + 0.8; tries++) await walk(a, 2500);
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
  // Closed, each door fills its whole opening: both halves of the first bay are solid.
  for (const z of [1.3, 3.1]) {
    await standAt(page, [-1.4, z], [3, z]);
    await walk(page, 1500);
    expect((await me(page)).x).toBeLessThan(houseToWorld(0, 0).x);
  }
  await standAt(page, [-1.4, 2.2], [3, 2.2], undefined, true); // on the apron, facing the first garage door
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1300);
  await walk(page, 2500);
  expect((await me(page)).x).toBeGreaterThan(houseToWorld(1, 0).x);
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

/** Walk (holding W, steering with the camera) through floorplan points in turn; no teleports. */
async function walkPath(p: Page, points: [number, number][], msPerLeg = 6000) {
  await p.keyboard.down("KeyW");
  try {
    for (const [x, z] of points) {
      const t = houseToWorld(x, z);
      const until = Date.now() + msPerLeg;
      while (Date.now() < until) {
        const here = await me(p);
        if (process.env.DEBUG_WALK) console.log(`→ (${x}, ${z})  at ${((here.x - HOUSE.originX) / HOUSE.scale).toFixed(2)}, ${(here.y / HOUSE.scale).toFixed(2)}, ${((here.z - HOUSE.originZ) / HOUSE.scale).toFixed(2)}`);
        if (Math.hypot(t.x - here.x, t.z - here.z) < 0.35) break;
        await p.evaluate(([tx, tz]) => {
          const d = window.__den!, q = d.player.position;
          d.camera.yaw = Math.atan2(-(tx! - q.x), -(tz! - q.z));
        }, [t.x, t.z] as const);
        await p.waitForTimeout(80);
      }
    }
  } finally {
    await p.keyboard.up("KeyW");
  }
  await p.waitForTimeout(400);
}

// Game-night fixes: Andrew's bear couldn't get up or down either staircase. Walk them for real.
test("you can walk from the foyer up the main stairs to the balcony, and back down", async ({ page }) => {
  test.setTimeout(120_000);
  failOnErrors(page);
  await hostGame(page, "Ranger");
  await standAt(page, [28.3, 1.6], [27, 0.6], 0); // in the foyer, just inside the front door
  await walkPath(page, [[27.4, 0.5], [26.2, 0.5], [26.2, 3.1], [26.2, 4.2]]);
  expect((await me(page)).y).toBeGreaterThan(UPPER_Y - 0.1);
  await page.screenshot({ path: "test-results/house-walked-up.png" });
  await walkPath(page, [[26.2, 3.0], [26.2, 0.5], [27.6, 0.5], [28.3, 1.6]]);
  const p = await me(page);
  expect(Math.abs(p.y)).toBeLessThan(0.1);
  expect(p.x).toBeGreaterThan(houseToWorld(27.2, 0).x); // back on the foyer floor
});

test("you can walk from the great room down to the basement, and back up", async ({ page }) => {
  test.setTimeout(120_000);
  failOnErrors(page);
  await hostGame(page, "Ranger");
  const great = GREAT_ROOM_FLOOR * HOUSE.scale;
  await standAt(page, [26.2, 5], [26.2, 2], great + 0.05, true); // in the great room, facing the basement door
  await expect(page.getByTestId("action-prompt")).toContainText("Open door");
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1500);
  await walkPath(page, [[26.2, 3.0], [26.2, 0.5], [24.6, 0.6], [23.5, 1.5]]);
  const down = await me(page);
  expect(Math.abs(down.y - level("basement"))).toBeLessThan(0.1);
  await page.screenshot({ path: "test-results/house-walked-down.png" });
  await walkPath(page, [[24.6, 0.5], [26.2, 0.5], [26.2, 3.0], [26.2, 5]]);
  const up = await me(page);
  expect(Math.abs(up.y - great)).toBeLessThan(0.1);
  expect(up.z).toBeGreaterThan(houseToWorld(0, 3.8).z); // back in the great room
});

function level(id: "basement") {
  return id === "basement" ? HOUSE.basementFloorY : 0;
}
