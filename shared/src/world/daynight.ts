// The day/night cycle (GAME_SPEC §9): 30 min day → 4 min dusk → 30 min night → 4 min dawn,
// 68 minutes in all. The server owns the clock (seconds into the cycle); everything else here is
// pure maths both sides can use.

export const CYCLE = {
  day: 1800,
  dusk: 240,
  night: 1800,
  dawn: 240,
} as const;
export const CYCLE_LENGTH = CYCLE.day + CYCLE.dusk + CYCLE.night + CYCLE.dawn; // 4080 s

/** Where each phase starts, in seconds into the cycle. */
export const PHASE_START = {
  day: 0,
  dusk: CYCLE.day,
  night: CYCLE.day + CYCLE.dusk,
  dawn: CYCLE.day + CYCLE.dusk + CYCLE.night,
} as const;
export type DayPhase = keyof typeof PHASE_START;

/** Named moments, for dev/test links like ?time=dusk. A new party starts mid-morning. */
export const TIME_PRESETS = {
  morning: 450,
  noon: 900,
  evening: 1700,
  dusk: PHASE_START.dusk + 80, // golden sunset light, just before the sun goes down
  night: PHASE_START.night + 900,
  dawn: PHASE_START.dawn + 160, // just after sunrise
} as const;
export const START_TIME: number = TIME_PRESETS.morning;

/** The sun rises halfway through dawn and sets halfway through dusk. */
const SUNRISE = PHASE_START.dawn + CYCLE.dawn / 2;
/** Highest sun at noon, in degrees above the horizon (summer in Maine is ~68°; a bit lower looks nicer). */
const PEAK_ELEVATION = 60;
/** Seconds the outdoor lights take to fade on at dusk / off at dawn. */
const LIGHT_FADE = 30;

export const wrapTime = (t: number) => ((t % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;

/** Turn a ?time= value (a preset name or seconds) into a time, or undefined if it isn't one. */
export function parseTime(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return wrapTime(v);
  if (typeof v !== "string" || v === "") return undefined;
  if (Object.hasOwn(TIME_PRESETS, v)) return TIME_PRESETS[v as keyof typeof TIME_PRESETS];
  const n = Number(v);
  return Number.isFinite(n) ? wrapTime(n) : undefined;
}

export function phaseAt(t: number): DayPhase {
  t = wrapTime(t);
  if (t < PHASE_START.dusk) return "day";
  if (t < PHASE_START.night) return "dusk";
  if (t < PHASE_START.dawn) return "night";
  return "dawn";
}

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export interface SkyState {
  phase: DayPhase;
  /** Unit vector toward the sun (x east, y up, z south). Below the horizon at night. */
  sun: { x: number; y: number; z: number };
  /** Unit vector toward the moon: opposite the sun, so it's up all night in the southern sky. */
  moon: { x: number; y: number; z: number };
  /** 1 in full daylight, 0 at night; changes during dusk and dawn. */
  daylight: number;
  /** 1 when the sun is near the horizon (golden hour, sunset, sunrise colours), else 0. */
  glow: number;
  /** Porch, coach and deck lights: 0 off … 1 on. On from dusk until dawn. */
  exteriorLights: number;
}

export function skyAt(time: number): SkyState {
  const t = wrapTime(time);
  // The sun goes once round a tilted circle per cycle: east at sunrise, high in the south at noon,
  // west at sunset, under the ground at midnight.
  const a = (2 * Math.PI * wrapTime(t - SUNRISE)) / CYCLE_LENGTH;
  const tilt = (PEAK_ELEVATION * Math.PI) / 180;
  const sun = { x: Math.cos(a), y: Math.sin(a) * Math.sin(tilt), z: Math.sin(a) * Math.cos(tilt) };
  const moon = { x: -sun.x, y: -sun.y, z: -sun.z };

  // Lights fade on over the first LIGHT_FADE s of dusk and off over the last LIGHT_FADE s of dawn.
  const sinceDusk = wrapTime(t - PHASE_START.dusk);
  const untilDay = CYCLE_LENGTH - PHASE_START.dusk - sinceDusk; // seconds left before the next day
  const nightSpan = CYCLE.dusk + CYCLE.night + CYCLE.dawn;
  const exteriorLights = sinceDusk >= nightSpan ? 0 : Math.min(1, sinceDusk / LIGHT_FADE, untilDay / LIGHT_FADE);

  return {
    phase: phaseAt(t),
    sun,
    moon,
    daylight: smoothstep(-0.16, 0.1, sun.y),
    glow: 1 - smoothstep(0.05, 0.45, Math.abs(sun.y)),
    exteriorLights: Math.max(0, exteriorLights),
  };
}
