import { expect, test, type Page } from "@playwright/test";
import { BOUNDARY_HALF, DOCK, STONE_WALLS, STREAM, dockStartX, spawnPoint, streamCenter } from "../shared/src/index.ts";
import { failOnErrors, fps, hostGame } from "./helpers.ts";

// Milestone 1.8: the outdoor map (GAME_SPEC §4).

const me = (page: Page) => page.evaluate(() => ({ ...window.__den!.player.position, yaw: window.__den!.player.yaw }));
const ground = (page: Page, x: number, z: number) => page.evaluate(([x, z]) => window.__den!.ground(x!, z!), [x, z]);

/** Put the bear at (x, z) with the camera behind it, so W walks toward (tx, tz). */
async function placeFacing(page: Page, x: number, z: number, tx: number, tz: number, y?: number) {
  await page.evaluate(([x, z, tx, tz, y]) => {
    const d = window.__den!;
    d.teleport(x!, z!, y ?? undefined);
    d.camera.yaw = Math.atan2(-(tx! - x!), -(tz! - z!));
  }, [x, z, tx, tz, y ?? null] as const);
  await page.waitForTimeout(500);
}

async function hold(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
}

test.beforeEach(async ({ page }) => {
  failOnErrors(page);
  await hostGame(page, "Ranger");
});

test("you start on the driveway at the north-west edge, facing down it, and it runs smoothly", async ({ page }) => {
  const spot = spawnPoint(0);
  const start = await me(page);
  expect(Math.hypot(start.x - spot.x, start.z - spot.z)).toBeLessThan(0.3);
  expect(Math.abs(start.y - spot.y)).toBeLessThan(0.2);
  expect(Math.cos(start.yaw - spot.yaw)).toBeGreaterThan(0.99);
  expect(await fps(page)).toBeGreaterThan(30);

  // W walks down the driveway (away from the camera), staying on the ground.
  await hold(page, ["KeyW"], 3000);
  const after = await me(page);
  expect(Math.hypot(after.x - start.x, after.z - start.z)).toBeGreaterThan(4.5);
  expect(after.x).toBeGreaterThan(start.x); // south-east, toward the house
  expect(after.z).toBeGreaterThan(start.z);
  expect(Math.abs(after.y - (await ground(page, after.x, after.z)))).toBeLessThan(0.15);
});

test("an invisible boundary keeps you on the map", async ({ page }) => {
  await placeFacing(page, -BOUNDARY_HALF + 6, 20, -200, 20);
  await hold(page, ["ShiftLeft", "KeyW"], 2500);
  expect((await me(page)).x).toBeGreaterThan(-BOUNDARY_HALF);
});

test("you can wade into the stream's shallows, but not into deep water", async ({ page }) => {
  const z = 40, c = streamCenter(z);
  await placeFacing(page, c - 15, z, c + 30, z);
  await hold(page, ["KeyW"], 6000);
  const p = await me(page);
  expect(p.x).toBeGreaterThan(c - STREAM.width / 2); // in the water...
  expect(p.x).toBeLessThan(c + STREAM.wadeLimitD); // ...but stopped at the wading limit
  expect(p.y).toBeLessThan(STREAM.waterY); // feet on the stream bed, under the surface
  expect(STREAM.waterY - p.y).toBeLessThan(0.8);
});

test("you can walk out to the end of the dock, and not fall off it", async ({ page }) => {
  const x0 = dockStartX(), end = x0 + DOCK.length;
  await placeFacing(page, x0 - 3, DOCK.z, end + 10, DOCK.z);
  await hold(page, ["KeyW"], 7000);
  let p = await me(page);
  expect(p.x).toBeGreaterThan(end - 1); // at the end
  expect(Math.abs(p.y - DOCK.deckY)).toBeLessThan(0.1); // standing on the boards
  // Try to step off the side over deep water.
  await hold(page, ["KeyA"], 1500);
  await hold(page, ["KeyD"], 3000);
  p = await me(page);
  expect(Math.abs(p.z - DOCK.z)).toBeLessThan(DOCK.width / 2);
  expect(Math.abs(p.y - DOCK.deckY)).toBeLessThan(0.1);
  await page.screenshot({ path: "test-results/property-dock-end.png" });
});

test("stone walls are solid", async ({ page }) => {
  // Walk straight at the middle of the first field wall from 4 m away.
  const wall = STONE_WALLS[0]!;
  const i = Math.floor(wall.length / 2);
  const a = wall[i - 2]!, b = wall[i + 2]!, m = wall[i]!;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len; // across the wall
  await placeFacing(page, m.x + nx * 4, m.z + nz * 4, m.x - nx * 10, m.z - nz * 10);
  await hold(page, ["KeyW"], 4000);
  const p = await me(page);
  const side = (p.x - m.x) * nx + (p.z - m.z) * nz;
  expect(side).toBeGreaterThan(0.3); // still on the near side
});
