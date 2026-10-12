import { expect, test } from "@playwright/test";
import { HOUSE, LEVELS, houseToWorld } from "../shared/src/index.ts";
import { failOnErrors, hostGame } from "./helpers.ts";

// Milestone 1.9 screenshot tour: every room of the house, plus the porch, deck and greenhouse.
//   npx playwright test e2e/house-tour.spec.ts   -> test-results/house-tour/*.png
// (STOPS=kitchen,den to shoot just some; TIME=night to shoot at another time of day.)

const SKIP = new Set(["utility"]); // locked, not enterable
const floorY = (level: string, room: string) =>
  room === "great_room" ? -0.5 * HOUSE.scale : level === "basement" ? HOUSE.basementFloorY : level === "upper" ? 2.7 * HOUSE.scale : 0;

test("screenshot tour of every room", async ({ page }) => {
  test.setTimeout(400_000);
  failOnErrors(page);
  await hostGame(page, "Tour");
  const time = process.env.TIME;
  if (time) await page.evaluate((t) => window.__den!.setTime(t), time);
  const dir = `test-results/house-tour${time ? `-${time}` : ""}`;
  const only = process.env.STOPS?.split(",");
  const stops = [
    ...LEVELS.flatMap((l) => l.rooms.filter((r) => !SKIP.has(r.id)).map((r) => ({ level: l.id, room: r }))),
    ...LEVELS[1]!.outdoor.map((r) => ({ level: "main" as const, room: r })),
  ].filter((s) => !only || only.includes(s.room.id));
  for (const { level, room } of stops) {
    // Stand in one corner, look across to the opposite corner (the foyer and landing have the stairs on their west side).
    const flip = room.id === "foyer" || room.id === "landing";
    const from = houseToWorld(room.x + room.w * (flip ? 0.8 : 0.25), room.z + room.d * 0.65);
    const to = houseToWorld(room.x + (flip ? 0 : room.w), room.z + room.d * 0.1);
    const y = floorY(level, room.id);
    await page.evaluate(([fx, fz, tx, tz, y]) => {
      const d = window.__den!;
      d.teleport(fx!, fz!, y!);
      d.camera.yaw = Math.atan2(-(tx! - fx!), -(tz! - fz!));
      d.camera.pitch = 0.42;
      d.camera.distance = 2.4;
    }, [from.x, from.z, to.x, to.z, y] as const);
    await page.waitForTimeout(1200);
    const p = await page.evaluate(() => window.__den!.player.position);
    expect(Math.abs(p.y - y), `${room.id}: standing on its floor`).toBeLessThan(0.3);
    await page.screenshot({ path: `${dir}/${level}-${room.id}.png` });
  }
  if (only) return;
  // And the outside, from the lawns (world x, z, look-at x, z).
  const outside: [string, number, number, number, number][] = [
    ["front", 2, -24, 2, 0], ["back", 8, 22, 8, 0], ["garage-side", -26, 16, -8, 0], ["north-east", 30, -22, 8, 0],
  ];
  for (const [name, x, z, lx, lz] of outside) {
    await page.evaluate(([x, z, lx, lz]) => {
      const d = window.__den!;
      d.teleport(x!, z!);
      d.camera.yaw = Math.atan2(-(lx! - x!), -(lz! - z!));
      d.camera.pitch = 0.06;
      d.camera.distance = 6;
    }, [x, z, lx, lz] as const);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/outside-${name}.png` });
  }
});
