import { describe, expect, it } from "vitest";
import { rng } from "../world/noise.ts";
import { TOKENS, generateBoard, pips, redsApart } from "./board.ts";
import {
  COAST_EDGES,
  EDGES,
  HARBOR_SLOTS,
  HEXES,
  HEX_EDGES,
  HEX_NEIGHBORS,
  HEX_VERTICES,
  VERTEX_EDGES,
  VERTEX_HEXES,
  VERTEX_NEIGHBORS,
  VERTICES,
  edgeBetween,
} from "./topology.ts";

const count = <T,>(xs: readonly T[], x: T) => xs.filter((y) => y === x).length;

describe("catan board shape", () => {
  it("has 19 hexes, 54 corners, 72 edges and 30 coast edges", () => {
    expect(HEXES).toHaveLength(19);
    expect(VERTICES).toHaveLength(54);
    expect(EDGES).toHaveLength(72);
    expect(COAST_EDGES).toHaveLength(30);
  });

  it("every hex has 6 distinct corners and 6 real edges", () => {
    for (const vs of HEX_VERTICES) expect(new Set(vs).size).toBe(6);
    for (const es of HEX_EDGES) {
      expect(new Set(es).size).toBe(6);
      expect(es.every((e) => e >= 0)).toBe(true);
    }
  });

  it("corners touch 1–3 hexes and 2–3 edges; neighbours are mutual", () => {
    for (let v = 0; v < VERTICES.length; v++) {
      expect(VERTEX_HEXES[v]!.length).toBeGreaterThanOrEqual(1);
      expect(VERTEX_HEXES[v]!.length).toBeLessThanOrEqual(3);
      expect([2, 3]).toContain(VERTEX_EDGES[v]!.length);
      for (const n of VERTEX_NEIGHBORS[v]!) expect(VERTEX_NEIGHBORS[n]).toContain(v);
      for (const n of VERTEX_NEIGHBORS[v]!) expect(edgeBetween(v, n)).toBeGreaterThanOrEqual(0);
    }
  });

  it("the centre hex has 6 neighbours and corner hexes have 3", () => {
    const centre = HEXES.findIndex((h) => h.q === 0 && h.r === 0);
    expect(HEX_NEIGHBORS[centre]).toHaveLength(6);
    const corner = HEXES.findIndex((h) => h.q === 2 && h.r === -2);
    expect(HEX_NEIGHBORS[corner]).toHaveLength(3);
  });

  it("the 9 harbor slots are on the coast and never share a corner", () => {
    expect(HARBOR_SLOTS).toHaveLength(9);
    const corners = HARBOR_SLOTS.flatMap((e) => EDGES[e]!);
    expect(new Set(corners).size).toBe(18);
    for (const e of HARBOR_SLOTS) expect(COAST_EDGES).toContain(e);
  });
});

describe("catan board generation", () => {
  it("uses the standard terrain, tokens and harbors", () => {
    const b = generateBoard(rng(1));
    const t = b.tiles.map((x) => x.terrain);
    expect([count(t, "forest"), count(t, "pasture"), count(t, "fields"), count(t, "hills"), count(t, "mountains"), count(t, "desert")]).toEqual([4, 4, 4, 3, 3, 1]);
    expect(b.tiles.flatMap((x) => (x.token === null ? [] : [x.token])).sort((a, c) => a - c)).toEqual([...TOKENS]);
    const desert = b.tiles.find((x) => x.terrain === "desert")!;
    expect(desert.token).toBeNull();
    const kinds = b.harbors.map((h) => h.kind);
    expect(count(kinds, "any")).toBe(4);
    for (const r of ["lumber", "brick", "wool", "grain", "ore"] as const) expect(count(kinds, r)).toBe(1);
  });

  it("never puts a 6 or 8 next to another 6 or 8 (2,000 boards)", () => {
    for (let s = 0; s < 2000; s++) expect(redsApart(generateBoard(rng(s)).tiles)).toBe(true);
  });

  it("the same seed makes the same board", () => {
    expect(generateBoard(rng(42))).toEqual(generateBoard(rng(42)));
    expect(generateBoard(rng(42))).not.toEqual(generateBoard(rng(43)));
  });

  it("number tokens keep their normal dots: 6 and 8 have 5, 2 and 12 have 1", () => {
    expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(pips)).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1]);
  });
});
