import { HOUSE } from "../world/layout.ts";

// The bowling alley's layout (GAME_SPEC §15, Phase 3): two regulation lanes in the basement room
// `bowling_alley` (docs/floorplan.json, floorplan x 28–56, z 0–6), running west → east with the
// bowler at the west end. Everything here is real metres; the game builds the house (and so the
// alley) 1.25× bigger, so the lanes keep regulation proportions.
//
// Two kinds of coordinates:
// - floorplan: x west→east, z north→south, y up (the basement floor is at −2.7).
// - lane: x along the lane from the foul line (0) toward the pins, z across it from the lane's
//   centre line (same direction as floorplan z), y up from the lane surface. The ball and pin
//   physics run in lane coordinates.

/** Basement floor height (floorplan). */
export const ALLEY_FLOOR_Y = -2.7;
/** The lanes and approach sit on a platform one step up (the photo). */
export const PLATFORM_Y = ALLEY_FLOOR_Y + 0.18;
/** The alley's ceiling: just under the main floor's slab (−0.3), and the same past the house (a thin underground roof). */
export const ALLEY_CEILING_Y = -0.32;

/** Regulation sizes (metres). */
export const LANE = {
  /** Width of the playing surface (41.5 in). */
  width: 1.054,
  /** Each gutter (9.25 in). */
  gutter: 0.235,
  /** How far the gutter floor is below the lane surface. */
  gutterDepth: 0.06,
  /** Foul line to the head pin's centre (60 ft). */
  headPin: 18.288,
  /** Foul line to the pit edge, the end of the pin deck. */
  pitEdge: 19.157,
  /** The pit, behind the pin deck. */
  pitDepth: 0.75,
  /** The approach, behind the foul line (15 ft). */
  approach: 4.57,
  /** The oiled front of the lane; past this the dry back end lets a spinning ball hook. */
  oil: 12.2,
  /** Targeting arrows (15 ft from the foul line) and dots (7 ft). */
  arrows: 4.57,
  dots: 2.13,
} as const;

/** The ball (8.5 in) and pins (15 in tall). */
export const BALL = { radius: 0.109, mass: 7 } as const;
export const PIN = { height: 0.381, maxRadius: 0.0605, mass: 1.6, spacing: 0.3048 } as const;

/** Where the foul line is (floorplan x). The approach starts just east of the great room's low ceiling. */
export const FOUL_X = 34.2;
/** Width of the raised strip between the two lanes (ball return, kiosk). */
export const CAPPING = 0.7;
/** North edge of lane 1's outside gutter (floorplan z), leaving room for the side kickback. */
const FIRST_GUTTER_Z = 0.3;

export interface LaneSpec {
  /** "1" (north, the left one as you face the pins) or "2". */
  id: "1" | "2";
  /** Centre line (floorplan z). */
  cz: number;
}

const laneSpan = LANE.width + 2 * LANE.gutter;
export const LANES: LaneSpec[] = [
  { id: "1", cz: FIRST_GUTTER_Z + LANE.gutter + LANE.width / 2 },
  { id: "2", cz: FIRST_GUTTER_Z + laneSpan + CAPPING + LANE.gutter + LANE.width / 2 },
];
export const laneById = (id: string) => LANES.find((l) => l.id === id);

/** The whole lane bed (both lanes, gutters, capping), floorplan z. */
export const BED = {
  z0: FIRST_GUTTER_Z,
  z1: FIRST_GUTTER_Z + 2 * laneSpan + CAPPING,
  /** Start of the approach (floorplan x). */
  x0: FOUL_X - LANE.approach,
  /** Back of the pit (floorplan x). */
  x1: FOUL_X + LANE.pitEdge + LANE.pitDepth,
} as const;
/** The ball return + kiosk, on the capping between the lanes (floorplan x/z). */
export const BALL_RETURN = { x: BED.x0 + 1.3, z: (LANES[0]!.cz + LANES[1]!.cz) / 2 } as const;

/** Pin spots in lane coordinates (x from the foul line, z across), pins 1–10 in the usual order. */
export const PIN_SPOTS: { x: number; z: number }[] = (() => {
  const row = PIN.spacing * Math.cos(Math.PI / 6); // 26.4 cm between rows
  const half = PIN.spacing / 2;
  const rows = [[0], [-half, half], [-2 * half, 0, 2 * half], [-3 * half, -half, half, 3 * half]];
  return rows.flatMap((zs, r) => zs.map((z) => ({ x: LANE.headPin + r * row, z })));
})();

/** Lane coordinates → floorplan. */
export const laneToFloorplan = (lane: LaneSpec, x: number, y: number, z: number): [number, number, number] =>
  [FOUL_X + x, PLATFORM_Y + y, lane.cz + z];
/** Floorplan → lane coordinates. */
export const floorplanToLane = (lane: LaneSpec, x: number, y: number, z: number): [number, number, number] =>
  [x - FOUL_X, y - PLATFORM_Y, z - lane.cz];
/** Lane coordinates → world (x, y, z), for distances to bears. */
export function laneToWorld(lane: LaneSpec, x: number, y: number, z: number): [number, number, number] {
  const [fx, fy, fz] = laneToFloorplan(lane, x, y, z);
  return [HOUSE.originX + fx * HOUSE.scale, fy * HOUSE.scale, HOUSE.originZ + fz * HOUSE.scale];
}

/** Where a bowler stands to throw (lane x, behind the foul line), and how far A/D can slide them. */
export const STANCE = { x: -0.9, maxZ: LANE.width / 2 - 0.12 } as const;
/** You can join a lane at its ball return from this far away (world metres). */
export const JOIN_REACH = 2.6;
