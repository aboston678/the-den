import { expect, test, type Page } from "@playwright/test";
import { doorById, houseToWorld } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, waitForBear } from "./helpers.ts";

// Phase 5 sound pass (GAME_SPEC §10): footsteps that match the ground, a landing thud, doors that
// the whole party hears, and menu clicks.
//   npx playwright test e2e/sound.spec.ts

test.afterEach(closePlayers);

const played = (p: Page) => p.evaluate(() => Object.keys(window.__den!.audio().played));
const heard = (p: Page, re: RegExp) => expect.poll(async () => (await played(p)).some((n) => re.test(n)), { timeout: 15_000 }).toBe(true);

async function walkFrom(p: Page, x: number, z: number, yaw: number, ms = 1800) {
  await p.evaluate(([x, z, yaw]) => {
    window.__den!.teleport(x!, z!);
    window.__den!.camera.yaw = yaw!;
  }, [x, z, yaw] as const);
  await p.waitForTimeout(700);
  await p.keyboard.down("KeyW");
  await p.waitForTimeout(ms);
  await p.keyboard.up("KeyW");
}

test("footsteps match the ground; landing thuds", async ({ page }) => {
  test.setTimeout(120_000);
  failOnErrors(page);
  await hostGame(page, "Steps");
  await waitForBear(page);
  await expect.poll(() => page.evaluate(() => window.__den!.audio().state)).toBe("running");

  // Spawn is on the driveway (asphalt).
  await page.keyboard.down("KeyW");
  await heard(page, /^step-stone-/);
  await page.keyboard.up("KeyW");

  // The porch boards, then into the foyer (oak): wood. The front lawn: grass.
  const porch = houseToWorld(24, -1.8);
  await walkFrom(page, porch.x, porch.z, -Math.PI / 2);
  await heard(page, /^step-wood-/);
  const lawn = houseToWorld(24, -14);
  await walkFrom(page, lawn.x, lawn.z, -Math.PI / 2);
  await heard(page, /^step-grass-/);

  await page.keyboard.press("Space");
  await heard(page, /^land$/);
});

test("doors are heard by the whole party; buttons click", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await newPlayer(browser), b = await newPlayer(browser);
  failOnErrors(a);
  const code = await hostGame(a, "Alpha", { play: false });
  await joinGame(b, code, "Bravo");
  await a.getByTestId("play").click();
  await waitForBear(a);
  await waitForBear(b);
  const door = doorById("main:foyer-porch")!;

  // Alpha opens the front door; Bravo, standing on the porch too, hears it. One at a time: each
  // bear's server copy glides over to the porch, and it mustn't sweep through the other on the way.
  for (const [p, x] of [[a, 27.5], [b, 25.5]] as const) {
    const at = houseToWorld(x, -1), to = houseToWorld(x, 2);
    await p.evaluate(([ax, az, bx, bz]) => {
      window.__den!.teleport(ax!, az!);
      window.__den!.camera.yaw = Math.atan2(-(bx! - ax!), -(bz! - az!));
    }, [at.x, at.z, to.x, to.z] as const);
    await expect.poll(async () => {
      const s = await p.evaluate(() => window.__den!.serverPosition());
      return s ? Math.hypot(s.x - at.x, s.z - at.z) : 99;
    }, { timeout: 20_000 }).toBeLessThan(1);
  }
  await expect.poll(async () => {
    const s = await a.evaluate(() => window.__den!.serverPosition());
    const at = houseToWorld(27.5, -1);
    return s ? Math.hypot(s.x - at.x, s.z - at.z) : 99;
  }, { timeout: 20_000 }).toBeLessThan(1);
  await expect(a.getByTestId("action-prompt")).toContainText("Open door");
  await a.keyboard.press("KeyE");
  await expect.poll(() => b.evaluate((id) => window.__den!.doors()[id], door.id)).toBe(true);
  await heard(b, /^door-open-/);
  await a.waitForTimeout(1200);
  await a.keyboard.press("KeyE");
  await heard(b, /^door-close-/);

  // A menu button clicks.
  await a.keyboard.press("Escape");
  await a.getByTestId("resume").click();
  await heard(a, /^ui-click$/);
});
