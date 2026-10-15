import { ALLEY_FLOOR_Y, APRON, DRIVEWAY, DRIVEWAY_WIDTH, HOUSE, LEVELS, isOnDock, surfaceAt } from "@den/shared";
import { styleOf } from "../house/style.ts";

// What the bear is standing on, for footsteps (GAME_SPEC §10): grass (lawn and forest floor), dirt
// (mud, banks, trail, stream bed), stone (asphalt, tile, terracotta, concrete), wood (oak and pine
// floors, the porch, deck, dock and the alley's approach) or carpet.

export type Floor = "grass" | "dirt" | "stone" | "wood" | "carpet";

const S = HOUSE.scale;
const ROOM_FLOOR: Record<string, Floor> = { carpet: "carpet", oak: "wood", pine: "wood", tile: "stone", terracotta: "stone", concrete: "stone" };
const ATTACHED: Record<string, Floor> = { porch: "wood", deck: "wood", greenhouse: "stone" };

const inside = (px: number, pz: number, r: { x: number; z: number; w: number; d: number }) => px >= r.x && px <= r.x + r.w && pz >= r.z && pz <= r.z + r.d;

export function floorAt(x: number, y: number, z: number): Floor {
  const px = (x - HOUSE.originX) / S, pz = (z - HOUSE.originZ) / S, py = y / S;
  for (const l of LEVELS) {
    if (py < l.floorY - 0.7 || py > l.floorY + 2.6) continue;
    const room = l.rooms.find((r) => inside(px, pz, r));
    if (room) {
      // The alley's lanes and approach are a raised wooden platform over the carpet.
      if (room.id === "bowling_alley" && py > ALLEY_FLOOR_Y + 0.1) return "wood";
      return ROOM_FLOOR[styleOf(room.id).floor] ?? "wood";
    }
    const attached = l.outdoor.find((r) => inside(px, pz, r));
    if (attached) return ATTACHED[attached.id] ?? "wood";
  }
  if (isOnDock(x, z)) return "wood";
  if (x >= APRON.minX && x <= APRON.maxX && z >= APRON.minZ && z <= APRON.maxZ) return "stone";
  if (DRIVEWAY.closest(x, z, DRIVEWAY_WIDTH / 2)) return "stone";
  const s = surfaceAt(x, z);
  return s.mud + s.bed > Math.max(s.lawn, s.forest) ? "dirt" : "grass";
}
