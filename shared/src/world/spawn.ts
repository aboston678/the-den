import { MAX_PLAYERS } from "../constants.ts";
import { APRON, DRIVEWAY, distanceToEdge } from "./layout.ts";

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

/** Metres along the driveway just inside the map's boundary (the old spawn; the roadside planting starts here). */
export const SPAWN_S = (() => {
  for (let s = 0; s < DRIVEWAY.length; s += 0.5) {
    const p = DRIVEWAY.pointAt(s);
    if (distanceToEdge(p.x, p.z) > 4) return s + 4;
  }
  return 0;
})();

/** The middle of the spawn rows: on the apron in front of the garage doors (world z −4.25 and 0.75). */
export const SPAWN_CENTRE = { x: -26.1, z: -1.75 };

/**
 * Where the bear in party slot 0–5 starts. On the property: two rows of three on the paved apron,
 * facing the garage doors (east; GAME_SPEC §4, Andrew 2026-10-16). On the test field: a short line.
 */
export function spawnPoint(slot: number, world: WorldName = "property"): SpawnSpot {
  const s = Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(slot)));
  if (world === "test") return { x: (s - (MAX_PLAYERS - 1) / 2) * 1.8, y: 0, z: 4, yaw: Math.PI };
  const row = Math.floor(s / 3), col = s % 3;
  return { x: SPAWN_CENTRE.x + 1.1 - row * 2.2, y: APRON.y, z: SPAWN_CENTRE.z + (col - 1) * 1.4, yaw: Math.PI / 2 };
}
