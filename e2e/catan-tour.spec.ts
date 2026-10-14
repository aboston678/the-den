import { expect, type Page, test } from "@playwright/test";
import { CATAN_SEATS, CATAN_TABLE, legalRoads, legalSettlements } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// Milestone 4.2 screenshot tour of the Catan table (GAME_SPEC §16): the board on the dining table,
// bears sitting down (seen from the side), the board camera, pieces and a dice roll.
//   npx playwright test e2e/catan-tour.spec.ts   -> test-results/catan-tour/*.png

test.afterEach(closePlayers);

/** Stand just behind a chair and wait until the server has us there. */
async function toChair(page: Page, seat: number) {
  const s = CATAN_SEATS[seat]!;
  const x = s.x - Math.sin(s.yaw) * 0.75, z = s.z - Math.cos(s.yaw) * 0.75;
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [x, z, s.y] as const);
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - x, p.z - z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(0.6);
}

async function sit(page: Page, seat: number) {
  await toChair(page, seat);
  await expect.poll(() => page.evaluate(() => window.__den!.catan!.state().prompt)).toBe("Sit at the Catan table");
  await page.keyboard.press("e");
  await expect.poll(() => page.evaluate(() => window.__den!.catan!.state().seats.filter((s) => s).length)).toBeGreaterThan(0);
}

/** Look at the table from a spot (world x, z) at a distance and pitch. */
async function lookAtTable(page: Page, x: number, z: number, dist: number, pitch: number) {
  await page.evaluate(([x, z, tx, tz, dist, pitch]) => {
    const d = window.__den!;
    d.teleport(x!, z!, 0);
    d.camera.yaw = Math.atan2(-(tx! - x!), -(tz! - z!));
    d.camera.pitch = pitch!;
    d.camera.distance = dist!;
  }, [x, z, CATAN_TABLE.x, CATAN_TABLE.z, dist, pitch] as const);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/catan-tour/${name}.png` });

test("screenshot tour of the Catan table", async ({ page, browser }) => {
  test.setTimeout(300_000);
  failOnErrors(page);
  const code = await hostGame(page, "Ann");
  if (process.env.NO_BEAR) await page.evaluate(() => (window.__den!.player.hidden = true));

  // The room with the sample board on the table.
  await lookAtTable(page, CATAN_TABLE.x - 1.4, CATAN_TABLE.z + 2.2, 2.6, 0.55);
  await page.waitForTimeout(1800);
  await shot(page, "1-room");

  // Bob and Cat sit down; Ann watches from the side.
  const bob = await newPlayer(browser);
  await joinGame(bob, code, "Bob");
  await waitForBear(bob);
  const cat = await newPlayer(browser);
  await joinGame(cat, code, "Cat");
  await waitForBear(cat);
  await sit(bob, 0);
  await sit(cat, 1);
  await expect.poll(() => page.evaluate(() => window.__den!.catan!.state().seats.filter((s) => s).length)).toBe(2);
  await lookAtTable(page, CATAN_TABLE.x - 2.3, CATAN_TABLE.z + 0.6, 1.6, 0.18);
  await page.waitForTimeout(3500);
  await shot(page, "2-side-view-seated");
  await lookAtTable(page, CATAN_TABLE.x + 0.3, CATAN_TABLE.z + 2.5, 1.6, 0.2);
  await page.waitForTimeout(1500);
  await shot(page, "3-front-view-seated");

  // Ann sits too: the board camera.
  await sit(page, 2);
  await page.waitForTimeout(2500);
  await shot(page, "4-board-camera");

  // Start; play setup with spread-out spots so there are pieces on the board.
  await page.evaluate(() => window.__den!.catan!.start());
  await expect.poll(() => page.evaluate(() => window.__den!.catan!.state().view?.phase)).toBe("setup");
  const seats = await page.evaluate(() => window.__den!.catan!.state().seats);
  const pageFor = (id: string) => [bob, cat, page][[seats[0], seats[1], seats[2]].indexOf(id)]!;
  for (let i = 0; i < 6; i++) {
    const v = (await page.evaluate(() => window.__den!.catan!.state().view))!;
    const actor = pageFor(v.players[v.turn]!.id);
    const spots = legalSettlements({ buildings: v.buildings, roads: v.roads } as never, v.turn, true);
    const vertex = spots[Math.floor(spots.length * ((0.1 + i * 0.37) % 1))]!;
    await actor.evaluate((vtx) => window.__den!.catan!.act({ type: "placeSettlement", vertex: vtx }), vertex);
    await expect.poll(() => page.evaluate(() => window.__den!.catan!.state().view?.setupPiece)).toBe("road");
    const v2 = (await page.evaluate(() => window.__den!.catan!.state().view))!;
    const edge = legalRoads({ buildings: v2.buildings, roads: v2.roads } as never, v2.turn, v2.setupVertex)[0]!;
    await actor.evaluate((e) => window.__den!.catan!.act({ type: "placeRoad", edge: e }), edge);
    await expect.poll(() => page.evaluate(() => window.__den!.catan!.state().view?.roads.filter((r) => r !== null).length)).toBe(i + 1);
  }
  await expect.poll(() => page.evaluate(() => window.__den!.catan!.state().view?.phase)).toBe("roll");
  await page.waitForTimeout(800);
  await shot(page, "5-setup-done");

  // Roll: mid-tumble and landed.
  const v = (await page.evaluate(() => window.__den!.catan!.state().view))!;
  const roller = pageFor(v.players[v.turn]!.id);
  await roller.evaluate(() => window.__den!.catan!.dev([4, 5]));
  await roller.evaluate(() => window.__den!.catan!.act({ type: "roll" }));
  await page.waitForTimeout(450);
  await shot(page, "6-dice-tumbling");
  await page.waitForTimeout(1500);
  await shot(page, "7-dice-landed");
  expect(await page.evaluate(() => window.__den!.catan!.state().view?.dice)).toEqual([4, 5]);
  await bob.screenshot({ path: "test-results/catan-tour/8-bob-board-camera.png" });
});
