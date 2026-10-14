// The fixed shape of a Catan board: 19 hexes, the 54 corners where settlements go and the 72 edges
// where roads go, plus what touches what. Worked out once from hex geometry so the numbering is
// always the same in the browser, on the server and in the tests. Ids are small integers so the
// game state stays tiny.
//
// Hexes are "pointy-top" in axial coordinates (q, r) out to radius 2. Positions are in hex units
// (centre to corner = 1); x runs east, y runs south (toward the bottom of the board on screen).

export interface HexCell {
  q: number;
  r: number;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

const SQ3 = Math.sqrt(3);

function buildHexes(): HexCell[] {
  const out: HexCell[] = [];
  for (let r = -2; r <= 2; r++) {
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(q + r) > 2) continue;
      out.push({ q, r, x: SQ3 * (q + r / 2), y: 1.5 * r });
    }
  }
  return out;
}

/** Corner i of a hex, clockwise from the top-right (pointy-top: corners at -30°, 30°, 90°, …). */
function corner(h: HexCell, i: number): Point {
  const a = ((60 * i - 30) * Math.PI) / 180;
  return { x: h.x + Math.cos(a), y: h.y + Math.sin(a) };
}

const key = (p: Point) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

export const HEXES: readonly HexCell[] = buildHexes();

const cornerPoints = HEXES.map((h) => [0, 1, 2, 3, 4, 5].map((i) => corner(h, i)));

/** Every corner, top to bottom then left to right. */
export const VERTICES: readonly Point[] = (() => {
  const seen = new Map<string, Point>();
  for (const pts of cornerPoints) for (const p of pts) if (!seen.has(key(p))) seen.set(key(p), p);
  return [...seen.values()].sort((a, b) => Math.round((a.y - b.y) * 1000) || a.x - b.x);
})();

const vertexId = new Map(VERTICES.map((p, i) => [key(p), i]));

/** The 6 corners of each hex, in corner order. */
export const HEX_VERTICES: readonly (readonly number[])[] = cornerPoints.map((pts) => pts.map((p) => vertexId.get(key(p))!));

/** Every edge as its two corners (lower id first), sorted. */
export const EDGES: readonly (readonly [number, number])[] = (() => {
  const seen = new Map<string, [number, number]>();
  for (const vs of HEX_VERTICES) {
    for (let i = 0; i < 6; i++) {
      const a = vs[i]!, b = vs[(i + 1) % 6]!;
      const e: [number, number] = a < b ? [a, b] : [b, a];
      seen.set(`${e[0]}-${e[1]}`, e);
    }
  }
  return [...seen.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
})();

const edgeId = new Map(EDGES.map((e, i) => [`${e[0]}-${e[1]}`, i]));

/** The edge joining two corners, or -1 if they aren't neighbours. */
export function edgeBetween(a: number, b: number): number {
  return edgeId.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? -1;
}

/** The 6 edges of each hex, in corner order (edge i joins corner i and i+1). */
export const HEX_EDGES: readonly (readonly number[])[] = HEX_VERTICES.map((vs) =>
  vs.map((v, i) => edgeBetween(v, vs[(i + 1) % 6]!)),
);

const collect = (n: number) => Array.from({ length: n }, () => [] as number[]);

/** Hexes touching each corner (1–3). */
export const VERTEX_HEXES: readonly (readonly number[])[] = (() => {
  const out = collect(VERTICES.length);
  HEX_VERTICES.forEach((vs, h) => vs.forEach((v) => out[v]!.push(h)));
  return out;
})();

/** Edges touching each corner (2–3). */
export const VERTEX_EDGES: readonly (readonly number[])[] = (() => {
  const out = collect(VERTICES.length);
  EDGES.forEach(([a, b], e) => {
    out[a]!.push(e);
    out[b]!.push(e);
  });
  return out;
})();

/** Corners one edge away from each corner. */
export const VERTEX_NEIGHBORS: readonly (readonly number[])[] = VERTICES.map((_, v) =>
  VERTEX_EDGES[v]!.map((e) => {
    const [a, b] = EDGES[e]!;
    return a === v ? b : a;
  }),
);

/** Hexes sharing a side with each hex. */
export const HEX_NEIGHBORS: readonly (readonly number[])[] = HEXES.map((h) =>
  HEXES.flatMap((o, i) => (Math.abs(o.q - h.q) + Math.abs(o.r - h.r) + Math.abs(o.q + o.r - h.q - h.r) === 2 ? [i] : [])),
);

/** The 30 edges on the outside of the island, going clockwise round from the top. */
export const COAST_EDGES: readonly number[] = (() => {
  const count = new Array<number>(EDGES.length).fill(0);
  for (const es of HEX_EDGES) for (const e of es) count[e]!++;
  const mid = (e: number) => {
    const [a, b] = EDGES[e]!;
    return { x: (VERTICES[a]!.x + VERTICES[b]!.x) / 2, y: (VERTICES[a]!.y + VERTICES[b]!.y) / 2 };
  };
  const angle = (e: number) => {
    const m = mid(e);
    return (Math.atan2(m.x, -m.y) + 2 * Math.PI) % (2 * Math.PI);
  };
  return EDGES.map((_, e) => e).filter((e) => count[e] === 1).sort((a, b) => angle(a) - angle(b));
})();

/** The 9 coast edges that hold harbors, spaced 3-3-4 round the island like the real board. */
export const HARBOR_SLOTS: readonly number[] = (() => {
  const gaps = [3, 3, 4, 3, 3, 4, 3, 3, 4];
  const out: number[] = [];
  let i = 1;
  for (const g of gaps) {
    out.push(COAST_EDGES[i % COAST_EDGES.length]!);
    i += g;
  }
  return out;
})();
