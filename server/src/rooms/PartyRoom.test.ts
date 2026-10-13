import { Client, type Room } from "@colyseus/sdk";
import { MAX_PLAYERS, MSG, PARTY_ROOM, START_TIME, TIME_PRESETS, doorById, isValidRoomCode, spawnPoint } from "@den/shared";
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

  it("starts bears on the property's driveway, or on the test field when asked", async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Alpha" }));
    a.send(MSG.start);
    await until(() => a.state.phase === "playing");
    const spot = spawnPoint(0);
    expect(a.state.world).toBe("property");
    const me = a.state.players.get(a.sessionId);
    for (const k of ["x", "y", "z"] as const) expect(me[k]).toBeCloseTo(spot[k], 3);

    const b = track(await client().create(PARTY_ROOM, { name: "Bravo", world: "test" }));
    b.send(MSG.start);
    await until(() => b.state.phase === "playing");
    expect(b.state.world).toBe("test");
    expect(b.state.players.get(b.sessionId).z).toBe(spawnPoint(0, "test").z);

    const c = track(await client().create(PARTY_ROOM, { name: "Charlie", world: "moon" }));
    await until(() => c.state.code !== undefined && c.state.code !== "");
    expect(c.state.world).toBe("property"); // unknown worlds are ignored
  });

  it("opens and closes doors for everyone, only for bears next to them, never locked ones", async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Alpha" }));
    const b = track(await client().joinById(a.roomId, { name: "Bravo" }));
    a.send(MSG.start);
    await until(() => b.state.phase === "playing" && b.state.doors.size > 0);
    const front = doorById("main:foyer-porch")!;
    // From the spawn (far away): nothing happens.
    a.send(MSG.door, { id: front.id });
    await new Promise((r) => setTimeout(r, 150));
    expect(b.state.doors.get(front.id)).toBe(false);
    // Walk up to it (server clamps speed, so step there over a few poses), then open it.
    const me = () => a.state.players.get(a.sessionId);
    for (let i = 0; i < 400 && Math.hypot(me().x - front.world.x, me().z - (front.world.z - 1)) > 0.5; i++) {
      a.send(MSG.pose, { x: front.world.x, y: 0, z: front.world.z - 1, yaw: 0, speed: 6, action: "locomotion" });
      await new Promise((r) => setTimeout(r, 10));
    }
    a.send(MSG.door, { id: front.id });
    await until(() => b.state.doors.get(front.id) === true);
    a.send(MSG.door, { id: front.id });
    await until(() => b.state.doors.get(front.id) === false);
    // The utility room is locked.
    expect(b.state.doors.has("basement:den-utility")).toBe(false);
  }, 15_000);

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

  it("runs one day/night clock per party, starting mid-morning and ticking every second", async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Alpha" }));
    const b = track(await client().joinById(a.roomId, { name: "Bravo" }));
    await until(() => b.state.clock > 0);
    expect(a.state.clock).toBeGreaterThanOrEqual(START_TIME);
    expect(a.state.clock).toBeLessThan(START_TIME + 2);
    const before = b.state.clock;
    await until(() => b.state.clock > before, 2500);
    expect(b.state.clock - before).toBeCloseTo(1, 3);
  });

  it("dev tools can set the time (?time=dusk); production refuses players who aren't signed in", async () => {
    const a = track(await client().create(PARTY_ROOM, { name: "Alpha", time: "dusk" }));
    await until(() => a.state.clock > 0);
    expect(a.state.clock).toBeGreaterThanOrEqual(TIME_PRESETS.dusk);
    a.send(MSG.devTime, { time: "night" });
    await until(() => a.state.clock >= TIME_PRESETS.night && a.state.clock < TIME_PRESETS.night + 2);

    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      // In production only signed-in players can join (GAME_SPEC §14), and dev time jumps are ignored.
      await expect(client().create(PARTY_ROOM, { name: "Charlie", time: "dusk" })).rejects.toThrow(/sign in/);
      a.send(MSG.devTime, { time: "dusk" });
      await new Promise((r) => setTimeout(r, 150));
      expect(a.state.clock).toBeGreaterThanOrEqual(TIME_PRESETS.night);
    } finally {
      process.env.NODE_ENV = env;
    }
  });
});
