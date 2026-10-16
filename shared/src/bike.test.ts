import { describe, expect, it } from "vitest";
import { BIKE, GARAGE_BIKE, bikeBlocked, bikeSpeedStep, bikeTopSpeed, bikeTurnRate, inGarage } from "./bike.ts";
import { APRON, houseToWorld } from "./world/layout.ts";

const ride = (seconds: number, input: { throttle: boolean; brake: boolean; tuck: boolean }, top: number, from = 0) => {
  let v = from;
  for (let t = 0; t < seconds; t += 0.02) v = bikeSpeedStep(v, 0.02, input, top);
  return v;
};
const GAS = { throttle: true, brake: false, tuck: false };

describe("the motorcycle", () => {
  it("waits in the garage, facing the doors", () => {
    expect(inGarage(GARAGE_BIKE.x, GARAGE_BIKE.z)).toBe(true);
    expect(Math.sin(GARAGE_BIKE.yaw)).toBeCloseTo(-1);
    expect(bikeBlocked(GARAGE_BIKE.x, GARAGE_BIKE.z)).toBe(false);
  });

  it("can't be ridden into the house, only the garage", () => {
    const kitchen = houseToWorld(14, 3), greatRoom = houseToWorld(25, 7);
    expect(bikeBlocked(kitchen.x, kitchen.z)).toBe(true);
    expect(bikeBlocked(greatRoom.x, greatRoom.z)).toBe(true);
    expect(bikeBlocked((APRON.minX + APRON.maxX) / 2, -1)).toBe(false);
  });

  it("is quick on the driveway, slower on grass, slow in the garage", () => {
    expect(bikeTopSpeed((APRON.minX + APRON.maxX) / 2, -1)).toBe(BIKE.roadSpeed);
    expect(bikeTopSpeed(0, -30)).toBe(BIKE.groundSpeed); // the front lawn
    expect(bikeTopSpeed(GARAGE_BIKE.x, GARAGE_BIKE.z)).toBe(BIKE.indoorSpeed);
    expect(bikeTopSpeed(0, -30, true)).toBe(BIKE.trackSpeed);
  });

  it("pulls hard off the line and tops out; brakes hard; backs up slowly", () => {
    const v3 = ride(3, GAS, BIKE.roadSpeed);
    expect(v3).toBeGreaterThan(18);
    const top = ride(20, GAS, BIKE.roadSpeed);
    expect(top).toBeCloseTo(BIKE.roadSpeed, 0);
    expect(ride(20, { ...GAS, tuck: true }, BIKE.roadSpeed)).toBeGreaterThan(top + 2);
    const braked = ride(1.4, { throttle: false, brake: true, tuck: false }, BIKE.roadSpeed, top);
    expect(braked).toBeLessThanOrEqual(0); // stopped from top speed in under 1.4 s…
    expect(braked).toBeGreaterThan(-0.5); // …and only just starting to back up
    expect(ride(3, { throttle: false, brake: true, tuck: false }, BIKE.roadSpeed)).toBeCloseTo(-BIKE.reverseSpeed);
    // Off the track onto grass: it slows to the grass's top speed.
    expect(ride(5, GAS, BIKE.groundSpeed, BIKE.trackSpeed)).toBeCloseTo(BIKE.groundSpeed, 0);
    // No throttle: rolls to a stop.
    expect(ride(20, { throttle: false, brake: false, tuck: false }, BIKE.roadSpeed, 10)).toBe(0);
  });

  it("turns tight when slow and wide when fast", () => {
    expect(bikeTurnRate(2)).toBeGreaterThan(bikeTurnRate(40) * 3);
  });
});
