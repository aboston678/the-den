import {
  CORRIDOR_HALF, DRIVEWAY, KERB_WIDTH, PADDOCK, RUNOFF_WIDTH, SCENERY, START_S, TRACK, TRACK_AREA, TRACK_ROAD, TRACK_WIDTH, TRACK_Y, fbm, heightAt, lerp,
  smoothstep, type Path,
} from "@den/shared";
import { BoxGeometry, BufferAttribute, BufferGeometry, Color } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// The racetrack's shapes (Andrew, 2026-10-16), built once in code: the farmland it sits in, its
// roads and circuit (asphalt, white edge lines, red/white kerbs and blue/red run-off on the
// corners, the chequered start line) and its buildings. All flat at TRACK_Y.

/** Layers just above the ground, so they never flicker against each other. */
const UP = { runoff: 0.03, asphalt: 0.05, paint: 0.07 } as const;

const rectDist = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) =>
  Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

/**
 * The ground outside the property's own terrain: from the edge of the woods it eases to a gently
 * rolling farmland at the track's height, dead flat round the track grounds and along the road out.
 */
export function farmHeight(x: number, z: number) {
  const ex = Math.min(SCENERY.maxX, Math.max(SCENERY.minX, x)), ez = Math.min(SCENERY.maxZ, Math.max(SCENERY.minZ, z));
  const out = Math.hypot(x - ex, z - ez);
  let h = lerp(heightAt(ex, ez), TRACK_Y + fbm(x, z, 140, 3) * 2.4, smoothstep(0, 60, out));
  const road = TRACK_ROAD.closest(x, z, 30) ?? (out > 0 ? DRIVEWAY.closest(x, z, 30) : null);
  const flat = Math.max(1 - smoothstep(4, 40, rectDist(TRACK_AREA, x, z)), road ? 1 - smoothstep(CORRIDOR_HALF + 1, 28, road.dist) : 0);
  return lerp(h, TRACK_Y - 0.03, flat);
}

/** Patchwork fields round the track, mown grass inside it and along the road. */
const FIELD = ["#7fbf4a", "#a9c94e", "#d9c45a", "#8fb35a", "#c9a95c", "#6fae46"].map((c) => new Color(c));
const MOWN = new Color("#5eae3c");
function groundColour(x: number, z: number, out: Color) {
  const inside = rectDist(TRACK_AREA, x, z) < 1 || !!TRACK_ROAD.closest(x, z, CORRIDOR_HALF + 4);
  if (inside) return out.copy(MOWN).offsetHSL(0, 0, fbm(x, z, 30, 9) * 0.03);
  const fx = Math.floor((x + fbm(x, z, 90, 4) * 12) / 70), fz = Math.floor((z + fbm(x, z, 90, 5) * 12) / 52);
  const k = Math.abs((fx * 73856093) ^ (fz * 19349663)) % FIELD.length;
  return out.copy(FIELD[k]!).offsetHSL(0, 0, fbm(x, z, 12, 6) * 0.04);
}

/**
 * The farmland mesh. It covers a big square round the track; where that square overlaps the
 * property's own terrain, those vertices fold onto the terrain's edge (and below it), so the two
 * meet without a gap.
 */
export function farmGeometry(r = { minX: -1150, maxX: 60, minZ: -1050, maxZ: 60 }, step = 5) {
  const nx = Math.round((r.maxX - r.minX) / step) + 1, nz = Math.round((r.maxZ - r.minZ) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const c = new Color();
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      let x = r.minX + ix * step, z = r.minZ + iz * step;
      let y: number;
      if (x > SCENERY.minX && z > SCENERY.minZ && z < SCENERY.maxZ) {
        // Under the property's terrain: fold onto its west or north edge, just below it.
        if (x - SCENERY.minX < z - SCENERY.minZ) x = SCENERY.minX;
        else z = SCENERY.minZ;
        y = heightAt(x, z) - 0.3;
      } else y = farmHeight(x, z);
      const i = (iz * nx + ix) * 3;
      pos[i] = x;
      pos[i + 1] = y;
      pos[i + 2] = z;
      groundColour(x, z, c);
      col[i] = c.r;
      col[i + 1] = c.g;
      col[i + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Each sample along a path: point, unit direction, and how sharply it turns (+ = left, per metre). */
function samples(path: Path) {
  const pts = path.points, n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[path.closed ? (i - 1 + n - 1) % (n - 1) : Math.max(0, i - 1)]!;
    const next = pts[path.closed ? (i + 1) % (n - 1) : Math.min(n - 1, i + 1)]!;
    const dx = next.x - prev.x, dz = next.z - prev.z, len = Math.hypot(dx, dz) || 1;
    return { x: p.x, z: p.z, dx: dx / len, dz: dz / len, s: path.at[i]! };
  }).map((p, i, all) => {
    // Curvature from the turn over ±12 m (smoothed so kerbs don't flicker on and off).
    const span = 12, j0 = Math.max(0, i - span), j1 = Math.min(all.length - 1, i + span);
    const a = all[j0]!, b = all[j1]!;
    const turn = Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz);
    return { ...p, k: -turn / Math.max(1, b.s - a.s) };
  });
}

/**
 * A strip alongside a path between two offsets (metres, + = left of the direction of travel), as
 * separate quads so each can take its own colour. `colour(s, k)` returns null to leave a gap.
 */
function strip(path: Path, from: number, to: number, y: number, colour: (s: number, k: number, i: number) => Color | null, side?: (k: number) => number) {
  const S = samples(path);
  const pos: number[] = [], col: number[] = [];
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i]!, b = S[i + 1]!;
    const c = colour(a.s, a.k, i);
    if (!c) continue;
    const sgn = side ? side(a.k) : 1;
    const corner = (p: typeof a, off: number) => [p.x + p.dz * off * sgn, y, p.z - p.dx * off * sgn];
    const q = [corner(a, from), corner(a, to), corner(b, from), corner(b, to)];
    for (const v of [q[0]!, q[2]!, q[1]!, q[1]!, q[2]!, q[3]!]) {
      pos.push(...v);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  // Quads are wound for the left side; flip the ones laid down on the right so they face up.
  const n = g.getAttribute("normal") as BufferAttribute;
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** A plain road along a path (uv in metres, for the asphalt texture). */
export function roadGeometry(path: Path, width: number, y: number) {
  const S = samples(path);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const [i, p] of S.entries()) {
    for (const side of [-1, 1]) {
      const off = (side * width) / 2;
      pos.push(p.x + p.dz * off, y, p.z - p.dx * off);
      uv.push((side + 1) / 2 * (width / 4), p.s / 4);
    }
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d); // counter-clockwise seen from above
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.getAttribute("normal") as BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

const RED = new Color("#d7342b"), WHITE = new Color("#f4f1ea"), BLUE = new Color("#2f6fd0"), BLACK = new Color("#1c1c1c");
/** Corners tighter than this radius get kerbs; a bit wider still, run-off paint. */
const KERB_K = 1 / 140, RUNOFF_K = 1 / 220;

/** Everything painted on and beside the circuit, as one coloured mesh. */
export function circuitPaint() {
  const half = TRACK_WIDTH / 2;
  const parts = [
    // White lines just inside both edges, all the way round.
    strip(TRACK, half - 0.55, half - 0.3, TRACK_Y + UP.paint, () => WHITE),
    strip(TRACK, -half + 0.3, -half + 0.55, TRACK_Y + UP.paint, () => WHITE),
    // Red/white kerbs on both edges through the corners.
    strip(TRACK, half, half + KERB_WIDTH, TRACK_Y + UP.paint, (s, k) => (Math.abs(k) > KERB_K ? (Math.floor(s / 1.6) % 2 ? RED : WHITE) : null)),
    strip(TRACK, -half - KERB_WIDTH, -half, TRACK_Y + UP.paint, (s, k) => (Math.abs(k) > KERB_K ? (Math.floor(s / 1.6) % 2 ? RED : WHITE) : null)),
    // Painted run-off on the outside of the corners: blue, then red (like Andrew's photo).
    strip(TRACK, half + KERB_WIDTH, half + KERB_WIDTH + RUNOFF_WIDTH / 2, TRACK_Y + UP.runoff, (_s, k) => (Math.abs(k) > RUNOFF_K ? BLUE : null), (k) => (k > 0 ? -1 : 1)),
    strip(TRACK, half + KERB_WIDTH + RUNOFF_WIDTH / 2, half + KERB_WIDTH + RUNOFF_WIDTH, TRACK_Y + UP.runoff, (_s, k) => (Math.abs(k) > RUNOFF_K ? RED : null), (k) => (k > 0 ? -1 : 1)),
  ];
  return mergeGeometries([...parts, startLine()])!;
}

/** The chequered start/finish line across the track. */
function startLine() {
  const p = TRACK.pointAt(START_S);
  const pos: number[] = [], col: number[] = [];
  const cols = 12, rows = 2, depth = 0.9, w = TRACK_WIDTH / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const colour = (r + c) % 2 ? BLACK : WHITE;
      const a = -TRACK_WIDTH / 2 + c * w, b = a + w, f0 = r * depth, f1 = f0 + depth;
      const at = (off: number, fwd: number) => [p.x + p.dz * off + p.dx * fwd, TRACK_Y + UP.paint + 0.005, p.z - p.dx * off + p.dz * fwd];
      for (const v of [at(a, f0), at(a, f1), at(b, f0), at(b, f0), at(a, f1), at(b, f1)]) {
        pos.push(...v);
        col.push(colour.r, colour.g, colour.b);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  const n = g.getAttribute("normal") as BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export const ASPHALT_Y = TRACK_Y + UP.asphalt;

/** A box (centre, size, turned by yaw) tinted one colour, for merging into a building. */
function box(cx: number, cy: number, cz: number, w: number, h: number, d: number, colour: string, yaw = 0) {
  const g = new BoxGeometry(w, h, d).rotateY(yaw).translate(cx, cy, cz).toNonIndexed();
  const c = new Color(colour), n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.deleteAttribute("uv");
  return g;
}

/**
 * The buildings and fixtures, as one coloured mesh: the pit building along the paddock, the
 * grandstand facing the start/finish straight, the gantry over the start line, and the fence round
 * the grounds (with a gap for the gate).
 */
export function trackBuildings(gate: { from: number; to: number }) {
  const parts: BufferGeometry[] = [];
  const y0 = TRACK_Y;
  // Pit building: long and white, a red stripe, garage doors facing the paddock (north).
  const pitZ = PADDOCK.maxZ + 6.5, pitX0 = PADDOCK.minX + 8, pitX1 = PADDOCK.maxX - 8;
  parts.push(box((pitX0 + pitX1) / 2, y0 + 3, pitZ, pitX1 - pitX0, 6, 10, "#eeeeea"));
  parts.push(box((pitX0 + pitX1) / 2, y0 + 5.3, pitZ - 5.02, pitX1 - pitX0, 0.7, 0.1, "#d7342b"));
  parts.push(box((pitX0 + pitX1) / 2, y0 + 6.15, pitZ, pitX1 - pitX0 + 1, 0.3, 11, "#5b6168")); // roof
  for (let x = pitX0 + 6; x < pitX1 - 4; x += 10) parts.push(box(x, y0 + 1.9, pitZ - 5.03, 7, 3.8, 0.1, "#3c4248"));
  // Grandstand: stepped seats rising south, away from the straight, under a white roof.
  const gx0 = -585, gx1 = -380, gz = -236;
  for (let r = 0; r < 7; r++) {
    parts.push(box((gx0 + gx1) / 2, y0 + 0.5 + r * 0.9, gz - 6 + r * 1.6 + 0.8, gx1 - gx0, 1 + r * 1.8, 1.6, "#cfd2d6")); // concrete step
    parts.push(box((gx0 + gx1) / 2, y0 + 1.15 + r * 1.8, gz - 6 + r * 1.6 + 1.0, gx1 - gx0 - 2, 0.35, 0.9, r % 2 ? "#2f5fb8" : "#d7342b")); // a row of seats
  }
  parts.push(box((gx0 + gx1) / 2, y0 + 4.2, gz + 6.4, gx1 - gx0, 8.4, 0.6, "#c9ccd0")); // back wall
  parts.push(box((gx0 + gx1) / 2, y0 + 10.2, gz + 1, gx1 - gx0 + 2, 0.4, 14, "#f4f1ea")); // roof
  for (let x = gx0; x <= gx1; x += 25) parts.push(box(x, y0 + 5, gz + 6, 0.5, 10, 0.5, "#9aa0a6"));
  // Start/finish gantry: two posts and a beam with a chequered-red panel.
  const s = TRACK.pointAt(START_S), yaw = Math.atan2(s.dx, s.dz);
  for (const side of [-1, 1]) {
    const off = side * (TRACK_WIDTH / 2 + 2.2);
    parts.push(box(s.x + s.dz * off, y0 + 3.5, s.z - s.dx * off, 0.6, 7, 0.6, "#c9ccd0", yaw));
  }
  parts.push(box(s.x, y0 + 7.2, s.z, TRACK_WIDTH + 5.4, 1.4, 0.6, "#d7342b", yaw + Math.PI / 2));
  for (let i = 0; i < 8; i++) {
    const off = -TRACK_WIDTH / 2 + 1 + i * 1.45;
    parts.push(box(s.x + s.dz * off - s.dx * 0.32, y0 + 7.2, s.z - s.dx * off - s.dz * 0.32, 0.72, 0.7, 0.05, i % 2 ? "#1c1c1c" : "#f4f1ea", yaw + Math.PI / 2));
  }
  // The fence: a low concrete wall round the grounds, red and white along the top.
  const f = fenceLine();
  for (const [x0, z0, x1, z1] of f) {
    const len = Math.hypot(x1 - x0, z1 - z0), wy = Math.atan2(x1 - x0, z1 - z0);
    // Leave the gate open.
    if (x0 === x1 && x0 === TRACK_AREA.maxX - 2 && Math.max(z0, z1) > gate.from && Math.min(z0, z1) < gate.to) {
      const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
      if (gate.from > lo) parts.push(box(x0, y0 + 0.55, (lo + gate.from) / 2, 0.5, 1.1, gate.from - lo, "#d9d9d4"));
      if (gate.to < hi) parts.push(box(x0, y0 + 0.55, (gate.to + hi) / 2, 0.5, 1.1, hi - gate.to, "#d9d9d4"));
      continue;
    }
    parts.push(box((x0 + x1) / 2, y0 + 0.55, (z0 + z1) / 2, 0.5, 1.1, len, "#d9d9d4", wy));
  }
  return mergeGeometries(parts)!;
}

/** The fence's four sides (x0, z0, x1, z1), 2 m inside the grounds' edge. */
export function fenceLine(): [number, number, number, number][] {
  const a = { minX: TRACK_AREA.minX + 2, maxX: TRACK_AREA.maxX - 2, minZ: TRACK_AREA.minZ + 2, maxZ: TRACK_AREA.maxZ - 2 };
  return [
    [a.minX, a.minZ, a.maxX, a.minZ],
    [a.minX, a.maxZ, a.maxX, a.maxZ],
    [a.minX, a.minZ, a.minX, a.maxZ],
    [a.maxX, a.minZ, a.maxX, a.maxZ],
  ];
}

export { UP as TRACK_LAYERS };
