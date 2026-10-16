import { GARAGE_BIKE, MAX_PLAYERS, sanitizePose } from "@den/shared";
import { describe, expect, it } from "vitest";
import { bikeMessage } from "./bike.ts";
import { Player } from "./PartyState.ts";

const bearAt = (x: number, z: number, y = 0) => Object.assign(new Player(), { x, y, z });

describe("the motorcycle on the server", () => {
  it("takes a bike only next to the garage one, not with a rod in your paw", () => {
    expect(bikeMessage(bearAt(GARAGE_BIKE.x + 10, GARAGE_BIKE.z), { do: "take" })).toBe(false);
    const fisher = bearAt(GARAGE_BIKE.x + 1, GARAGE_BIKE.z);
    fisher.rod = true;
    expect(bikeMessage(fisher, { do: "take" })).toBe(false);
    const p = bearAt(GARAGE_BIKE.x + 1, GARAGE_BIKE.z);
    expect(bikeMessage(p, { do: "take" })).toBe(true);
    expect(p.bike).toBe("riding");
    expect(bikeMessage(p, { do: "take" })).toBe(false); // already on one
  });

  it("parks where you stop (not somewhere else, not in the house) and gets back on next to it", () => {
    const p = bearAt(-40, -10, 1);
    p.bike = "riding";
    expect(bikeMessage(p, { do: "park", x: -39, y: 1, z: -10, yaw: 1 })).toBe(true);
    expect([p.bike, p.bikeX, p.bikeZ, p.bikeYaw]).toEqual(["parked", -39, -10, 1]);
    p.x = -60;
    expect(bikeMessage(p, { do: "mount" })).toBe(false); // too far away
    p.x = -40;
    expect(bikeMessage(p, { do: "mount" })).toBe(true);
    expect(bikeMessage(p, { do: "park", x: 500, y: 1, z: -10 })).toBe(true);
    expect(p.bikeX).toBe(-40); // a far-off spot is ignored: it stays with the bear
  });

  it("only a riding bear may move at a bike's speed or look like it's riding", () => {
    const prev = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, action: "locomotion" as const, flashlight: false, aimYaw: 0, aimPitch: 0 };
    const fast = { ...prev, x: 2, speed: 40, action: "ride" };
    const walking = sanitizePose(fast, prev, 0.05, false);
    expect(walking.x).toBeLessThan(2);
    expect(walking.action).toBe("locomotion");
    const riding = sanitizePose(fast, prev, 0.05, true);
    expect(riding.x).toBe(2);
    expect(riding.speed).toBe(40);
    expect(riding.action).toBe("ride");
    expect(MAX_PLAYERS).toBeGreaterThan(0);
  });
});
