import { describe, expect, it } from "vitest";
import { BIKE, GARAGE_BIKE, GEARS, GEAR_TOP, MPH, autoGear, bikeBlocked, bikeRevs, bikeSpeedStep, bikeTopSpeed, bikeTurnRate, canShiftDown, inGarage } from "./bike.ts";
import { START_S, TRACK, TRACK_WIDTH } from "./track.ts";
import { APRON, houseToWorld } from "./world/layout.ts";

/** Ride with the automatic box (or held in one gear). */
const ride = (seconds: number, input: { throttle: boolean; brake: boolean; tuck: boolean }, top: number, from = 0, hold?: number) => {
  let v = from, g = hold ?? 1;
  for (let t = 0; t < seconds; t += 0.02) {
    v = bikeSpeedStep(v, 0.02, input, top, g);
    if (hold === undefined) g = autoGear(v, g);
  }
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

  it("is as fast on grass as on the nearby pavement; slow in the garage", () => {
    expect(bikeTopSpeed((APRON.minX + APRON.maxX) / 2, -1)).toBe(BIKE.roadSpeed);
    expect(bikeTopSpeed(0, -30)).toBe(BIKE.roadSpeed); // the front lawn
    expect(bikeTopSpeed(GARAGE_BIKE.x, GARAGE_BIKE.z)).toBe(BIKE.indoorSpeed);
    expect(bikeTopSpeed(0, -30, true)).toBe(BIKE.trackSpeed);
    // The grass beside the start line, off the asphalt: still track speed.
    const s = TRACK.pointAt(START_S), off = -(TRACK_WIDTH / 2 + 6);
    expect(bikeTopSpeed(s.x + s.dz * off, s.z - s.dx * off)).toBe(BIKE.trackSpeed);
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
    // Over the top speed here (rolled out onto the property's road from the track): slows to it.
    expect(ride(5, GAS, BIKE.roadSpeed, BIKE.trackSpeed)).toBeCloseTo(BIKE.roadSpeed, 0);
    // No throttle: rolls to a stop.
    expect(ride(20, { throttle: false, brake: false, tuck: false }, BIKE.roadSpeed, 10)).toBe(0);
  });

  it("has six gears up to ~125 mph, each held at its rev limiter", () => {
    expect(GEARS).toBe(6);
    expect(GEAR_TOP[5] * MPH).toBeGreaterThan(120);
    expect(GEAR_TOP[5]).toBeGreaterThanOrEqual(BIKE.trackSpeed * BIKE.tuck);
    expect(ride(10, GAS, BIKE.trackSpeed, 0, 1)).toBeCloseTo(GEAR_TOP[0], 0); // first gear tops out
    expect(bikeRevs(0, 1)).toBeGreaterThan(0.1); // idling
    expect(bikeRevs(GEAR_TOP[2], 3)).toBe(1);
    expect(ride(60, { ...GAS, tuck: true }, BIKE.trackSpeed)).toBeCloseTo(BIKE.trackSpeed * BIKE.tuck, 0); // the automatic gets to the top
  });

  it("pulls hardest in the right gear: lugging in sixth from a standstill is slow", () => {
    expect(ride(3, GAS, BIKE.trackSpeed, 0, 6)).toBeLessThan(ride(3, GAS, BIKE.trackSpeed) / 2);
  });

  it("the automatic shifts up near the redline and down as it slows", () => {
    expect(autoGear(GEAR_TOP[0] * 0.97, 1)).toBe(2);
    expect(autoGear(GEAR_TOP[0] * 0.5, 1)).toBe(1);
    expect(autoGear(2, 4)).toBe(3);
    expect(autoGear(20, 3)).toBe(3);
  });

  it("won't shift down into an over-rev", () => {
    expect(canShiftDown(30, 4)).toBe(false); // third tops out at 24
    expect(canShiftDown(20, 4)).toBe(true);
    expect(canShiftDown(5, 1)).toBe(false);
  });

  it("turns tight when slow and wide when fast", () => {
    expect(bikeTurnRate(2)).toBeGreaterThan(bikeTurnRate(40) * 3);
  });
});
