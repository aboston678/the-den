import { HOUSE_SCALE } from "../constants.ts";
import { Path, type PathPoint } from "./path.ts";

// Where everything is on the property (GAME_SPEC §4). 1 unit = 1 m, north = −z, east = +x.
// The house sits near the middle; the driveway comes in from the north-west corner and the
// stream runs north→south along the east side.

/** Half the map's width: the world spans −150…150 on both axes. */
export const MAP_HALF = 150;
/** Invisible boundary, about 10 m inside the map edge. */
export const BOUNDARY_HALF = 140;

/**
 * The house (built in milestone 1.9 from docs/floorplan.json at 1.25×). Floorplan x/z (real
 * metres from the north-west corner) map to the world like this.
 */
export const HOUSE = {
  originX: -21,
  originZ: -7,
  scale: HOUSE_SCALE,
  mainFloorY: 0,
  basementFloorY: -2.7 * HOUSE_SCALE,
} as const;
export const houseToWorld = (x: number, z: number) => ({ x: HOUSE.originX + x * HOUSE.scale, z: HOUSE.originZ + z * HOUSE.scale });

/** Rectangles (floorplan metres) the house covers: main block, porch, deck, greenhouse. */
export const HOUSE_FOOTPRINT = [
  { x: 0, z: 0, w: 34, d: 11.5, name: "house" },
  { x: 21.5, z: -2.5, w: 12.5, d: 2.5, name: "porch" },
  { x: 16.5, z: 10, w: 13.5, d: 4.5, name: "deck" },
  { x: 0, z: 8.5, w: 11, d: 4, name: "greenhouse" },
].map((r) => {
  const a = houseToWorld(r.x, r.z);
  return { name: r.name, minX: a.x, minZ: a.z, maxX: a.x + r.w * HOUSE.scale, maxZ: a.z + r.d * HOUSE.scale };
});

/** The bowling alley runs underground east of the house (floorplan x 28–56, z 0–6). */
export const BOWLING_ALLEY = (() => {
  const a = houseToWorld(28, 0), b = houseToWorld(56, 6);
  return { minX: a.x, minZ: a.z, maxX: b.x, maxZ: b.z };
})();

/** Lawn clearing around the house: a rounded, uneven rectangle, bigger to the south and east. */
export const CLEARING = { cx: 4, cz: 4, rx: 40, rz: 34 } as const;

// --- the stream ---
export const STREAM = {
  width: 20,
  waterY: -8.5,
  bankTopY: -7,
  /** How far out from our shore the shallow, wadeable strip goes before the invisible wall. */
  wadeWidth: 3,
  /** The invisible wall in the water, as distance from the centre line (our shore is at about −10.5). */
  wadeLimitD: -7.5,
} as const;
/** x of the stream's centre line at z (it meanders a little). */
export const streamCenter = (z: number) => 122 + 4 * Math.sin(z / 45) + 2 * Math.sin(z / 17 + 1);

// --- the dock (due east of the house) ---
export const DOCK = {
  z: 0,
  width: 1.8,
  length: 8,
  /** Top of the boards: ~0.65 m above the water. */
  deckY: -7.85,
  /** Starts where the bank has come down to deck level (distance from the stream's centre line). */
  startD: -12.6,
} as const;
export const dockStartX = () => streamCenter(DOCK.z) + DOCK.startD;
/** The bucket of fishing rods at the base of the dock. */
export const rodBucket = () => ({ x: dockStartX() - 1.1, z: DOCK.z + 1.5 });

// --- the driveway: from the NW map edge, ~170 m through the woods to the garage apron ---
export const DRIVEWAY_WIDTH = 4;
export const DRIVEWAY = new Path([
  { x: -156, z: -152 }, // off the map: the road continues into the fog
  { x: -138, z: -134 },
  { x: -124, z: -118 },
  { x: -116, z: -100 },
  { x: -110, z: -82 },
  { x: -99, z: -66 },
  { x: -84, z: -56 },
  { x: -70, z: -44 },
  { x: -61, z: -30 },
  { x: -52, z: -17 },
  { x: -42, z: -8 },
  { x: -32, z: -3 },
  { x: -26, z: -2 },
]);
/** Paved apron in front of the two garage doors (west end of the house). */
export const APRON = (() => {
  const a = houseToWorld(0, 0);
  return { minX: a.x - 12, maxX: a.x, minZ: a.z - 1, maxZ: a.z + 8.5 * HOUSE.scale + 1, y: HOUSE.mainFloorY };
})();

// --- the trail: back lawn to the dock (~90 m) ---
export const TRAIL_WIDTH = 1.6;
export const TRAIL = new Path([
  { x: 20, z: 16 },
  { x: 34, z: 22 },
  { x: 48, z: 21 },
  { x: 62, z: 15 },
  { x: 76, z: 9 },
  { x: 90, z: 4 },
  { x: 101, z: 1.2 },
  { x: dockStartX() - 0.3, z: DOCK.z },
]);

// --- dry-stone walls ---
/** Old field walls along the woodline and through the forest (GAME_SPEC §4). */
export const STONE_WALLS: PathPoint[][] = [
  // Behind the greenhouse, along the back woodline (greenhouse-exterior photo).
  [{ x: -37, z: 10 }, { x: -35, z: 24 }, { x: -27, z: 36 }, { x: -14, z: 43 }, { x: 2, z: 45 }],
  // Along the north woodline beyond the front lawn.
  [{ x: -16, z: -30 }, { x: 4, z: -33 }, { x: 24, z: -31 }, { x: 44, z: -24 }],
  // An old boundary wall through the southern woods.
  [{ x: 24, z: 72 }, { x: 52, z: 68 }, { x: 80, z: 71 }, { x: 98, z: 66 }],
  // And one in the northern woods.
  [{ x: -78, z: -96 }, { x: -40, z: -102 }, { x: 0, z: -98 }, { x: 46, z: -106 }],
].map((w) => new Path(w, 0.5).points);
export const WALL_PATHS = STONE_WALLS.map((w) => new Path(w, 0.5));

/** Retaining wall along the north side of the driveway's last stretch and the apron (garage-driveway photo). */
export const RETAINING_WALL = (() => {
  const pts: PathPoint[] = [];
  const end = DRIVEWAY.closest(APRON.minX, (APRON.minZ + APRON.maxZ) / 2)!.s;
  for (let s = end - 26; s <= end; s += 2) {
    const p = DRIVEWAY.pointAt(s);
    const off = DRIVEWAY_WIDTH / 2 + 0.7;
    pts.push({ x: p.x + p.dz * off, z: p.z - p.dx * off }); // left of travel = north
  }
  pts.push({ x: APRON.minX + 1, z: APRON.minZ - 0.7 }, { x: APRON.maxX - 2.5, z: APRON.minZ - 0.7 });
  return new Path(pts, 0.5);
})();
export const RETAINING_WALL_HEIGHT = 1.0;

/** Landmark white pines on the lawn near the house (photos), as [x, z, height]. */
export const LAWN_PINES: [number, number, number][] = [
  [-28, -13, 29], [-26, 12, 30], [29, -16, 26], [33, 19, 28], [10, 31, 25], [-12, 27, 27],
];
/** The big boulder on the front lawn (exterior-front photo). */
export const FRONT_BOULDER = { x: 13, z: -20, scale: 1.9, rotY: 0.6 };
