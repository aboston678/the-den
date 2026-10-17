import { type Box2, contains } from "./rects.ts";

// The roofs (GAME_SPEC §8.1, exterior photos), in floorplan metres. A Cape: the east block's roof
// starts 1 m above the upstairs floor so the upstairs rooms have sloped ceilings near the front
// and back walls, with three front dormers. A two-storey cross gable at the front (over the
// skylight bedroom), the great room's tall rear gable with the arched windows, and lower roofs
// over the kitchen wing (two decorative dormers) and the garage (its big gable faces the front).

export const PITCH = 0.7; // rise per metre (~35°)
export const ROOF_THICKNESS = 0.22;
export const OVERHANG = 0.35;
export const UPPER_FLOOR = 2.7;
export const UPPER_CEILING = UPPER_FLOOR + 2.4;

export interface Gable {
  id: string;
  /** Wall lines the roof sits on (overhang is added when drawing). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The ridge runs along this axis. */
  ridge: "x" | "z";
  /** Underside height at the eaves (top of the walls). */
  eaveY: number;
  pitch: number;
  /** Gable-end triangles this roof draws itself (others are made by the upstairs walls). */
  gableEnds?: ("start" | "end")[];
  /** Areas where another roof takes over (cross gables, dormers). */
  holes?: Box2[];
  /** Skip the overhang at these ends (where it meets another roof). */
  noOverhang?: ("start" | "end" | "sideStart" | "sideEnd")[];
}

export interface Dormer {
  /** Centre along the front wall, width, how far back into the roof it reaches. */
  x: number;
  width: number;
  /** Front wall line and depth back into the roof. */
  z0: number;
  depth: number;
  /** Floor of the space inside, flat ceiling height, and the height of its little roof's eaves. */
  ceilingY: number;
  /** True if it opens into a room upstairs (otherwise it's decoration on an attic). */
  open: boolean;
  /** The roof it sits on. */
  on: string;
}

const EAST_EAVE = UPPER_FLOOR + 1.0;
const DORMER_CEILING = UPPER_FLOOR + 2.2;

/** Dormers: three opening into the upstairs front rooms, two decorative ones over the kitchen wing. */
export const DORMERS: Dormer[] = [
  ...[23.5, 27.6, 31.75].map((x) => ({
    x, width: 1.8, z0: 0, depth: (DORMER_CEILING - EAST_EAVE) / PITCH + 0.15, ceilingY: DORMER_CEILING, open: true, on: "east",
  })),
  ...[10.2, 14.2].map((x) => ({ x, width: 1.5, z0: 0.5, depth: 1.6, ceilingY: 2.7 + 1.2, open: false, on: "kitchen_wing" })),
];
export const dormerBox = (d: Dormer): Box2 => ({ x0: d.x - d.width / 2, x1: d.x + d.width / 2, z0: d.z0, z1: d.z0 + d.depth });

const FRONT_GABLE_EAVE = UPPER_CEILING;
const FRONT_GABLE_END = (FRONT_GABLE_EAVE + 2.25 * PITCH - EAST_EAVE) / PITCH; // where its ridge meets the main roof
const REAR_GABLE_EAVE = 4.4;

export const ROOFS: Gable[] = [
  {
    id: "east", x0: 17, x1: 34, z0: 0, z1: 10, ridge: "x", eaveY: EAST_EAVE, pitch: PITCH,
    holes: [
      { x0: 17, x1: 21.5, z0: -1, z1: FRONT_GABLE_END }, // front cross gable
      { x0: 21.5, x1: 29.5, z0: 5, z1: 11 }, // great room's rear gable
      ...DORMERS.filter((d) => d.on === "east").map(dormerBox),
    ],
  },
  {
    id: "front_gable", x0: 17, x1: 21.5, z0: 0, z1: FRONT_GABLE_END, ridge: "z", eaveY: FRONT_GABLE_EAVE, pitch: PITCH,
    noOverhang: ["end"],
  },
  {
    id: "rear_gable", x0: 21.5, x1: 29.5, z0: 5, z1: 11.5, ridge: "z", eaveY: REAR_GABLE_EAVE, pitch: PITCH,
    noOverhang: ["start"],
    // Its side eaves stop where they'd poke into the upstairs rooms under the main roof (the yellow
    // bedroom and the west attic, round 3); out past the main roof's back edge they stay.
    holes: [{ x0: 21.5 - 1, x1: 21.5, z0: 4, z1: 10 }, { x0: 29.5, x1: 29.5 + 1, z0: 4, z1: 10 }],
  },
  {
    id: "kitchen_wing", x0: 7.5, x1: 17, z0: 0.5, z1: 9, ridge: "x", eaveY: 2.7, pitch: PITCH, gableEnds: ["start", "end"],
    holes: DORMERS.filter((d) => d.on === "kitchen_wing").map(dormerBox), noOverhang: ["end"],
  },
  { id: "garage", x0: 0, x1: 7.5, z0: 0, z1: 8.5, ridge: "z", eaveY: 2.7, pitch: 1.0, gableEnds: ["start", "end"] },
];

/** Underside height of one roof at (x, z), or null if it doesn't cover that spot. */
export function gableUnder(g: Gable, x: number, z: number) {
  if (!contains({ x0: g.x0, x1: g.x1, z0: g.z0, z1: g.z1 }, x, z, 1e-6)) return null;
  if (g.holes?.some((h) => x > h.x0 + 1e-6 && x < h.x1 - 1e-6 && z > h.z0 + 1e-6 && z < h.z1 - 1e-6)) return null;
  const fromEave = g.ridge === "x" ? Math.min(z - g.z0, g.z1 - z) : Math.min(x - g.x0, g.x1 - x);
  return g.eaveY + g.pitch * fromEave;
}

export const ridgeY = (g: Gable) => g.eaveY + g.pitch * ((g.ridge === "x" ? g.z1 - g.z0 : g.x1 - g.x0) / 2);

/**
 * Height of the roof's underside above (x, z) (the highest roof there, so walls reach up to meet
 * it), or null outside every roof. Inside an open dormer it's the dormer's flat ceiling.
 */
export function roofUnder(x: number, z: number): number | null {
  for (const d of DORMERS) if (d.open && contains(dormerBox(d), x, z, 1e-6)) return d.ceilingY;
  let best: number | null = null;
  for (const g of ROOFS) {
    const h = gableUnder(g, x, z);
    if (h !== null && (best === null || h > best)) best = h;
  }
  return best;
}
