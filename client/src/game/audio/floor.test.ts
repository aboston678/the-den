import { DOCK, DRIVEWAY, HOUSE, PLATFORM_Y, heightAt, level, roomById, streamCenter, surfaceAt } from "@den/shared";
import { describe, expect, it } from "vitest";
import { floorAt } from "./floor.ts";

// Footsteps by surface (GAME_SPEC §10): what's underfoot at known spots.

const S = HOUSE.scale;
/** World position of a room's middle, on its level's floor. */
function room(id: string) {
  const r = roomById(id)!;
  const lvl = ["basement", "main", "upper"].map((l) => level(l as "main")).find((l) => l.rooms.includes(r) || l.outdoor.includes(r))!;
  return { x: HOUSE.originX + (r.x + r.w / 2) * S, y: lvl.floorY * S, z: HOUSE.originZ + (r.z + r.d / 2) * S };
}
const at = (id: string) => {
  const p = room(id);
  return floorAt(p.x, p.y, p.z);
};

describe("floorAt", () => {
  it("rooms use their floor: carpet, oak, tile and terracotta", () => {
    expect(at("den")).toBe("carpet");
    expect(at("great_room")).toBe("carpet");
    expect(at("foyer")).toBe("wood");
    expect(at("formal_dining")).toBe("wood");
    expect(at("kitchen")).toBe("stone");
    expect(at("bathroom_up")).toBe("stone");
    expect(at("garage")).toBe("stone");
  });

  it("the porch and deck are wood, the greenhouse stone", () => {
    expect(at("porch")).toBe("wood");
    expect(at("deck")).toBe("wood");
    expect(at("greenhouse")).toBe("stone");
  });

  it("the alley's raised approach is wood, the lounge carpet", () => {
    const p = room("bowling_alley");
    expect(floorAt(p.x, PLATFORM_Y * S, p.z)).toBe("wood");
    expect(at("bowling_lounge")).toBe("carpet");
  });

  it("outside: the driveway is stone, the dock wood, the lawn grass, the stream banks dirt", () => {
    const road = DRIVEWAY.points[3]!;
    expect(floorAt(road.x, heightAt(road.x, road.z), road.z)).toBe("stone");
    const dx = streamCenter(DOCK.z) + DOCK.startD + DOCK.length / 2;
    expect(floorAt(dx, DOCK.deckY, DOCK.z)).toBe("wood");
    // Somewhere on the open lawn, and somewhere muddy by the stream.
    let lawn = null, mud = null;
    for (let x = -60; x < 60 && (!lawn || !mud); x += 1.5) {
      for (let z = -60; z < 60 && (!lawn || !mud); z += 1.5) {
        const s = surfaceAt(x, z);
        if (!lawn && s.lawn > 0.95 && !DRIVEWAY.closest(x, z, 4)) lawn = { x, z };
        if (!mud && s.mud > 0.9) mud = { x, z };
      }
    }
    expect(floorAt(lawn!.x, heightAt(lawn!.x, lawn!.z), lawn!.z)).toBe("grass");
    expect(floorAt(mud!.x, heightAt(mud!.x, mud!.z), mud!.z)).toBe("dirt");
  });
});
