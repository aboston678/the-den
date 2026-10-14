import { expect, test } from "@playwright/test";
import { CATAN_SEATS, CATAN_TABLE } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// Tool: watch a bear sit in a Catan chair from the side, over time (tuning the sit spot and clips).
//   SEAT=1 npx playwright test e2e/tools-catan-sit.spec.ts   -> test-results/catan-sit/*.png

test.afterEach(closePlayers);

test("a bear sitting down, seen from the side", async ({ page, browser }) => {
  test.setTimeout(180_000);
  failOnErrors(page);
  const seat = Number(process.env.SEAT ?? 1);
  const code = await hostGame(page, "Watcher");
  await page.evaluate(() => (window.__den!.player.hidden = true));
  const bob = await newPlayer(browser);
  await joinGame(bob, code, "Bob");
  await waitForBear(bob);
  const s = CATAN_SEATS[seat]!;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const bx = s.x - fx * 0.75, bz = s.z - fz * 0.75;
  await bob.evaluate(([x, z]) => window.__den!.teleport(x!, z!, 0), [bx, bz] as const);
  await expect.poll(async () => {
    const p = await bob.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - bx, p.z - bz) : 99;
  }, { timeout: 60_000 }).toBeLessThan(0.6);
  // Watch from the side of the chair (perpendicular to the way it faces).
  const wx = s.x + fz * 2.2 - fx * 0.3, wz = s.z - fx * 2.2 - fz * 0.3;
  await page.evaluate(([x, z, tx, tz]) => {
    const d = window.__den!;
    d.teleport(x!, z!, 0);
    d.camera.yaw = Math.atan2(-(tx! - x!), -(tz! - z!));
    d.camera.pitch = 0.12;
    d.camera.distance = 0.6;
  }, [wx, wz, s.x, s.z] as const);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/catan-sit/0-standing.png" });
  await bob.evaluate((i) => window.__den!.catan!.sit(i), seat);
  for (const t of [400, 900, 1500, 2500, 4500]) {
    await page.waitForTimeout(t - (t === 400 ? 0 : [400, 900, 1500, 2500, 4500][[400, 900, 1500, 2500, 4500].indexOf(t) - 1]!));
    await page.screenshot({ path: `test-results/catan-sit/${t}ms.png` });
  }
  const remote = await page.evaluate(() => window.__den!.remotes()[0]);
  console.log("remote seen as", JSON.stringify(remote), "table", CATAN_TABLE.x, CATAN_TABLE.z, "sit spot", s.sitX, s.sitZ);
  await bob.evaluate(() => window.__den!.catan!.stand());
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/catan-sit/stand-900ms.png" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test-results/catan-sit/stand-done.png" });
});
