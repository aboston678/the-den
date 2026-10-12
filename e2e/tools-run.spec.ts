import { test } from "@playwright/test";
import { DRIVEWAY } from "../shared/src/index.ts";
import { hostGame } from "./helpers.ts";

// Dev tool, not a check: records a walk then a sprint from the spawn up the driveway (RUNVIDEO=1).
test.skip(!process.env.RUNVIDEO, "dev tool: set RUNVIDEO=1 to run");
test("driveway run video", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: "test-results/run", size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await hostGame(page, "Runner");
  await page.waitForTimeout(3000);
  // Steer by pointing the camera at a spot 10 m further up the driveway (the bear walks where the camera looks).
  const steer = async () => {
    const p = await page.evaluate(() => ({ x: window.__den!.player.position.x, z: window.__den!.player.position.z }));
    const here = DRIVEWAY.closest(p.x, p.z)!.s;
    const t = DRIVEWAY.pointAt(Math.min(DRIVEWAY.length, here + 10));
    await page.evaluate(([dx, dz]) => {
      const d = window.__den!;
      d.camera.yaw = Math.atan2(-dx!, -dz!);
      d.camera.pitch = 0.12;
      d.camera.distance = 4.5;
    }, [t.x - p.x, t.z - p.z]);
  };
  await steer();
  await page.keyboard.down("KeyW");
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500);
    await steer();
  }
  await page.keyboard.down("ShiftLeft");
  for (let i = 0; i < 28; i++) {
    await page.waitForTimeout(500);
    await steer();
  }
  await ctx.close();
});
