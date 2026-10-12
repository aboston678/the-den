import plan from "../../../docs/floorplan.json" with { type: "json" };
import { HOUSE, houseToWorld } from "../world/layout.ts";

// The house layout from docs/floorplan.json (real-world metres; the game builds it 1.25× bigger,
// GAME_SPEC §4, §8). Shared so the server can validate door clicks.

export type LevelId = "basement" | "main" | "upper";
export type DoorType = "hinged" | "french" | "sliding" | "opening" | "garage" | "exterior";

export interface Rect {
  id: string;
  name?: string;
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface DoorSpec {
  a: string;
  b: string;
  x: number;
  z: number;
  width: number;
  type: DoorType;
  locked?: boolean;
}
export interface StairSpec {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface Level {
  id: LevelId;
  floorY: number;
  ceilingHeight: number;
  rooms: Rect[];
  doors: DoorSpec[];
  stairs: StairSpec[];
  outdoor: Rect[];
  voids: Rect[];
}

export const LEVELS: Level[] = plan.levels.map((l) => ({
  id: l.id as LevelId,
  floorY: l.floor_y,
  ceilingHeight: l.ceiling_height,
  rooms: l.rooms as Rect[],
  doors: l.doors as DoorSpec[],
  stairs: l.stairs as StairSpec[],
  outdoor: ((l as { outdoor_attached?: Rect[] }).outdoor_attached ?? []) as Rect[],
  voids: ((l as { open_to_below?: Rect[] }).open_to_below ?? []) as Rect[],
}));
export const level = (id: LevelId) => LEVELS.find((l) => l.id === id)!;

/** Room (or porch/deck/greenhouse) by id, on any level. */
export function roomById(id: string): Rect | undefined {
  for (const l of LEVELS) {
    const r = l.rooms.find((r) => r.id === id) ?? l.outdoor.find((r) => r.id === id);
    if (r) return r;
  }
  return undefined;
}

// --- doors ---

/** Door height in real metres (a standard 2.03 m door; garage doors 2.1 m). */
export const DOOR_HEIGHT = 2.03;
export const GARAGE_DOOR_HEIGHT = 2.1;

export interface Door extends DoorSpec {
  /** Stable id, e.g. "main:garage-mudroom" (with ":2" etc. when the same rooms share several doors). */
  id: string;
  level: LevelId;
  /** "x" when the door sits in a wall running along x (at constant z), "z" for a wall along z. */
  axis: "x" | "z";
  /** Door centre on the floor, in world coordinates. */
  world: { x: number; y: number; z: number };
}

/** Is (x, z) on an edge of rect r? Returns which axis that edge runs along. */
function edgeAxis(r: Rect, x: number, z: number): "x" | "z" | null {
  const eps = 0.01;
  const inX = x >= r.x - eps && x <= r.x + r.w + eps, inZ = z >= r.z - eps && z <= r.z + r.d + eps;
  if (inX && (Math.abs(z - r.z) < eps || Math.abs(z - (r.z + r.d)) < eps)) return "x";
  if (inZ && (Math.abs(x - r.x) < eps || Math.abs(x - (r.x + r.w)) < eps)) return "z";
  return null;
}

/**
 * Small corrections to the draft floorplan so it can be built (logged in PROGRESS.md):
 * the foyer → great room opening starts east of the stairs (which need that wall for the
 * basement door), and the basement door under the stairs is added from the great room.
 */
const DOOR_FIXES: Record<string, Partial<DoorSpec>> = {
  "main:great_room-foyer": { x: 28.2, width: 2.4 },
};
const EXTRA_DOORS: { level: LevelId; door: DoorSpec }[] = [
  { level: "main", door: { a: "great_room", b: "basement_stairs", x: 26.2, z: 3.5, width: 0.9, type: "hinged" } },
];

export const DOORS: Door[] = (() => {
  const out: Door[] = [];
  const seen = new Map<string, number>();
  const all = [...LEVELS.flatMap((l) => l.doors.map((door) => ({ level: l.id, door }))), ...EXTRA_DOORS];
  for (const { level: lv, door: raw } of all) {
    const base = `${lv}:${raw.a}-${raw.b}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}:${n}`;
    const door = { ...raw, ...DOOR_FIXES[id] };
    const rects = [roomById(door.a), roomById(door.b)].filter((r): r is Rect => !!r);
    const axis = rects.map((r) => edgeAxis(r, raw.x, raw.z)).find((a) => a) ?? "x";
    const w = houseToWorld(door.x, door.z);
    const floorY = lv === "basement" ? HOUSE.basementFloorY : lv === "upper" ? level("upper").floorY * HOUSE.scale : 0;
    out.push({ ...door, id, level: lv, axis, world: { x: w.x, y: floorY, z: w.z } });
  }
  return out;
})();

/** Doors you can open and close (not plain openings). */
export const INTERACTIVE_DOORS = DOORS.filter((d) => d.type !== "opening");
export const doorById = (id: string) => DOORS.find((d) => d.id === id);

/** How close (world metres, door centre to bear) you must be to open a door. */
export const DOOR_REACH = 2.6;

/**
 * Where the ground is cut away for the house (world rectangles): every main-floor and basement room
 * (the bowling alley only as far as the house; past that it runs underground), the greenhouse and porch.
 */
export function houseCutRects() {
  const rects: Rect[] = [...level("main").rooms, ...level("basement").rooms, ...level("main").outdoor.filter((r) => r.id !== "deck")];
  return rects.map((r) => {
    const x1 = r.id === "bowling_alley" ? Math.min(r.x + r.w, 34) : r.x + r.w;
    const a = houseToWorld(r.x, r.z), b = houseToWorld(x1, r.z + r.d);
    return { minX: a.x, minZ: a.z, maxX: b.x, maxZ: b.z };
  });
}
