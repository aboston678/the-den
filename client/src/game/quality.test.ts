import { describe, expect, it } from "vitest";
import { PRESETS, guessTier } from "./quality.ts";

describe("graphics presets", () => {
  it("Auto's first guess from the graphics chip", () => {
    expect(guessTier("ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)")).toBe("medium");
    expect(guessTier("ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)")).toBe("high");
    expect(guessTier("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("low");
    expect(guessTier("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("high");
    expect(guessTier("")).toBe("medium");
  });

  it("each step up costs more", () => {
    const { low, medium, high } = PRESETS;
    for (const [a, b] of [[low, medium], [medium, high]] as const) {
      expect(b.dpr).toBeGreaterThanOrEqual(a.dpr);
      expect(b.shadowMap).toBeGreaterThanOrEqual(a.shadowMap);
      expect(b.treeLods[0]).toBeGreaterThanOrEqual(a.treeLods[0]);
      expect(b.interiorLights).toBeGreaterThanOrEqual(a.interiorLights);
    }
    expect(low.bloom || medium.bloom).toBe(false);
    expect(high.bloom && high.ambientOcclusion).toBe(true);
  });
});
