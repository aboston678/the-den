// The Catan table (GAME_SPEC §16): the formal dining table and its 4 chairs, in world metres.
// Seats go clockwise round the table seen from above (north, east, south, west), which is also
// the turn order.

import { FURNITURE, kindOf, roomFloorY } from "../house/furniture.ts";
import { HOUSE, houseToWorld } from "../world/layout.ts";

const table = FURNITURE.find((p) => p.kind === "dining_table" && p.room === "formal_dining")!;
const chairs = FURNITURE.filter((p) => p.kind === "chippendale_chair" && p.room === "formal_dining");

/** Table centre and top (world). */
export const CATAN_TABLE = (() => {
  const c = houseToWorld(table.x, table.z);
  const k = kindOf(table);
  return { x: c.x, z: c.z, topY: (roomFloorY(table.room) + k.h) * HOUSE.scale, w: k.w * HOUSE.scale, d: k.d * HOUSE.scale };
})();

export interface CatanSeat {
  /** Chair centre (world). */
  x: number;
  z: number;
  /** Floor height (world). */
  y: number;
  /** Facing the table: the bear faces (sin yaw, cos yaw). */
  yaw: number;
}

/** The 4 seats, clockwise from the north side. */
export const CATAN_SEATS: readonly CatanSeat[] = (() => {
  const seats = chairs.map((p) => {
    const w = houseToWorld(p.x, p.z);
    return { x: w.x, z: w.z, y: roomFloorY(p.room) * HOUSE.scale, yaw: Math.atan2(CATAN_TABLE.x - w.x, CATAN_TABLE.z - w.z) };
  });
  // Clockwise from north (seen from above, x east and z south): angle from the table centre.
  const angle = (s: CatanSeat) => (Math.atan2(s.x - CATAN_TABLE.x, -(s.z - CATAN_TABLE.z)) + 2 * Math.PI) % (2 * Math.PI);
  return seats.sort((a, b) => angle(a) - angle(b));
})();

/** How close (metres, level ground) a bear must be to a chair to sit in it. */
export const SIT_REACH = 1.6;

/** The free seat nearest to (x, z) within reach, or -1. */
export function nearestSeat(x: number, z: number, taken: readonly boolean[] = []): number {
  let best = -1, bestD = SIT_REACH;
  CATAN_SEATS.forEach((s, i) => {
    const d = Math.hypot(x - s.x, z - s.z);
    if (!taken[i] && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Bears near the table can watch a game (the scoreboard shows within this distance). */
export const WATCH_REACH = 4.5;
