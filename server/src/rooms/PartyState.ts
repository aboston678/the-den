import { schema, t, type SchemaType } from "@colyseus/schema";

// Everything here is synced to every client in the party automatically (GAME_SPEC §7).

export const Player = schema(
  {
    name: t.string(),
    slot: t.uint8(), // 0–5: line-up position on the home screen and at spawn
    connected: t.boolean().default(true), // false while inside the 30 s reconnect window
    // Pose, sent by the bear's own client at 20 Hz (server-clamped).
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    yaw: t.float32(),
    speed: t.float32(),
    action: t.string().default("locomotion"),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const PartyState = schema(
  {
    phase: t.string().default("lobby"), // "lobby" | "playing"
    code: t.string(),
    hostId: t.string(),
    world: t.string().default("property"), // "property" | "test" (the 1.6 test field, for dev and tests)
    players: t.map(Player),
  },
  "PartyState",
);
export type PartyState = SchemaType<typeof PartyState>;
