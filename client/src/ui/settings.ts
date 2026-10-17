import { create } from "zustand";

// Player settings (GAME_SPEC §11.4), remembered in this browser.

export type GraphicsPreset = "auto" | "low" | "medium" | "high";

export interface Settings {
  music: number; // 0…1
  effects: number;
  ambience: number;
  /** Mouse-look speed, × the normal speed (0.4…2.5). */
  sensitivity: number;
  invertY: boolean;
  graphics: GraphicsPreset;
  /** A small frame-rate number in the party badge, so friends can say how smooth it runs (Phase 5). */
  showFps: boolean;
  /** Go full screen when you press Play or Resume (ui/fullscreen.ts). */
  fullscreen: boolean;
}

const KEY = "den.settings";
/** Medium graphics and full screen from the start (Andrew, round 3). */
export const DEFAULT_SETTINGS: Settings = { music: 0.8, effects: 1, ambience: 0.9, sensitivity: 1, invertY: false, graphics: "medium", showFps: false, fullscreen: true };
/** Bumped when new defaults should reach browsers that already saved settings. */
const VERSION = 2;

/** Saved settings over the defaults. Settings saved before version 2 get Medium and full screen once. */
export function migrate(saved: Record<string, unknown>): Settings {
  const { artStyle: _retired, v, ...rest } = saved;
  const s = { ...DEFAULT_SETTINGS, ...rest } as Settings;
  if (typeof v !== "number" || v < 2) {
    s.graphics = "medium";
    s.fullscreen = true;
  }
  return s;
}

function load(): Settings {
  try {
    return migrate(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const useSettings = create<Settings>(load);

export function updateSettings(patch: Partial<Settings>) {
  useSettings.setState(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...useSettings.getState(), v: VERSION }));
  } catch {
    /* private mode: settings last for this visit */
  }
}

/** Current settings outside React (per-frame code). */
export const settings = () => useSettings.getState();
