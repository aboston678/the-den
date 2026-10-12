import { describe, expect, it } from "vitest";
import { lerpAngle, sampleAt } from "./interpolate.ts";
import type { Snapshot } from "./remotes.ts";

const snap = (t: number, x: number, yaw = 0, action: Snapshot["action"] = "locomotion"): Snapshot =>
  ({ t, x, y: 0, z: 0, yaw, speed: 2, action, flashlight: false, aimYaw: 0, aimPitch: 0 });

describe("sampleAt", () => {
  const snaps = [snap(0, 0), snap(50, 1), snap(100, 3, 0, "jump")];
  it("is empty without snapshots", () => expect(sampleAt([], 10)).toBeNull());
  it("blends between the two snapshots around t", () => {
    expect(sampleAt(snaps, 25)!.x).toBeCloseTo(0.5);
    expect(sampleAt(snaps, 75)!.x).toBeCloseTo(2);
  });
  it("holds at the ends", () => {
    expect(sampleAt(snaps, -10)!.x).toBe(0);
    expect(sampleAt(snaps, 500)!.x).toBe(3);
  });
  it("switches action only when the newer snapshot is reached", () => {
    expect(sampleAt(snaps, 99)!.action).toBe("locomotion");
    expect(sampleAt(snaps, 100)!.action).toBe("jump");
  });
});

describe("lerpAngle", () => {
  it("goes the short way across ±π", () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1);
  });
});
