import { expect, test, type Page } from "@playwright/test";
import { GARAGE_BIKE } from "../shared/src/index.ts";
import { hostGame } from "./helpers.ts";

// Dev tool, not a check (BIKESHOTS=1): get on the motorcycle and photograph the rider from a few sides
// on the apron, standing still, then at speed down the driveway. Pictures in review/bike/ (not in git).
test.skip(!process.env.BIKESHOTS, "dev tool: set BIKESHOTS=1 to run");
const bike = (p: Page) => p.evaluate(() => window.__den!.bike!.state());

test("rider views", async ({ page }) => {
  test.setTimeout(180_000);
  await hostGame(page, "Rider");
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [GARAGE_BIKE.x + 1.4, GARAGE_BIKE.z, GARAGE_BIKE.y] as const);
  await expect.poll(() => page.evaluate(([x, z]) => { const s = window.__den!.serverPosition(); return s ? Math.hypot(s.x - x!, s.z - z!) : 99; }, [GARAGE_BIKE.x + 1.4, GARAGE_BIKE.z] as const), { timeout: 60_000 }).toBeLessThan(0.6);
  await expect.poll(async () => (await bike(page)).prompt).toBe("Ride the motorcycle");
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await bike(page)).riding).toBe(true);
  // Out on the apron, facing west down the driveway.
  await page.evaluate(() => window.__den!.teleport(-28, 0.75, Number.NaN));
  await page.waitForTimeout(1500);
  // Standing still: the rider must hold the same pose (round 3: the hunch used to add up every frame and spin the bear).
  for (const t of [0, 1, 2]) {
    await page.evaluate(() => { const d = window.__den!; d.camera.yaw = d.player.yaw + Math.PI; d.camera.pitch = 0.15; d.camera.distance = 4; });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `review/bike/still-${t}.png` });
  }
  for (const [name, turn, pitch, dist] of [["left", -Math.PI / 2, 0.1, 3.2], ["right", Math.PI / 2, 0.1, 3.2], ["front", Math.PI, 0.15, 3.5], ["behind", 0, 0.2, 4]] as const) {
    await page.evaluate(([turn, pitch, dist]) => { const d = window.__den!; d.camera.yaw = d.player.yaw + Math.PI + turn!; d.camera.pitch = pitch!; d.camera.distance = dist!; }, [turn, pitch, dist] as const);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `review/bike/rider-${name}.png` });
  }
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1300); // round 4's bike is quicker: any longer and it's in the trees
  await page.screenshot({ path: "review/bike/speed.png" });
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(350);
  await page.screenshot({ path: "review/bike/lean.png" });
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyW");
  // Round 4: stop, park, and photograph the bike on its own (the bear hidden) next to Andrew's photos.
  await page.keyboard.down("KeyS");
  await expect.poll(async () => (await bike(page)).prompt, { timeout: 10_000 }).toBe("Get off");
  await page.keyboard.up("KeyS");
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await bike(page)).me.state).toBe("parked");
  const parked = (await bike(page)).me as { x: number; y: number; z: number; yaw: number };
  console.log("parked", JSON.stringify(parked));
  await page.evaluate(() => { window.__den!.player.hidden = true; });
  for (const [name, side, up, dist] of [["bike-side", Math.PI / 2, 0.6, 3.4], ["bike-front34", Math.PI / 4, 0.8, 3.6], ["bike-rear34", (3 * Math.PI) / 4, 0.9, 3.6], ["bike-close", Math.PI / 2, 0.45, 1.9]] as const) {
    await page.evaluate(([b, side, up, dist]) => {
      const a = b!.yaw + side!, cx = b!.x + Math.sin(a) * dist!, cz = b!.z + Math.cos(a) * dist!;
      window.__den!.camera.override = { from: { x: cx, y: b!.y + up!, z: cz }, look: { x: b!.x, y: b!.y + 0.6, z: b!.z } } as never;
    }, [parked, side, up, dist] as const);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `review/bike/${name}.png` });
  }
  await page.evaluate(() => { window.__den!.camera.override = null; window.__den!.player.hidden = false; });
});
