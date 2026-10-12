import { MAX_PLAYERS } from "../constants.ts";
import { DRIVEWAY, distanceToEdge } from "./layout.ts";
import { drivewayY } from "./terrain.ts";

/** Which map a party plays on: the real property, or the 1.6 test field (dev/tests only). */
export const WORLDS = ["property", "test"] as const;
export type WorldName = (typeof WORLDS)[number];
export const isWorldName = (v: unknown): v is WorldName => WORLDS.includes(v as WorldName);

export interface SpawnSpot {
  x: number;
  y: number;
  z: number;
  /** Facing angle: the bear faces (sin yaw, cos yaw) on x/z. */
  yaw: number;
}

/** Metres along the driveway where the party starts: just inside the map's boundary. */
export const SPAWN_S = (() => {
  for (let s = 0; s < DRIVEWAY.length; s += 0.5) {
    const p = DRIVEWAY.pointAt(s);
    if (distanceToEdge(p.x, p.z) > 4) return s + 4;
  }
  return 0;
})();

/**
 * Where the bear in party slot 0–5 starts. On the property: two rows of three across the start of
 * the driveway, facing down it toward the house (GAME_SPEC §4). On the test field: a short line.
 */
export function spawnPoint(slot: number, world: WorldName = "property"): SpawnSpot {
  const s = Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(slot)));
  if (world === "test") return { x: (s - (MAX_PLAYERS - 1) / 2) * 1.8, y: 0, z: 4, yaw: Math.PI };
  const row = Math.floor(s / 3), col = s % 3;
  const along = SPAWN_S - row * 2.2;
  const p = DRIVEWAY.pointAt(along);
  const side = (col - 1) * 1.4;
  return { x: p.x + p.dz * side, y: drivewayY(along), z: p.z - p.dx * side, yaw: Math.atan2(p.dx, p.dz) };
}
