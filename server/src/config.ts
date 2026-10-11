import { DEFAULT_SERVER_PORT } from "@den/shared";

export const PORT = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

/** Websites allowed to talk to this server (comma-separated in ALLOWED_ORIGINS). */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
