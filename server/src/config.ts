import { DEFAULT_SERVER_PORT } from "@den/shared";

// GAME_PORT wins so local tools that set PORT for the website (e.g. preview launchers) can't
// move the game server; hosting (Railway) sets PORT.
export const PORT = Number(process.env.GAME_PORT ?? process.env.PORT ?? DEFAULT_SERVER_PORT);

/** Websites allowed to talk to this server (comma-separated in ALLOWED_ORIGINS). */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
