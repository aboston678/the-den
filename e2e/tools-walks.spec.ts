import { test } from "@playwright/test";

// Dev tool, not a check: records /walks.html (walk clips side by side) to a video. Skipped unless WALKS is set:
//   WALKS="model=/models/bear-walks-preview.glb&clips=Walk:0.71,Walk2:1.03" npx playwright test e2e/tools-walks.spec.ts
test.skip(!process.env.WALKS, "dev tool: set WALKS to run");
test("walk comparison video", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: "test-results/walks", size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await page.goto(`/walks.html?${process.env.WALKS}`);
  await page.waitForTimeout(Number(process.env.SECONDS ?? 10) * 1000);
  await page.screenshot({ path: "test-results/walks/still.png" });
  await ctx.close();
});
