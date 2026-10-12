import { DOORS, HOUSE, type LevelId, heightAt, houseToWorld, level } from "@den/shared";
import { type GeoBuckets, type SolidBox, add, boxFaces, quad } from "./geometry.ts";
import { type Box2, box, subtractAll } from "./rects.ts";
import { UPPER_CEILING, UPPER_FLOOR, DORMERS, dormerBox, roofUnder } from "./roof.ts";
import { floorKey, styleOf } from "./style.ts";
import { type Cell, GREAT_ROOM, GREAT_ROOM_FLOOR, type Railing, cellsOf, floorOf } from "./walls.ts";

// Floors, ceilings, stairs, steps, the porch and deck floors, the fireplace (floorplan metres).

/** Main stairs: from the foyer by the front door, rising south to the balcony (14 risers). */
export const MAIN_STAIRS = { x0: 25.6, x1: 26.8, z0: 0.3, z1: 3.3, risers: 14 };
/** Basement stairs: underneath, entered from the great room, going down north (top landing, then 11 risers). */
export const BASEMENT_STAIRS = { x0: 25.6, x1: 26.8, zTop: 3.5, zLanding: 2.6, z1: 0.3, risers: 11 };
export const FIREPLACE = { x0: 28.8, x1: 29.5, z0: 6.0, z1: 8.2 };
export const DECK = box(16.5, 10, 13.5, 4.5);
export const PORCH = box(21.5, -2.5, 12.5, 2.5);
/** Over the basement den where the kitchen wing doesn't reach: a small flat terrace at main-floor level. */
const TERRACE = box(11, 9, 5.5, 1);
/** The bowling alley's roof where it runs past the house underground. */
const ALLEY_ROOF = box(34, 0, 22, 6);

const STEP_T = 0.22; // stair tread thickness

export interface Structure {
  buckets: GeoBuckets;
  solids: SolidBox[];
  railings: Railing[];
  /** Sloped railings (stairs): from/to points. */
  stairRails: { from: [number, number, number]; to: [number, number, number] }[];
}

/** Floor holes: the stairwells. */
const FLOOR_HOLES: Record<LevelId, Box2[]> = {
  basement: [],
  main: [{ x0: BASEMENT_STAIRS.x0, x1: BASEMENT_STAIRS.x1, z0: BASEMENT_STAIRS.z1, z1: BASEMENT_STAIRS.zTop }],
  upper: [{ x0: MAIN_STAIRS.x0, x1: MAIN_STAIRS.x1, z0: MAIN_STAIRS.z0, z1: MAIN_STAIRS.z1 }],
};

function slab(s: Structure, r: Box2, top: number, bottom: number, topKey: string, bottomKey = "ceiling") {
  boxFaces([r.x0, bottom, r.z0], [r.x1, top, r.z1], { top: topKey, bottom: bottomKey, sides: bottomKey }, s.buckets);
  s.solids.push({ min: [r.x0, bottom, r.z0], max: [r.x1, top, r.z1] });
}

/** A flat ceiling (facing down) over a rectangle. */
function ceiling(s: Structure, r: Box2, y: number, key: string) {
  add(s.buckets, key, quad([[r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1]], (p) => [p[0], p[2]]));
}

function floorsAndCeilings(s: Structure) {
  const upperCells = cellsOf("upper");
  for (const lv of ["basement", "main", "upper"] as const) {
    for (const cell of cellsOf(lv)) {
      if (cell.kind === "void") continue;
      const y = floorOf(lv, cell.id);
      const thick = lv === "upper" ? 0.1 : lv === "main" ? 0.3 : 0.2;
      for (const part of subtractAll(cell.box, FLOOR_HOLES[lv])) slab(s, part, y, y - thick, cell.kind === "attic" ? "attic" : floorKey(cell.id));
      if (lv === "main") mainCeiling(s, cell, upperCells);
      if (lv === "upper" && cell.kind === "room") upperCeiling(s, cell);
    }
  }
  slab(s, TERRACE, 0, -0.3, "deck", "ceiling");
  slab(s, ALLEY_ROOF, -0.3, -0.5, "foundation", "paint:#3d424c");
  // Under the deck's posts the basement den walks out; the deck itself sits on the main floor.
  for (const part of subtractAll(DECK, [{ x0: GREAT_ROOM.x0, x1: GREAT_ROOM.x1, z0: DECK.z0, z1: GREAT_ROOM.z1 }])) slab(s, part, 0, -0.12, "deck", "deck");
  slab(s, PORCH, 0, -0.9, "porch_floor", "foundation");
}

/** Main-floor rooms without an upstairs over them get a ceiling at 2.6 m (pine boards in the kitchen wing). */
function mainCeiling(s: Structure, cell: Cell, upperCells: Cell[]) {
  const st = styleOf(cell.id);
  const covered = upperCells.map((c) => c.box);
  for (const part of subtractAll(cell.box, covered)) ceiling(s, part, 2.6, st.ceiling === "pine" ? "pine" : "ceiling");
  if (st.beams) beams(s, cell.box, 2.6, cell.id === "den" ? "pine" : "pine");
}

/** Exposed timber beams across a room's ceiling (kitchen, mudroom, basement den photos). */
function beams(s: Structure, r: Box2, ceilingY: number, key: string) {
  const along = r.x1 - r.x0 < r.z1 - r.z0 ? "x" : "z"; // beams span the short way
  const span = along === "x" ? r.z1 - r.z0 : r.x1 - r.x0;
  const n = Math.max(2, Math.round(span / 1.2));
  for (let i = 1; i < n; i++) {
    const t = (along === "x" ? r.z0 : r.x0) + (span * i) / n;
    const b = along === "x" ? { x0: r.x0, x1: r.x1, z0: t - 0.09, z1: t + 0.09 } : { x0: t - 0.09, x1: t + 0.09, z0: r.z0, z1: r.z1 };
    boxFaces([b.x0, ceilingY - 0.2, b.z0], [b.x1, ceilingY, b.z1], { top: key, bottom: key, sides: key }, s.buckets);
  }
}

/** Upstairs: a flat ceiling at 2.4 m wherever the roof is higher than that; the roof's underside elsewhere. */
function upperCeiling(s: Structure, cell: Cell) {
  const step = 0.25;
  const b = cell.box;
  for (let z = b.z0; z < b.z1 - 1e-6; z += step) {
    let runStart: number | null = null;
    const z1 = Math.min(b.z1, z + step);
    for (let x = b.x0; x <= b.x1 + 1e-6; x += step) {
      const x1 = Math.min(b.x1, x + step);
      const inside = x < b.x1 - 1e-6;
      const open = inside && (roofUnder((x + x1) / 2, (z + z1) / 2) ?? 99) >= UPPER_CEILING - 1e-3;
      if (open && runStart === null) runStart = x;
      if ((!open || !inside) && runStart !== null) {
        ceiling(s, { x0: runStart, x1: x, z0: z, z1 }, UPPER_CEILING, "ceiling");
        runStart = null;
      }
    }
  }
  // Open dormers: their own little flat ceiling.
  for (const d of DORMERS) {
    if (!d.open) continue;
    const r = dormerBox(d);
    if (r.x0 >= b.x0 - 1e-6 && r.x1 <= b.x1 + 1e-6 && r.z0 >= b.z0 - 1e-6 && r.z0 < b.z1) ceiling(s, r, d.ceilingY, "ceiling");
  }
}

/** A run of steps: n treads between two heights, laid out from (u0) to (u1) along an axis. */
function steps(s: Structure, axis: "x" | "z", u0: number, u1: number, w0: number, w1: number, yStart: number, yEnd: number, n: number, key: string) {
  const run = (u1 - u0) / n;
  for (let i = 0; i < n; i++) {
    const top = yStart + ((yEnd - yStart) * (i + 1)) / n;
    const a = u0 + run * i, b = u0 + run * (i + 1);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const r = axis === "z" ? { x0: w0, x1: w1, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: w0, z1: w1 };
    slab(s, r, top, top - STEP_T, key, "trim");
  }
}

function stairs(s: Structure) {
  const m = MAIN_STAIRS;
  steps(s, "z", m.z0, m.z1, m.x0, m.x1, 0, UPPER_FLOOR, m.risers, "oak_trim");
  // Rail along the open side, starting a few steps up so you can walk on from the side at the bottom.
  const railStart = m.z0 + 0.9;
  s.stairRails.push({ from: [m.x1 - 0.05, (UPPER_FLOOR * (railStart - m.z0)) / (m.z1 - m.z0), railStart], to: [m.x1 - 0.05, UPPER_FLOOR, m.z1] });
  // A wall under the stairs on the foyer side, closing off the basement stairs below.
  const run = (m.z1 - m.z0) / m.risers;
  for (let i = 0; i < m.risers; i++) {
    const top = (UPPER_FLOOR * (i + 1)) / m.risers - STEP_T;
    const r = { x0: m.x1, x1: m.x1 + 0.1, z0: m.z0 + run * i, z1: m.z0 + run * (i + 1) };
    if (top > -0.3) slab(s, r, top, -0.3, "paint:#ece5d6", "paint:#ece5d6");
  }
  slab(s, { x0: m.x1, x1: m.x1 + 0.1, z0: m.z1, z1: BASEMENT_STAIRS.zTop }, UPPER_FLOOR - 0.1, -0.3, "paint:#ece5d6", "paint:#ece5d6");
  slab(s, { x0: m.x0, x1: m.x1, z0: m.z0 - 0.08, z1: m.z0 }, 0, -0.3, "paint:#ece5d6", "paint:#ece5d6");

  const b = BASEMENT_STAIRS;
  slab(s, { x0: b.x0, x1: b.x1, z0: b.zLanding, z1: b.zTop }, GREAT_ROOM_FLOOR, GREAT_ROOM_FLOOR - 0.3, floorKey("stair_landing"));
  steps(s, "z", b.zLanding, b.z1, b.x0, b.x1, GREAT_ROOM_FLOOR, level("basement").floorY, b.risers, "oak_trim");
  s.stairRails.push({ from: [b.x1 + 0.05, GREAT_ROOM_FLOOR, b.zLanding], to: [b.x1 + 0.05, level("basement").floorY, b.z1] });
  s.stairRails.push({ from: [b.x0 - 0.05, GREAT_ROOM_FLOOR, b.zLanding], to: [b.x0 - 0.05, level("basement").floorY, b.z1] });

  // Railing round the stairwell upstairs.
  s.railings.push({ axis: "z", c: m.x1 + 0.03, u0: m.z0, u1: m.z1 - 0.2, y: UPPER_FLOOR });
}

/** Three steps down into the sunken great room at every doorway that leads into it from a higher floor. */
function greatRoomSteps(s: Structure) {
  for (const d of DOORS) {
    if (d.level !== "main" || (d.a !== "great_room" && d.b !== "great_room") || d.b === "basement_stairs") continue;
    const w0 = (d.axis === "x" ? d.x : d.z) - d.width / 2 - 0.1, w1 = (d.axis === "x" ? d.x : d.z) + d.width / 2 + 0.1;
    const c = d.axis === "x" ? d.z : d.x;
    // Which way is the great room from this wall?
    const sign = d.axis === "x" ? (GREAT_ROOM.z0 + GREAT_ROOM.z1) / 2 > c ? 1 : -1 : (GREAT_ROOM.x0 + GREAT_ROOM.x1) / 2 > c ? 1 : -1;
    const n = 3, depth = 0.3;
    const start = c + sign * 0.06, end = start + sign * depth * (n - 1);
    steps(s, d.axis === "x" ? "z" : "x", start, end, w0, w1, 0, GREAT_ROOM_FLOOR + (0 - GREAT_ROOM_FLOOR) / n, n - 1, "oak_trim");
  }
}

function fireplace(s: Structure) {
  const f = FIREPLACE;
  const top = roofUnder(f.x0, (f.z0 + f.z1) / 2) ?? 4.4;
  // Floor-to-ceiling red brick, a dark firebox, a white mantel.
  boxFaces([f.x0, GREAT_ROOM_FLOOR, f.z0], [f.x1, top, f.z1], { top: "brick", sides: "brick" }, s.buckets);
  s.solids.push({ min: [f.x0, GREAT_ROOM_FLOOR, f.z0], max: [f.x1, top, f.z1] });
  boxFaces([f.x0 - 0.01, GREAT_ROOM_FLOOR, f.z0 + 0.55], [f.x0 + 0.3, GREAT_ROOM_FLOOR + 0.85, f.z1 - 0.55], { top: "paint:#151210", sides: "paint:#151210" }, s.buckets);
  boxFaces([f.x0 - 0.18, GREAT_ROOM_FLOOR + 1.3, f.z0 - 0.1], [f.x0 + 0.05, GREAT_ROOM_FLOOR + 1.38, f.z1 + 0.1], { top: "trim", sides: "trim", bottom: "trim" }, s.buckets);
  // Hearth.
  boxFaces([f.x0 - 0.45, GREAT_ROOM_FLOOR, f.z0], [f.x0, GREAT_ROOM_FLOOR + 0.12, f.z1], { top: "brick", sides: "brick" }, s.buckets);
}

/** Deck posts down to the lawn, its railing, and stairs at the west end down to the back lawn. */
function deck(s: Structure) {
  const groundAt = (x: number, z: number) => {
    const w = houseToWorld(x, z);
    return heightAt(w.x, w.z) / HOUSE.scale;
  };
  const posts: [number, number][] = [];
  for (let x = DECK.x0 + 0.1; x <= DECK.x1; x += 2.25) posts.push([x, DECK.z1 - 0.1]);
  for (let z = DECK.z0 + 1.5; z < DECK.z1; z += 2.25) posts.push([DECK.x1 - 0.1, z], [DECK.x0 + 0.1, z]);
  for (const [x, z] of posts) {
    const g = groundAt(x, z) - 0.3;
    boxFaces([x - 0.08, g, z - 0.08], [x + 0.08, -0.12, z + 0.08], { top: "deck", sides: "deck" }, s.buckets);
  }
  // Stairs from the south edge at the west end, as many 18 cm steps as it takes to reach the lawn.
  const sx0 = DECK.x0 + 0.15, sx1 = sx0 + 1.2;
  let y = 0, z = DECK.z1, n = 0;
  while (y > groundAt((sx0 + sx1) / 2, z + 0.27) + 0.05 && n < 30) {
    y -= 0.18;
    slab(s, { x0: sx0, x1: sx1, z0: z, z1: z + 0.27 }, y, y - STEP_T, "deck", "deck");
    z += 0.27;
    n++;
  }
  s.stairRails.push({ from: [sx1 + 0.04, 0, DECK.z1], to: [sx1 + 0.04, y, z] });
  s.stairRails.push({ from: [sx0 - 0.04, 0, DECK.z1], to: [sx0 - 0.04, y, z] });
  // Railings round the deck's outer edges (leaving the stair gap).
  s.railings.push({ axis: "x", c: DECK.z1, u0: sx1 + 0.05, u1: DECK.x1, y: 0 });
  s.railings.push({ axis: "z", c: DECK.x1, u0: GREAT_ROOM.z1, u1: DECK.z1, y: 0 });
  s.railings.push({ axis: "x", c: GREAT_ROOM.z1, u0: GREAT_ROOM.x1, u1: DECK.x1, y: 0 });
  s.railings.push({ axis: "z", c: DECK.x0, u0: DECK.z0, u1: DECK.z1, y: 0 });
  s.railings.push({ axis: "x", c: TERRACE.z1, u0: TERRACE.x0, u1: TERRACE.x1, y: 0 });
}

export function buildStructure(): Structure {
  const s: Structure = { buckets: new Map(), solids: [], railings: [], stairRails: [] };
  floorsAndCeilings(s);
  stairs(s);
  greatRoomSteps(s);
  fireplace(s);
  deck(s);
  return s;
}
