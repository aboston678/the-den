import { describe, expect, it } from "vitest";
import { DOORS, INTERACTIVE_DOORS, LEVELS, doorById } from "./floorplan.ts";

describe("floorplan", () => {
  it("loads all three levels", () => {
    expect(LEVELS.map((l) => l.id)).toEqual(["basement", "main", "upper"]);
    expect(LEVELS.flatMap((l) => l.rooms)).toHaveLength(5 + 12 + 6);
  });

  it("gives every door a unique id and a wall direction", () => {
    expect(new Set(DOORS.map((d) => d.id)).size).toBe(DOORS.length);
    expect(doorById("main:garage-mudroom")!.axis).toBe("z"); // in the garage's east wall
    expect(doorById("main:foyer-porch")!.axis).toBe("x"); // front door, in the north wall
    expect(doorById("main:great_room-deck:2")).toBeDefined(); // the second of the two deck doors
    expect(doorById("basement:den-utility")!.locked).toBe(true);
  });

  it("has a door under the stairs from the great room to the basement stairs", () => {
    const d = doorById("main:great_room-basement_stairs")!;
    expect(d.type).toBe("hinged");
    expect(INTERACTIVE_DOORS).toContain(d);
  });

  it("puts doors at their floor's height in the world", () => {
    expect(doorById("basement:den-outside")!.world.y).toBeCloseTo(-3.375);
    expect(doorById("upper:landing-bedroom_pink")!.world.y).toBeCloseTo(3.375);
  });
});
