import { Client, type Room } from "@colyseus/sdk";
import { MAX_PLAYERS, MSG, PARTY_ROOM, isValidRoomCode } from "@den/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "../app.ts";

// Runs a real game server and connects real SDK clients to it.
const PORT = 2599;
const server = createGameServer(["http://localhost:5173"]);
const client = () => new Client(`http://localhost:${PORT}`);
const rooms: Room[] = [];
const track = (r: Room) => (rooms.push(r), r);
const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  const ok = () => { try { return check(); } catch { return false; } }; // state may not have arrived yet
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
};

beforeAll(async () => {
  await server.listen(PORT);
});
afterAll(async () => {
  // Skip rooms a test already left: leaving twice never resolves.
  await Promise.all(rooms.filter((r) => r.connection.isOpen).map((r) => r.leave().catch(() => {})));
  await server.gracefullyShutdown(false);
});

describe("party room", () => {
  it("create gives a valid party code and makes you host", async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Alpha" }));
    await until(() => a.state.code !== undefined && a.state.code !== "");
    expect(isValidRoomCode(a.roomId)).toBe(true);
    expect(a.state.code).toBe(a.roomId);
    expect(a.state.hostId).toBe(a.sessionId);
    expect(a.state.phase).toBe("lobby");
  });

  it("friends join with the code and get their own slot", async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Alpha" }));
    const b = track(await client().joinById(a.roomId, { name: "  Bravo  " }));
    await until(() => a.state.players.size === 2);
    expect(b.state.players.get(b.sessionId).name).toBe("Bravo");
    const slots = [...a.state.players.values()].map((p: { slot: number }) => p.slot);
    expect(new Set(slots).size).toBe(2);
  });

  it("a wrong code fails", async () => {
    await expect(client().joinById("ZZZZZ", { name: "Lost" })).rejects.toThrow();
  });

  it(`holds at most ${MAX_PLAYERS} bears`, async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Bear 1" }));
    for (let i = 2; i <= MAX_PLAYERS; i++) track(await client().joinById(a.roomId, { name: `Bear ${i}` }));
    await until(() => a.state.players.size === MAX_PLAYERS);
    await expect(client().joinById(a.roomId, { name: "Bear 7" })).rejects.toThrow();
  });

  it("only the host can start, and the host hands off when leaving", async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Alpha" }));
    const b = track(await client().joinById(a.roomId, { name: "Bravo" }));
    await until(() => b.state.players.size === 2);
    b.send(MSG.start);
    await new Promise((r) => setTimeout(r, 150));
    expect(b.state.phase).toBe("lobby");
    a.send(MSG.start);
    await until(() => b.state.phase === "playing");
    await a.leave();
    await until(() => b.state.hostId === b.sessionId);
  });

  it("clamps impossible movement", async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Alpha" }));
    a.send(MSG.start);
    await until(() => a.state.phase === "playing");
    const me = () => a.state.players.get(a.sessionId);
    const startX = me().x;
    a.send(MSG.pose, { x: startX + 100, y: 0, z: me().z, yaw: 0, speed: 6, action: "locomotion" });
    await until(() => me().x !== startX);
    expect(me().x - startX).toBeLessThan(3);
  });
});
