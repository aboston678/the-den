import { useSyncExternalStore } from "react";
import { settings } from "./settings.ts";

// Full screen (game-night fixes): the whole page, so the HUD stays on screen, without the browser's
// address bar and tabs. Browsers only allow it from a click or key press, and Esc always leaves it
// (on a Mac Esc also frees the mouse, which opens the pause menu). "Play in full screen" is on by
// default (Andrew, round 3): the first "Click to start" goes full screen, and Create/Join, Play, Resume
// or the next click on the game go back to it.

type WebkitDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export const isFullscreen = () => !!(document.fullscreenElement ?? (document as WebkitDoc).webkitFullscreenElement);

/** Go full screen (call from a click or key press). Quietly does nothing if the browser says no. */
export function enterFullscreen() {
  if (isFullscreen()) return;
  const el = document.documentElement as WebkitEl;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : el.webkitRequestFullscreen?.();
    void Promise.resolve(p).catch(() => {});
  } catch {
    /* not allowed here (e.g. inside a frame) */
  }
}

export function exitFullscreen() {
  if (!isFullscreen()) return;
  const d = document as WebkitDoc;
  void Promise.resolve(document.exitFullscreen ? document.exitFullscreen() : d.webkitExitFullscreen?.()).catch(() => {});
}

export const toggleFullscreen = () => (isFullscreen() ? exitFullscreen() : enterFullscreen());

/** With "Play in full screen" on: back to full screen (from a click). */
export function fullscreenIfWanted() {
  if (settings().fullscreen) enterFullscreen();
}

function subscribe(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
}

/** Whether the page is full screen right now (re-renders when that changes). */
export const useFullscreen = () => useSyncExternalStore(subscribe, isFullscreen);
