import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

const MODEL = "client/public/models/bear.glb";
const CLIPS = ["Idle", "Walk", "Run", "Jump", "Roar", "OpenDoor", "Pet", "SitDown", "SitIdle", "StandUp", "Cast", "Celebrate", "Dance", "Reel", "Bowl"];

test("bear model loads in the turntable viewer with all its clips", async ({ page }) => {
  test.skip(!existsSync(MODEL), "bear model not downloaded yet");
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/viewer.html?model=/models/bear.glb");
  await expect(page.getByTestId("viewer-panel")).toHaveAttribute("data-loaded", "yes", { timeout: 30_000 });
  for (const clip of CLIPS) await expect(page.getByRole("button", { name: clip, exact: true })).toBeVisible();

  // Three turntable angles (it turns ~0.4 rad/s, so ~90° apart).
  for (const n of [1, 2, 3]) {
    await page.waitForTimeout(n === 1 ? 1_000 : 4_000);
    await page.screenshot({ path: `test-results/bear-turntable-${n}.png` });
  }
  expect(errors).toEqual([]);
});
