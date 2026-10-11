// Keyboard state for the game. Held keys for movement, plus one-shot presses (Y, B, Space).
// Uses KeyboardEvent.code so it works on any keyboard layout.

const held = new Set<string>();
const presses = new Set<string>();

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
}

export function attachKeyboard(target: Window = window) {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    if (!e.repeat) presses.add(e.code);
    held.add(e.code);
    if (e.code === "Space") e.preventDefault(); // don't scroll the page
  };
  const up = (e: KeyboardEvent) => held.delete(e.code);
  const blur = () => held.clear();
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  target.addEventListener("blur", blur);
  return () => {
    target.removeEventListener("keydown", down);
    target.removeEventListener("keyup", up);
    target.removeEventListener("blur", blur);
  };
}

export const isHeld = (code: string) => held.has(code);

/** True once per key press; call once per frame per key. */
export function consumePress(code: string) {
  return presses.delete(code);
}

/** Forget presses nobody consumed this frame (e.g. Y while roar is on cooldown). */
export function clearPresses() {
  presses.clear();
}
