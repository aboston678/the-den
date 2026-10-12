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
  /** Takes effect in milestone 1.12. */
  graphics: GraphicsPreset;
}

const KEY = "den.settings";
export const DEFAULT_SETTINGS: Settings = { music: 0.8, effects: 1, ambience: 0.9, sensitivity: 1, invertY: false, graphics: "auto" };

function load(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const useSettings = create<Settings>(load);

export function updateSettings(patch: Partial<Settings>) {
  useSettings.setState(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(useSettings.getState()));
  } catch {
    /* private mode: settings last for this visit */
  }
}

/** Current settings outside React (per-frame code). */
export const settings = () => useSettings.getState();
