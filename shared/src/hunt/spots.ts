// Where the bear hunt happens (Andrew, 2026-10-17): the blue circle by the dock where players ready
// up, the gun locker in the basement den, and the hiding spots the bear is dropped at (the whole map,
// house and racetrack included). World metres.

import { FURNITURE, footprint, isSolid, kindOf, roomFloorY, roomRect } from "../house/furniture.ts";
import { PADDOCK, TRACK, TRACK_ROAD, TRACK_Y } from "../track.ts";
import { DRIVEWAY, HOUSE, TRAIL, houseToWorld } from "../world/layout.ts";

/** The glowing circle on the trail ground just west of the rod bucket at the dock. */
export const HUNT_CIRCLE = { x: 102.5, z: 6.5, r: 3.5 } as const;
export const inHuntCircle = (x: number, z: number) => Math.hypot(x - HUNT_CIRCLE.x, z - HUNT_CIRCLE.z) <= HUNT_CIRCLE.r;

/** The gun locker against the basement den's north wall (furniture.ts), and how close you must be to use it. */
export const GUN_LOCKER = (() => {
  const p = FURNITURE.find((f) => f.kind === "gun_locker")!;
  const c = houseToWorld(p.x, p.z);
  const k = kindOf(p);
  // It faces south (into the den): you stand in front of it.
  return { x: c.x, z: c.z, y: roomFloorY(p.room) * HOUSE.scale, w: k.w * HOUSE.scale, d: k.d * HOUSE.scale, h: k.h * HOUSE.scale, yaw: 0 };
})();
export const LOCKER_REACH = 2.6;
export const nearLocker = (x: number, y: number, z: number) =>
  Math.hypot(x - GUN_LOCKER.x, z - (GUN_LOCKER.z + GUN_LOCKER.d / 2)) <= LOCKER_REACH && Math.abs(y - GUN_LOCKER.y) < 2;

export interface HideSpot {
  name: string;
  x: number;
  /** Floor height for spots indoors; null outdoors (the bear drops onto whatever is there). */
  y: number | null;
  z: number;
}

/** A spot in a room as far from the solid furniture as possible (floorplan rects, world result). */
function roomSpot(room: string, name: string): HideSpot {
  const r = roomRect(room)!;
  const pieces = FURNITURE.filter((p) => p.room === room && isSolid(p)).map((p) => footprint(p, true));
  let best = { x: r.x + r.w / 2, z: r.z + r.d / 2, clear: -1 };
  const inset = 0.7;
  for (let x = r.x + inset; x <= r.x + r.w - inset; x += 0.25) {
    for (let z = r.z + inset; z <= r.z + r.d - inset; z += 0.25) {
      let clear = Infinity;
      for (const f of pieces) {
        const dx = Math.max(f.x0 - x, 0, x - f.x1), dz = Math.max(f.z0 - z, 0, z - f.z1);
        clear = Math.min(clear, Math.hypot(dx, dz));
      }
      if (clear > best.clear) best = { x, z, clear };
    }
  }
  const w = houseToWorld(best.x, best.z);
  return { name, x: w.x, y: roomFloorY(room) * HOUSE.scale + 0.05, z: w.z };
}

const along = (path: { pointAt(s: number): { x: number; z: number } }, s: number, name: string, y: number | null = null): HideSpot => {
  const p = path.pointAt(s);
  return { name, x: p.x, y, z: p.z };
};

/** Every place the bear can start (never the same one twice in a row, never close to the circle). */
export const HIDE_SPOTS: readonly HideSpot[] = [
  // The house.
  roomSpot("garage", "the garage"),
  roomSpot("kitchen", "the kitchen"),
  roomSpot("great_room", "the great room"),
  roomSpot("formal_dining", "the formal dining room"),
  roomSpot("office", "the office"),
  roomSpot("bedroom_main", "the downstairs bedroom"),
  roomSpot("bedroom_yellow", "the yellow bedroom"),
  roomSpot("bedroom_skylight", "the skylight bedroom"),
  roomSpot("den", "the basement den"),
  roomSpot("bowling_lounge", "the bowling lounge"),
  roomSpot("greenhouse", "the greenhouse"),
  // Outdoors on the property.
  along(DRIVEWAY, 20, "the top of the driveway"),
  along(DRIVEWAY, 60, "halfway down the driveway"),
  along(TRAIL, 4, "the back lawn"),
  { name: "the front lawn", x: 18, y: null, z: -27 },
  { name: "the north-west woods", x: -82, y: null, z: -62 },
  { name: "the south-west woods", x: -70, y: null, z: 72 },
  { name: "the north woods", x: 30, y: null, z: -88 },
  { name: "the south woods", x: 45, y: null, z: 85 },
  { name: "the north-east woods", x: 95, y: null, z: -80 },
  { name: "the south-east woods", x: 95, y: null, z: 82 },
  // Out past the driveway: the road and the racetrack.
  along(TRACK_ROAD, TRACK_ROAD.length / 2, "the road to the track", TRACK_Y),
  { name: "the paddock", x: (PADDOCK.minX + PADDOCK.maxX) / 2, y: TRACK_Y, z: PADDOCK.maxZ + 6 },
  along(TRACK, TRACK.length * 0.3, "the track's west side", TRACK_Y),
  along(TRACK, TRACK.length * 0.55, "the back straight", TRACK_Y),
  along(TRACK, TRACK.length * 0.8, "the hairpin", TRACK_Y),
];

/** The bear never starts this close to the circle. */
export const HIDE_MIN_DISTANCE = 80;

/** Pick a spot for the bear: far enough from the circle and not the one used last time. */
export function pickHideSpot(rand: () => number, last = -1): number {
  const ok = HIDE_SPOTS.map((s, i) => i).filter((i) => i !== last && Math.hypot(HIDE_SPOTS[i]!.x - HUNT_CIRCLE.x, HIDE_SPOTS[i]!.z - HUNT_CIRCLE.z) >= HIDE_MIN_DISTANCE);
  return ok[Math.min(ok.length - 1, Math.floor(rand() * ok.length))]!;
}
