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
    flashlight: t.boolean().default(false),
    aimYaw: t.float32(),
    aimPitch: t.float32(),
    // Fishing (GAME_SPEC §13), run by the server so everyone sees the same line, bite and fight.
    rod: t.boolean().default(false),
    fishing: t.string().default(""), // FishState: "" | cast | bite | fight | landed | snapped | missed
    lureX: t.float32(),
    lureZ: t.float32(),
    tension: t.float32(),
    line: t.float32(),
    surges: t.uint16(),
    catchSpecies: t.string().default(""),
    catchWeight: t.float32(),
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
    doors: t.map("boolean"), // door id -> open (GAME_SPEC §8.2: every door opens for everyone)
    clock: t.float32(), // seconds into the 68-minute day/night cycle (GAME_SPEC §9); ticks once a second
  },
  "PartyState",
);
export type PartyState = SchemaType<typeof PartyState>;
