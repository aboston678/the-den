import { type LevelId, LEVELS, type Rect, roomById } from "./floorplan.ts";

// What's in every room (GAME_SPEC §8.2–8.3, milestones 2.1–2.2), in floorplan metres like
// docs/floorplan.json (real size; the game builds the house and everything in it 1.25× bigger).
// Hero pieces are Higgsfield models packed in client/public/models/furniture.glb; everything else
// is built in code (client/src/game/house/furniture/). Shared so tests can check that nothing
// blocks a door or the stairs, and so later features (Catan chairs) can find their seats.

/** The sunken great room's floor, below the main floor (real metres). */
export const GREAT_ROOM_FLOOR = -0.5;

export type Mount = "floor" | "flat" | "wall" | "ceiling" | "surface";

export interface Kind {
  /** Size with the front facing +z: w along x, d along z, h up (real metres). */
  w: number;
  d: number;
  h: number;
  /** Node name in furniture.glb for hero pieces; code-built when absent. */
  model?: string;
  /**
   * floor: stands on the floor and is solid. flat: rugs (walk over them). wall: hangs on a wall at
   * y. ceiling: hangs from the ceiling (y = its top). surface: sits on another piece at y.
   */
  mount?: Mount;
  /** Collision footprint when smaller than the piece (lamps, the harp). */
  foot?: { w: number; d: number };
  /** Chairs: allowed to tuck under a table. */
  tuck?: boolean;
}

export const KINDS = {
  // --- hero models (sizes from tools/build-furniture.mjs) ---
  grand_piano: { w: 1.19, d: 1.75, h: 1.49, model: "grand-piano" },
  harp: { w: 1.33, d: 0.76, h: 1.85, model: "harp", foot: { w: 0.7, d: 0.5 } },
  wingback_chair: { w: 0.86, d: 0.92, h: 1.12, model: "wingback-chair" },
  camelback_sofa: { w: 1.95, d: 0.83, h: 1.03, model: "camelback-sofa" },
  china_cabinet: { w: 1.04, d: 0.43, h: 2.0, model: "china-cabinet" },
  chippendale_chair: { w: 0.5, d: 0.55, h: 0.98, model: "chippendale-chair", tuck: true },
  armchair_ottoman: { w: 1.0, d: 1.55, h: 0.9, model: "leather-armchair-ottoman" },
  pot_rack: { w: 0.75, d: 0.9, h: 0.99, model: "pot-rack", mount: "ceiling" },
  tiffany_lamp: { w: 0.59, d: 0.59, h: 1.6, model: "tiffany-lamp", foot: { w: 0.3, d: 0.3 } },
  spindle_bench: { w: 1.5, d: 0.61, h: 0.94, model: "spindle-bench" },
  four_poster_bed: { w: 2.08, d: 2.15, h: 2.0, model: "four-poster-bed" },
  chesterfield: { w: 2.2, d: 1.01, h: 0.86, model: "chesterfield" },
  recliner: { w: 0.99, d: 1.04, h: 1.05, model: "recliner" },
  canoe: { w: 5.0, d: 1.26, h: 1.67, model: "canoe" },

  // --- built in code ---
  // garage
  workbench: { w: 1.8, d: 0.62, h: 0.92 },
  pegboard: { w: 1.6, d: 0.03, h: 0.9, mount: "wall" },
  steel_shelf: { w: 1.2, d: 0.45, h: 1.8 },
  bins: { w: 1.1, d: 0.6, h: 1.05 },
  // mudroom
  firewood_rack: { w: 0.8, d: 0.36, h: 0.8 },
  closet_doors: { w: 1.4, d: 0.04, h: 2.0, mount: "wall" },
  // half bath
  toilet: { w: 0.4, d: 0.68, h: 0.76 },
  vanity: { w: 0.8, d: 0.5, h: 0.86 },
  mirror: { w: 0.6, d: 0.03, h: 0.8, mount: "wall" },
  // kitchen + pantry
  counter: { w: 1, d: 0.63, h: 0.92 },
  upper_cabinet: { w: 1, d: 0.34, h: 0.72, mount: "wall" },
  range: { w: 0.76, d: 0.66, h: 0.92 },
  range_hood: { w: 0.76, d: 0.5, h: 0.3, mount: "wall" },
  fridge: { w: 0.84, d: 0.75, h: 1.78 },
  island: { w: 2.4, d: 1.0, h: 0.92 },
  microwave: { w: 0.5, d: 0.38, h: 0.3, mount: "surface" },
  toaster: { w: 0.3, d: 0.18, h: 0.2, mount: "surface" },
  kettle: { w: 0.22, d: 0.22, h: 0.26, mount: "surface" },
  fruit_bowl: { w: 0.32, d: 0.32, h: 0.14, mount: "surface" },
  trash_can: { w: 0.32, d: 0.32, h: 0.66 },
  pantry_shelf: { w: 1, d: 0.38, h: 2.1 },
  // tables, chairs, sofas
  farm_table: { w: 1.8, d: 0.9, h: 0.76 },
  slat_chair: { w: 0.45, d: 0.5, h: 0.95, tuck: true },
  dining_table: { w: 1.5, d: 1.1, h: 0.76 },
  coffee_table: { w: 1.0, d: 1.0, h: 0.45 },
  side_table: { w: 0.48, d: 0.48, h: 0.6 },
  console_table: { w: 1.1, d: 0.36, h: 0.8 },
  sofa: { w: 2.0, d: 0.9, h: 0.85 },
  armchair: { w: 0.85, d: 0.85, h: 0.85 },
  tv_stand: { w: 1.1, d: 0.42, h: 0.5 },
  tv: { w: 1.1, d: 0.06, h: 0.66, mount: "surface" },
  bookshelf: { w: 1, d: 0.32, h: 2.3 },
  cabinet_low: { w: 0.7, d: 0.4, h: 0.75 },
  queen_bed: { w: 1.6, d: 2.1, h: 1.05 },
  nightstand: { w: 0.45, d: 0.4, h: 0.6 },
  desk: { w: 0.9, d: 0.45, h: 0.76 },
  // lights and decor
  floor_lamp: { w: 0.4, d: 0.4, h: 1.55, foot: { w: 0.25, d: 0.25 } },
  table_lamp: { w: 0.3, d: 0.3, h: 0.5, mount: "surface" },
  ceiling_fan: { w: 1.2, d: 1.2, h: 0.45, mount: "ceiling" },
  chandelier: { w: 0.75, d: 0.75, h: 0.8, mount: "ceiling" },
  pendant_lantern: { w: 0.35, d: 0.35, h: 0.7, mount: "ceiling" },
  plant_stand: { w: 0.36, d: 0.36, h: 1.25 },
  flowers: { w: 0.4, d: 0.4, h: 0.45, mount: "surface" },
  frame: { w: 0.6, d: 0.03, h: 0.45, mount: "wall" },
  painting: { w: 0.9, d: 0.05, h: 0.7, mount: "wall" },
  rug_braided: { w: 2.0, d: 1.3, h: 0.01, mount: "flat" },
  rug_round: { w: 2.6, d: 2.6, h: 0.01, mount: "flat" },
  rug_oriental: { w: 3.0, d: 2.2, h: 0.01, mount: "flat" },
  // deck + porch
  patio_set: { w: 1.9, d: 1.9, h: 2.4 },
  rocking_chair: { w: 0.62, d: 0.85, h: 1.05 },
} satisfies Record<string, Kind>;

export type KindId = keyof typeof KINDS;

export interface Placement {
  kind: KindId;
  room: string;
  /** Centre of the footprint (floorplan metres). */
  x: number;
  z: number;
  /** Which way the front faces, degrees: 0 = south (+z), 90 = east, 180 = north, 270 = west. */
  rot?: number;
  /** Height of the piece's bottom above the room's floor (wall, ceiling-top and surface pieces). */
  y?: number;
  /** Size overrides for stretchy pieces (counters, shelves, rugs). */
  w?: number;
  d?: number;
  h?: number;
  /** Look variant for code-built pieces (colour, pattern, picture). */
  look?: string;
}

const P = (kind: KindId, room: string, x: number, z: number, rest: Omit<Placement, "kind" | "room" | "x" | "z"> = {}): Placement => ({ kind, room, x, z, ...rest });

/** Wall half-thicknesses (client/src/game/house/walls.ts: 0.2 m outside walls, 0.12 m inside). */
const EXTERIOR_HALF = 0.1, INTERIOR_HALF = 0.06;
type Side = "n" | "s" | "e" | "w";
const SIDE_ROT: Record<Side, number> = { n: 0, s: 180, w: 90, e: 270 }; // facing away from that wall

/** Where a room's wall surface is on one side, at a point along it (inside walls are thinner than outside ones). */
export function wallFace(roomId: string, side: Side, along: number): number {
  const r = roomById(roomId)!;
  const line = side === "n" ? r.z : side === "s" ? r.z + r.d : side === "w" ? r.x : r.x + r.w;
  const out = side === "n" || side === "w" ? -1 : 1;
  const level = levelOfRoom(roomId)!;
  const px = side === "n" || side === "s" ? along : line + out * 0.02;
  const pz = side === "n" || side === "s" ? line + out * 0.02 : along;
  const neighbour = level.rooms.some((o) => o.id !== roomId && px > o.x && px < o.x + o.w && pz > o.z && pz < o.z + o.d);
  return line - out * (neighbour ? INTERIOR_HALF : EXTERIOR_HALF);
}

/** A piece standing (or hanging) against a wall, facing into the room; `along` is its centre along the wall. */
function W(kind: KindId, room: string, side: Side, along: number, rest: Omit<Placement, "kind" | "room" | "x" | "z"> = {}): Placement {
  const d = rest.d ?? KINDS[kind].d;
  const gap = (KINDS[kind] as Kind).mount === "wall" ? 0 : 0.01;
  const face = wallFace(room, side, along);
  const into = side === "n" || side === "w" ? 1 : -1;
  const c = face + into * (d / 2 + gap);
  const pos = side === "n" || side === "s" ? { x: along, z: c } : { x: c, z: along };
  return { kind, room, ...pos, rot: SIDE_ROT[side], ...rest };
}

/** Main floor (milestone 2.1). See the room notes in docs/floorplan.json and the photos. */
const MAIN: Placement[] = [
  // Garage: workbench + pegboard and shelving down the east wall, bins by the greenhouse door.
  W("workbench", "garage", "e", 1.1),
  W("pegboard", "garage", "e", 1.1, { y: 1.0 }),
  W("steel_shelf", "garage", "e", 4.9),
  W("steel_shelf", "garage", "e", 6.25),
  W("bins", "garage", "s", 5.9),

  // Mudroom: spindle bench under the coat wall, firewood rack, pine closet, red braided rug.
  W("spindle_bench", "mudroom", "e", 1.35),
  W("firewood_rack", "mudroom", "n", 7.98),
  W("closet_doors", "mudroom", "w", 4.5),
  P("rug_braided", "mudroom", 9.25, 3.0, { look: "red" }),
  W("frame", "mudroom", "e", 1.35, { y: 1.45, w: 0.55, h: 0.7, look: "map" }),
  W("frame", "mudroom", "n", 8.2, { y: 1.45, look: "photo" }),

  // Half bath.
  W("toilet", "half_bath", "s", 10.2),
  W("vanity", "half_bath", "w", 7.0),
  W("mirror", "half_bath", "w", 7.0, { y: 1.1 }),

  // Kitchen: fridge, counters and range along the north wall, an island with the sink and the
  // pot rack over it, counters along the south wall either side of the pantry.
  W("fridge", "kitchen", "n", 11.5),
  W("counter", "kitchen", "n", 12.76, { w: 1.68 }),
  W("range", "kitchen", "n", 13.98),
  W("counter", "kitchen", "n", 15.64, { w: 2.52 }),
  W("upper_cabinet", "kitchen", "n", 11.5, { y: 1.88, w: 0.84, h: 0.5 }),
  W("upper_cabinet", "kitchen", "n", 13.27, { y: 1.5, w: 0.5 }),
  W("upper_cabinet", "kitchen", "n", 14.69, { y: 1.5, w: 0.62 }),
  W("range_hood", "kitchen", "n", 13.98, { y: 1.55 }),
  W("upper_cabinet", "kitchen", "n", 16.45, { y: 1.5, w: 0.95 }),
  W("microwave", "kitchen", "n", 16.55, { y: 0.92 }),
  W("toaster", "kitchen", "n", 15.6, { y: 0.92 }),
  P("kettle", "kitchen", 13.8, 0.95, { y: 0.92 }),
  P("island", "kitchen", 14.0, 3.75),
  P("fruit_bowl", "kitchen", 14.75, 3.9, { y: 0.92 }),
  P("pot_rack", "kitchen", 14.0, 3.75, { y: 2.6 }),
  W("counter", "kitchen", "s", 12.17, { w: 2.2 }),
  W("counter", "kitchen", "s", 15.5, { w: 1.8 }),
  W("trash_can", "kitchen", "w", 1.65),
  P("rug_braided", "kitchen", 14.0, 5.0, { w: 1.8, d: 0.9, look: "blue" }),
  // Pantry: shelves of jars, cans and boxes round three walls.
  W("pantry_shelf", "pantry", "s", 14.0, { w: 5.8 }),
  W("pantry_shelf", "pantry", "w", 7.95, { w: 1.1 }),
  W("pantry_shelf", "pantry", "e", 7.95, { w: 1.1 }),

  // Dining hall: farmhouse table, 4 slat-back chairs, blue braided round rug, brass fan, plant stand.
  P("rug_round", "dining_hall", 19.6, 2.4, { look: "blue" }),
  P("farm_table", "dining_hall", 19.6, 2.4),
  P("slat_chair", "dining_hall", 19.15, 1.65),
  P("slat_chair", "dining_hall", 20.05, 1.65),
  P("slat_chair", "dining_hall", 19.15, 3.15, { rot: 180 }),
  P("slat_chair", "dining_hall", 20.05, 3.15, { rot: 180 }),
  P("ceiling_fan", "dining_hall", 19.25, 2.5, { y: 2.6 }),
  P("plant_stand", "dining_hall", 21.12, 0.42),
  P("flowers", "dining_hall", 21.12, 0.42, { y: 1.25 }),
  W("frame", "dining_hall", "e", 2.4, { y: 1.35, w: 0.75, h: 0.55, look: "print" }),

  // Common area (pink sitting room): cream sofa with a sheepskin, armchair, side tables, lamp, TV.
  W("sofa", "common_area", "w", 8.1, { look: "cream" }),
  W("side_table", "common_area", "w", 6.85),
  W("side_table", "common_area", "w", 9.37),
  P("table_lamp", "common_area", 17.3, 6.85, { y: 0.6 }),
  P("armchair", "common_area", 21.0, 5.55, { rot: 270, look: "cream" }),
  W("tv_stand", "common_area", "e", 9.35),
  W("tv", "common_area", "e", 9.35, { y: 0.5, d: 0.06 }),
  P("floor_lamp", "common_area", 17.75, 9.65),
  W("frame", "common_area", "w", 7.6, { y: 1.3, w: 0.4, h: 0.5, look: "print" }),
  W("frame", "common_area", "w", 8.6, { y: 1.3, w: 0.4, h: 0.5, look: "photo" }),

  // Great room: camelback sofas facing each other in front of the fireplace with a round glass
  // table, two striped wingbacks, the grand piano and harp by the windows, Tiffany lamp, oriental rug.
  P("rug_oriental", "great_room", 26.3, 7.15, { w: 3.4, d: 2.6, look: "red" }),
  P("camelback_sofa", "great_room", 26.58, 5.85),
  P("camelback_sofa", "great_room", 26.58, 8.45, { rot: 180 }),
  P("coffee_table", "great_room", 26.58, 7.15, { look: "glass" }),
  P("wingback_chair", "great_room", 24.75, 6.55, { rot: 90 }),
  P("wingback_chair", "great_room", 24.75, 7.75, { rot: 90 }),
  P("side_table", "great_room", 24.0, 7.15, { look: "round" }),
  P("flowers", "great_room", 24.0, 7.15, { y: 0.6, look: "fern" }),
  P("grand_piano", "great_room", 22.6, 10.0, { rot: 90 }),
  P("harp", "great_room", 28.6, 10.55, { rot: 270 }),
  P("tiffany_lamp", "great_room", 21.92, 11.1),
  W("painting", "great_room", "w", 4.9, { y: 1.4, look: "landscape" }),
  W("painting", "great_room", "e", 4.75, { y: 1.4, w: 0.7, h: 0.9, look: "portrait" }),
  W("painting", "great_room", "e", 10.6, { y: 1.4, w: 0.6, h: 0.75, look: "sea" }),

  // Office / library: floor-to-ceiling pine bookshelves, beige armchair + ottoman, plaid curtains.
  W("bookshelf", "office", "e", 1.75, { w: 3.3 }),
  W("bookshelf", "office", "w", 2.3, { w: 1.8 }),
  P("armchair_ottoman", "office", 23.0, 1.0, { rot: 90 }),
  P("floor_lamp", "office", 22.0, 0.4),
  W("frame", "office", "w", 0.75, { y: 1.3, w: 0.5, h: 0.65, look: "print" }),

  // Foyer: console table, small oriental rug, brass lantern.
  W("console_table", "foyer", "e", 0.68),
  P("table_lamp", "foyer", 29.24, 0.45, { y: 0.8 }),
  P("rug_oriental", "foyer", 28.0, 1.9, { w: 1.6, d: 1.0, look: "blue" }),
  P("pendant_lantern", "foyer", 28.0, 1.7, { y: 2.6 }),

  // Formal dining (Catan room): mahogany table with EXACTLY 4 Chippendale chairs, one per side
  // (GAME_SPEC §8.2, §16), china cabinet, candle chandelier, oriental rug.
  P("rug_oriental", "formal_dining", 31.9, 2.4, { w: 3.0, d: 2.4, look: "gold" }),
  P("dining_table", "formal_dining", 31.9, 2.4, { look: "cloth" }),
  P("chippendale_chair", "formal_dining", 31.9, 1.6),
  P("chippendale_chair", "formal_dining", 31.9, 3.2, { rot: 180 }),
  P("chippendale_chair", "formal_dining", 30.92, 2.4, { rot: 90 }),
  P("chippendale_chair", "formal_dining", 32.88, 2.4, { rot: 270 }),
  P("flowers", "formal_dining", 31.9, 2.4, { y: 0.76, look: "dried" }),
  W("china_cabinet", "formal_dining", "s", 32.0),
  P("chandelier", "formal_dining", 31.9, 2.4, { y: 2.6 }),
  W("painting", "formal_dining", "e", 2.5, { y: 1.45, w: 0.9, h: 0.4, look: "landscape" }),

  // Downstairs bedroom (blue): queen bed between the east windows, nightstands, black desk.
  W("queen_bed", "bedroom_main", "e", 7.5, { look: "white" }),
  W("nightstand", "bedroom_main", "e", 6.4),
  W("nightstand", "bedroom_main", "e", 8.6),
  P("table_lamp", "bedroom_main", 33.68, 6.4, { y: 0.6 }),
  W("desk", "bedroom_main", "n", 31.2, { look: "black" }),
  P("table_lamp", "bedroom_main", 30.95, 5.25, { y: 0.76 }),
  W("mirror", "bedroom_main", "n", 31.2, { y: 1.15, w: 0.5, h: 0.65 }),
  P("slat_chair", "bedroom_main", 31.2, 5.8, { rot: 180, look: "black" }),
  W("frame", "bedroom_main", "s", 33.2, { y: 1.4, look: "print" }),

  // Deck: green market umbrella over a round black table with 4 chairs. Porch: rockers.
  P("patio_set", "deck", 19.3, 12.4),
  P("rocking_chair", "porch", 30.6, -1.1, { rot: 180 }),
  P("rocking_chair", "porch", 32.0, -1.1, { rot: 180 }),
  P("rocking_chair", "porch", 23.2, -1.1, { rot: 180 }),
];

export const FURNITURE: Placement[] = [...MAIN];

// --- geometry helpers ---

export function kindOf(p: Placement): Kind & { w: number; d: number; h: number } {
  const k: Kind = KINDS[p.kind];
  return { ...k, w: p.w ?? k.w, d: p.d ?? k.d, h: p.h ?? k.h };
}

/** Floor height (real metres) of a room on its level. */
export function roomFloorY(room: string): number {
  if (room === "great_room") return GREAT_ROOM_FLOOR;
  return levelOfRoom(room)?.floorY ?? 0;
}

export function levelOfRoom(room: string) {
  return LEVELS.find((l) => l.rooms.some((r) => r.id === room) || l.outdoor.some((r) => r.id === room));
}

export interface Footprint {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** The axis-aligned box a piece covers on the floor (rotations are multiples of 90°, or the box round any other angle). */
export function footprint(p: Placement, useFoot = false): Footprint {
  const k = kindOf(p);
  const w = useFoot && k.foot ? k.foot.w : k.w, d = useFoot && k.foot ? k.foot.d : k.d;
  const a = ((p.rot ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
  return { x0: p.x - hw, z0: p.z - hd, x1: p.x + hw, z1: p.z + hd };
}

/** Is a piece something you bump into? */
export const isSolid = (p: Placement) => (kindOf(p).mount ?? "floor") === "floor";

/** Rooms on a level by id (rooms + porch/deck/greenhouse). */
export const roomRect = (id: string): Rect | undefined => roomById(id);
export type { LevelId };
