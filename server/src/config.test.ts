import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./config.ts";

describe("which websites may use the game server", () => {
  it("our own sites only", () => {
    const list = ["http://localhost:5173"];
    expect(isAllowedOrigin("http://localhost:5173", list)).toBe(true);
    expect(isAllowedOrigin("https://the-den.vercel.app", list)).toBe(true);
    expect(isAllowedOrigin("https://the-den-git-main-aboston678s-projects.vercel.app", list)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", list)).toBe(false);
    expect(isAllowedOrigin("https://the-den.vercel.app.evil.com", list)).toBe(false);
    expect(isAllowedOrigin("http://the-den.vercel.app", list)).toBe(false);
  });
});
