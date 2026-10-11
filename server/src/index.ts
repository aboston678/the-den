import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PARTY_ROOM } from "@den/shared";
import { ALLOWED_ORIGINS, PORT } from "./config.ts";
import { PartyRoom } from "./rooms/PartyRoom.ts";

// Only answer matchmaking requests from our own website(s). Colyseus defaults to "*" for
// unknown origins, so always override it: other sites get our first origin back and the
// browser blocks them.
matchMaker.controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
  const origin = headers.get("origin");
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? "null");
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

await server.listen(PORT);
console.log(`[den] game server listening on :${PORT} (allowed origins: ${ALLOWED_ORIGINS.join(", ")})`);
