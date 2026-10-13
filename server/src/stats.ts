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
