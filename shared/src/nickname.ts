import { DEFAULT_NICKNAME, NICKNAME_MAX_LENGTH } from "./constants.ts";

/** Trim, collapse spaces, strip control characters and cap the length. Never returns an empty name. */
export function sanitizeNickname(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_NICKNAME;
  const cleaned = input
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX_LENGTH)
    .trim();
  return cleaned || DEFAULT_NICKNAME;
}
