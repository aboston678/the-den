// Usernames (GAME_SPEC §14): picked on first sign-in, shown as your name tag. 3–16 letters,
// numbers or underscores, unique ignoring case (the database checks that part too).

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

/** What's wrong with a username, in plain words, or null if it's fine. */
export function usernameProblem(input: string): string | null {
  const name = input.trim();
  if (name.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(name)) return "Letters, numbers and _ only (no spaces).";
  return null;
}
