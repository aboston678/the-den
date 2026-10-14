import { CATAN_TABLE, EDGES, type Board, type Terrain } from "@den/shared";
import {
  BoxGeometry, type BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BOARD_Y, FRAME_R, HEX, TILE_H, TILE_TOP, hexPos, seaward, vertexPos } from "./layout.ts";
import { TERRAIN_COLOURS, boardAtlas, cellUv, harborCell, tokenCell } from "./textures.ts";

// The fixed parts of a Catan board (GAME_SPEC §16), built in code: a wooden rim and a sea frame,
// 19 painted hex tiles with chunky little scenery (trees, sheep, wheat, brick kilns, snowy peaks),
// the number tokens and the harbors. Merged into two meshes: one coloured, one textured.

const TOP = TILE_TOP;

const tmpM = new Matrix4(), tmpQ = new Quaternion(), tmpS = new Vector3(), tmpP = new Vector3();

/** Places a geometry and paints it one colour (as vertex colours). */
function piece(g: BufferGeometry, colour: string, x: number, y: number, z: number, yaw = 0, s: [number, number, number] = [1, 1, 1]) {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  geo.deleteAttribute("uv");
  tmpQ.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  geo.applyMatrix4(tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(...s)));
  const c = new Color(colour);
  const n = geo.getAttribute("position").count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new Float32BufferAttribute(cols, 3));
  return geo;
}

/** A small seeded jitter so every tile's scenery looks a bit different but the same for everyone. */
function jitter(seed: number) {
  let a = seed * 9301 + 49297;
  return () => {
    a = (a * 9301 + 49297) % 233280;
    return a / 233280;
  };
}

const cone = new ConeGeometry(1, 1, 7);
const ball = new SphereGeometry(1, 8, 6);
const box = new BoxGeometry(1, 1, 1);
const hexTile = new CylinderGeometry(HEX * 0.965, HEX * 0.965, TILE_H, 6);

/** Scenery on a tile, kept round the edge so the number token in the middle stays clear. */
function scenery(t: Terrain, h: number, out: BufferGeometry[]) {
  const [cx, , cz] = hexPos(h);
  const r = jitter(h + 1);
  const spots = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + r() * 0.6 + 0.4;
      const d = HEX * (0.58 + r() * 0.12);
      return [cx + Math.cos(a) * d, cz + Math.sin(a) * d] as const;
    });
  switch (t) {
    case "forest":
      for (const [x, z] of spots(4)) {
        const s = 0.75 + r() * 0.4;
        out.push(piece(box, "#6b4423", x, TOP + 0.008 * s, z, 0, [0.008, 0.016 * s, 0.008]));
        out.push(piece(cone, r() < 0.5 ? "#1f5e2c" : "#2c7438", x, TOP + 0.016 * s + 0.022 * s, z, r() * 3, [0.022 * s, 0.045 * s, 0.022 * s]));
      }
      return;
    case "pasture":
      for (const [x, z] of spots(3)) {
        out.push(piece(ball, "#fbfaf4", x, TOP + 0.012, z, 0, [0.017, 0.012, 0.012]));
        out.push(piece(ball, "#3b3330", x + 0.014, TOP + 0.015, z, 0, [0.006, 0.006, 0.006]));
      }
      return;
    case "fields":
      for (const [x, z] of spots(4)) {
        const yaw = r() * Math.PI;
        for (let k = -1; k <= 1; k++) out.push(piece(box, k === 0 ? "#e3a920" : "#f7d65a", x + k * 0.006 * Math.cos(yaw), TOP + 0.009, z - k * 0.006 * Math.sin(yaw), yaw, [0.004, 0.018, 0.022]));
      }
      return;
    case "hills":
      for (const [x, z] of spots(3)) {
        const yaw = r() * Math.PI;
        out.push(piece(box, "#a9472a", x, TOP + 0.006, z, yaw, [0.026, 0.012, 0.014]));
        out.push(piece(box, "#d0714a", x, TOP + 0.016, z, yaw, [0.018, 0.008, 0.012]));
      }
      return;
    case "mountains":
      for (const [x, z] of spots(3)) {
        const s = 0.8 + r() * 0.5;
        out.push(piece(cone, "#7a7f89", x, TOP + 0.022 * s, z, r() * 3, [0.03 * s, 0.045 * s, 0.03 * s]));
        out.push(piece(cone, "#ffffff", x, TOP + 0.036 * s, z, r() * 3, [0.012 * s, 0.017 * s, 0.012 * s]));
      }
      return;
    case "desert":
      for (const [x, z] of spots(2)) {
        out.push(piece(ball, "#d9bd78", x, TOP, z, r() * 3, [0.035, 0.012, 0.024]));
        out.push(piece(box, "#4f8a3c", x + 0.01, TOP + 0.016, z, 0, [0.006, 0.03, 0.006]));
      }
      return;
  }
}

/** A flat disc on the board showing one atlas cell on top. */
function tag(cell: number, x: number, z: number, radius: number, y = TOP + 0.002) {
  const g = new CylinderGeometry(radius, radius, 0.005, 24).toNonIndexed();
  const [u0, v0, u1, v1] = cellUv(cell);
  const pos = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    // Map the disc's top face by position, so the picture lies flat and upright (north up).
    const px = pos.getX(i) / radius, pz = pos.getZ(i) / radius;
    uv.setXY(i, u0 + ((px + 1) / 2) * (u1 - u0), v0 + ((1 - (pz + 1) / 2)) * (v1 - v0));
  }
  g.translate(x, y + 0.0025, z);
  return g;
}

export interface BoardMeshes {
  coloured: BufferGeometry;
  textured: BufferGeometry;
}

export function buildBoard(board: Board): BoardMeshes {
  const col: BufferGeometry[] = [];
  const tex: BufferGeometry[] = [];
  const { x: cx, z: cz } = CATAN_TABLE;

  // Wooden rim, then the sea, as flat-sided hexagons round the island.
  col.push(piece(new CylinderGeometry(FRAME_R + 0.04, FRAME_R + 0.05, 0.03, 6).rotateY(Math.PI / 6), "#7a4a26", cx, CATAN_TABLE.topY + 0.015, cz));
  col.push(piece(new CylinderGeometry(FRAME_R, FRAME_R, 0.03, 6).rotateY(Math.PI / 6), "#3d9bd1", cx, CATAN_TABLE.topY + 0.017, cz));

  board.tiles.forEach((t, h) => {
    const [x, , z] = hexPos(h);
    col.push(piece(hexTile, TERRAIN_COLOURS[t.terrain], x, BOARD_Y, z));
    scenery(t.terrain, h, col);
    if (t.token !== null) tex.push(tag(tokenCell(t.token), x, z, HEX * 0.34));
  });

  // Harbors: a little dock from the shore's two corners out to a tag in the water.
  for (const hb of board.harbors) {
    const [hx, hz] = seaward(hb.edge, 0.62);
    for (const v of EDGES[hb.edge]!) {
      const [vx, , vz] = vertexPos(v);
      const len = Math.hypot(hx - vx, hz - vz);
      col.push(piece(box, "#9b6b3f", (hx + vx) / 2, CATAN_TABLE.topY + 0.034, (hz + vz) / 2, Math.atan2(hx - vx, hz - vz), [0.012, 0.004, len]));
    }
    tex.push(tag(harborCell(hb.kind), hx, hz, HEX * 0.3, CATAN_TABLE.topY + 0.031));
  }
  return { coloured: mergeGeometries(col)!, textured: mergeGeometries(tex)! };
}

export { boardAtlas };
