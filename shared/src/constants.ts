// Numbers that both the browser and the game server must agree on.
// Values come from GAME_SPEC.md; change them there first.

/** Max bears in one party (GAME_SPEC §2). */
export const MAX_PLAYERS = 6;

/** How often clients send their pose and the server sends state, per second (GAME_SPEC §3). */
export const NET_TICK_HZ = 20;

/** Seconds a dropped player has to reconnect before they're removed (GAME_SPEC §7). */
export const RECONNECT_WINDOW_S = 30;

/** Colyseus room name for a party. */
export const PARTY_ROOM = "party";

/** Default local port for the game server. */
export const DEFAULT_SERVER_PORT = 2567;

/** The house is built this much bigger than real life (GAME_SPEC §4). */
export const HOUSE_SCALE = 1.25;

/** Bear size and movement (GAME_SPEC §5.3). */
export const BEAR = {
  heightM: 2.1,
  walkSpeed: 1.8,
  sprintSpeed: 6.0,
  jumpApexM: 1.1,
  gravity: 20,
} as const;

/** Nickname box limits until Google sign-in arrives in Phase 2 (GAME_SPEC §2). */
export const NICKNAME_MAX_LENGTH = 16;
export const DEFAULT_NICKNAME = "Bear";
