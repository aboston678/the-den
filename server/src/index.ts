import { createGameServer } from "./app.ts";
import { ALLOWED_ORIGINS, PORT } from "./config.ts";

const server = createGameServer(ALLOWED_ORIGINS);
await server.listen(PORT);
console.log(`[den] game server listening on :${PORT} (allowed origins: ${ALLOWED_ORIGINS.join(", ")})`);
