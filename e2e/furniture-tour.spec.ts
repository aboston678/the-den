import { expect, test } from "@playwright/test";
import { DOCK, HOUSE, dockStartX, houseToWorld } from "../shared/src/index.ts";
import { failOnErrors, hostGame } from "./helpers.ts";

// Milestone 2.1–2.2 screenshot tour of the furnished rooms, each from a spot that shows its furniture.
//   npx playwright test e2e/furniture-tour.spec.ts   -> test-results/furniture-tour/*.png
// (STOPS=kitchen,office to shoot just some; TIME=night for evening light.)

/** room -> [stand x, z, look-at x, z] in floorplan metres, and the floor level. */
const STOPS: Record<string, { at: [number, number, number, number]; floor?: number; cam?: [number, number] }> = {
  garage: { at: [2.0, 4.5, 7.2, 3.5] },
  mudroom: { at: [8.2, 4.3, 10.7, 0.9] },
  half_bath: { at: [9.3, 6.3, 8.0, 8.3] },
  kitchen: { at: [12.0, 5.8, 15.5, 1.2] },
  kitchen_island: { at: [16.2, 2.0, 12.0, 6.0] },
  pantry: { at: [14.0, 7.4, 14.0, 9.0] },
  dining_hall: { at: [17.9, 4.4, 20.6, 0.8] },
  common_area: { at: [20.3, 7.6, 17.2, 8.6] },
  great_room: { at: [23.3, 4.8, 27.8, 9.4], floor: -0.5 },
  great_room_piano: { at: [26.6, 10.2, 22.4, 9.4], floor: -0.5 },
  great_room_fire: { at: [23.4, 7.1, 29.4, 7.1], floor: -0.5 },
  office: { at: [24.5, 2.9, 22.0, 0.6] },
  foyer: { at: [28.5, 2.9, 28.6, 0.2] },
  formal_dining: { at: [30.4, 4.3, 32.6, 1.0] },
  bedroom_main: { at: [30.3, 9.3, 33.6, 6.6] },
  deck: { at: [23.0, 13.6, 19.3, 12.0] },
  porch: { at: [27.5, -1.6, 31.6, -0.8] },
  common_area_tv: { at: [18.3, 8.4, 21.4, 9.35] },
  // 2.2: upstairs (floor 2.7), the basement den (−2.7), the greenhouse.
  landing: { at: [27.6, 4.5, 28.0, 1.0], floor: 2.7, cam: [2.0, 0.4] },
  balcony_hall: { at: [28.2, 4.3, 18.0, 4.2], floor: 2.7 },
  bathroom_up: { at: [23.0, 1.6, 25.3, 2.6], floor: 2.7, cam: [1.3, 0.6] },
  bedroom_skylight: { at: [18.6, 2.6, 21.0, 1.0], floor: 2.7, cam: [1.3, 0.6] },
  bedroom_pink: { at: [30.4, 3.2, 33.2, 2.4], floor: 2.7, cam: [1.3, 0.55] },
  bedroom_yellow: { at: [33.0, 5.3, 30.6, 8.8], floor: 2.7, cam: [1.3, 0.55] },
  den: { at: [15.4, 6.0, 20.8, 7.4], floor: -2.7 },
  den_tv: { at: [16.6, 6.0, 20.0, 5.6], floor: -2.7 },
  den_reading: { at: [16.0, 8.8, 11.3, 7.2], floor: -2.7 },
  greenhouse: { at: [10.2, 9.6, 2.0, 11.2] },
  greenhouse_stockpile: { at: [5.0, 10.0, 1.0, 8.7] },
  greenhouse_canoe: { at: [9.0, 9.5, 4.5, 11.3], cam: [2.0, 0.45] },
};

/** Stops outside the house, in world metres: [x, z, look x, look z, y]. */
const WORLD_STOPS: Record<string, [number, number, number, number, number]> = {
  dock_boat: [dockStartX() + 1.5, DOCK.z - 0.3, dockStartX() + 5, DOCK.z + 2.8, DOCK.deckY],
  boat_from_bank: [dockStartX() - 3, DOCK.z + 7, dockStartX() + 4, DOCK.z + 2.5, Number.NaN],
};

test("screenshot tour of the furnished rooms", async ({ page }) => {
  test.setTimeout(300_000);
  failOnErrors(page);
  await hostGame(page, "Tour");
  const time = process.env.TIME;
  if (time) await page.evaluate((t) => window.__den!.setTime(t), time);
  const dir = `test-results/furniture-tour${time ? `-${time}` : ""}`;
  const only = process.env.STOPS?.split(",");
  for (const [name, { at: [fx, fz, tx, tz], floor = 0, cam: [dist, pitch] = [2.2, 0.32] }] of Object.entries(STOPS)) {
    if (only && !only.includes(name)) continue;
    const from = houseToWorld(fx, fz), to = houseToWorld(tx, tz);
    const y = floor === -2.7 ? HOUSE.basementFloorY : floor * HOUSE.scale;
    await page.evaluate(([fx, fz, tx, tz, y, dist, pitch]) => {
      const d = window.__den!;
      d.teleport(fx!, fz!, y!);
      d.camera.yaw = Math.atan2(-(tx! - fx!), -(tz! - fz!));
      d.camera.pitch = pitch!;
      d.camera.distance = dist!;
    }, [from.x, from.z, to.x, to.z, y, dist, pitch] as const);
    await page.waitForTimeout(1300);
    const p = await page.evaluate(() => window.__den!.player.position);
    expect(Math.abs(p.y - y), `${name}: standing on the floor, not on furniture`).toBeLessThan(0.3);
    await page.screenshot({ path: `${dir}/${name}.png` });
  }
  for (const [name, [x, z, lx, lz, y]] of Object.entries(WORLD_STOPS)) {
    if (only && !only.includes(name)) continue;
    await page.evaluate(([x, z, lx, lz, y]) => {
      const d = window.__den!;
      d.teleport(x!, z!, y!);
      d.camera.yaw = Math.atan2(-(lx! - x!), -(lz! - z!));
      d.camera.pitch = 0.2;
      d.camera.distance = 3.5;
    }, [x, z, lx, lz, y] as const);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/${name}.png` });
  }
});
