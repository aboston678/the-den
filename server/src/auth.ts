import { sanitizeNickname } from "@den/shared";
import { devToolsOn } from "./config.ts";

// Who's joining (GAME_SPEC §14): every bear signs in with Google (Supabase). The browser sends its
// Supabase access token when it joins a party; the server asks Supabase whose token it is and
// looks up their username, which becomes the name tag. The user id stays on the server (it's
// needed to save fish caught and other stats). Development and tests can join with just a name.

export interface Bear {
  /** Supabase user id, or null for a development player. */
  userId: string | null;
  username: string;
}

// Read when used (not at start-up), so tests can set them.
const url = () => process.env.SUPABASE_URL ?? "";
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const supabaseReady = () => !!url() && !!key();

/** Calls to Supabase with the server's secret key. */
export async function supabase(path: string, init: RequestInit = {}) {
  return fetch(`${url()}${path}`, {
    ...init,
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

/** The signed-in bear behind an access token, or null if it isn't valid or has no username yet. */
export async function bearFromToken(token: string, fetchFn: typeof fetch = fetch): Promise<Bear | null> {
  if (!supabaseReady() || !token) return null;
  const who = await fetchFn(`${url()}/auth/v1/user`, { headers: { apikey: key(), Authorization: `Bearer ${token}` } });
  if (!who.ok) return null;
  const user = (await who.json()) as { id?: string };
  if (!user.id) return null;
  const res = await fetchFn(`${url()}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=username`, {
    headers: { apikey: key(), Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as { username?: string }[];
  const username = rows[0]?.username;
  return username ? { userId: user.id, username } : null;
}

/**
 * Check a joining player. Signed-in players send { token }; in development a { name } is enough.
 * Throws (refusing the join) for anyone else.
 */
export async function authenticate(options: { token?: unknown; name?: unknown } | undefined, fetchFn: typeof fetch = fetch): Promise<Bear> {
  if (typeof options?.token === "string" && options.token) {
    const bear = await bearFromToken(options.token, fetchFn);
    if (bear) return bear;
    throw new Error("sign-in expired: sign in again");
  }
  if (devToolsOn()) return { userId: null, username: sanitizeNickname(options?.name) };
  throw new Error("sign in to play");
}
