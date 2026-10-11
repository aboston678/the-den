import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PARTY_ROOM } from "@den/shared";
import { PartyRoom } from "./rooms/PartyRoom.ts";

/** Build the game server (rooms, routes, CORS) without starting it. */
export function createGameServer(allowedOrigins: string[]) {
  // Only answer matchmaking requests from our own website(s). Colyseus defaults to "*" for
  // unknown origins, so always override it: other sites get our first origin back and the
  // browser blocks them.
  matchMaker.controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
    const origin = headers.get("origin");
    const allowed = origin && allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? "null");
    return { "Access-Control-Allow-Origin": allowed, Vary: "Origin" };
  };

  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    express: (app) => {
      app.get("/health", (_req, res) => {
        res.json({ ok: true });
      });
    },
  });
  server.define(PARTY_ROOM, PartyRoom);
  return server;
}
