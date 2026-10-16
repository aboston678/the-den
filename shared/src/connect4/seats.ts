// The Connect Four table (Andrew, 2026-10-16): the games table in the basement stair landing and its
// two chairs, in world metres. Seat 0 is the north chair, seat 1 the south one.

import type { CatanSeat } from "../catan/seats.ts";
import { SIT_FORWARD, SIT_REACH } from "../catan/seats.ts";
import { FURNITURE, kindOf, roomFloorY } from "../house/furniture.ts";
import { HOUSE, houseToWorld } from "../world/layout.ts";

const table = FURNITURE.find((p) => p.kind === "game_table" && p.room === "stair_landing")!;
const chairs = FURNITURE.filter((p) => p.kind === "slat_chair" && p.room === "stair_landing");

/** Table centre and top (world). */
export const C4_TABLE = (() => {
  const c = houseToWorld(table.x, table.z);
  const k = kindOf(table);
  return { x: c.x, z: c.z, y: roomFloorY(table.room) * HOUSE.scale, topY: (roomFloorY(table.room) + k.h) * HOUSE.scale, w: k.w * HOUSE.scale, d: k.d * HOUSE.scale };
})();

/** The two chairs, north then south (same shape as a Catan seat, so the bear sits the same way). */
export const C4_SEATS: readonly CatanSeat[] = chairs
  .map((p): CatanSeat => {
    const w = houseToWorld(p.x, p.z);
    const yaw = Math.atan2(C4_TABLE.x - w.x, C4_TABLE.z - w.z);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const out = C4_TABLE.d / 2 + 0.55;
    return {
      x: w.x, z: w.z, y: C4_TABLE.y, yaw,
      sitX: w.x + fx * SIT_FORWARD, sitZ: w.z + fz * SIT_FORWARD,
      // Up on the west side of the chair, clear of the table (the stairs are to the east).
      standX: C4_TABLE.x - fx * out - fz * 0.85, standZ: C4_TABLE.z - fz * out + fx * 0.85,
    };
  })
  .sort((a, b) => a.z - b.z);

/** The free Connect Four chair nearest to (x, z) within reach, or -1. */
export function nearestC4Seat(x: number, z: number, taken: readonly boolean[] = []): number {
  let best = -1, bestD = SIT_REACH;
  C4_SEATS.forEach((s, i) => {
    const d = Math.hypot(x - s.x, z - s.z);
    if (!taken[i] && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
