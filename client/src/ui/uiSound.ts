import { play } from "../game/audio/audio.ts";

// Menu sounds (GAME_SPEC §10 "UI clicks"): a soft click on every button press and a faint tick when
// the mouse moves onto one, for every screen at once (home, settings, pause, leaderboard, Catan).

const HOVER_GAP_MS = 60;

export function initUiSounds() {
  let lastHover: Element | null = null, lastAt = 0;
  const button = (e: Event) => (e.target as Element | null)?.closest?.("button:not(:disabled), [role=button]") ?? null;
  document.addEventListener("click", (e) => {
    if (button(e)) void play("ui-click", 0.6);
  }, true);
  document.addEventListener("mouseover", (e) => {
    const b = button(e);
    if (!b || b === lastHover) return;
    lastHover = b;
    const now = performance.now();
    if (now - lastAt < HOVER_GAP_MS) return;
    lastAt = now;
    void play("ui-hover", 0.35);
  }, true);
  document.addEventListener("mouseout", (e) => {
    if (button(e) === lastHover && !lastHover?.contains((e as MouseEvent).relatedTarget as Node | null)) lastHover = null;
  }, true);
}
