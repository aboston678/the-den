import { START_TIME, type SkyState, skyAt } from "@den/shared";
import { Color } from "three";
import { TOON } from "../artStyle.ts";

// How the world looks at a given time of day: light colours and strengths, fog, exposure
// (GAME_SPEC §9). Mid-morning matches the fixed sun the game had before 1.10.

const C = {
  dayFog: new Color("#c4d3dc"),
  goldenFog: new Color("#d8b796"), // sun low but up: warm haze
  duskFog: new Color("#4f5068"), // sun just down: dusky violet
  nightFog: new Color("#0e1520"),
  daySun: new Color("#fff4e6"),
  lowSun: new Color("#ffaa5e"),
  moon: new Color("#b6c4dc"),
  dayHemiSky: new Color("#dfe9f3"),
  nightHemiSky: new Color("#4f5f7e"),
  dayHemiGround: new Color("#3a4630"),
  nightHemiGround: new Color("#161c28"),
};

const scratch = new Color();

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export interface Look {
  sky: SkyState;
  fog: Color;
  /** The one shadow-casting outdoor light: the sun by day, the moon by night. */
  light: { dir: { x: number; y: number; z: number }; color: Color; intensity: number };
  hemi: { sky: Color; ground: Color; intensity: number };
  envIntensity: number;
  exposure: number;
  /** 0 by day … 1 at night: the night sky dome and the stars. */
  night: number;
}

const INDOOR_HEMI_SKY = new Color("#d9ccb6");
const TOON_SUN = new Color("#ffe2b0");
const TOON_FOG = new Color("#b9d8f2");
const INDOOR_HEMI_GROUND = new Color("#6e5d4a");

/**
 * The look at `time`. `indoors` (0…1) swaps the sky's blue fill light for a dim warm one, so the
 * night sky doesn't light up the rooms; the house's own lamps do that (house/Lights.tsx).
 */
export function lookAt(time: number, out: Look = newLook(), indoors = 0): Look {
  const sky = skyAt(time);
  const d = sky.daylight;
  out.sky = sky;

  const lowTint = smoothstep(-0.08, 0.06, sky.sun.y); // golden above the horizon, violet below
  const tint = scratch.copy(C.duskFog).lerp(C.goldenFog, lowTint);
  out.fog.copy(C.nightFog).lerp(C.dayFog, d).lerp(tint, sky.glow * 0.8);

  const sunUp = smoothstep(-0.03, 0.08, sky.sun.y);
  const moonUp = smoothstep(-0.03, 0.1, sky.moon.y) * (1 - d);
  if (sky.sun.y >= 0) {
    out.light.dir = sky.sun;
    out.light.color.copy(C.daySun).lerp(C.lowSun, sky.glow);
    out.light.intensity = 2.6 * sunUp;
  } else {
    out.light.dir = sky.moon;
    out.light.color.copy(C.moon);
    out.light.intensity = 0.75 * moonUp;
  }

  out.hemi.sky.copy(C.nightHemiSky).lerp(C.dayHemiSky, d);
  out.hemi.ground.copy(C.nightHemiGround).lerp(C.dayHemiGround, d);
  out.hemi.intensity = lerp(0.8, 0.45, d);
  // three's Sky is high dynamic range (much brighter than the old drei sky), so its reflections are scaled down.
  out.envIntensity = lerp(0.03, 0.12, d);
  // A touch of "auto exposure" so night stays readable (GAME_SPEC §9).
  out.exposure = lerp(1.75, 1.0, d);
  out.night = 1 - d;

  if (TOON) {
    // Cartoon art style: brighter, bluer shade (shadows read as soft colour, not darkness), warmer
    // sunshine, and a clear light-blue haze.
    out.hemi.intensity *= lerp(1, 1.7, d);
    out.light.color.lerp(TOON_SUN, 0.3 * d);
    out.fog.lerp(TOON_FOG, 0.6 * d * (1 - sky.glow));
  }
  if (indoors > 0) {
    out.hemi.sky.lerp(INDOOR_HEMI_SKY, indoors);
    out.hemi.ground.lerp(INDOOR_HEMI_GROUND, indoors);
    out.hemi.intensity = lerp(out.hemi.intensity, lerp(0.12, 0.3, d), indoors);
    out.envIntensity = lerp(out.envIntensity, lerp(0.02, 0.06, d), indoors);
    out.exposure = lerp(out.exposure, 1.1, indoors);
  }
  return out;
}

function newLook(): Look {
  return {
    sky: skyAt(START_TIME),
    fog: new Color(),
    light: { dir: { x: 0, y: 1, z: 0 }, color: new Color(), intensity: 0 },
    hemi: { sky: new Color(), ground: new Color(), intensity: 0 },
    envIntensity: 0,
    exposure: 1,
    night: 0,
  };
}

/** The look right now, refreshed once per frame by <DayNightSky>. Everything else reads it. */
export const current: Look = lookAt(START_TIME);
