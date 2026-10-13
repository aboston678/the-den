import { describe, expect, it } from "vitest";
import { usernameProblem } from "./username.ts";

describe("usernames", () => {
  it("accepts 3–16 letters, numbers and underscores", () => {
    for (const ok of ["Bob", "big_bear_42", "ABCDEFGHIJKLMNOP"]) expect(usernameProblem(ok)).toBeNull();
  });
  it("explains what's wrong", () => {
    expect(usernameProblem("ab")).toMatch(/At least 3/);
    expect(usernameProblem("a".repeat(17))).toMatch(/At most 16/);
    expect(usernameProblem("big bear")).toMatch(/no spaces/);
    expect(usernameProblem("bear!")).toMatch(/Letters, numbers/);
  });
});
