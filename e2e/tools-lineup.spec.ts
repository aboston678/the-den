import { test } from "@playwright/test";

// Dev tool, not a check: screenshots /lineup.html views. Skipped unless SHOTS is set, e.g.
//   OUT=/tmp SHOTS="model=/models/trees.glb&only=lod0&group=1" npx playwright test e2e/tools-lineup.spec.ts
test.skip(!process.env.SHOTS, "dev tool: set SHOTS to run");
const OUT = process.env.OUT ?? "test-results";
const shots = (process.env.SHOTS ?? "").split(";").filter(Boolean);
test("lineup screenshots", async ({ page }) => {
  for (const [i, q] of shots.entries()) {
    await page.goto(`/lineup.html?${q}`);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/lineup-${i}.png` });
  }
});
