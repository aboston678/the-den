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

/**
 * Save a finished game of Catan (GAME_SPEC §16): the game (winner + signed-in players), and +1
 * Catan win for a signed-in winner. Null if it couldn't be saved.
 */
/**
 * Save a finished game of Connect Four (Andrew, 2026-10-16): the game, and +1 Connect Four win for a
 * signed-in winner. Null if it couldn't be saved (or before the database has the c4 columns).
 */
export async function recordC4Game(winnerId: string | null, playerIds: string[], call = supabase): Promise<{ wins: number } | null> {
  if (!supabaseReady() || playerIds.length === 0) return null;
  const fail = async (what: string, res: Response) => {
    console.warn(`[den] couldn't save a Connect Four game (${what}): ${res.status} ${await res.text()}`);
    return null;
  };
  const game = await call("/rest/v1/c4_games", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ winner: winnerId, players: playerIds }) });
  if (!game.ok) return fail("game", game);
  if (!winnerId) return { wins: 0 };
  const user = encodeURIComponent(winnerId);
  const got = await call(`/rest/v1/stats?user_id=eq.${user}&select=c4_wins`);
  if (!got.ok) return fail("stats", got);
  const rows = (await got.json()) as { c4_wins: number }[];
  const wins = (rows[0]?.c4_wins ?? 0) + 1;
  const save = rows.length
    ? await call(`/rest/v1/stats?user_id=eq.${user}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ c4_wins: wins, updated_at: new Date().toISOString() }) })
    : await call("/rest/v1/stats", { method: "POST", headers: { Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify({ user_id: winnerId, c4_wins: wins }) });
  if (!save.ok) return fail("wins", save);
  return { wins };
}

export async function recordCatanGame(winnerId: string | null, playerIds: string[], call = supabase): Promise<{ wins: number } | null> {
  if (!supabaseReady() || playerIds.length === 0) return null;
  const fail = async (what: string, res: Response) => {
    console.warn(`[den] couldn't save a Catan game (${what}): ${res.status} ${await res.text()}`);
    return null;
  };
  const game = await call("/rest/v1/catan_games", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ winner: winnerId, players: playerIds }) });
  if (!game.ok) return fail("game", game);
  if (!winnerId) return { wins: 0 };
  const user = encodeURIComponent(winnerId);
  const got = await call(`/rest/v1/stats?user_id=eq.${user}&select=catan_wins`);
  if (!got.ok) return fail("stats", got);
  const rows = (await got.json()) as { catan_wins: number }[];
  const wins = (rows[0]?.catan_wins ?? 0) + 1;
  const save = rows.length
    ? await call(`/rest/v1/stats?user_id=eq.${user}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ catan_wins: wins, updated_at: new Date().toISOString() }) })
    : await call("/rest/v1/stats", { method: "POST", headers: { Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify({ user_id: winnerId, catan_wins: wins }) });
  if (!save.ok) return fail("wins", save);
  return { wins };
}

/**
 * Save a finished bear hunt (Andrew, 2026-10-17) in one step (`record_hunt`): the hunt, the bear's
 * points added to its total, +1 takedown for the hunter who landed the final hit. False if it couldn't
 * be saved (or before the database script has been run).
 */
export async function recordHunt(
  h: { bear: string | null; points: number; seconds: number; how: string; takenBy: string | null; players: string[] },
  call = supabase,
): Promise<boolean> {
  if (!supabaseReady() || h.players.length === 0) return false;
  const res = await call("/rest/v1/rpc/record_hunt", {
    method: "POST",
    body: JSON.stringify({ p_bear: h.bear, p_points: h.points, p_seconds: Math.round(h.seconds), p_how: h.how, p_taken_by: h.takenBy, p_players: h.players }),
  });
  if (!res.ok) {
    console.warn(`[den] couldn't save a bear hunt: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}
