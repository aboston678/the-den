import { HOUSE, type LevelId, LEVELS } from "@den/shared";
import { FIREPLACE } from "./structure.ts";
import { UPPER_CEILING, roofUnder } from "./roof.ts";
import { S, toWorld } from "./space.ts";
import { contains } from "./rects.ts";
import { GREAT_ROOM, GREAT_ROOM_FLOOR } from "./walls.ts";

// Where the house's lights are (GAME_SPEC §8.2, §9). Indoors: a ceiling fixture in every room
// (more in big rooms), always on. Outdoors: lanterns by the doors, on from dusk to dawn.
// Positions are world metres.

export interface Fixture {
  pos: [number, number, number];
  level: LevelId;
  /** Brightness relative to an ordinary ceiling light (high ceilings need more). */
  power: number;
}

/** Roughly one ceiling light per 4 m of room (floorplan metres). */
const SPACING = 4;
/** The great room's cathedral ceiling gets a chandelier hanging this high (floorplan metres). */
const GREAT_ROOM_LIGHT_Y = 4.2;

/** Thickness of the main floor's slab (structure.ts): the basement ceiling is its underside. */
const MAIN_SLAB = 0.3;

function ceilingY(level: LevelId, room: string, x: number, z: number) {
  // Under the sunken great room the basement ceiling is lower.
  if (level === "basement") return (contains(GREAT_ROOM, x, z) ? GREAT_ROOM_FLOOR : 0) - MAIN_SLAB;
  if (level === "main") return room === "great_room" ? GREAT_ROOM_LIGHT_Y : 2.6;
  return Math.min(UPPER_CEILING, roofUnder(x, z) ?? UPPER_CEILING);
}

export const INTERIOR_FIXTURES: Fixture[] = LEVELS.flatMap((l) =>
  l.rooms.flatMap((r) => {
    const nx = Math.max(1, Math.round(r.w / SPACING)), nz = Math.max(1, Math.round(r.d / SPACING));
    const out: Fixture[] = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = r.x + (r.w * (i + 0.5)) / nx, z = r.z + (r.d * (j + 0.5)) / nz;
        out.push({ pos: toWorld([x, ceilingY(l.id, r.id, x, z) - 0.06, z]), level: l.id, power: r.id === "great_room" ? 3 : 1 });
      }
    }
    return out;
  }),
);

/** Lanterns on the outside walls: by the front door, the garage doors, the mudroom door, the deck and the den's doors. */
export const EXTERIOR_FIXTURES: Fixture[] = (
  [
    [26.85, 1.95, -0.07, "main"], [28.15, 1.95, -0.07, "main"], // front door, on the porch
    [-0.07, 2.3, 0.45, "main"], [-0.07, 2.3, 4.2, "main"], [-0.07, 2.3, 7.95, "main"], // either side of the garage doors
    [9.95, 1.95, 0.43, "main"], // mudroom door
    [25.5, 2.25, 11.57, "main"], [18.3, 2.05, 10.07, "main"], // deck: great room doors, common area slider
    [18.75, -0.75, 10.07, "basement"], // the den's french doors to the back lawn
  ] as const
).map(([x, y, z, level]) => ({ pos: toWorld([x, y, z]), level, power: 1 }));

/** Where the fire burns: just in front of the firebox, facing into the great room. */
export const FIRE_POS = toWorld([FIREPLACE.x0 - 0.12, GREAT_ROOM_FLOOR + 0.3, (FIREPLACE.z0 + FIREPLACE.z1) / 2]);

/** Which floor of the house (x, y, z) is inside, or null when outdoors (the porch, deck and greenhouse count as outdoors). */
export function insideHouse(x: number, y: number, z: number): LevelId | null {
  const px = (x - HOUSE.originX) / S, pz = (z - HOUSE.originZ) / S, py = y / S;
  for (const l of LEVELS) {
    if (py < l.floorY - 0.7 || py > l.floorY + 2.6) continue;
    if (l.rooms.some((r) => px >= r.x && px <= r.x + r.w && pz >= r.z && pz <= r.z + r.d)) return l.id;
  }
  return null;
}

/** How "indoors" the bear is right now (0 outside … 1 inside), eased so lighting doesn't snap at doorways. */
export const indoor = { amount: 0, level: null as LevelId | null };
