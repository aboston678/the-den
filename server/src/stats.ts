import { supabase, supabaseReady } from "./auth.ts";

// Saving stats (GAME_SPEC §14): only the game server writes them, with its secret key.

/** Save a landed fish: +1 fish caught, and whether it's this bear's heaviest of that species ever. Null if it couldn't be saved. */
export async function recordCatch(userId: string, species: string, weight: number, call = supabase): Promise<{ best: boolean; total: number } | null> {
  if (!supabaseReady()) return null;
  const res = await call("/rest/v1/rpc/record_catch", { method: "POST", body: JSON.stringify({ p_user: userId, p_species: species, p_weight: weight }) });
  if (!res.ok) {
    console.warn(`[den] couldn't save a catch: ${res.status} ${await res.text()}`);
    return null;
  }
  const rows = (await res.json()) as { best: boolean; total: number }[];
  return rows[0] ?? null;
}

/**
 * Save a finished game of bowling (GAME_SPEC §15): the game itself, and the bear's bowling high
 * score if this beats it. Uses the tables directly (the server's key may write them). Null if it
 * couldn't be saved.
 */
export async function recordBowlingGame(userId: string, score: number, call = supabase): Promise<{ best: boolean; high: number } | null> {
  if (!supabaseReady()) return null;
  const user = encodeURIComponent(userId);
  const fail = async (what: string, res: Response) => {
    console.warn(`[den] couldn't save a bowling game (${what}): ${res.status} ${await res.text()}`);
    return null;
  };
  const game = await call("/rest/v1/bowling_games", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: userId, score }) });
  if (!game.ok) return fail("game", game);
  const got = await call(`/rest/v1/stats?user_id=eq.${user}&select=bowling_high_score`);
  if (!got.ok) return fail("stats", got);
  const rows = (await got.json()) as { bowling_high_score: number }[];
  const old = rows[0]?.bowling_high_score ?? 0;
  if (score <= old) return { best: false, high: old };
  const save = rows.length
    ? await call(`/rest/v1/stats?user_id=eq.${user}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ bowling_high_score: score, updated_at: new Date().toISOString() }) })
    : await call("/rest/v1/stats", { method: "POST", headers: { Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify({ user_id: userId, bowling_high_score: score }) });
  if (!save.ok) return fail("high score", save);
  return { best: true, high: score };
}
