import { DEFAULT_SERVER_PORT } from "@den/shared";

// GAME_PORT wins so local tools that set PORT for the website (e.g. preview launchers) can't
// move the game server; hosting (Railway) sets PORT.
export const PORT = Number(process.env.GAME_PORT ?? process.env.PORT ?? DEFAULT_SERVER_PORT);

/** Websites allowed to talk to this server (comma-separated in ALLOWED_ORIGINS). */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** The game's website on Vercel, including its preview copies (the-den-git-main-….vercel.app). */
const VERCEL_SITE = /^https:\/\/the-den(-[a-z0-9-]+)?\.vercel\.app$/;

export const isAllowedOrigin = (origin: string, list: string[] = ALLOWED_ORIGINS) => list.includes(origin) || VERCEL_SITE.test(origin);

/** Dev-only helpers (jumping the day/night clock) are switched off in production. */
export const devToolsOn = () => process.env.NODE_ENV !== "production";
