import { expect, test, type Page } from "@playwright/test";
import { HOUSE, houseToWorld } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame } from "./helpers.ts";

// Milestone 1.12: frame rate, draw calls and triangles at full 1080p for each graphics preset, at
// the heaviest places in the game (GAME_SPEC §17 budgets). Writes test-results/perf.json.
//   PRESETS=low,medium,high DPR=2 SPOTS=dock BREAKDOWN=1 npx playwright test e2e/perf.spec.ts

test.afterEach(closePlayers);

const gr = houseToWorld(24, 8);
const lounge = houseToWorld(30.5, 9.3), loungeLook = houseToWorld(42, 2);
const approach = houseToWorld(32.6, 1.5), pins = houseToWorld(52.5, 1.5);
const dining = houseToWorld(30.2, 4.3), table = houseToWorld(31.9, 2.4);
type Spot = [string, string, number, number, number, number, number?];
const SPOTS: Spot[] = [
  ["driveway woods", "noon", -92, -60, -80, -50],
  ["front lawn", "evening", 8, -34, 2, 0],
  ["back lawn night", "night", 8, 26, 4, 0],
  ["great room night", "night", gr.x, gr.z, gr.x + 5, gr.z, -0.5 * HOUSE.scale],
  ["dock", "noon", 106, 0, 125, 0],
  ["map edge forest", "noon", -96, 10, -130, 10],
  ["bowling lounge", "noon", lounge.x, lounge.z, loungeLook.x, loungeLook.z, -2.7 * HOUSE.scale],
  ["bowling lanes", "noon", approach.x, approach.z, pins.x, pins.z, -2.52 * HOUSE.scale],
  ["dining room catan", "evening", dining.x, dining.z, table.x, table.z, 0],
  // Phase 5 polish: dawn mist over the stream, the flower bed by the house.
  ["stream dawn", "dawn", 113, -10, 122, 4],
  ["flower bed", "noon", 8, -13, 8, 0],
  // Round 2: out of the woods on the road to the racetrack, and on the start/finish straight.
  ["track road", "noon", -165, -161, -200, -205],
  ["track straight", "noon", -280, -268, -500, -268],
];

async function measure(page: Page, [, time, x, z, lx, lz, y]: Spot) {
  await page.evaluate((t) => window.__den!.setTime(t), time);
  await page.evaluate(([x, z, lx, lz, y]) => {
    const d = window.__den!;
    d.teleport(x!, z!, y ?? Number.NaN);
    d.camera.yaw = Math.atan2(-(lx! - x!), -(lz! - z!));
    d.camera.pitch = 0.15;
    d.camera.distance = 4;
  }, [x, z, lx, lz, y ?? null] as const);
  await page.waitForTimeout(3500); // settle, then the probe averages the last ~2 s
  return page.evaluate(() => window.__den!.perf());
}

// By default: Medium, with the GAME_SPEC §17 budgets checked (60 fps target; allow some slack for test noise).
for (const preset of (process.env.PRESETS ?? "medium").split(",")) {
  test(`frame rate and budgets: ${preset}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const dpr = Number(process.env.DPR ?? 1);
    const [w, h] = (process.env.VIEW ?? "1920x1080").split("x").map(Number);
    const ctx = await browser.newContext({ viewport: { width: w!, height: h! }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    failOnErrors(page);
    if (preset !== "current") {
      await page.addInitScript((p) => localStorage.setItem("den.settings", JSON.stringify({ graphics: p, v: 2 })), preset);
    }
    let bytes = 0;
    page.on("requestfinished", async (r) => {
      try {
        bytes += (await r.sizes()).responseBodySize;
      } catch {
        /* ignore */
      }
    });
    await hostGame(page, "Speedy");
    console.log(`downloaded to spawn: ${(bytes / 1024 / 1024).toFixed(1)} MB (dev build, uncompressed scripts)`);
    await page.waitForTimeout(4000); // shaders finish compiling; the first seconds always stutter
    const rows: Record<string, unknown>[] = [];
    for (const spot of SPOTS.filter((s) => !process.env.SPOTS || process.env.SPOTS.split(",").some((p) => s[0].startsWith(p)))) {
      const r = await measure(page, spot);
      rows.push({ spot: spot[0], ...r, fps: Math.round(r.fps), p95ms: Math.round(r.p95ms) });
      if (process.env.BREAKDOWN) console.log(spot[0], (await page.evaluate(() => window.__den!.perfBreakdown())).join(" | "));
      await page.screenshot({ path: `test-results/perf/${preset}-dpr${dpr}-${spot[0].replace(/ /g, "-")}.png` });
    }
    console.log(`\n${preset} @1080p dpr${dpr}`);
    console.table(rows);
    if (preset === "medium" && dpr === 1 && !process.env.VIEW) {
      for (const r of rows) {
        expect(r.fps as number, `${r.spot as string}: frame rate`).toBeGreaterThan(45);
        expect(r.calls as number, `${r.spot as string}: draw calls`).toBeLessThan(400);
        expect(r.textureMB as number, "texture memory").toBeLessThan(1024);
      }
    }
    await ctx.close();
  });
}

test("Auto steps down a level when the first seconds of play are too slow", async ({ page }) => {
  test.setTimeout(90_000);
  failOnErrors(page);
  // Pretend Auto had picked High on this computer (an M1 manages ~18 fps on High at 1080p).
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("den.autoTier", "high");
      localStorage.setItem("den.settings", JSON.stringify({ graphics: "auto", v: 2 }));
      sessionStorage.setItem("seeded", "1");
    }
  });
  await hostGame(page, "Auto");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("den.autoTier")), { timeout: 30_000 }).toBe("medium");
});
