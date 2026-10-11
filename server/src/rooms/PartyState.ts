import { schema, t, type SchemaType } from "@colyseus/schema";

// Everything here is synced to every client in the party automatically.
// Milestone 1.7 adds pose, animation and flags to Player.

export const Player = schema(
  {
    name: t.string(),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const PartyState = schema(
  {
    phase: t.string().default("lobby"), // "lobby" | "playing"
    code: t.string(),
    hostId: t.string(),
    players: t.map(Player),
  },
  "PartyState",
);
export type PartyState = SchemaType<typeof PartyState>;
