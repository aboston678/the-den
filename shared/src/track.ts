import { BOUNDS, DRIVEWAY } from "./world/layout.ts";
import { Path } from "./world/path.ts";

// The racetrack (Andrew, 2026-10-16), joined to the map: the driveway carries on out of the woods
// past the end of the property, across open farmland, through a gate into a fenced circuit like his
// photo (a long start/finish straight with the pits and a grandstand, then a winding loop of
// corners with red/white kerbs and blue/red painted run-off). All flat, at the height where the
// driveway leaves the woods. North = −z, east = +x.

/** Height of the track, its road and the farmland round it (the driveway's far end is at ~6.5 m). */
export const TRACK_Y = 6.5;

/** The fenced circuit grounds (world metres). */
export const TRACK_AREA = { minX: -760, maxX: -215, minZ: -560, maxZ: -205 } as const;

/** The road from the driveway's far end (off the old map edge) to the gate in the east fence: the driveway carried on. */
export const TRACK_ROAD_WIDTH = 4;
export const TRACK_ROAD = new Path([
  { x: DRIVEWAY.points[0]!.x, z: DRIVEWAY.points[0]!.z },
  { x: -172, z: -170 },
  { x: -188, z: -192 },
  { x: -200, z: -214 },
  { x: -212, z: -233 },
  { x: -228, z: -238 },
  { x: -250, z: -238 },
]);

/** Paved paddock just inside the gate, beside the start/finish straight: the pits, and where you ride on. */
export const PADDOCK = { minX: -335, maxX: -215, minZ: -255, maxZ: -221 } as const;

export const TRACK_WIDTH = 12;
export const KERB_WIDTH = 1.2;
export const RUNOFF_WIDTH = 8;

/** The circuit's centre line, a closed loop starting at the east end of the start/finish straight, heading west. */
export const TRACK = new Path([
  { x: -265, z: -268 }, // the start/finish straight (west along the south side)
  { x: -460, z: -268 },
  { x: -650, z: -268 },
  { x: -712, z: -300 }, // turn 1: sweeping right, north
  { x: -718, z: -370 },
  { x: -680, z: -418 },
  { x: -612, z: -404 }, // back east…
  { x: -566, z: -352 },
  { x: -500, z: -362 }, // …round the hairpin
  { x: -520, z: -442 },
  { x: -600, z: -488 },
  { x: -665, z: -515 }, // far north-west
  { x: -570, z: -532 },
  { x: -420, z: -522 }, // the back straight, east along the north
  { x: -330, z: -486 },
  { x: -302, z: -420 }, // the esses
  { x: -360, z: -372 },
  { x: -292, z: -326 },
  { x: -244, z: -302 }, // the last corner, back onto the straight
], 1, true);

/** Metres along the circuit to the start/finish line (on the straight, past the pits). */
export const START_S = 40;
/** Where the start/finish line is, and which way the track runs there. */
export const startLine = () => TRACK.pointAt(START_S);

/** True on the circuit's asphalt (or its kerbs): full racing speed. */
export const onTrackAsphalt = (x: number, z: number) =>
  inRect(TRACK_AREA, x, z, 0) && !!TRACK.closest(x, z, TRACK_WIDTH / 2 + KERB_WIDTH);

/** True on the road out to the track or the paddock (paving, like the driveway). */
export const onTrackRoad = (x: number, z: number) =>
  inRect(PADDOCK, x, z, 0) || !!TRACK_ROAD.closest(x, z, TRACK_ROAD_WIDTH / 2 + 0.5);

const inRect = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, m: number) =>
  x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m;
const inProperty = (x: number, z: number) => inRect(BOUNDS, x, z, 0);

/** Half-width of the walkable strip along the road out (woods, then farmland, either side of the road). */
export const CORRIDOR_HALF = 7;

/** True on the way out to the track: along the driveway beyond the old map edge, and along the track road. */
export function inTrackCorridor(x: number, z: number) {
  if (TRACK_ROAD.closest(x, z, CORRIDOR_HALF)) return true;
  return !inProperty(x, z) && !!DRIVEWAY.closest(x, z, CORRIDOR_HALF);
}

/** Walls round the track grounds stand this far inside TRACK_AREA. */
export const TRACK_FENCE_INSET = 2;
/** True inside the fenced track grounds. */
export const inTrackArea = (x: number, z: number) => inRect(TRACK_AREA, x, z, -TRACK_FENCE_INSET);

/** The whole world the server accepts positions in (the property, the road out and the track). */
export const WORLD_LIMITS = { minX: TRACK_AREA.minX - 20, maxX: 180, minZ: TRACK_AREA.minZ - 20, maxZ: 180 } as const;

// --- lap timing ---

/** A lap only counts if you pass these points along the way (no cutting across the infield). */
export const SECTORS = [TRACK.length / 3, (2 * TRACK.length) / 3] as const;
/** The fastest a lap could possibly be (a bike flat out all the way, with slack): quicker is refused. */
export const MIN_LAP_S = TRACK.length / 60;

/** Metres along the circuit measured from the start/finish line (0…length), or null when off the circuit. */
export function lapDistance(x: number, z: number) {
  const hit = TRACK.closest(x, z, TRACK_WIDTH / 2 + RUNOFF_WIDTH + 4);
  if (!hit) return null;
  return (hit.s - START_S + TRACK.length) % TRACK.length;
}

/**
 * Follows one rider round the circuit and times laps: a lap starts when you cross the start/finish
 * line going the right way, and counts when you cross it again having passed both sectors.
 */
export class LapTimer {
  /** When the current lap started (seconds), or null before the first crossing. */
  startedAt: number | null = null;
  private last: number | null = null;
  private passed = 0;

  /** Call often (every frame). Returns a finished lap's time in seconds, or null. */
  update(x: number, z: number, now: number): number | null {
    const d = lapDistance(x, z);
    const prev = this.last;
    this.last = d;
    if (d === null || prev === null) return null;
    const L = TRACK.length;
    // Crossing the line forwards: from the end of the lap round to its start.
    if (prev > L - 60 && d < 60) {
      const done = this.startedAt !== null && this.passed === SECTORS.length ? now - this.startedAt : null;
      this.startedAt = now;
      this.passed = 0;
      return done !== null && done >= MIN_LAP_S ? done : null;
    }
    if (prev < 60 && d > L - 60) {
      this.startedAt = null; // backwards over the line: no lap
      return null;
    }
    while (this.passed < SECTORS.length && prev < SECTORS[this.passed]! && d >= SECTORS[this.passed]! && d - prev < 60) this.passed++;
    return null;
  }

  /** Seconds into the current lap, or null. */
  current(now: number) {
    return this.startedAt === null ? null : now - this.startedAt;
  }
}

/** "1:23.45". */
export function formatLap(seconds: number) {
  const m = Math.floor(seconds / 60), s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
