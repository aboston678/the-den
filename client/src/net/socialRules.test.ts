import { describe, expect, it } from "vitest";
import { type Friendship, rankRows, sortFriendships } from "./socialRules.ts";

describe("leaderboard ranks", () => {
  it("highest first, ties share a rank, zeros left off, you marked", () => {
    const rows = rankRows([
      { userId: "a", username: "Alpha", value: 5 }, { userId: "b", username: "Bravo", value: 9 }, { userId: "c", username: "Charlie", value: 5 },
      { userId: "d", username: "Delta", value: 0 }, { userId: "e", username: "Echo", value: 2 },
    ], "c");
    expect(rows.map((r) => [r.username, r.rank, r.you])).toEqual([["Bravo", 1, false], ["Alpha", 2, false], ["Charlie", 2, true], ["Echo", 4, false]]);
  });
});

describe("friends list", () => {
  it("splits requests you got, requests you sent, and friends (by name)", () => {
    const f = (otherName: string, status: "pending" | "accepted", direction: "incoming" | "outgoing"): Friendship =>
      ({ requester: "x", addressee: "y", status, otherId: otherName, otherName, direction });
    const s = sortFriendships([f("Zed", "accepted", "incoming"), f("Amy", "accepted", "outgoing"), f("Bo", "pending", "incoming"), f("Cy", "pending", "outgoing")]);
    expect(s.friends.map((x) => x.otherName)).toEqual(["Amy", "Zed"]);
    expect(s.incoming.map((x) => x.otherName)).toEqual(["Bo"]);
    expect(s.outgoing.map((x) => x.otherName)).toEqual(["Cy"]);
  });
});
