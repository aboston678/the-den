import { supabase, useAuth } from "./auth.ts";
import { type Friendship, type Row, rankRows } from "./socialRules.ts";

export { type Friendship, type Row, sortFriendships } from "./socialRules.ts";

// Friends and the leaderboard (GAME_SPEC §14), straight from Supabase with the player's own
// sign-in: the database's row rules decide what each player may see and change. Stats are
// written only by the game server.

export type Board = "fish" | "bowling" | "catan";
export const BOARDS: { id: Board; label: string; column: string; unit: string; soon?: string }[] = [
  { id: "fish", label: "Fish caught", column: "fish_caught", unit: "fish" },
  { id: "bowling", label: "Bowling", column: "bowling_high_score", unit: "best game", soon: "Bowling opens in Phase 3" },
  { id: "catan", label: "Catan", column: "catan_wins", unit: "wins", soon: "Catan opens in Phase 4" },
];

// --- development preview (?mocksocial in a dev build): made-up bears, so the panels can be looked at without signing in ---
export const mockSocial = import.meta.env.DEV && new URLSearchParams(location.search).has("mocksocial");
const MOCK_FRIENDS: Friendship[] = [
  { requester: "m1", addressee: "me", status: "accepted", otherId: "m1", otherName: "RaptorFan", direction: "incoming" },
  { requester: "me", addressee: "m2", status: "accepted", otherId: "m2", otherName: "LunaLover", direction: "outgoing" },
  { requester: "m3", addressee: "me", status: "pending", otherId: "m3", otherName: "BassMaster", direction: "incoming" },
  { requester: "me", addressee: "m4", status: "pending", otherId: "m4", otherName: "Sleepy_Bear", direction: "outgoing" },
];
const MOCK_STATS = [
  { userId: "m3", username: "BassMaster", value: 41 }, { userId: "me", username: "DevBear", value: 17 }, { userId: "m1", username: "RaptorFan", value: 17 },
  { userId: "m5", username: "Hemlock", value: 9 }, { userId: "m2", username: "LunaLover", value: 3 },
];

const myId = () => (mockSocial ? "me" : useAuth.getState().userId);

/** The leaderboard for one board, all players or just you and your friends. */
export async function leaderboard(board: Board, scope: "all" | "friends"): Promise<Row[]> {
  const me = myId();
  if (mockSocial) {
    const friendIds = new Set(["me", ...MOCK_FRIENDS.filter((f) => f.status === "accepted").map((f) => f.otherId)]);
    return rankRows(board === "fish" ? MOCK_STATS.filter((r) => scope === "all" || friendIds.has(r.userId)) : [], me);
  }
  if (!supabase || !me) return [];
  const column = BOARDS.find((b) => b.id === board)!.column;
  let q = supabase.from("stats").select(`user_id, ${column}, profiles(username)`).gt(column, 0).order(column, { ascending: false }).limit(50);
  if (scope === "friends") q = q.in("user_id", [me, ...(await friendships()).filter((f) => f.status === "accepted").map((f) => f.otherId)]);
  const { data } = await q;
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    username: (r.profiles as { username?: string } | null)?.username ?? "?",
    value: Number(r[column] ?? 0),
  }));
  return rankRows(rows, me);
}

/** Every friendship and request involving you. */
export async function friendships(): Promise<Friendship[]> {
  if (mockSocial) return MOCK_FRIENDS;
  const me = myId();
  if (!supabase || !me) return [];
  const { data } = await supabase
    .from("friendships")
    .select("requester, addressee, status, from:profiles!friendships_requester_fkey(username), to:profiles!friendships_addressee_fkey(username)");
  return ((data ?? []) as unknown as { requester: string; addressee: string; status: "pending" | "accepted"; from: { username: string } | null; to: { username: string } | null }[]).map((f) => {
    const incoming = f.addressee === me;
    return {
      requester: f.requester, addressee: f.addressee, status: f.status,
      otherId: incoming ? f.requester : f.addressee,
      otherName: (incoming ? f.from?.username : f.to?.username) ?? "?",
      direction: incoming ? "incoming" : "outgoing",
    };
  });
}

/** Bears whose username starts with `text` (not you). */
export async function searchBears(text: string): Promise<{ id: string; username: string }[]> {
  const q = text.trim();
  if (q.length < 2) return [];
  if (mockSocial) return [{ id: "m5", username: "Hemlock" }, { id: "m6", username: "HoneyPaws" }].filter((b) => b.username.toLowerCase().startsWith(q.toLowerCase()));
  const me = myId();
  if (!supabase || !me) return [];
  const { data } = await supabase.from("profiles").select("id, username").ilike("username", `${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`).neq("id", me).limit(8);
  return (data ?? []) as { id: string; username: string }[];
}

/** Ask a bear to be friends (or, if they already asked you, accept). Returns an error to show, or null. */
export async function addFriend(otherId: string): Promise<string | null> {
  if (mockSocial) return null;
  const me = myId();
  if (!supabase || !me) return "Sign in first.";
  const theirs = (await friendships()).find((f) => f.otherId === otherId);
  if (theirs?.status === "accepted") return "You're already friends.";
  if (theirs?.direction === "incoming") return accept(otherId);
  if (theirs) return "Request already sent.";
  const { error } = await supabase.from("friendships").insert({ requester: me, addressee: otherId });
  return error ? "Couldn't send that request. Try again." : null;
}

/** Accept a request someone sent you. */
export async function accept(requesterId: string): Promise<string | null> {
  if (mockSocial) return null;
  const me = myId();
  if (!supabase || !me) return "Sign in first.";
  const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("requester", requesterId).eq("addressee", me);
  return error ? "Couldn't accept that. Try again." : null;
}

/** Decline a request, cancel one you sent, or unfriend. */
export async function removeFriendship(f: Friendship): Promise<string | null> {
  if (mockSocial || !supabase) return null;
  const { error } = await supabase.from("friendships").delete().eq("requester", f.requester).eq("addressee", f.addressee);
  return error ? "Couldn't do that. Try again." : null;
}
