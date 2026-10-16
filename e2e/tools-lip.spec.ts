import { expect, test, type Page } from "@playwright/test";
import { rodBucket, streamCenter } from "../shared/src/index.ts";
import { hostGame } from "./helpers.ts";

// Dev tool, not a check (LIP=1): land a fish and photograph the lip hold from a few sides, in test-results/lip/.
test.skip(!process.env.LIP, "dev tool: set LIP=1 to run");
const fish = (p: Page) => p.evaluate(() => window.__den!.fish.me());

test("lip hold views", async ({ page }) => {
  test.setTimeout(180_000);
  await hostGame(page, "Lip");
  const b = rodBucket();
  await page.evaluate(([x, z]) => { const d = window.__den!; d.teleport(x!, z!); d.camera.yaw = -Math.PI / 2; }, [b.x + 0.6, b.z] as const);
  await expect.poll(() => page.evaluate(([x, z]) => { const s = window.__den!.serverPosition(); return s ? Math.hypot(s.x - x!, s.z - z!) : 99; }, [b.x + 0.6, b.z] as const), { timeout: 60_000 }).toBeLessThan(0.5);
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await fish(page)).rod).toBe(true);
  await page.evaluate(([sp, w]) => window.__den!.fish.quickBite(1, sp, w), [process.env.SPECIES ?? "largemouth", Number(process.env.WEIGHT ?? 3)] as const);
  const toWater = (streamCenter(0) - 6 - (b.x + 0.6) - 3) / 22;
  await page.evaluate((p) => window.__den!.fish.cast(p), toWater);
  await expect.poll(async () => (await fish(page)).state, { timeout: 10_000 }).toBe("bite");
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await fish(page)).state).toBe("fight");
  for (let i = 0; i < 600 && (await fish(page)).state !== "landed"; i++) {
    if ((await fish(page)).tension < 0.55) await page.keyboard.press("KeyR");
    await page.waitForTimeout(120);
  }
  expect((await fish(page)).state).toBe("landed");
  await page.waitForTimeout(3000);
  for (const [name, turn, pitch, dist] of [["behind", Math.PI, 0.15, 3.5], ["behind-left", Math.PI + 0.6, 0.12, 3.2], ["left", Math.PI / 2 + Math.PI, 0.1, 3], ["front", 0, 0.1, 3]] as const) {
    await page.evaluate(([turn, pitch, dist]) => { const d = window.__den!; d.camera.yaw = d.player.yaw + turn!; d.camera.pitch = pitch!; d.camera.distance = dist!; }, [turn, pitch, dist] as const);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/lip/${name}.png` });
  }
});
