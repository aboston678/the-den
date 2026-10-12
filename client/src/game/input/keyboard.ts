// Keyboard state for the game. Held keys for movement, plus one-shot presses (Y, B, Space, E, F).
// Uses KeyboardEvent.code so it works on any keyboard layout.
//
// Presses that arrive between frames are handed out together at the start of the next frame
// (beginInputFrame) and forgotten at the start of the one after, so every part of the game sees
// the same presses whichever order their per-frame code runs in.

const held = new Set<string>();
let incoming = new Set<string>();
let presses = new Set<string>();

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
}

export function attachKeyboard(target: Window = window) {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    if (!e.repeat) incoming.add(e.code);
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

/** Start of a frame: this frame's presses are the ones since the last frame; unused older ones are dropped. */
export function beginInputFrame() {
  presses = incoming;
  incoming = new Set();
}
