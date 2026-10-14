import { describe, expect, it } from "vitest";
import { sanitizeBowlFrame } from "./sync.ts";

const pin = (x: number) => [x, 0, 0, 0, 0, 0, 1];
const pins = Array.from({ length: 10 }, (_, i) => pin((183 + i) / 10)).flat();

describe("bowling frames", () => {
  it("keeps a good frame (rounded, quaternions made unit length)", () => {
    const f = sanitizeBowlFrame({ lane: "1", b: [5.12345, 0.109, 0.02, 0, 0, 0, 1.2], p: pins, g: 3, s: [0.5, 18], snd: "crash" });
    expect(f).toEqual({ lane: "1", b: [5.123, 0.109, 0.02, 0, 0, 0, 1], p: pins, g: 3, s: [0.5, 18], snd: "crash" });
  });

  it("allows a hidden ball and pins that haven't moved", () => {
    expect(sanitizeBowlFrame({ lane: "2", b: null, p: null, g: 0, s: [0, 0] })).toEqual({ lane: "2", b: null, p: null, g: 0, s: [0, 0] });
  });

  it("refuses junk: wrong lane, bad numbers, things outside the lane, the wrong number of pins", () => {
    expect(sanitizeBowlFrame(null)).toBeNull();
    expect(sanitizeBowlFrame({ lane: "3", b: null, p: null })).toBeNull();
    expect(sanitizeBowlFrame({ lane: "1", b: [Number.NaN, 0, 0, 0, 0, 0, 1], p: null })).toBeNull();
    expect(sanitizeBowlFrame({ lane: "1", b: [400, 0, 0, 0, 0, 0, 1], p: null })).toBeNull();
    expect(sanitizeBowlFrame({ lane: "1", b: [1, 0, 0, 0, 0, 0, 0], p: null })).toBeNull();
    expect(sanitizeBowlFrame({ lane: "1", b: null, p: pins.slice(7) })).toBeNull();
  });

  it("drops unknown sounds and cleans the rest", () => {
    expect(sanitizeBowlFrame({ lane: "1", b: null, p: null, g: 99999, s: [5, 1], snd: "boom" })).toEqual({ lane: "1", b: null, p: null, g: 99999 & 0x3ff, s: [1, 1] });
  });
});
