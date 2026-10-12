import { describe, expect, it } from "vitest";
import song from "./song.json" with { type: "json" };
import { LOGO_AT, LYRICS, cueAt, cueOpacity } from "./lyrics.ts";

describe("intro lyrics", () => {
  it("three lines in order, before the logo, all inside the clip", () => {
    expect(LYRICS.map((c) => c.text.split(" ")[0])).toEqual(["There", "and", "on"]);
    for (let i = 1; i < LYRICS.length; i++) expect(LYRICS[i]!.from).toBeGreaterThan(LYRICS[i - 1]!.to);
    expect(LYRICS.at(-1)!.to).toBeLessThan(LOGO_AT);
    expect(LOGO_AT).toBeLessThan(song.introLength - 3);
  });

  it("shows the right line at the right time, fading in and out", () => {
    expect(cueAt(2)?.text).toMatch(/^There is a bear/);
    expect(cueAt(6.5)?.text).toBe("and he does not have a coat");
    expect(cueAt(12)?.text).toBe("on purpose");
    expect(cueAt(9.5)).toBeNull();
    const c = LYRICS[1]!;
    expect(cueOpacity(c, c.from)).toBe(0);
    expect(cueOpacity(c, (c.from + c.to) / 2)).toBe(1);
    expect(cueOpacity(c, c.to + 0.1)).toBe(0);
  });

  it("the full song picks up just after the clip ends (the song starts ~0.15 s later than the clip)", () => {
    expect(song.introLength).toBeCloseTo(18.6, 1);
    expect(song.songResumeAt - song.introLength).toBeGreaterThan(0);
    expect(song.songResumeAt - song.introLength).toBeLessThan(0.5);
  });
});
