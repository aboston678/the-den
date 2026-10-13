import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import sharp from "sharp";
import { DRIVEWAY } from "../shared/src/index.ts";
import { hostGame } from "./helpers.ts";

// Dev tool, not a check (POPIN=1): how much the world "pops" as you move through it.
//  1. Sprint from the spawn up the driveway to the house, counting stutters (frames over 50 ms).
//  2. Step slowly up the driveway, screenshotting each step; a sudden jump in how much the picture
//     changes between two steps is something appearing or swapping detail. Writes test-results/popin/.
//   POPIN=1 TAG=before npx playwright test e2e/tools-popin.spec.ts
// OUT=<folder> writes there instead (Playwright empties test-results/ on every run); VIDEO=1 also
// records the sprint; SWEEP=0 skips part 2.
test.skip(!process.env.POPIN, "dev tool: set POPIN=1 to run");

const TAG = process.env.TAG ?? "run";
const OUT = `${process.env.OUT ?? "test-results/popin"}/${TAG}`;

test("pop-in and stutter on the driveway", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const size = { width: 1280, height: 720 };
  const ctx = await browser.newContext({ viewport: size, ...(process.env.VIDEO ? { recordVideo: { dir: OUT, size } } : {}) });
  const page = await ctx.newPage();
  await hostGame(page, "Popper");
  await page.evaluate(() => window.__den!.setTime("noon"));
  await page.waitForTimeout(4000); // first-load shader compiles
  const start = await page.evaluate(() => ({ ...window.__den!.player.position }));

  // 1. Sprint run, frame times recorded in the page.
  const steer = async () => {
    const p = await page.evaluate(() => ({ x: window.__den!.player.position.x, z: window.__den!.player.position.z }));
    const here = DRIVEWAY.closest(p.x, p.z)!.s;
    const t = DRIVEWAY.pointAt(Math.min(DRIVEWAY.length, here + 10));
    await page.evaluate(([dx, dz]) => {
      const d = window.__den!;
      d.camera.yaw = Math.atan2(-dx!, -dz!);
      d.camera.pitch = 0.12;
      d.camera.distance = 4.5;
    }, [t.x - p.x, t.z - p.z]);
  };
  const programsBefore = await page.evaluate(() => window.__den!.programNames?.() ?? []);
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = [];
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__frames.length < 100_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await steer();
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ShiftLeft");
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    await steer();
  }
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.up("KeyW");
  const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames.splice(0));
  const programsAfter = await page.evaluate(() => window.__den!.programNames?.() ?? []);
  const sorted = [...frames].sort((a, b) => a - b);
  const run = {
    frames: frames.length,
    avgFps: Math.round(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)),
    p99ms: Math.round(sorted[Math.floor(sorted.length * 0.99)]!),
    worstMs: Math.round(sorted.at(-1)!),
    over50ms: frames.filter((f) => f > 50).length,
    over100ms: frames.filter((f) => f > 100).length,
    newShaders: programsAfter.length - programsBefore.length,
    newShaderNames: programsAfter.filter((n) => !programsBefore.includes(n)).join(", "),
  };
  console.log("sprint run", run);

  if (process.env.SWEEP === "0") {
    writeFileSync(`${OUT}/result.json`, JSON.stringify({ run }, null, 1));
    await ctx.close();
    return;
  }

  // 2. Slow steps up the driveway (camera behind the bear, looking ahead), measuring picture change.
  await page.evaluate(([x, z]) => window.__den!.teleport(x!, z!), [start.x, start.z]);
  await page.waitForTimeout(1500);
  const s0 = DRIVEWAY.closest(start.x, start.z)!.s;
  const STEP = 0.75, N = Math.floor((DRIVEWAY.length - s0 - 6) / STEP);
  const diffs: number[] = [];
  let prev: Buffer | null = null;
  for (let i = 0; i < N; i++) {
    const s = s0 + i * STEP, p = DRIVEWAY.pointAt(s), ahead = DRIVEWAY.pointAt(s + 8);
    await page.evaluate(([x, z, dx, dz]) => {
      const d = window.__den!;
      d.teleport(x!, z!);
      d.camera.yaw = Math.atan2(-dx!, -dz!);
      d.camera.pitch = 0.12;
      d.camera.distance = 4.5;
    }, [p.x, p.z, ahead.x - p.x, ahead.z - p.z]);
    await page.waitForTimeout(350);
    const png = await page.screenshot({ type: "png" });
    const raw = await sharp(png).resize(320, 180).greyscale().raw().toBuffer();
    if (prev) {
      let sum = 0;
      for (let k = 0; k < raw.length; k++) sum += Math.abs(raw[k]! - prev[k]!);
      diffs.push(sum / raw.length);
    } else diffs.push(0);
    prev = raw;
    if (i % 4 === 0) writeFileSync(`${OUT}/step-${String(i).padStart(3, "0")}.png`, png);
  }
  // A pop is a step that changes the picture much more than the steps around it (plain movement changes it steadily).
  const pops = diffs.map((d, i) => {
    const near = diffs.slice(Math.max(1, i - 4), i + 5).filter((_, j, a) => a[j] !== d).sort((a, b) => a - b);
    const median = near[Math.floor(near.length / 2)] ?? d;
    return { i, d, ratio: d / Math.max(0.5, median) };
  }).filter((p) => p.i > 0 && p.ratio > 1.6);
  const sweep = {
    steps: N,
    meanChange: +(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2),
    pops: pops.length,
    biggest: pops.sort((a, b) => b.ratio - a.ratio).slice(0, 8).map((p) => `step ${p.i}: ×${p.ratio.toFixed(1)}`),
  };
  console.log("slow sweep", sweep);
  writeFileSync(`${OUT}/result.json`, JSON.stringify({ run, sweep, diffs }, null, 1));
  await ctx.close();
});
