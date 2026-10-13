import { afterEach, describe, expect, it } from "vitest";
import { authenticate } from "./auth.ts";

// GAME_SPEC §14: the server checks a joining player's Supabase sign-in and uses their username.

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

/** A pretend Supabase: one valid token belonging to a user with (or without) a username. */
function fakeSupabase(username: string | null) {
  return (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (url.endsWith("/auth/v1/user")) {
      return headers.Authorization === "Bearer good-token" ? Response.json({ id: "user-1" }) : new Response("bad", { status: 401 });
    }
    if (url.includes("/rest/v1/profiles?id=eq.user-1")) return Response.json(username ? [{ username }] : []);
    return new Response("?", { status: 404 });
  }) as typeof fetch;
}

describe("joining a party", () => {
  it("a signed-in player joins under their username", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
    expect(await authenticate({ token: "good-token" }, fakeSupabase("BigBear"))).toEqual({ userId: "user-1", username: "BigBear" });
  });

  it("refuses a bad token, or an account with no username yet", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
    await expect(authenticate({ token: "stolen" }, fakeSupabase("BigBear"))).rejects.toThrow(/sign in again/);
    await expect(authenticate({ token: "good-token" }, fakeSupabase(null))).rejects.toThrow(/sign in again/);
  });

  it("development lets you join with just a name; production doesn't", async () => {
    process.env.NODE_ENV = "development";
    expect(await authenticate({ name: "Tester" })).toEqual({ userId: null, username: "Tester" });
    process.env.NODE_ENV = "production";
    await expect(authenticate({ name: "Tester" })).rejects.toThrow(/sign in to play/);
  });
});
