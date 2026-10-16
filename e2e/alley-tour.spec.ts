import { expect, test } from "@playwright/test";
import { HOUSE, houseToWorld } from "../shared/src/index.ts";
import { failOnErrors, hostGame } from "./helpers.ts";

// Milestone 3.1 screenshot tour of the bowling alley (GAME_SPEC §15), with made-up bowlers on the
// screens so the scorecards can be checked.
//   npx playwright test e2e/alley-tour.spec.ts   -> test-results/alley-tour/*.png   (STOPS=lounge,pins; NO_BEAR=1 hides your bear)

/** [stand x, z, look-at x, z] in floorplan metres; cam = [distance, pitch]; y = floor height (floorplan). */
const STOPS: Record<string, { at: [number, number, number, number]; cam?: [number, number]; y?: number }> = {
  lounge: { at: [29.4, 9.5, 36.0, 2.0], cam: [2.8, 0.42] }, // like the reference photo
  landing: { at: [24.9, 4.8, 36.0, 2.2], cam: [2.4, 0.15] }, // beside the Connect Four table
  approach: { at: [31.6, 1.06, 52.0, 1.06], cam: [2.2, 0.08], y: -2.52 },
  ball_return: { at: [30.2, 3.5, 31.0, 2.17], cam: [1.6, 0.4], y: -2.52 },
  lane: { at: [33.4, 2.17, 52.5, 1.06], cam: [0.9, -0.04], y: -2.52 },
  screens: { at: [31.4, 2.6, 34.2, 2.17], cam: [1.4, -0.25], y: -2.52 },
  pins: { at: [49.5, 5.2, 52.9, 2.2], cam: [1.6, 0.35] },
  walkway: { at: [33.0, 5.1, 54.0, 3.5], cam: [2.2, 0.12] },
};

test("screenshot tour of the bowling alley", async ({ page }) => {
  test.setTimeout(180_000);
  failOnErrors(page);
  await hostGame(page, "Tour");
  if (process.env.NO_BEAR) await page.evaluate(() => (window.__den!.player.hidden = true));
  await page.evaluate(() => {
    window.__den!.bowl!.setLanes({
      "1": {
        bowlers: [
          { id: "a", name: "BigBear", rolls: [10, 7, 3, 9, 0, 10, 10, 8] },
          { id: "b", name: "Honeypaw", rolls: [6, 2, 10, 5, 5, 0, 9, 7] },
        ],
        turn: 1,
        phase: "aim",
      },
    });
  });
  const only = process.env.STOPS?.split(",");
  for (const [name, { at: [fx, fz, tx, tz], cam: [dist, pitch] = [2.2, 0.3], y: fy = -2.7 }] of Object.entries(STOPS)) {
    if (only && !only.includes(name)) continue;
    const from = houseToWorld(fx, fz), to = houseToWorld(tx, tz);
    const y = fy * HOUSE.scale;
    await page.evaluate(([fx, fz, tx, tz, y, dist, pitch]) => {
      const d = window.__den!;
      d.teleport(fx!, fz!, y!);
      d.camera.yaw = Math.atan2(-(tx! - fx!), -(tz! - fz!));
      d.camera.pitch = pitch!;
      d.camera.distance = dist!;
    }, [from.x, from.z, to.x, to.z, y, dist, pitch] as const);
    await page.waitForTimeout(1500);
    const p = await page.evaluate(() => window.__den!.player.position);
    expect(Math.abs(p.y - y), `${name}: standing where expected`).toBeLessThan(0.35);
    await page.screenshot({ path: `test-results/alley-tour/${name}.png` });
    const perf = await page.evaluate(() => window.__den!.perf?.());
    if (perf) console.log(`${name}: ${perf.fps} fps, ${perf.calls} draw calls, ${Math.round(perf.triangles / 1000)}k triangles`);
  }
});
