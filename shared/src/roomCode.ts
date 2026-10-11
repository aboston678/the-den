// Party codes: 5 characters, letters A–Z without I and O, digits 2–9 (GAME_SPEC §7).
// Leaving out I/O/0/1 means nobody mixes up look-alike characters when reading a code aloud.

export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const VALID_CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Make a new random party code. Pass `random` to make it predictable in tests. */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Clean up what a player typed: uppercase, drop spaces and dashes. */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidRoomCode(code: string): boolean {
  return VALID_CODE.test(code);
}
