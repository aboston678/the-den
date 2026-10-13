import { afterEach, describe, expect, it } from "vitest";
import { recordCatch } from "./stats.ts";

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
