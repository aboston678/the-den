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

// Bowling (GAME_SPEC §15): who's on each lane, their balls so far, whose turn. The server owns this.
export const Bowler = schema(
  {
    id: t.string(), // session id
    name: t.string(),
    rolls: t.string().default(""), // pins knocked down by each ball, comma separated ("10,7,3")
  },
  "Bowler",
);
export type Bowler = SchemaType<typeof Bowler>;

export const Lane = schema(
  {
    bowlers: t.array(Bowler),
    turn: t.uint8().default(0), // index into bowlers
    phase: t.string().default("idle"), // idle | aim | rolling | reset | over
    standing: t.uint16().default(0x3ff), // pins up for the next ball (bit 0 = head pin)
  },
  "Lane",
);
export type Lane = SchemaType<typeof Lane>;

// Catan (GAME_SPEC §16): who sits where, and the game as everyone may see it. Hands and development
// cards are never in here; each player gets their own by private message.
export const CatanTable = schema(
  {
    seats: t.array("string"), // 4 chairs, clockwise from the north side: session id or ""
    view: t.string().default(""), // CatanView as JSON ("" before the first game)
    waitingFor: t.string().default(""), // name of a dropped player the game is waiting for
    waitUntil: t.float64().default(0), // when they'll be removed (ms since 1970)
  },
  "CatanTable",
);
export type CatanTable = SchemaType<typeof CatanTable>;

// Connect Four (Andrew, 2026-10-16): who sits in the two chairs, and the game (nothing in it is secret).
export const C4Table = schema(
  {
    seats: t.array("string"), // north and south chairs: session id or ""
    view: t.string().default(""), // C4Game as JSON ("" before the first game)
    waitingFor: t.string().default(""), // name of a dropped player the game is waiting for
    waitUntil: t.float64().default(0), // when they'll be removed (ms since 1970)
  },
  "C4Table",
);
export type C4Table = SchemaType<typeof C4Table>;

export const PartyState = schema(
  {
    phase: t.string().default("lobby"), // "lobby" | "playing"
    code: t.string(),
    hostId: t.string(),
    world: t.string().default("property"), // "property" | "test" (the 1.6 test field, for dev and tests)
    players: t.map(Player),
    doors: t.map("boolean"), // door id -> open (GAME_SPEC §8.2: every door opens for everyone)
    clock: t.float32(), // seconds into the 68-minute day/night cycle (GAME_SPEC §9); ticks once a second
    lanes: t.map(Lane), // "1" and "2" (GAME_SPEC §15)
    catan: CatanTable,
    c4: C4Table,
  },
  "PartyState",
);
export type PartyState = SchemaType<typeof PartyState>;
