import { describe, expect, it } from "vitest";
import { type BallState, BALL_PHYSICS, reachedPins, stepBall } from "./ball.ts";
import { BALL, LANE } from "./lane.ts";
import { THROW, aimScatter, throwBall } from "./throw.ts";

const mid = () => 0.5; // no luck: exactly what the meters say

/** Roll a ball to the pins; returns its z at each metre and the time taken. */
function roll(b: BallState) {
  const path: number[] = [];
  let t = 0;
  while (!reachedPins(b) && t < 8) {
    stepBall(b, 1 / 240);
    t += 1 / 240;
    path[Math.floor(b.x)] ??= b.z;
  }
  return { path, t, b };
}

describe("the ball on the lane", () => {
  it("rolls dead straight with no curve, ~2.5 s to the pins at medium power", () => {
    const { b, t } = roll(throwBall({ z: 0, aim: 0, power: 0.6, curve: 0 }, mid));
    expect(Math.abs(b.z)).toBeLessThan(1e-9);
    expect(t).toBeGreaterThan(2.2);
    expect(t).toBeLessThan(2.8);
  });

  it("hooks late: little bend on the oil, most of it on the dry back end", () => {
    const { path, b } = roll(throwBall({ z: 0.3, aim: 0, power: 0.6, curve: -1 }, mid));
    const onOil = Math.abs(path[12]! - 0.3);
    const backEnd = Math.abs(b.z - path[12]!);
    expect(onOil).toBeLessThan(0.2);
    expect(backEnd).toBeGreaterThan(onOil);
    expect(b.z).toBeLessThan(0); // crossed the middle, from the right side toward the left
    expect(b.gutter).toBe(false);
  });

  it("curves the other way with the meter on the other side", () => {
    const { b } = roll(throwBall({ z: -0.3, aim: 0, power: 0.6, curve: 1 }, mid));
    expect(b.z).toBeGreaterThan(0);
  });

  it("a slow ball hooks more than a fast one", () => {
    const slow = roll(throwBall({ z: 0.3, aim: 0, power: 0.3, curve: -1 }, mid)).b;
    const fast = roll(throwBall({ z: 0.3, aim: 0, power: 1, curve: -1 }, mid)).b;
    expect(0.3 - slow.z).toBeGreaterThan(0.3 - fast.z);
  });

  it("ends up rolling (no slip) once it has hooked", () => {
    const { b } = roll(throwBall({ z: 0.3, aim: 0, power: 0.4, curve: -0.6 }, mid));
    expect(Math.hypot(b.vx + b.wz * BALL.radius, b.vz - b.wx * BALL.radius)).toBeLessThan(0.05);
  });

  it("drops into the gutter and rolls on to the pit, missing the pins", () => {
    const { b } = roll(throwBall({ z: 0.35, aim: 3, power: 0.5, curve: 0 }, mid));
    expect(b.gutter).toBe(true);
    expect(Math.abs(b.z)).toBeCloseTo(LANE.width / 2 + LANE.gutter / 2);
    expect(b.x).toBeGreaterThanOrEqual(LANE.pitEdge);
  });

  it("hands over to the pin physics just before the head pin", () => {
    const { b } = roll(throwBall({ z: 0, aim: 0, power: 0.6, curve: 0 }, mid));
    expect(b.x).toBeGreaterThanOrEqual(BALL_PHYSICS.handoverX);
    expect(b.x).toBeLessThan(LANE.headPin - BALL.radius);
  });
});

describe("the throw", () => {
  it("is exactly what the meters say without luck, and the same luck gives the same ball", () => {
    const a = throwBall({ z: 0.1, aim: 1, power: 0.7, curve: 0.5 }, mid);
    expect(Math.atan2(a.vz, a.vx) * 180 / Math.PI).toBeCloseTo(1);
    expect(a.wx).toBeCloseTo(0.5 * THROW.maxSideSpin);
    let i = 0;
    const seq = [0.1, 0.9, 0.3];
    const r1 = () => seq[i++ % 3]!;
    const b1 = throwBall({ z: 0, aim: 0, power: 0.7, curve: 0 }, r1);
    i = 0;
    const b2 = throwBall({ z: 0, aim: 0, power: 0.7, curve: 0 }, r1);
    expect(b1).toEqual(b2);
  });

  it("scatters the aim a little, more when you throw harder", () => {
    expect(aimScatter(1)).toBeGreaterThan(aimScatter(0));
    const angle = (power: number, r: number) => {
      const b = throwBall({ z: 0, aim: 0, power, curve: 0 }, () => r);
      return Math.abs(Math.atan2(b.vz, b.vx) * 180 / Math.PI);
    };
    const worst = (power: number) => [0, 1].map((r) => angle(power, r));
    expect(Math.max(...worst(1))).toBeCloseTo(aimScatter(1), 0);
    expect(Math.max(...worst(0))).toBeLessThan(0.5);
  });

  it("keeps the bear's spot and the aim inside their limits", () => {
    const b = throwBall({ z: 5, aim: 40, power: 2, curve: 3 }, mid);
    expect(Math.abs(b.z)).toBeLessThan(LANE.width / 2);
    expect(Math.atan2(b.vz, b.vx) * 180 / Math.PI).toBeCloseTo(THROW.maxAim);
    expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(THROW.maxSpeed);
  });
});
