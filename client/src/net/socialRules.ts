// Plain rules for the friends and leaderboard panels (no network), so they're easy to test.

export interface Row {
  userId: string;
  username: string;
  value: number;
  rank: number;
  you: boolean;
}

export interface Friendship {
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
  /** The other bear. */
  otherId: string;
  otherName: string;
  /** Who sent it, from our side. */
  direction: "incoming" | "outgoing";
}

/** Rank rows by value, highest first; ties share a rank (1, 2, 2, 4). Bears with 0 are left off. */
export function rankRows(rows: { userId: string; username: string; value: number }[], me: string | null): Row[] {
  const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.username.localeCompare(b.username));
  let rank = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.value !== sorted[i - 1]!.value) rank = i + 1;
    return { ...r, rank, you: r.userId === me };
  });
}

/** Sort friendships into incoming requests, sent requests and friends, from `me`'s side. */
export function sortFriendships(list: Friendship[]) {
  return {
    incoming: list.filter((f) => f.status === "pending" && f.direction === "incoming"),
    outgoing: list.filter((f) => f.status === "pending" && f.direction === "outgoing"),
    friends: list.filter((f) => f.status === "accepted").sort((a, b) => a.otherName.localeCompare(b.otherName)),
  };
}
