import { type BufferGeometry, ExtrudeGeometry, Path, PlaneGeometry, Shape, ShapeGeometry } from "three";
import { type GeoBuckets, type SolidBox, add, boxFaces, quad } from "./geometry.ts";
import { type Box2, subtractAll } from "./rects.ts";
import { DORMERS, type Dormer, type Gable, OVERHANG, ROOFS, ROOF_THICKNESS, dormerBox, ridgeY } from "./roof.ts";
import { PORCH } from "./structure.ts";
import { type Opening, type WallPiece } from "./walls.ts";

// The outside of the house (GAME_SPEC §8.1, exterior photos): shingled roofs with dormers, the
// porch roof on white columns, the chimney, window glass with white frames and colonial muntins,
// black shutters on the front, and the curved-eave greenhouse. Floorplan metres.

type V3 = [number, number, number];

// --- roofs ---

/** Roof surface heights for one gable: outer (shingles) and underside, by distance from the eave line. */
const under = (g: Gable, fromEave: number) => g.eaveY + g.pitch * fromEave;

function gableRoof(g: Gable, out: GeoBuckets, solids?: SolidBox[]) {
  const ov = (end: "start" | "end" | "sideStart" | "sideEnd") => (g.noOverhang?.includes(end) ? 0 : OVERHANG);
  const half = (g.ridge === "x" ? g.z1 - g.z0 : g.x1 - g.x0) / 2;
  const T = ROOF_THICKNESS;
  // Work in (along, across) where across runs from one eave (0) to the other (2 * half).
  const alongMin = (g.ridge === "x" ? g.x0 : g.z0) - ov("start"), alongMax = (g.ridge === "x" ? g.x1 : g.z1) + ov("end");
  const acrossMin = -ov("sideStart"), acrossMax = 2 * half + ov("sideEnd");
  const toPlan = (along: number, across: number) => (g.ridge === "x" ? { x: along, z: g.z0 + across } : { x: g.x0 + across, z: along });
  const holes: Box2[] = (g.holes ?? []).map((h) => (g.ridge === "x"
    ? { x0: h.x0, x1: h.x1, z0: h.z0 - g.z0, z1: h.z1 - g.z0 }
    : { x0: h.z0, x1: h.z1, z0: h.x0 - g.x0, z1: h.x1 - g.x0 }));
  for (const [a0, a1] of [[acrossMin, half], [half, acrossMax]] as const) {
    const slope = a0 < half ? 1 : -1; // rising toward the ridge, then falling
    const fromEave = (across: number) => (slope > 0 ? across : 2 * half - across);
    for (const r of subtractAll({ x0: alongMin, x1: alongMax, z0: a0, z1: a1 }, holes)) {
      const corner = (along: number, across: number, top: boolean): V3 => {
        const p = toPlan(along, across);
        const y = under(g, fromEave(across)) + (top ? T : 0);
        return [p.x, y, p.z];
      };
      const [l0, l1, c0, c1] = [r.x0, r.x1, r.z0, r.z1];
      const surf = (top: boolean, key: string) => {
        const pts: [V3, V3, V3, V3] = [corner(l0, c0, top), corner(l1, c0, top), corner(l1, c1, top), corner(l0, c1, top)];
        // Keep faces pointing up (top) or down (underside) whichever way the plan axes run.
        const n = normalY(pts);
        if ((top && n < 0) || (!top && n > 0)) pts.reverse();
        add(out, key, quad(pts, (p) => (g.ridge === "x" ? [p[0], (p[2] - g.z0) * Math.hypot(1, g.pitch)] : [p[2], (p[0] - g.x0) * Math.hypot(1, g.pitch)])));
      };
      surf(true, "shingles");
      surf(false, "ceiling");
      if (solids) {
        // A tilted box along this piece of slope (so the camera stops at the ceiling indoors).
        const mid = corner((l0 + l1) / 2, (c0 + c1) / 2, false);
        const ang = Math.atan(g.pitch) * slope;
        const halfAcross = ((c1 - c0) / 2) * Math.hypot(1, g.pitch);
        const centre: V3 = [mid[0], mid[1] + (T / 2) * Math.cos(ang), mid[2]];
        solids.push({
          min: centre, max: centre,
          tilted: g.ridge === "x"
            // Rotating about x by −a lifts +z; rotating about z by +a lifts +x.
            ? { centre, half: [(l1 - l0) / 2, T / 2, halfAcross], axis: "x", angle: -ang }
            : { centre, half: [halfAcross, T / 2, (l1 - l0) / 2], axis: "z", angle: ang },
        });
      }
      // Edges (fascia) on the outside edges of this piece.
      const edge = (a: V3, b: V3, c: V3, d: V3) => add(out, "trim", quad([a, b, c, d], (p) => [p[0] + p[2], p[1]]));
      for (const [pa, pb] of [[[l0, c0], [l1, c0]], [[l1, c0], [l1, c1]], [[l1, c1], [l0, c1]], [[l0, c1], [l0, c0]]] as const) {
        const [x0, y0] = pa, [x1, y1] = pb;
        edge(corner(x0, y0, false), corner(x1, y1, false), corner(x1, y1, true), corner(x0, y0, true));
        edge(corner(x1, y1, false), corner(x0, y0, false), corner(x0, y0, true), corner(x1, y1, true));
      }
    }
  }
  // Ridge cap.
  const rp0 = toPlan(alongMin, half), rp1 = toPlan(alongMax, half), ry = ridgeY(g) + T;
  const w = 0.12;
  boxFaces(
    [Math.min(rp0.x, rp1.x) - (g.ridge === "z" ? w : 0), ry - 0.04, Math.min(rp0.z, rp1.z) - (g.ridge === "x" ? w : 0)],
    [Math.max(rp0.x, rp1.x) + (g.ridge === "z" ? w : 0), ry + 0.05, Math.max(rp0.z, rp1.z) + (g.ridge === "x" ? w : 0)],
    { top: "shingles", sides: "shingles" }, out,
  );
  // Gable-end triangles this roof draws itself.
  for (const end of g.gableEnds ?? []) {
    const at = end === "start" ? (g.ridge === "x" ? g.x0 : g.z0) : g.ridge === "x" ? g.x1 : g.z1;
    const s = new Shape();
    s.moveTo(0, g.eaveY);
    s.lineTo(2 * half, g.eaveY);
    s.lineTo(half, ridgeY(g));
    s.lineTo(0, g.eaveY);
    extrudeWall(s, g.ridge === "x" ? "z" : "x", at, g.ridge === "x" ? g.z0 : g.x0, 0.2, "clapboard", "clapboard", out);
  }
  // The garage's big front gable has a shuttered window (exterior-front photo).
  if (g.id === "garage") {
    const cx = (g.x0 + g.x1) / 2, y0 = g.eaveY + 0.55, y1 = y0 + 1.25, w = 0.85;
    windowParts({ u0: cx - w / 2, u1: cx + w / 2, y0, y1, kind: "window" }, "x", g.z0 - 0.11, -1, true, out, "dark_glass");
  }
}

function normalY([a, b, c]: [V3, V3, V3, V3]) {
  const e1 = [b[0] - a[0], b[2] - a[2]], e2 = [c[0] - a[0], c[2] - a[2]];
  return e1[1]! * e2[0]! - e1[0]! * e2[1]!; // y of (b-a) x (c-a)
}

/**
 * Extrude a wall outline (u along the wall from `uStart`, y up) with thickness t centred on a wall
 * line ("x": along x at z = c; "z": along z at x = c). Faces: `neg` toward −z/−x, `pos` toward +z/+x.
 */
export function extrudeWall(shape: Shape, axis: "x" | "z", c: number, uStart: number, t: number, neg: string, pos: string, out: GeoBuckets) {
  for (const side of [-1, 1] as const) {
    const g = new ExtrudeGeometry(shape, { depth: t / 2, bevelEnabled: false, curveSegments: 12 });
    if (axis === "x") g.translate(uStart, 0, side < 0 ? c - t / 2 : c);
    else {
      g.rotateY(-Math.PI / 2);
      g.translate(side < 0 ? c : c + t / 2, 0, uStart);
    }
    add(out, side < 0 ? neg : pos, g.index ? g.toNonIndexed() : g);
  }
}

// --- dormers ---

/** Outer surface height of the roof a dormer sits on, at distance z from that roof's front eave line. */
const roofTopAt = (g: Gable, z: number) => g.eaveY + ROOF_THICKNESS + g.pitch * (z - g.z0);

function dormer(d: Dormer, out: GeoBuckets) {
  const g = ROOFS.find((r) => r.id === d.on)!;
  const b = dormerBox(d);
  const eave = d.ceilingY + 0.02;
  // Side walls ("cheeks") from the roof up to the dormer's eaves.
  for (const x of [b.x0, b.x1]) {
    const s = new Shape();
    s.moveTo(0, roofTopAt(g, b.z0) - 0.05);
    s.lineTo(b.z1 - b.z0, roofTopAt(g, b.z1) - 0.05);
    s.lineTo(b.z1 - b.z0, eave);
    s.lineTo(0, eave);
    s.lineTo(0, roofTopAt(g, b.z0) - 0.05);
    const inside = d.open ? "paint:#ece5d6" : "attic";
    extrudeWall(s, "z", x, b.z0, 0.12, x === b.x0 ? "clapboard" : inside, x === b.x0 ? inside : "clapboard", out);
  }
  if (!d.open) {
    // Decorative dormer: a front wall with a dark window.
    const s = new Shape();
    s.moveTo(b.x0, roofTopAt(g, b.z0) - 0.05);
    s.lineTo(b.x1, roofTopAt(g, b.z0) - 0.05);
    s.lineTo(b.x1, eave);
    s.lineTo(b.x0, eave);
    s.lineTo(b.x0, roofTopAt(g, b.z0) - 0.05);
    const w = 0.7, y0 = roofTopAt(g, b.z0) + 0.15, y1 = eave - 0.15;
    const hole = new Path();
    hole.moveTo(d.x - w / 2, y0);
    hole.lineTo(d.x + w / 2, y0);
    hole.lineTo(d.x + w / 2, y1);
    hole.lineTo(d.x - w / 2, y1);
    hole.lineTo(d.x - w / 2, y0);
    s.holes.push(hole);
    extrudeWall(s, "x", b.z0, 0, 0.12, "clapboard", "attic", out);
    windowParts({ u0: d.x - w / 2, u1: d.x + w / 2, y0, y1, kind: "window" }, "x", b.z0, -1, false, out, "dark_glass");
  }
  // Its own little gable roof, ridge running back into the main roof.
  const roof: Gable = {
    id: `dormer-${d.x}`, x0: b.x0 - 0.06, x1: b.x1 + 0.06, z0: b.z0 - 0.3, z1: b.z1 + 0.4, ridge: "z", eaveY: eave, pitch: 0.9,
    gableEnds: [], noOverhang: ["end"],
  };
  gableRoof(roof, out);
  // Gable triangle over the front wall.
  const half = (b.x1 - b.x0) / 2 + 0.06;
  const s = new Shape();
  s.moveTo(0, eave);
  s.lineTo(2 * half, eave);
  s.lineTo(half, eave + 0.9 * half);
  s.lineTo(0, eave);
  extrudeWall(s, "x", b.z0 - 0.02, b.x0 - 0.06, 0.12, "clapboard", "attic", out);
}

// --- windows ---

/**
 * Glass, a white frame and colonial muntins for one window opening. `outside` is −1/+1: which side
 * of the wall is outdoors (for shutters), 0 for interior.
 */
export function windowParts(o: Opening, axis: "x" | "z", c: number, outside: -1 | 0 | 1, shutters: boolean, out: GeoBuckets, glassKey = "glass") {
  const at = (u: number, y: number, off: number): V3 => (axis === "x" ? [u, y, c + off] : [c + off, y, u]);
  const box = (u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, key: string) => {
    const a = at(u0, y0, d0), b = at(u1, y1, d1);
    boxFaces([Math.min(a[0], b[0]), y0, Math.min(a[2], b[2])], [Math.max(a[0], b[0]), y1, Math.max(a[2], b[2])], { top: key, bottom: key, sides: key }, out);
  };
  const { u0, u1, y0, y1 } = o;
  const f = 0.06, depth = 0.13;
  if (o.kind === "arch") {
    const r = (u1 - u0) / 2, cx = (u0 + u1) / 2, cy = y1 - r;
    const s = new Shape();
    s.moveTo(u0, y0);
    s.lineTo(u1, y0);
    s.lineTo(u1, cy);
    s.absarc(cx, cy, r, 0, Math.PI, false);
    s.lineTo(u0, y0);
    const g = new ShapeGeometry(s, 24);
    if (axis === "z") g.rotateY(-Math.PI / 2);
    g.translate(axis === "x" ? 0 : c, 0, axis === "x" ? c : 0);
    add(out, glassKey, g.toNonIndexed());
    // Fan muntins.
    for (let i = 0; i <= 6; i++) {
      const a = (Math.PI * i) / 6, len = r;
      const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
      const steps = 6;
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const pu = cx + (ex - cx) * t0, pv = cy + (ey - cy) * t0, qu = cx + (ex - cx) * t1, qv = cy + (ey - cy) * t1;
        box(Math.min(pu, qu) - 0.015, Math.max(pu, qu) + 0.015, Math.min(pv, qv) - 0.015, Math.max(pv, qv) + 0.015, -0.03, 0.03, "frame");
      }
    }
    box(u0, u1, cy - 0.025, cy + 0.025, -depth / 2, depth / 2, "frame");
    for (const u of [cx - r / 2.2, cx + r / 2.2]) box(u - 0.015, u + 0.015, y0, cy, -0.03, 0.03, "frame");
    box(u0 - f, u1 + f, y0 - f, y0, -depth / 2 - 0.02, depth / 2 + 0.02, "trim");
    return;
  }
  // Glass in the middle of the wall.
  const g = quad([at(u0, y0, 0), at(u1, y0, 0), at(u1, y1, 0), at(u0, y1, 0)], (p) => [p[0] + p[2], p[1]]);
  add(out, glassKey, g);
  // Frame round the opening (sticking out a little on both faces).
  box(u0 - f, u1 + f, y0 - f, y0, -depth / 2 - 0.02, depth / 2 + 0.02, "trim");
  box(u0 - f, u1 + f, y1, y1 + f, -depth / 2 - 0.02, depth / 2 + 0.02, "trim");
  box(u0 - f, u0, y0, y1, -depth / 2 - 0.02, depth / 2 + 0.02, "trim");
  box(u1, u1 + f, y0, y1, -depth / 2 - 0.02, depth / 2 + 0.02, "trim");
  // Six-over-six muntins: two vertical bars, a meeting rail and a bar in each sash.
  const w = u1 - u0, h = y1 - y0, m = 0.014;
  for (const t of [1 / 3, 2 / 3]) box(u0 + w * t - m, u0 + w * t + m, y0, y1, -0.02, 0.02, "frame");
  box(u0, u1, y0 + h / 2 - 0.025, y0 + h / 2 + 0.025, -0.03, 0.03, "frame");
  for (const t of [1 / 4, 3 / 4]) box(u0, u1, y0 + h * t - m, y0 + h * t + m, -0.02, 0.02, "frame");
  // Black shutters beside front windows.
  if (shutters && outside !== 0) {
    const off = outside * 0.13, sw = Math.min(0.45, w * 0.5);
    for (const [a, b] of [[u0 - f - sw, u0 - f], [u1 + f, u1 + f + sw]] as const) box(a, b, y0, y1, off - 0.02 * outside, off, "shutter");
  }
}

/**
 * A warm pane just inside an outside window, facing out: the window glowing at night (its
 * material fades with the time of day, see Lights.tsx). Seen only from outdoors.
 */
function windowGlow(o: Opening, axis: "x" | "z", c: number, outside: -1 | 1, out: GeoBuckets) {
  const { u0, u1, y0, y1 } = o;
  let g: BufferGeometry;
  if (o.kind === "arch") {
    const r = (u1 - u0) / 2, cy = y1 - r - y0;
    const s = new Shape();
    s.moveTo(-r, 0);
    s.lineTo(r, 0);
    s.lineTo(r, cy);
    s.absarc(0, cy, r, 0, Math.PI, false);
    s.lineTo(-r, 0);
    g = new ShapeGeometry(s, 24).toNonIndexed();
  } else {
    g = new PlaneGeometry(u1 - u0, y1 - y0).toNonIndexed().translate(0, (y1 - y0) / 2, 0);
  }
  // The plane faces +z; turn it to face outdoors.
  if (axis === "x") g.rotateY(outside === 1 ? 0 : Math.PI);
  else g.rotateY(outside === 1 ? Math.PI / 2 : -Math.PI / 2);
  const inset = -outside * 0.035, um = (u0 + u1) / 2;
  g.translate(axis === "x" ? um : c + inset, y0, axis === "x" ? c + inset : um);
  add(out, "window_glow", g);
}

/** Windows for every wall piece (shutters on the front, north-facing walls). */
export function windows(pieces: WallPiece[], out: GeoBuckets) {
  for (const p of pieces) {
    const outside: -1 | 0 | 1 = !p.a ? -1 : !p.b ? 1 : 0;
    const front = p.axis === "x" && outside === -1 && p.level !== "basement";
    for (const o of p.openings) {
      if (o.kind === "door") continue;
      windowParts(o, p.axis, p.c, outside, front, out);
      if (outside !== 0 && (p.a ?? p.b)?.id !== "garage") windowGlow(o, p.axis, p.c, outside, out);
    }
  }
}

// --- porch, chimney ---

function porch(out: GeoBuckets, solids: SolidBox[]) {
  const z0 = PORCH.z0 - 0.25, z1 = 0, x0 = PORCH.x0 - 0.2, x1 = PORCH.x1 + 0.2;
  const yIn = 3.3, yOut = 2.8, T = 0.18;
  const pts = (y: (z: number) => number): [V3, V3, V3, V3] => [[x0, y(z0), z0], [x1, y(z0), z0], [x1, y(z1), z1], [x0, y(z1), z1]];
  const yAt = (z: number) => yOut + ((yIn - yOut) * (z - z0)) / (z1 - z0);
  add(out, "shingles", quad(pts((z) => yAt(z) + T).reverse() as [V3, V3, V3, V3], (p) => [p[0], p[2] * 1.05]));
  add(out, "ceiling", quad(pts(yAt), (p) => [p[0], p[2]]));
  add(out, "trim", quad([[x1, yOut, z0], [x0, yOut, z0], [x0, yOut + T, z0], [x1, yOut + T, z0]], (p) => [p[0], p[1]]));
  // White square columns.
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = PORCH.x0 + 0.3 + ((PORCH.x1 - PORCH.x0 - 0.6) * i) / (n - 1), z = PORCH.z0 + 0.25;
    boxFaces([x - 0.11, 0, z - 0.11], [x + 0.11, yAt(z), z + 0.11], { top: "trim", sides: "trim" }, out);
    solids.push({ min: [x - 0.11, 0, z - 0.11], max: [x + 0.11, yAt(z), z + 0.11] });
  }
}

function chimney(out: GeoBuckets) {
  // Straight up from the great room's fireplace (inside the great room's wall line, clear of the yellow bedroom).
  boxFaces([28.8, 4.2, 6.6], [29.45, 8.3, 7.6], { top: "paint:#3a3533", sides: "brick" }, out);
  boxFaces([28.75, 8.1, 6.55], [29.5, 8.22, 7.65], { top: "foundation", sides: "foundation", bottom: "foundation" }, out);
}

// --- greenhouse ---

const GH = { x0: 0, x1: 11, z0: 8.5, z1: 12.5, backY: 3.2, wallY: 2.0, curve: 0.8 };
/** The greenhouse's cross-section, from the garage wall down over the curved eave to the ground. */
function greenhouseProfile(): [number, number][] {
  const pts: [number, number][] = [[GH.z0, GH.backY]];
  const cz = GH.z1 - GH.curve, cy = GH.wallY;
  const slopeEnd: [number, number] = [cz, cy + GH.curve];
  pts.push(slopeEnd);
  for (let i = 1; i <= 6; i++) {
    const a = (Math.PI / 2) * (1 - i / 6);
    pts.push([cz + Math.cos(a) * GH.curve, cy + Math.sin(a) * GH.curve]);
  }
  pts.push([GH.z1, 0]);
  return pts;
}

function greenhouse(out: GeoBuckets, solids: SolidBox[]) {
  const prof = greenhouseProfile();
  // Glass skin along the length.
  for (let i = 0; i < prof.length - 1; i++) {
    const [za, ya] = prof[i]!, [zb, yb] = prof[i + 1]!;
    add(out, "glass", quad([[GH.x0, ya, za], [GH.x1, ya, za], [GH.x1, yb, zb], [GH.x0, yb, zb]], (p) => [p[0], p[1]]));
  }
  // End walls (glass), with the outside door's opening at the east end.
  for (const x of [GH.x0, GH.x1]) {
    const s = new Shape();
    s.moveTo(GH.z0, 0);
    for (const [z, y] of prof) s.lineTo(z, y);
    s.lineTo(GH.z0, 0);
    if (x === GH.x1) {
      const h = new Path();
      h.moveTo(10.05, 0.02);
      h.lineTo(10.95, 0.02);
      h.lineTo(10.95, 2.03);
      h.lineTo(10.05, 2.03);
      h.lineTo(10.05, 0.02);
      s.holes.push(h);
    }
    const g = new ShapeGeometry(s, 12);
    g.rotateY(-Math.PI / 2);
    g.translate(x, 0, 0);
    add(out, "glass", g.toNonIndexed());
  }
  // White aluminium ribs following the profile, plus bars along the length.
  const bar = (a: V3, b: V3, t = 0.035) => boxFaces(
    [Math.min(a[0], b[0]) - t, Math.min(a[1], b[1]) - t, Math.min(a[2], b[2]) - t],
    [Math.max(a[0], b[0]) + t, Math.max(a[1], b[1]) + t, Math.max(a[2], b[2]) + t], { top: "frame", sides: "frame", bottom: "frame" }, out);
  for (let x = GH.x0; x <= GH.x1 + 1e-6; x += 11 / 14) {
    for (let i = 0; i < prof.length - 1; i++) bar([x, prof[i]![1], prof[i]![0]], [x, prof[i + 1]![1], prof[i + 1]![0]]);
  }
  for (const [z, y] of prof) bar([GH.x0, y, z], [GH.x1, y, z]);
  bar([GH.x0, 0.9, GH.z1], [GH.x1, 0.9, GH.z1]);
  // Low wall along the bottom, and the floor.
  boxFaces([GH.x0, -0.2, GH.z1 - 0.08], [GH.x1, 0.35, GH.z1 + 0.04], { top: "foundation", sides: "foundation" }, out);
  boxFaces([GH.x0, -0.3, GH.z0], [GH.x1, 0, GH.z1], { top: "concrete", sides: "foundation", bottom: "foundation" }, out);
  solids.push({ min: [GH.x0, -0.3, GH.z0], max: [GH.x1, 0, GH.z1] });
  // Walls you bump into: the long glass side and the two ends (leaving the doorway).
  solids.push({ min: [GH.x0, 0, GH.z1 - 0.08], max: [GH.x1, 2.4, GH.z1 + 0.04] });
  solids.push({ min: [GH.x0 - 0.04, 0, GH.z0], max: [GH.x0 + 0.04, 2.6, GH.z1] });
  solids.push({ min: [GH.x1 - 0.04, 0, GH.z0], max: [GH.x1 + 0.04, 2.6, 10.05] });
  solids.push({ min: [GH.x1 - 0.04, 0, 10.95], max: [GH.x1 + 0.04, 2.6, GH.z1] });
  solids.push({ min: [GH.x1 - 0.04, 2.03, 10.05], max: [GH.x1 + 0.04, 2.6, 10.95] });
}

export function buildExterior(pieces: WallPiece[]) {
  const out: GeoBuckets = new Map();
  const solids: SolidBox[] = [];
  for (const g of ROOFS) gableRoof(g, out, solids);
  for (const d of DORMERS) dormer(d, out);
  windows(pieces, out);
  porch(out, solids);
  chimney(out);
  greenhouse(out, solids);
  return { buckets: out, solids };
}
