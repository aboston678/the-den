import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, migrate } from "./settings.ts";

describe("settings", () => {
  it("start on Medium graphics and full screen", () => {
    expect(DEFAULT_SETTINGS.graphics).toBe("medium");
    expect(DEFAULT_SETTINGS.fullscreen).toBe(true);
    expect(migrate({})).toEqual(DEFAULT_SETTINGS);
  });

  it("move settings saved before round 3 onto Medium and full screen once, dropping the art style", () => {
    const s = migrate({ graphics: "auto", fullscreen: false, artStyle: "cartoon", music: 0.3 });
    expect(s.graphics).toBe("medium");
    expect(s.fullscreen).toBe(true);
    expect(s.music).toBe(0.3);
    expect("artStyle" in s).toBe(false);
  });

  it("keep choices made since then", () => {
    const s = migrate({ v: 2, graphics: "low", fullscreen: false });
    expect(s.graphics).toBe("low");
    expect(s.fullscreen).toBe(false);
    expect("v" in s).toBe(false);
  });
});
