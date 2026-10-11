import { describe, expect, it } from "vitest";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from "./roomCode.ts";

describe("room codes", () => {
  it("alphabet has no I, O, 0 or 1", () => {
    for (const ch of "IO01") expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
  });

  it("generates valid 5-character codes", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it("covers both ends of the alphabet", () => {
    expect(generateRoomCode(() => 0)).toBe("AAAAA");
    expect(generateRoomCode(() => 0.9999)).toBe("99999");
  });

  it("normalizes what players type", () => {
    expect(normalizeRoomCode(" ab-c 23 ")).toBe("ABC23");
  });

  it("rejects bad codes", () => {
    expect(isValidRoomCode("ABCD")).toBe(false);
    expect(isValidRoomCode("ABCDEF")).toBe(false);
    expect(isValidRoomCode("ABCDO")).toBe(false);
    expect(isValidRoomCode("ABCD1")).toBe(false);
    expect(isValidRoomCode("abcde")).toBe(false);
  });
});
