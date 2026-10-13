import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { DRIVEWAY } from "../shared/src/index.ts";
import { failOnErrors, openGame, waitForBear } from "./helpers.ts";

// Dev tool, not a check (STYLE=1): the same views in the realistic and the cartoon art style
// (game/artStyle.ts), plus side-by-side pictures, in review/style/ (not kept in git).
//   STYLE=1 npx playwright test e2e/tools-style.spec.ts
test.skip(!process.env.STYLE, "dev tool: set STYLE=1 to run");

const OUT = "review/style";
const near = DRIVEWAY.pointAt(DRIVEWAY.length - 45), ahead = DRIVEWAY.pointAt(DRIVEWAY.length - 30);
/** name, time of day, bear x/z, where the camera looks (x/z), camera distance, pitch */
const VIEWS: [string, string, number, number, number, number, number, number][] = [
  ["house", "noon", 0, -19, 2, 0, 6, 0.0],
  ["driveway", "noon", near.x, near.z, ahead.x, ahead.z, 4.5, 0.12],
  ["woods", "noon", -92, -60, -80, -50, 4.5, 0.1],
  ["dock", "dusk", 106, 0, 125, 0, 5, 0.1],
  ["bear", "noon", 6, -36, 6, -50, 3, 0.05],
];

async function shoot(page: Page, style: string) {
  for (const [name, time, x, z, lx, lz, dist, pitch] of VIEWS) {
    await page.evaluate((t) => window.__den!.setTime(t), time);
    await page.evaluate(([x, z, lx, lz, dist, pitch]) => {
      const d = window.__den!;
      d.teleport(x!, z!);
      d.camera.yaw = Math.atan2(-(lx! - x!), -(lz! - z!));
      d.camera.pitch = pitch!;
      d.camera.distance = dist!;
    }, [x, z, lx, lz, dist, pitch]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${style}-${name}.png` });
  }
}

test("realistic vs cartoon", async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  for (const style of ["realistic", "cartoon"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    failOnErrors(page);
    await openGame(page, style === "cartoon" ? "/?toon" : "/");
    await page.getByTestId("nickname").fill("Stylist");
    await page.getByTestId("create").click();
    await expect(page.getByTestId("party-code")).toHaveText(/^[A-Z2-9]{5}$/, { timeout: 15_000 });
    await page.getByTestId("play").click();
    await waitForBear(page);
    await page.waitForTimeout(3000);
    await shoot(page, style);
    await ctx.close();
  }
  // Side by side: realistic on the left, cartoon on the right.
  for (const [name] of VIEWS) {
    const [a, b] = await Promise.all(["realistic", "cartoon"].map((s) => sharp(`${OUT}/${s}-${name}.png`).resize(960, 540).toBuffer()));
    await sharp({ create: { width: 1930, height: 540, channels: 3, background: "#111" } })
      .composite([{ input: a!, left: 0, top: 0 }, { input: b!, left: 970, top: 0 }])
      .png().toFile(`${OUT}/compare-${name}.png`);
  }
});
