import { test } from "@playwright/test";
import { DRIVEWAY, START_S, TRACK, TRACK_ROAD } from "../shared/src/index.ts";
import { hostGame } from "./helpers.ts";

// Dev tool, not a check (TRACKSHOTS=1): pictures of the way out to the racetrack and round it, in
// review/track/ (not in git). Set shots use the camera's fixed-shot override.
test.skip(!process.env.TRACKSHOTS, "dev tool: set TRACKSHOTS=1 to run");

type V = { x: number; y: number; z: number };
test("track tour", async ({ page }) => {
  test.setTimeout(300_000);
  await hostGame(page, "Tour");
  const shot = async (name: string, bear: { x: number; z: number }, from: V | null, look: V | null, yaw?: number) => {
    await page.evaluate(([b, from, look, yaw]) => {
      const d = window.__den!;
      d.teleport(b.x, b.z);
      d.camera.override = from && look ? ({ from, look } as never) : null;
      if (yaw !== null) d.camera.yaw = yaw;
      d.camera.pitch = 0.12;
      d.camera.distance = 5;
    }, [bear, from, look, yaw ?? null] as const);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `review/track/${name}.png` });
    const perf = await page.evaluate(() => window.__den!.perf?.());
    console.log(name, JSON.stringify(perf));
  };
  const d10 = DRIVEWAY.pointAt(12), r = TRACK_ROAD.pointAt(TRACK_ROAD.length * 0.55);
  // Leaving the woods: looking out along the road from where the driveway leaves the trees.
  await shot("1-out-of-the-woods", d10, null, null, Math.atan2(-d10.dx, -d10.dz) + Math.PI);
  await shot("2-the-road", r, null, null, Math.atan2(-r.dx, -r.dz) + Math.PI);
  const s = TRACK.pointAt(START_S);
  await shot("3-start-line", { x: s.x + 30, z: s.z }, { x: s.x + 40, y: 10, z: s.z + 4 }, { x: s.x - 60, y: 6.5, z: s.z - 4 });
  const c = TRACK.pointAt(START_S + 680);
  await shot("4-corner", c, { x: c.x + 25, y: 12, z: c.z + 25 }, { x: c.x, y: 6.5, z: c.z });
  await shot("5-overview", s, { x: -180, y: 120, z: -180 }, { x: -470, y: 0, z: -390 });
  await shot("7-junction", { x: -156, z: -152 }, { x: -150, y: 60, z: -146 }, { x: -158, y: 6, z: -156 });
  await shot("8-gate", { x: -230, z: -238 }, { x: -200, y: 40, z: -215 }, { x: -235, y: 6, z: -238 });
  await shot("6-grandstand", { x: -480, z: -255 }, { x: -470, y: 9, z: -300 }, { x: -480, y: 8, z: -235 });
});
