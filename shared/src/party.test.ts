import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "./constants.ts";
import { type Pose, sanitizePose } from "./party.ts";
import { WORLD_LIMITS } from "./track.ts";

const prev: Pose = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, action: "locomotion", flashlight: false, aimYaw: 0, aimPitch: 0, wheelie: 0 };

describe("sanitizePose", () => {
  it("accepts normal movement", () => {
    const p = sanitizePose({ x: 0.3, y: 0, z: -0.1, yaw: 1, speed: 6, action: "locomotion" }, prev, 0.05);
    expect(p).toMatchObject({ x: 0.3, z: -0.1, yaw: 1, speed: 6 });
  });

  it("clamps teleports to sprint speed (with slack)", () => {
    const p = sanitizePose({ x: 100, y: 0, z: 0, yaw: 0, speed: 6, action: "locomotion" }, prev, 0.05);
    expect(p.x).toBeCloseTo(6 * 1.5 * 0.05 + 1);
    expect(p.z).toBe(0);
  });

  it("keeps bears inside the map (the property, and the racetrack out to the north-west)", () => {
    const edge = { ...prev, x: WORLD_LIMITS.maxX - 0.1 };
    expect(sanitizePose({ ...edge, x: 400 }, edge, 1).x).toBe(WORLD_LIMITS.maxX);
    const track = { ...prev, x: -700, z: -500 };
    expect(sanitizePose({ ...track, x: -701 }, track, 1).x).toBe(-701); // out at the track is fine
    expect(WORLD_LIMITS.minX).toBeLessThan(-760);
  });

  it("rejects junk", () => {
    const p = sanitizePose({ x: "lol", y: NaN, z: Infinity, yaw: null, speed: 999, action: "fly" }, prev, 0.05);
    expect(p).toMatchObject({ x: 0, y: 0, z: 0, yaw: 0, action: "locomotion" });
    expect(p.speed).toBeCloseTo(7.2); // capped at 1.2 × sprint
    expect(sanitizePose(undefined, prev, 0.05)).toEqual({ ...prev, speed: 0 });
  });

  it("carries the flashlight and where it points, within sane angles", () => {
    const p = sanitizePose({ x: 0, y: 0, z: 0, yaw: 0, speed: 0, action: "locomotion", flashlight: true, aimYaw: 1, aimPitch: 9 }, prev, 0.05);
    expect(p).toMatchObject({ flashlight: true, aimYaw: 1, aimPitch: 1.4 });
    expect(sanitizePose({ flashlight: "yes" }, { ...prev, flashlight: true }, 0.05).flashlight).toBe(true); // junk keeps the old value
  });
});
