import { describe, expect, it } from "vitest";
import { ENGINE_RPM, EngineSynth, revsToRpm } from "./engineSynth.ts";

const SR = 22050;
/** Run the engine for `seconds` at a steady rpm and throttle; returns the last 0.5 s. */
function run(e: EngineSynth, seconds: number, rpm: number, throttle: number) {
  const block = new Float32Array(128), out: number[] = [];
  for (let n = 0; n < seconds * SR; n += 128) {
    e.render(block, rpm, throttle);
    out.push(...block);
  }
  return Float32Array.from(out.slice(-SR / 2));
}
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
/** The pitch (Hz, 60…700) by autocorrelation: the shortest repeat nearly as strong as the strongest
 * (so two near-identical firings in a row don't read as half the pitch). */
function pitch(x: Float32Array) {
  const c: number[] = [];
  const lo = Math.floor(SR / 700), hi = Math.ceil(SR / 60);
  for (let l = lo; l <= hi; l++) {
    let s = 0;
    for (let i = 0; i + l < x.length; i++) s += x[i]! * x[i + l]!;
    c[l] = s;
  }
  const best = Math.max(...c.slice(lo));
  for (let l = lo + 1; l < hi; l++) if (c[l]! > 0.85 * best && c[l]! >= c[l - 1]! && c[l]! >= c[l + 1]!) return SR / l;
  return 0;
}

describe("the engine made in code", () => {
  it("maps the bike's revs to rpm, never below idle", () => {
    expect(revsToRpm(0)).toBe(ENGINE_RPM.idle);
    expect(revsToRpm(1)).toBe(ENGINE_RPM.redline);
  });

  it("its note follows the revs: an inline-four fires rpm / 30 times a second", () => {
    for (const rpm of [6000, 10000, 14000]) {
      const f = pitch(run(new EngineSynth(SR), 0.8, rpm, 1));
      expect(f / (rpm / 30)).toBeGreaterThan(0.93);
      expect(f / (rpm / 30)).toBeLessThan(1.07);
    }
  });

  it("is louder on the throttle than off it, and stays sane", () => {
    const on = run(new EngineSynth(SR), 0.6, 9000, 1), off = run(new EngineSynth(SR), 0.6, 9000, 0);
    expect(rms(on)).toBeGreaterThan(rms(off) * 1.4);
    for (const v of on) expect(Number.isFinite(v) && Math.abs(v) < 1.5).toBe(true);
  });

  it("pops on an upshift and dips the revs fast", () => {
    const e = new EngineSynth(SR);
    run(e, 0.5, 14000, 1);
    const before = e.rpm;
    e.shift(1);
    const block = new Float32Array(128);
    let peak = 0;
    for (let n = 0; n < 0.1 * SR; n += 128) {
      e.render(block, 10500, 1);
      for (const v of block) peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(e.rpm).toBeLessThan(before - 2500);
  });

  it("blips the revs past the new gear's on a downshift", () => {
    const e = new EngineSynth(SR);
    run(e, 0.5, 7000, 0);
    e.shift(-1);
    const block = new Float32Array(128);
    let top = 0;
    for (let n = 0; n < 0.15 * SR; n += 128) {
      e.render(block, 9000, 0);
      top = Math.max(top, e.rpm);
    }
    expect(top).toBeGreaterThan(9200);
  });
});
