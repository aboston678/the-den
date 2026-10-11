import { describe, expect, it } from "vitest";
import { approach, facingYaw, locomotionWeights, moveDirection, turnToward } from "./movement.ts";

const keys = (s: string) => ({ forward: s.includes("w"), back: s.includes("s"), left: s.includes("a"), right: s.includes("d") });
const close = (v: { x: number; z: number }, x: number, z: number) => {
  expect(v.x).toBeCloseTo(x, 5);
  expect(v.z).toBeCloseTo(z, 5);
};

describe("moveDirection", () => {
  it("W walks away from the camera", () => close(moveDirection(keys("w"), 0), 0, -1));
  it("D walks to the camera's right", () => close(moveDirection(keys("d"), 0), 1, 0));
  it("follows the camera's yaw", () => close(moveDirection(keys("w"), Math.PI / 2), -1, 0));
  it("diagonals are normalised", () => close(moveDirection(keys("wd"), 0), Math.SQRT1_2, -Math.SQRT1_2));
  it("opposite keys cancel", () => close(moveDirection(keys("ws"), 0), 0, 0));
});

describe("facing and turning", () => {
  it("faces +z at yaw 0", () => expect(facingYaw({ x: 0, z: 1 })).toBeCloseTo(0));
  it("turns the short way across ±π", () => {
    const next = turnToward(3.0, -3.0, 0.1);
    expect(next).toBeCloseTo(3.1);
  });
  it("snaps when close enough", () => expect(turnToward(1, 1.05, 0.1)).toBe(1.05));
});

describe("approach", () => {
  it("never overshoots", () => {
    expect(approach(0, 1, 5)).toBe(1);
    expect(approach(1, 0, 0.25)).toBe(0.75);
  });
});

describe("locomotionWeights", () => {
  const w = (s: number) => locomotionWeights(s, 2.4, 6);
  it("idle when still", () => expect(w(0)).toEqual({ idle: 1, walk: 0, run: 0 }));
  it("full walk at walk speed", () => expect(w(2.4)).toEqual({ idle: 0, walk: 1, run: 0 }));
  it("full run at sprint speed", () => expect(w(6)).toEqual({ idle: 0, walk: 0, run: 1 }));
  it("always sums to 1", () => {
    for (let s = 0; s <= 7; s += 0.37) {
      const { idle, walk, run } = w(s);
      expect(idle + walk + run).toBeCloseTo(1);
    }
  });
});
