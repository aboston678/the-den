import { describe, expect, it } from "vitest";
import { CYCLE_LENGTH, PHASE_START, START_TIME, TIME_PRESETS, parseTime, phaseAt, skyAt } from "./daynight.ts";

// The day/night cycle checked against GAME_SPEC §9.

describe("day/night cycle", () => {
  it("is 30 min day, 4 min dusk, 30 min night, 4 min dawn (68 min)", () => {
    expect(CYCLE_LENGTH).toBe(68 * 60);
    expect(phaseAt(0)).toBe("day");
    expect(phaseAt(30 * 60 - 1)).toBe("day");
    expect(phaseAt(30 * 60)).toBe("dusk");
    expect(phaseAt(34 * 60)).toBe("night");
    expect(phaseAt(64 * 60)).toBe("dawn");
    expect(phaseAt(68 * 60)).toBe("day"); // loops
    expect(phaseAt(-1)).toBe("dawn");
  });

  it("a new party starts mid-morning, with the sun well up in the south-east", () => {
    const { phase, sun, daylight } = skyAt(START_TIME);
    expect(phase).toBe("day");
    expect(daylight).toBe(1);
    expect(sun.x).toBeGreaterThan(0.3); // east
    expect(sun.z).toBeGreaterThan(0.3); // south
    expect(sun.y).toBeGreaterThan(0.5); // ~40°+ up
  });

  it("the sun rises in the east, crosses the southern sky and sets in the west", () => {
    const sunrise = skyAt(PHASE_START.dawn + 120).sun;
    expect(sunrise.y).toBeCloseTo(0, 5);
    expect(sunrise.x).toBeCloseTo(1, 5);
    const sunset = skyAt(PHASE_START.dusk + 120).sun;
    expect(sunset.y).toBeCloseTo(0, 5);
    expect(sunset.x).toBeCloseTo(-1, 5);
    for (let t = 0; t < PHASE_START.dusk; t += 30) {
      const s = skyAt(t).sun;
      expect(s.y).toBeGreaterThan(0);
      expect(s.z).toBeGreaterThanOrEqual(0); // always the southern half of the sky
    }
    const noon = skyAt(TIME_PRESETS.noon).sun;
    expect(Math.asin(noon.y) * (180 / Math.PI)).toBeCloseTo(60, 0);
  });

  it("at night the sun is down, the moon is up in the south and it's dark", () => {
    for (let t = PHASE_START.night; t < PHASE_START.dawn; t += 30) {
      const s = skyAt(t);
      expect(s.sun.y).toBeLessThan(0);
      expect(s.moon.y).toBeGreaterThan(0);
      expect(s.moon.z).toBeGreaterThanOrEqual(0);
      expect(s.daylight).toBeLessThan(0.05);
    }
  });

  it("outdoor lights are on from dusk until dawn and off all day", () => {
    for (let t = 0; t < PHASE_START.dusk; t += 10) expect(skyAt(t).exteriorLights).toBe(0);
    expect(skyAt(PHASE_START.dusk + 60).exteriorLights).toBe(1);
    expect(skyAt(TIME_PRESETS.night).exteriorLights).toBe(1);
    expect(skyAt(PHASE_START.dawn + 60).exteriorLights).toBe(1);
    expect(skyAt(PHASE_START.dusk + 15).exteriorLights).toBeCloseTo(0.5, 5); // fading on
    expect(skyAt(CYCLE_LENGTH - 15).exteriorLights).toBeCloseTo(0.5, 5); // fading off
  });

  it("sunset and sunrise glow; noon and midnight don't", () => {
    expect(skyAt(PHASE_START.dusk + 120).glow).toBe(1);
    expect(skyAt(PHASE_START.dawn + 120).glow).toBe(1);
    expect(skyAt(TIME_PRESETS.noon).glow).toBe(0);
    expect(skyAt(TIME_PRESETS.night).glow).toBe(0);
  });

  it("reads ?time= values", () => {
    expect(parseTime("dusk")).toBe(TIME_PRESETS.dusk);
    expect(parseTime("100")).toBe(100);
    expect(parseTime(CYCLE_LENGTH + 5)).toBe(5);
    expect(parseTime("tea time")).toBeUndefined();
    expect(parseTime("toString")).toBeUndefined();
    expect(parseTime(undefined)).toBeUndefined();
  });
});
