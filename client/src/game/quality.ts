import { create } from "zustand";
import { type GraphicsPreset, settings, useSettings } from "../ui/settings.ts";

// Graphics presets (GAME_SPEC §17): Low / Medium / High, and Auto, which picks one from the
// graphics chip and then checks the first seconds of real frame times.

export type Tier = Exclude<GraphicsPreset, "auto">;

export interface Quality {
  tier: Tier;
  /** Render resolution as a multiple of the page's CSS pixels (capped by the screen's real density). */
  dpr: number;
  /** Sun/moon shadow map size and how far round the bear it reaches (metres). */
  shadowMap: number;
  shadowHalf: number;
  /** Trees: full-detail distance, medium-detail distance, then flat "impostor" pictures out to the last. */
  treeLods: [number, number, number];
  /** How many detail levels of trees cast shadows (1 = only the nearest). */
  treeShadowLevels: number;
  /** Saplings, ferns and small props are drawn this far. */
  smallFar: number;
  /** Outdoors, the rooms' furniture is drawn within this distance of the house walls (seen through the windows). */
  furnitureFar: number;
  /** Fog: where it starts and where it's solid. */
  fog: [number, number];
  /** House lamps that are real lights (the rest just glow), inside and outside. */
  interiorLights: number;
  exteriorLights: number;
  /** Does your flashlight cast shadows; does the room you're in get a shadow-casting lamp. */
  flashlightShadow: boolean;
  indoorShadow: boolean;
  /** Bloom + vignette, and ambient occlusion (contact shadows). High only: on an M1 they cost ~15 fps at 1080p. */
  bloom: boolean;
  ambientOcclusion: boolean;
}

export const PRESETS: Record<Tier, Quality> = {
  low: {
    tier: "low", dpr: 0.75, shadowMap: 1024, shadowHalf: 35, treeLods: [18, 45, 150], treeShadowLevels: 2, smallFar: 30, furnitureFar: 12, fog: [25, 140],
    interiorLights: 2, exteriorLights: 1, flashlightShadow: false, indoorShadow: false, bloom: false, ambientOcclusion: false,
  },
  medium: {
    tier: "medium", dpr: 1, shadowMap: 2048, shadowHalf: 55, treeLods: [22, 48, 200], treeShadowLevels: 2, smallFar: 32, furnitureFar: 15, fog: [35, 185],
    interiorLights: 4, exteriorLights: 2, flashlightShadow: true, indoorShadow: false, bloom: false, ambientOcclusion: false,
  },
  high: {
    tier: "high", dpr: 1.25, shadowMap: 4096, shadowHalf: 70, treeLods: [35, 80, 210], treeShadowLevels: 2, smallFar: 50, furnitureFar: 30, fog: [40, 200],
    interiorLights: 6, exteriorLights: 3, flashlightShadow: true, indoorShadow: true, bloom: true, ambientOcclusion: true,
  },
};

/** The graphics chip's name, if the browser shares it. */
export function gpuName(): string {
  try {
    // Ask for the fast graphics card, like the game's own canvas does (React Three Fiber's default):
    // laptops with two chips (e.g. a gaming laptop's NVIDIA card plus Intel graphics) would otherwise
    // report the slow one here and Auto would pick Low.
    const gl = document.createElement("canvas").getContext("webgl2", { powerPreference: "high-performance" });
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return (ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "") || "";
  } catch {
    return "";
  }
}

/** A first guess from the chip's name: integrated Intel graphics → Low, big discrete GPUs and Pro/Max Macs → High. */
export function guessTier(gpu: string): Tier {
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|intel\(r\) (hd|uhd)|intel hd|intel uhd|mali|adreno|powervr/.test(g)) return "low";
  if (/apple m\d+ (pro|max|ultra)|rtx|radeon rx|gtx 1[06-9]|gtx 16|rx [5-9]\d{3}/.test(g)) return "high";
  return "medium"; // base Apple M chips, Iris Xe, Radeon integrated, unknown
}

const AUTO_KEY = "den.autoTier";

/** What Auto settled on last time on this computer (it can step down after measuring), else the guess. */
function savedAutoTier(): Tier {
  try {
    const saved = localStorage.getItem(AUTO_KEY);
    if (saved === "low" || saved === "medium" || saved === "high") return saved;
  } catch {
    /* ignore */
  }
  return guessTier(gpuName());
}
const useAuto = create(() => ({ tier: savedAutoTier() }));

export const resolveTier = (preset: GraphicsPreset, auto = useAuto.getState().tier): Tier => (preset === "auto" ? auto : preset);

/** The quality to use, following the setting (and Auto's choice). */
export function useQuality(): Quality {
  const preset = useSettings((s) => s.graphics);
  const auto = useAuto((s) => s.tier);
  return PRESETS[resolveTier(preset, auto)];
}
export const quality = () => PRESETS[resolveTier(settings().graphics)];

/**
 * Auto only: after a few seconds in the game, if frames are too slow, step down one tier and
 * remember it for this computer. Returns the new tier, or null if nothing changed.
 */
export function autoStepDown(avgFps: number): Tier | null {
  if (settings().graphics !== "auto") return null;
  const tier = useAuto.getState().tier;
  const next: Tier | null = avgFps < 45 && tier === "high" ? "medium" : avgFps < 30 && tier === "medium" ? "low" : null;
  if (!next) return null;
  try {
    localStorage.setItem(AUTO_KEY, next);
  } catch {
    /* ignore */
  }
  useAuto.setState({ tier: next });
  return next;
}
