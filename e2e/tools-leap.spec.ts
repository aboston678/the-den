import { expect, test, type Page } from "@playwright/test";
import { rodBucket, streamCenter } from "../shared/src/index.ts";
import { hostGame } from "./helpers.ts";

// Dev tool, not a check (LEAP=1): hook a fish and photograph it leaping, in review/fixes/ (not in git).
// SPECIES=jenna_catfish WEIGHT=300 picks the fish.
test.skip(!process.env.LEAP, "dev tool: set LEAP=1 to run");
const fish = (p: Page) => p.evaluate(() => window.__den!.fish.me());

test("leap frames", async ({ page }) => {
  test.setTimeout(180_000);
  const species = process.env.SPECIES ?? "largemouth";
  await hostGame(page, "Leap");
  const r = rodBucket(), b = { x: r.x + 0.6, z: r.z - 9 }; // up the bank, clear of the boat
  await page.evaluate(([x, z]) => { const d = window.__den!; d.teleport(x!, z!); d.camera.yaw = -Math.PI / 2; }, [b.x, b.z] as const);
  await expect.poll(() => page.evaluate(([x, z]) => { const s = window.__den!.serverPosition(); return s ? Math.hypot(s.x - x!, s.z - z!) : 99; }, [b.x, b.z] as const), { timeout: 60_000 }).toBeLessThan(0.5);
  await page.evaluate(([x, z]) => { const d = window.__den!; d.teleport(x!, z!); d.camera.yaw = -Math.PI / 2; }, [r.x + 0.6, r.z] as const);
  await expect.poll(() => page.evaluate(([x, z]) => { const s = window.__den!.serverPosition(); return s ? Math.hypot(s.x - x!, s.z - z!) : 99; }, [r.x + 0.6, r.z] as const), { timeout: 60_000 }).toBeLessThan(0.5);
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await fish(page)).rod).toBe(true);
  await page.evaluate(([x, z]) => { const d = window.__den!; d.teleport(x!, z!); d.camera.yaw = -Math.PI / 2; }, [b.x, b.z] as const);
  await expect.poll(() => page.evaluate(([x, z]) => { const s = window.__den!.serverPosition(); return s ? Math.hypot(s.x - x!, s.z - z!) : 99; }, [b.x, b.z] as const), { timeout: 60_000 }).toBeLessThan(0.5);
  await page.evaluate(([sp, w]) => window.__den!.fish.quickBite(1, sp, w), [species, Number(process.env.WEIGHT ?? 5)] as const);
  const toWater = (streamCenter(b.z) - 5 - b.x - 3) / 22;
  await page.evaluate((p) => window.__den!.fish.cast(p), toWater);
  await expect.poll(async () => (await fish(page)).state, { timeout: 10_000 }).toBe("bite");
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await fish(page)).state).toBe("fight");
  // Side-on to the line, a little behind the bear.
  await page.evaluate(() => { const d = window.__den!; d.camera.yaw = d.player.yaw + Math.PI + 0.9; d.camera.pitch = 0.08; d.camera.distance = 6; });
  for (let n = 0; n < 2; n++) {
    await expect.poll(() => page.evaluate(() => window.__den!.fish.leaping().includes("me")), { timeout: 10_000, intervals: [30] }).toBe(true);
    for (let i = 0; i < 4; i++) {
      await page.screenshot({ path: `review/fixes/leap-${species}-${n}-${i}.png` });
      await page.waitForTimeout(170);
    }
    await expect.poll(() => page.evaluate(() => window.__den!.fish.leaping().includes("me")), { timeout: 10_000, intervals: [30] }).toBe(false);
  }
});
