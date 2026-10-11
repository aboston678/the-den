import { describe, expect, it } from "vitest";
import { DEFAULT_NICKNAME, NICKNAME_MAX_LENGTH } from "./constants.ts";
import { sanitizeNickname } from "./nickname.ts";

describe("sanitizeNickname", () => {
  it("keeps normal names", () => {
    expect(sanitizeNickname("Andrew")).toBe("Andrew");
  });

  it("trims and collapses spaces", () => {
    expect(sanitizeNickname("  Big   Bear  ")).toBe("Big Bear");
  });

  it("caps the length", () => {
    expect(sanitizeNickname("x".repeat(40))).toHaveLength(NICKNAME_MAX_LENGTH);
  });

  it("falls back for empty or non-string input", () => {
    expect(sanitizeNickname("   ")).toBe(DEFAULT_NICKNAME);
    expect(sanitizeNickname(undefined)).toBe(DEFAULT_NICKNAME);
    expect(sanitizeNickname(42)).toBe(DEFAULT_NICKNAME);
  });

  it("strips control characters", () => {
    expect(sanitizeNickname("Be\u0000ar​")).toBe("Bear");
  });
});
