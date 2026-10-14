import {
  ALLEY_CEILING_Y, ALLEY_FLOOR_Y, BALL_RETURN, BED, FOUL_X, LANE, LANES, PIN_SPOTS, PLATFORM_Y, laneToFloorplan,
} from "@den/shared";
import { Matrix4 } from "three";
import type { GeoBuckets, SolidBox } from "../house/geometry.ts";
import { Kit } from "../house/furniture/parts.ts";

// The bowling alley's fixed parts (GAME_SPEC §15, milestone 3.1), built in floorplan metres into the
// furniture buckets (merged per material, drawn only near the house): the raised approach, two
// lanes with gutters, foul lines, arrows and dots, pin decks, the pit with its blue glow, kickbacks,
// the masking wall over the pins (its mural is drawn by Monitors.tsx), the screens' bulkhead, the
// ball return and the kiosk. Modelled on reference/bowling/alley-inspiration.jpg.

const LANE_WOOD = "lane";
const EDGE_WOOD = "wood:#7a4a2c";
const DARK_WOOD = "wood:#3b2a20";
const GUTTER = "plastic:#3b3f47";
const BLACK = "plastic:#141518";
const MARK = "plastic:#5a2f1a";
const GLOW = "glow:#2e6cff";
const BULKHEAD = "paint:#f1ede4";

/** The pin deck starts a little in front of the head pin. */
const DECK_X = LANE.headPin - 0.35;
/** The masking wall over the pins: its face (lane x) and how high its bottom edge is. */
export const MASKING = { x: LANE.headPin - 1.0, bottom: PLATFORM_Y + 0.8 } as const;
/** The screens hang from a bulkhead just in front of the foul line. */
export const SCREENS = { x: FOUL_X - 0.16, y: ALLEY_CEILING_Y - 0.12 - 0.02 - 0.27, w: 0.96, h: 0.54 } as const;
/** Where balls sit on the return's rails (floorplan), nearest the bowler first. */
export const RACK_SPOTS: [number, number, number][] = [0, 1, 2].map((i) => [BALL_RETURN.x - 0.33 + i * 0.225, PLATFORM_Y + 0.6, BALL_RETURN.z]);

export interface AlleyBuild {
  /** Things you bump into. */
  solids: SolidBox[];
  /** Invisible: stops bears at the foul line, but the camera looks through it. */
  barriers: SolidBox[];
}

export function buildAlley(out: GeoBuckets): AlleyBuild {
  const k = new Kit(out, new Matrix4());
  const solids: SolidBox[] = [];
  const barriers: SolidBox[] = [];
  const outer0 = BED.z0 - 0.15, outer1 = BED.z1 + 0.15; // the kickbacks / side walls round the bed
  const pit = FOUL_X + LANE.pitEdge;

  // The approach: one raised wooden platform across the whole bed, with a nosing on its step.
  k.box([BED.x0, ALLEY_FLOOR_Y, 0.06], [FOUL_X, PLATFORM_Y, outer1], { all: EDGE_WOOD, top: LANE_WOOD });
  k.box([BED.x0 - 0.02, PLATFORM_Y - 0.03, 0.06], [BED.x0 + 0.03, PLATFORM_Y + 0.004, outer1], DARK_WOOD);
  solids.push({ min: [BED.x0, ALLEY_FLOOR_Y, 0.06], max: [FOUL_X, PLATFORM_Y, outer1] });

  for (const lane of LANES) {
    const at = (x: number, y: number, z: number) => laneToFloorplan(lane, x, y, z);
    const half = LANE.width / 2;
    // The lane itself, foul line to pit.
    k.box(at(0, ALLEY_FLOOR_Y - PLATFORM_Y, -half), at(LANE.pitEdge, 0, half), { all: EDGE_WOOD, top: LANE_WOOD });
    // Pin deck: a lighter, harder surface with a mark under every pin.
    k.box(at(DECK_X, 0, -half), at(LANE.pitEdge, 0.002, half), "wood:#efcf9f");
    for (const s of PIN_SPOTS) k.cyl(...at(s.x, 0.002, s.z), 0.028, 0.028, 0.001, MARK, 10);
    // Gutters, both sides.
    for (const side of [-1, 1]) {
      const z0 = side < 0 ? -half - LANE.gutter : half, z1 = side < 0 ? -half : half + LANE.gutter;
      k.box(at(0, ALLEY_FLOOR_Y - PLATFORM_Y, z0), at(LANE.pitEdge, -LANE.gutterDepth, z1), GUTTER);
    }
    // Foul line, arrows (a V of 7, the middle one furthest out) and dots.
    k.box(at(-0.01, 0, -half - LANE.gutter), at(0.01, 0.0015, half + LANE.gutter), BLACK);
    const board = LANE.width / 39;
    for (let i = 1; i <= 7; i++) {
      const z = -half + i * 5 * board, x = LANE.arrows + (4 - Math.abs(4 - i)) * 0.15;
      k.box(at(x, 0, z - 0.016), at(x + 0.2, 0.0015, z + 0.016), MARK);
      k.cyl(...at(LANE.dots, 0.0015, z), 0.008, 0.008, 0.001, MARK, 8);
      k.cyl(...at(-LANE.approach + 0.6, 0.0015, z), 0.009, 0.009, 0.001, MARK, 8); // approach dots
      k.cyl(...at(-1.2, 0.0015, z), 0.009, 0.009, 0.001, MARK, 8);
    }
    // The pit: a dark drop behind the pin deck, then the glowing back panel the pins stand out against.
    k.box(at(LANE.pitEdge, -0.4, -half - LANE.gutter), at(LANE.pitEdge + LANE.pitDepth, -0.38, half + LANE.gutter), BLACK);
    k.box(at(LANE.pitEdge + LANE.pitDepth - 0.04, -0.38, -half - LANE.gutter), at(LANE.pitEdge + LANE.pitDepth, 0.78, half + LANE.gutter), GLOW);
    // A blue strip along the front of the pin deck's kickbacks (the photo's glow).
    for (const side of [-1, 1]) {
      const z0 = side < 0 ? -half - LANE.gutter : half + LANE.gutter - 0.006;
      k.box(at(DECK_X - 0.6, 0.18, z0), at(LANE.pitEdge + LANE.pitDepth - 0.04, 0.2, z0 + 0.006), GLOW);
    }
  }

  // Capping between the lanes and along both sides, foul line to pit (the ball return runs under the middle one).
  const l1 = LANES[0]!, l2 = LANES[1]!;
  const mid0 = l1.cz + LANE.width / 2 + LANE.gutter, mid1 = l2.cz - LANE.width / 2 - LANE.gutter;
  for (const [z0, z1] of [[outer0, BED.z0], [mid0, mid1], [BED.z1, outer1]] as const) {
    k.box([FOUL_X, ALLEY_FLOOR_Y, z0], [pit, PLATFORM_Y + 0.07, z1], { all: DARK_WOOD, top: "wood:#5b3a26" });
    // Kickbacks: tall boards beside the pin decks.
    k.box([FOUL_X + DECK_X - 0.6, PLATFORM_Y + 0.07, z0], [pit + LANE.pitDepth, PLATFORM_Y + 0.78, z1], DARK_WOOD);
    solids.push({ min: [FOUL_X + DECK_X - 0.6, ALLEY_FLOOR_Y, z0], max: [pit + LANE.pitDepth, PLATFORM_Y + 0.78, z1] });
  }
  // A low wall between the lanes and the walkway, so nobody wanders down a lane.
  k.box([FOUL_X, PLATFORM_Y + 0.07, BED.z1], [FOUL_X + DECK_X - 0.6, PLATFORM_Y + 0.85, outer1], { all: "wood:#6b4229", top: "wood:#4a2e1d" });
  solids.push({ min: [FOUL_X, ALLEY_FLOOR_Y, BED.z1], max: [FOUL_X + DECK_X - 0.6, PLATFORM_Y + 0.85, outer1] });
  // The machine wall at the back of the pits, floor to ceiling.
  k.box([pit + LANE.pitDepth, ALLEY_FLOOR_Y, 0.06], [pit + LANE.pitDepth + 0.12, ALLEY_CEILING_Y, outer1], "paint:#24272e");
  solids.push({ min: [pit + LANE.pitDepth, ALLEY_FLOOR_Y, 0.06], max: [pit + LANE.pitDepth + 0.12, ALLEY_CEILING_Y, outer1] });
  // Masking wall over the pins: dark frame round the mural (Monitors.tsx), top to the ceiling.
  const mx = FOUL_X + MASKING.x;
  k.box([mx, MASKING.bottom, 0.06], [mx + 0.12, ALLEY_CEILING_Y, outer1], "paint:#1d2026");
  // Stop bears at the foul line (invisible, as high as the room).
  barriers.push({ min: [FOUL_X - 0.02, PLATFORM_Y, 0.06], max: [FOUL_X + 0.1, ALLEY_CEILING_Y, outer1] });

  // The screens' bulkhead: a white soffit across the bed just in front of the foul line.
  k.box([FOUL_X - 0.1, ALLEY_CEILING_Y - 0.12, 0.06], [FOUL_X + 0.3, ALLEY_CEILING_Y, outer1], BULKHEAD); // behind the screens, so it never hides their top edge
  // Black bezels behind the three screens (Monitors.tsx draws the pictures).
  for (const z of [l1.cz, (l1.cz + l2.cz) / 2, l2.cz]) {
    const hw = SCREENS.w / 2 + 0.02, hh = SCREENS.h / 2 + 0.02;
    k.box([SCREENS.x + 0.002, SCREENS.y - hh, z - hw], [SCREENS.x + 0.05, SCREENS.y + hh, z + hw], BLACK);
    k.box([SCREENS.x + 0.01, SCREENS.y + hh, z - 0.05], [SCREENS.x + 0.04, ALLEY_CEILING_Y - 0.12, z + 0.05], BLACK);
  }

  ballReturn(k, solids);
  return { solids, barriers };
}

/** Ball return + twin-screen kiosk on the approach between the lanes (the photo's centrepiece). */
function ballReturn(k: Kit, solids: SolidBox[]) {
  const { x, z } = BALL_RETURN;
  const y = PLATFORM_Y;
  const r = k.at(x, y, z);
  const body = "plastic:#202226", trim = "metal:#b8bec5";
  // Base and the hood the balls pop out of (at the pin end, x+).
  r.box([-0.45, 0, -0.27], [0.55, 0.42, 0.27], body);
  r.box([0.25, 0.42, -0.3], [0.62, 0.8, 0.3], body);
  r.box([0.22, 0.48, -0.2], [0.26, 0.72, 0.2], BLACK); // the hood's mouth
  r.rodZ(-0.3, 0.3, 0.44, 0.8, 0.18, body, 16);
  // Two rails the balls rest on, sloping gently toward the bowler.
  for (const s of [-1, 1]) r.rodX(-0.45, 0.25, 0.5, s * 0.075, 0.018, trim);
  r.box([-0.47, 0.42, -0.1], [-0.43, 0.6, 0.1], trim); // end stop
  // Air blower / hand dryer grille on the side.
  r.box([-0.2, 0.15, -0.275], [0.1, 0.3, -0.27], "metal:#55595f");
  r.box([-0.2, 0.15, 0.27], [0.1, 0.3, 0.275], "metal:#55595f");
  solids.push({ min: [x - 0.45, ALLEY_FLOOR_Y, z - 0.3], max: [x + 0.62, y + 0.95, z + 0.3] });

  // The kiosk: a black post a step closer to the lanes holding two screens (drawn by Monitors.tsx).
  const p = k.at(x + 1.1, y, z);
  p.box([-0.18, 0, -0.14], [0.18, 0.03, 0.14], body);
  p.box([-0.04, 0.03, -0.04], [0.04, 1.05, 0.04], body);
  p.box([-0.06, 1.0, -0.38], [0.02, 1.32, 0.38], body); // the bar holding both screens
  solids.push({ min: [x + 0.92, ALLEY_FLOOR_Y, z - 0.16], max: [x + 1.28, y + 1.3, z + 0.16] });
}

/** Where the kiosk's two screens are (floorplan centre, facing the bowlers, −x), one per lane. */
export const KIOSK_SCREENS = LANES.map((lane, i) => ({
  lane: lane.id,
  centre: [BALL_RETURN.x + 1.1 - 0.065, PLATFORM_Y + 1.16, BALL_RETURN.z + (i === 0 ? -0.19 : 0.19)] as [number, number, number],
  w: 0.36,
  h: 0.25,
}));
