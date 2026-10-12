import { test } from "@playwright/test";
import { hostGame } from "./helpers.ts";
// Dev probe: quick looks at the house. [name, bear x, z, look x, z, pitch, dist, y?]
const STOPS = (process.env.HS ?? "").split(";").filter(Boolean).map((s) => s.split(",")) as string[][];
test("house probe", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await hostGame(page, "Probe");
  for (const [name, x, z, lx, lz, pitch, dist, y, key] of STOPS) {
    await page.evaluate(([x, z, lx, lz, pitch, dist, y]) => {
      const d = window.__den!;
      d.teleport(+x!, +z!, y ? +y : undefined);
      d.camera.yaw = Math.atan2(-(+lx! - +x!), -(+lz! - +z!));
      d.camera.pitch = +(pitch ?? 0.15);
      d.camera.distance = +(dist ?? 4);
    }, [x, z, lx, lz, pitch, dist, y]);
    await page.waitForTimeout(1500);
    if (key) {
      const pr = page.getByTestId("action-prompt");
      console.log(name, "prompt:", (await pr.count()) ? await pr.textContent() : "none");
      await page.keyboard.press(key);
      await page.waitForTimeout(1500);
    }
    const p = await page.evaluate(() => window.__den!.player.position);
    console.log(name, "bear at", p.x.toFixed(1), p.y.toFixed(2), p.z.toFixed(1));
    await page.screenshot({ path: `${process.env.OUT}/h-${name}.png` });
  }
  console.log("errors:", errors.slice(0, 5).join(" | "));
});
