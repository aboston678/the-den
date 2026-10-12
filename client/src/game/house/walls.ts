import { DOORS, type Door, GARAGE_DOOR_HEIGHT, DOOR_HEIGHT, type LevelId, level } from "@den/shared";
import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape } from "three";
import { type Box2, box, contains, intersect } from "./rects.ts";
import { UPPER_CEILING, UPPER_FLOOR, roofUnder } from "./roof.ts";
import { wallKey } from "./style.ts";

// Every wall of the house, worked out from the room rectangles in docs/floorplan.json (floorplan
// metres). A wall between two rooms gets each room's paint on its side; an outside wall gets
// clapboard (foundation concrete in the basement). Door and window openings are cut out.

export const EXTERIOR_T = 0.2;
export const INTERIOR_T = 0.12;
export const GREAT_ROOM = box(21.5, 3.5, 8, 8);
export const GREAT_ROOM_FLOOR = -0.5;
/** Floor heights that aren't the level's own (sunken great room, the basement stair's top landing). */
const FLOOR_OVERRIDE: Record<string, number> = { great_room: GREAT_ROOM_FLOOR, basement_stairs: GREAT_ROOM_FLOOR };

export interface Cell {
  id: string;
  box: Box2;
  kind: "room" | "void" | "attic";
}

export interface Opening {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  /** "door" openings reach the floor; "arch" = window with a half-round top. */
  kind: "door" | "window" | "arch";
  door?: Door;
}

export interface WallPiece {
  level: LevelId;
  /** "x": runs along x at z = c. "z": runs along z at x = c. */
  axis: "x" | "z";
  c: number;
  u0: number;
  u1: number;
  /** Cell on the −z / −x side, and on the +z / +x side (null = outside). */
  a: Cell | null;
  b: Cell | null;
  bottom: number;
  top: (u: number) => number;
  thickness: number;
  openings: Opening[];
}

export interface Railing {
  axis: "x" | "z";
  c: number;
  u0: number;
  u1: number;
  y: number;
}

/** The rooms of a level, plus the great room's two-storey space and the attic over the common area upstairs. */
export function cellsOf(id: LevelId): Cell[] {
  const l = level(id);
  const cells: Cell[] = l.rooms.map((r) => ({ id: r.id, box: box(r.x, r.z, r.w, r.d), kind: "room" as const }));
  if (id === "upper") {
    for (const v of l.voids) cells.push({ id: v.id, box: box(v.x, v.z, v.w, v.d), kind: "void" });
    cells.push({ id: "attic_west", box: box(17, 5, 4.5, 5), kind: "attic" });
  }
  return cells;
}

export const floorOf = (lv: LevelId, room: string | null): number =>
  (room ? FLOOR_OVERRIDE[room] : undefined) ?? level(lv).floorY;

/** Height of the next floor up (where this level's walls stop), for interior walls. */
function interiorTop(lv: LevelId, x: number, z: number) {
  if (lv === "basement") return contains(GREAT_ROOM, x, z) ? GREAT_ROOM_FLOOR - 0.3 : -0.3;
  if (lv === "main") return UPPER_FLOOR;
  return Math.min(UPPER_CEILING, roofUnder(x, z) ?? UPPER_CEILING);
}

/** Split every room edge on a level into wall pieces with the cells on each side. */
export function wallPieces(lv: LevelId): { walls: WallPiece[]; railings: Railing[] } {
  const cells = cellsOf(lv);
  const lines = new Map<string, { axis: "x" | "z"; c: number; cuts: Set<number> }>();
  const add = (axis: "x" | "z", c: number, u0: number, u1: number) => {
    const key = `${axis}:${c.toFixed(3)}`;
    const line = lines.get(key) ?? { axis, c, cuts: new Set<number>() };
    line.cuts.add(u0).add(u1);
    lines.set(key, line);
  };
  for (const { box: b } of cells) {
    add("x", b.z0, b.x0, b.x1);
    add("x", b.z1, b.x0, b.x1);
    add("z", b.x0, b.z0, b.z1);
    add("z", b.x1, b.z0, b.z1);
  }
  // Cuts at every room corner along each line, so each stretch has one cell per side.
  for (const line of lines.values()) {
    for (const { box: b } of cells) {
      if (line.axis === "x" && b.z0 <= line.c && b.z1 >= line.c) line.cuts.add(b.x0).add(b.x1);
      if (line.axis === "z" && b.x0 <= line.c && b.x1 >= line.c) line.cuts.add(b.z0).add(b.z1);
    }
  }

  const cellAt = (axis: "x" | "z", c: number, u: number, side: -1 | 1) => {
    const x = axis === "x" ? u : c + side * 0.01, z = axis === "x" ? c + side * 0.01 : u;
    return cells.find((cell) => contains(cell.box, x, z)) ?? null;
  };

  const walls: WallPiece[] = [], railings: Railing[] = [];
  for (const line of lines.values()) {
    const cuts = [...line.cuts].sort((p, q) => p - q);
    let run: { u0: number; u1: number; a: Cell | null; b: Cell | null } | null = null;
    const flush = () => {
      if (!run) return;
      const { u0, u1, a, b } = run;
      run = null;
      if (!a && !b) return;
      if (a?.id === b?.id) return;
      const isVoid = (c: Cell | null) => c?.kind === "void";
      if ((isVoid(a) && b?.id === "balcony_hall") || (isVoid(b) && a?.id === "balcony_hall")) {
        railings.push({ axis: line.axis, c: line.c, u0, u1, y: UPPER_FLOOR });
        return;
      }
      walls.push(makePiece(lv, line.axis, line.c, u0, u1, a, b));
    };
    for (let i = 0; i < cuts.length - 1; i++) {
      const u0 = cuts[i]!, u1 = cuts[i + 1]!, mid = (u0 + u1) / 2;
      const a = cellAt(line.axis, line.c, mid, -1), b = cellAt(line.axis, line.c, mid, 1);
      if (run && run.a === a && run.b === b && Math.abs(run.u1 - u0) < 1e-6) run.u1 = u1;
      else {
        flush();
        run = { u0, u1, a, b };
      }
    }
    flush();
  }
  return { walls, railings };
}

function makePiece(lv: LevelId, axis: "x" | "z", c: number, u0: number, u1: number, a: Cell | null, b: Cell | null): WallPiece {
  const exterior = !a || !b || a.kind !== "room" || b.kind !== "room";
  const at = (u: number) => (axis === "x" ? { x: u, z: c } : { x: c, z: u });
  let bottom = Math.min(floorOf(lv, a?.id ?? null), floorOf(lv, b?.id ?? null));
  let top: (u: number) => number;
  if (lv === "basement") top = exterior ? () => 0 : (u) => interiorTop(lv, at(u).x, at(u).z);
  else if (lv === "main") {
    top = () => UPPER_FLOOR;
    if (!a || !b) bottom = GREAT_ROOM_FLOOR - 0.3; // outside walls go down past the sunken great room
  } else {
    // Upstairs: partitions stop at the ceiling; walls on the outside, the attic or the great room reach the roof.
    top = exterior
      ? (u) => roofUnder(at(u).x, at(u).z) ?? UPPER_CEILING
      : (u) => interiorTop(lv, at(u).x, at(u).z);
  }
  const piece: WallPiece = { level: lv, axis, c, u0, u1, a, b, bottom, top, thickness: exterior ? EXTERIOR_T : INTERIOR_T, openings: [] };
  piece.openings = [...doorOpenings(piece), ...windowOpenings(piece)];
  return piece;
}

function doorOpenings(p: WallPiece): Opening[] {
  const out: Opening[] = [];
  for (const d of DOORS) {
    if (d.level !== p.level || d.axis !== p.axis) continue;
    const c = p.axis === "x" ? d.z : d.x, u = p.axis === "x" ? d.x : d.z;
    if (Math.abs(c - p.c) > 0.02 || u < p.u0 || u > p.u1) continue;
    const y0 = Math.max(floorOf(p.level, d.a), floorOf(p.level, d.b === "outside" || d.b === "deck" || d.b === "porch" ? null : d.b));
    const h = d.type === "garage" ? GARAGE_DOOR_HEIGHT : d.type === "opening" ? 2.1 : DOOR_HEIGHT;
    out.push({ u0: u - d.width / 2, u1: u + d.width / 2, y0, y1: y0 + h, kind: "door", door: d });
  }
  return out;
}

/** Rooms that get no automatic windows, and walls with hand-placed ones. */
const NO_WINDOWS = new Set(["utility", "stair_landing", "bowling_lounge", "bowling_alley", "den", "pantry", "great_room"]);

function windowOpenings(p: WallPiece): Opening[] {
  if (p.level === "basement") return [];
  const room = !p.a ? p.b : !p.b ? p.a : null; // only walls with the outdoors on one side
  const out: Opening[] = [];
  // The great room's rear gable: two big half-round windows (over transoms, over the glass doors).
  const greatSouth = p.axis === "x" && Math.abs(p.c - GREAT_ROOM.z1) < 0.01;
  if (greatSouth && p.level === "main") {
    for (const x of [24, 27]) out.push({ u0: x - 0.9, u1: x + 0.9, y0: 2.17, y1: 2.6, kind: "window" });
    return out;
  }
  if (greatSouth && p.level === "upper") {
    for (const x of [24, 27]) out.push({ u0: x - 1.1, u1: x + 1.1, y0: 2.85, y1: 4.15, kind: "arch" });
    return out;
  }
  if (!room || room.kind !== "room" || NO_WINDOWS.has(room.id)) return out;

  const upper = p.level === "upper";
  const width = upper ? 0.85 : 0.9, sill = upper ? 0.6 : 0.8, height = upper ? 1.25 : 1.4;
  const y0 = (upper ? UPPER_FLOOR : 0) + sill, y1 = y0 + height;
  const len = p.u1 - p.u0;
  const count = Math.min(3, Math.floor((len - 0.4) / 2.1));
  const doors = doorOpenings(p);
  for (let i = 0; i < count; i++) {
    const u = p.u0 + (len * (i + 0.5)) / count;
    const w0 = u - width / 2, w1 = u + width / 2;
    if (doors.some((d) => w1 > d.u0 - 0.35 && w0 < d.u1 + 0.35)) continue;
    let minTop = Infinity;
    for (let s = w0 - 0.1; s <= w1 + 0.1; s += 0.05) minTop = Math.min(minTop, p.top(s));
    if (minTop < y1 + 0.15) continue; // under a low roof slope (knee wall): no room for a window
    out.push({ u0: w0, u1: w1, y0, y1, kind: "window" });
  }
  return out;
}

// --- geometry ---

/** The wall's face outline: bottom edge with notches for doors, then the top edge (which may follow the roof). */
function outline(p: WallPiece): Shape {
  const s = new Shape();
  const notches = p.openings.filter((o) => o.kind === "door" && o.y0 <= p.bottom + 0.01).sort((a, b) => a.u0 - b.u0);
  s.moveTo(p.u0, p.bottom);
  for (const n of notches) {
    s.lineTo(Math.max(p.u0, n.u0), p.bottom);
    s.lineTo(Math.max(p.u0, n.u0), n.y1);
    s.lineTo(Math.min(p.u1, n.u1), n.y1);
    s.lineTo(Math.min(p.u1, n.u1), p.bottom);
  }
  s.lineTo(p.u1, p.bottom);
  const steps = Math.max(1, Math.ceil((p.u1 - p.u0) / 0.2));
  for (let i = steps; i >= 0; i--) {
    const u = p.u0 + ((p.u1 - p.u0) * i) / steps;
    s.lineTo(u, p.top(u));
  }
  for (const o of p.openings) {
    if (o.kind === "door" && o.y0 <= p.bottom + 0.01) continue;
    const h = new Path();
    if (o.kind === "arch") {
      const r = (o.u1 - o.u0) / 2, cx = (o.u0 + o.u1) / 2, cy = o.y1 - r;
      h.moveTo(o.u0, o.y0);
      h.lineTo(o.u1, o.y0);
      h.lineTo(o.u1, cy);
      h.absarc(cx, cy, r, 0, Math.PI, false);
      h.lineTo(o.u0, o.y0);
    } else {
      h.moveTo(o.u0, o.y0);
      h.lineTo(o.u1, o.y0);
      h.lineTo(o.u1, o.y1);
      h.lineTo(o.u0, o.y1);
      h.lineTo(o.u0, o.y0);
    }
    s.holes.push(h);
  }
  return s;
}

/** Split an extruded geometry into its face caps (group 0) and its edges (group 1). */
function splitGroups(g: BufferGeometry): [BufferGeometry, BufferGeometry] {
  const out = g.groups.slice(0, 2).map((grp) => {
    const part = new BufferGeometry();
    for (const name of ["position", "normal", "uv"] as const) {
      const attr = g.getAttribute(name);
      const n = attr.itemSize;
      part.setAttribute(name, new Float32BufferAttribute((attr.array as Float32Array).slice(grp.start * n, (grp.start + grp.count) * n), n));
    }
    return part;
  });
  return [out[0]!, out[1] ?? new BufferGeometry()];
}

/** Material key for the outside face of a wall. */
const outsideKey = (lv: LevelId, cell: Cell | null) => (cell ? (cell.kind === "attic" ? "attic" : wallKey(cell.id === "great_room_void" ? "great_room" : cell.id)) : lv === "basement" ? "foundation" : "clapboard");

/** Geometry for one wall piece: { material key: geometries } (two half-thickness slabs, one per side). */
export function wallGeometry(p: WallPiece, out: Map<string, BufferGeometry[]>) {
  const shape = outline(p);
  const half = p.thickness / 2;
  const push = (key: string, g: BufferGeometry) => out.set(key, [...(out.get(key) ?? []), g]);
  for (const side of [-1, 1] as const) {
    const g = new ExtrudeGeometry(shape, { depth: half, bevelEnabled: false, curveSegments: 16 });
    // Shape x = u along the wall, y = height, extrusion along +z; place it on the wall's -/+ side.
    if (p.axis === "x") g.translate(0, 0, side < 0 ? p.c - half : p.c);
    else {
      g.rotateY(-Math.PI / 2); // shape x -> world z, extrusion -> world -x
      g.translate(side < 0 ? p.c : p.c + half, 0, 0);
    }
    const [caps, edges] = splitGroups(g);
    g.dispose();
    push(outsideKey(p.level, side < 0 ? p.a : p.b), caps);
    push("trim", edges);
  }
}

/** Solid boxes for collisions: the stretches between doors, and the wall above each door. */
export function wallColliders(p: WallPiece): { min: [number, number, number]; max: [number, number, number] }[] {
  const doors = p.openings.filter((o) => o.kind === "door").sort((a, b) => a.u0 - b.u0);
  const minTop = (u0: number, u1: number) => {
    let m = Infinity;
    for (let u = u0; u <= u1 + 1e-6; u += Math.max(0.1, (u1 - u0) / 8)) m = Math.min(m, p.top(Math.min(u, u1)));
    return Math.min(m, p.bottom + 9);
  };
  const boxes: { min: [number, number, number]; max: [number, number, number] }[] = [];
  const add = (u0: number, u1: number, y0: number, y1: number) => {
    if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
    const h = p.thickness / 2;
    boxes.push(p.axis === "x"
      ? { min: [u0, y0, p.c - h], max: [u1, y1, p.c + h] }
      : { min: [p.c - h, y0, u0], max: [p.c + h, y1, u1] });
  };
  let u = p.u0;
  for (const d of doors) {
    add(u, Math.max(u, d.u0), p.bottom, minTop(u, Math.max(u, d.u0)));
    add(d.u0, d.u1, d.y1, minTop(d.u0, d.u1));
    add(d.u0, d.u1, p.bottom, d.y0); // under a raised door (step up)
    u = Math.max(u, d.u1);
  }
  add(u, p.u1, p.bottom, minTop(u, p.u1));
  return boxes;
}

/** Is the wall piece on the outside of the house (one side is outdoors)? */
export const isOutside = (p: WallPiece) => !p.a || !p.b;
/** Rectangles of a cell list's floor, for intersect tests. */
export const overlaps = (a: Box2, b: Box2) => intersect(a, b) !== null;
