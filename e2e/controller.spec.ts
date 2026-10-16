import { expect, test, type Page } from "@playwright/test";
import { failOnErrors, hostGame } from "./helpers.ts";

// Milestone 1.6: the bear moves, jumps, roars, dances, and the camera avoids walls (on the flat test field).

const den = (page: Page) => page.evaluate(() => {
  const d = window.__den!;
  return { ...d.player, position: { ...d.player.position }, camera: { ...d.camera } };
});

async function hold(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
}

test.beforeEach(async ({ page }) => {
  failOnErrors(page);
  await hostGame(page, "Tester", { world: "test" });
});

test("walks and sprints at the spec speeds", async ({ page }) => {
  const a = await den(page);
  await hold(page, ["KeyW"], 2000);
  const b = await den(page);
  const walk = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z) / (b.gameTime - a.gameTime);
  expect(walk).toBeGreaterThan(1.55); // 1.8 m/s, minus a moment of acceleration
  expect(walk).toBeLessThan(1.85);
  expect(b.position.z).toBeLessThan(a.position.z); // W goes away from the camera (−z at start)

  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(400); // get up to speed
  const c = await den(page);
  await page.waitForTimeout(1200);
  const d = await den(page);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  const run = Math.hypot(d.position.x - c.position.x, d.position.z - c.position.z) / (d.gameTime - c.gameTime);
  expect(run).toBeGreaterThan(5.5); // 6 m/s
  expect(run).toBeLessThan(6.1);
  await page.screenshot({ path: "test-results/controller-run.png" });
});

test("jumps about 1.1 m and lands", async ({ page }) => {
  const ground = (await den(page)).position.y;
  await page.keyboard.press("Space");
  let peak = ground;
  for (let i = 0; i < 20; i++) {
    peak = Math.max(peak, (await den(page)).position.y);
    await page.waitForTimeout(25);
  }
  expect(peak - ground).toBeGreaterThan(0.8);
  expect(peak - ground).toBeLessThan(1.3);
  await expect.poll(async () => (await den(page)).grounded, { timeout: 3000 }).toBe(true);
  await expect.poll(async () => (await den(page)).action).toBe("locomotion");
});

test("dance and roar start, and moving cancels them", async ({ page }) => {
  await page.keyboard.press("KeyB");
  await expect.poll(async () => (await den(page)).action).toBe("dance");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/controller-dance.png" });
  await hold(page, ["KeyD"], 300);
  await expect.poll(async () => (await den(page)).action).toBe("locomotion");

  await page.waitForTimeout(400);
  await page.keyboard.press("KeyY");
  await expect.poll(async () => (await den(page)).action).toBe("roar");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/controller-roar.png" });
  await hold(page, ["KeyA"], 300);
  await expect.poll(async () => (await den(page)).action).toBe("locomotion");
  // 3 s cooldown: a second roar right away is ignored
  await page.keyboard.press("KeyY");
  await page.waitForTimeout(200);
  expect((await den(page)).action).toBe("locomotion");
});

test("Y roars while walking: the bear stops and roars (game-night bug: it was cancelled at once)", async ({ page }) => {
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(600);
  await page.keyboard.press("KeyY");
  await page.waitForTimeout(300);
  expect((await den(page)).action).toBe("roar");
  await page.waitForTimeout(1300); // still holding W: once planted, walking on cancels it
  await page.keyboard.up("KeyW");
  expect((await den(page)).action).toBe("locomotion");
  if ((await page.evaluate(() => window.__den!.audio().state)) === "running") {
    expect(await page.evaluate(() => window.__den!.audio().recent)).toContain("roar");
  }
});

test("camera pulls in when a wall is behind the bear", async ({ page }) => {
  // Inside the test room (back wall at z = −13), 1.5 m from the back wall, with the camera
  // swung round to the −z side so the wall is right behind it.
  await page.evaluate(() => window.__den!.teleport(-12, -11.5, 0)); // on the floor, not the roof
  await page.evaluate(() => { window.__den!.camera.yaw = Math.PI; });
  await page.waitForTimeout(800);
  const { camera } = await den(page);
  expect(camera.current).toBeLessThan(camera.distance - 0.5);
  await page.screenshot({ path: "test-results/controller-indoors.png" });
});

test("feet don't slide while walking or sprinting", async ({ page }) => {
  for (const [label, keys] of [["walk", ["KeyW"]], ["sprint", ["ShiftLeft", "KeyW"]]] as const) {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(600); // reach full speed
    // Sample the toes every frame for 3 s.
    const samples = await page.evaluate(async () => {
      const d = window.__den!;
      d.player.trackFeet = true;
      const out: { t: number; feet: number[][] }[] = [];
      const end = performance.now() + 3000;
      while (performance.now() < end) {
        await new Promise((r) => requestAnimationFrame(r));
        out.push({ t: d.player.gameTime, feet: d.player.feet.map((f) => [f.x, f.y, f.z]) });
      }
      d.player.trackFeet = false;
      return out;
    });
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
    await page.waitForTimeout(300);

    // At any moment one foot should be planted, i.e. barely moving over the ground. The slower
    // foot's ground speed is the slide (it would equal the bear's speed with no foot planted).
    let slide = 0, time = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!, b = samples[i]!;
      const dt = b.t - a.t;
      if (dt <= 0) continue;
      const v = [0, 1].map((k) => Math.hypot(b.feet[k]![0]! - a.feet[k]![0]!, b.feet[k]![2]! - a.feet[k]![2]!) / dt);
      slide += Math.min(...v) * dt;
      time += dt;
    }
    const speed = slide / time;
    console.log(`${label}: planted-foot slide ${speed.toFixed(2)} m/s`);
    // Walk (1.8 m/s) must stay planted. The RunFast clip is stylised (its foot speed varies a lot
    // within each stride) so some sprint slide is unavoidable; it's reported, not graded.
    // (Frame timing makes single readings noisy, so the bar is a quarter of walking speed.)
    if (label === "walk") expect(speed, "walk foot slide").toBeLessThan(0.25 * 1.8);
  }
});
