import { afterEach, describe, expect, it } from "vitest";
import { recordBowlingGame, recordCatanGame, recordCatch } from "./stats.ts";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("saving catches", () => {
  it("calls record_catch for the bear and reports a personal best", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
    let sent: unknown = null;
    const call = (async (path: string, init?: RequestInit) => {
      sent = { path, body: JSON.parse(String(init?.body)) };
      return Response.json([{ best: true, total: 7 }]);
    }) as typeof import("./auth.ts").supabase;
    expect(await recordCatch("user-1", "perch", 1.25, call)).toEqual({ best: true, total: 7 });
    expect(sent).toEqual({ path: "/rest/v1/rpc/record_catch", body: { p_user: "user-1", p_species: "perch", p_weight: 1.25 } });
  });

  it("does nothing without the server's keys, and survives a failed save", async () => {
    delete process.env.SUPABASE_URL;
    expect(await recordCatch("user-1", "perch", 1)).toBeNull();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
    const failing = (async () => new Response("nope", { status: 500 })) as typeof import("./auth.ts").supabase;
    expect(await recordCatch("user-1", "perch", 1, failing)).toBeNull();
  });
});

describe("saving bowling games", () => {
  const keys = () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
  };
  /** A fake database: the bear's stats row (or none), recording every call. */
  function fakeDb(high: number | null) {
    const calls: { path: string; method: string; body: unknown }[] = [];
    const call = (async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path.startsWith("/rest/v1/stats?") && !init?.method) return Response.json(high === null ? [] : [{ bowling_high_score: high }]);
      return new Response(null, { status: 201 });
    }) as typeof import("./auth.ts").supabase;
    return { calls, call };
  }

  it("saves the game and raises the high score when it's beaten", async () => {
    keys();
    const db = fakeDb(150);
    expect(await recordBowlingGame("user-1", 187, db.call)).toEqual({ best: true, high: 187 });
    expect(db.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /rest/v1/bowling_games", "GET /rest/v1/stats?user_id=eq.user-1&select=bowling_high_score", "PATCH /rest/v1/stats?user_id=eq.user-1",
    ]);
    expect(db.calls[0]!.body).toEqual({ user_id: "user-1", score: 187 });
    expect((db.calls[2]!.body as { bowling_high_score: number }).bowling_high_score).toBe(187);
  });

  it("keeps the old high score when it isn't beaten, and makes a stats row for a first game", async () => {
    keys();
    const lower = fakeDb(200);
    expect(await recordBowlingGame("user-1", 120, lower.call)).toEqual({ best: false, high: 200 });
    expect(lower.calls).toHaveLength(2);
    const first = fakeDb(null);
    expect(await recordBowlingGame("user-2", 95, first.call)).toEqual({ best: true, high: 95 });
    expect(first.calls[2]).toMatchObject({ method: "POST", path: "/rest/v1/stats", body: { user_id: "user-2", bowling_high_score: 95 } });
  });

  it("does nothing without keys, and survives a failed save", async () => {
    delete process.env.SUPABASE_URL;
    expect(await recordBowlingGame("user-1", 100)).toBeNull();
    keys();
    const failing = (async () => new Response("nope", { status: 500 })) as typeof import("./auth.ts").supabase;
    expect(await recordBowlingGame("user-1", 100, failing)).toBeNull();
  });
});

describe("saving catan games", () => {
  it("saves the game and gives the winner +1 win", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
    const calls: { path: string; method: string; body: unknown }[] = [];
    const call = (async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path.startsWith("/rest/v1/stats?") && !init?.method) return Response.json([{ catan_wins: 2 }]);
      return new Response(null, { status: 201 });
    }) as typeof import("./auth.ts").supabase;
    expect(await recordCatanGame("user-1", ["user-1", "user-2"], call)).toEqual({ wins: 3 });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /rest/v1/catan_games", "GET /rest/v1/stats?user_id=eq.user-1&select=catan_wins", "PATCH /rest/v1/stats?user_id=eq.user-1",
    ]);
    expect(calls[0]!.body).toEqual({ winner: "user-1", players: ["user-1", "user-2"] });
    expect((calls[2]!.body as { catan_wins: number }).catan_wins).toBe(3);
  });

  it("a winner who isn't signed in still gets the game saved for the others", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
    const paths: string[] = [];
    const call = (async (path: string) => {
      paths.push(path);
      return new Response(null, { status: 201 });
    }) as typeof import("./auth.ts").supabase;
    expect(await recordCatanGame(null, ["user-2"], call)).toEqual({ wins: 0 });
    expect(paths).toEqual(["/rest/v1/catan_games"]);
    expect(await recordCatanGame(null, [], call)).toBeNull();
  });
});
