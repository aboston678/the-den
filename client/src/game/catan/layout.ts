import { CATAN_TABLE, EDGES, HEXES, VERTICES } from "@den/shared";

// Where things go on the Catan board (GAME_SPEC §16), in world metres. The board lies flat on the
// dining table: topology x → world x (east), topology y → world z (south).

/** Hex size: centre to corner. The island plus its sea frame is ~1.3 × 1.1 m, inside the table. */
export const HEX = 0.14;
/** Centre height of the hex tiles, which sit on the sea frame (its top is 3.2 cm above the table). */
export const TILE_H = 0.016;
export const BOARD_Y = CATAN_TABLE.topY + 0.032 + TILE_H / 2;
/** Top of the tiles: where pieces stand. */
export const TILE_TOP = BOARD_Y + TILE_H / 2;
/** Sea frame: a flat-sided hexagon round the island (centre to corner). */
export const FRAME_R = HEX * 4.75;

export const hexPos = (h: number): [number, number, number] => [CATAN_TABLE.x + HEXES[h]!.x * HEX, BOARD_Y, CATAN_TABLE.z + HEXES[h]!.y * HEX];
export const vertexPos = (v: number): [number, number, number] => [CATAN_TABLE.x + VERTICES[v]!.x * HEX, TILE_TOP, CATAN_TABLE.z + VERTICES[v]!.y * HEX];

/** An edge's middle, its direction (yaw about y) and length. */
export function edgePos(e: number) {
  const [a, b] = EDGES[e]!;
  const pa = VERTICES[a]!, pb = VERTICES[b]!;
  const dx = (pb.x - pa.x) * HEX, dz = (pb.y - pa.y) * HEX;
  return {
    x: CATAN_TABLE.x + ((pa.x + pb.x) / 2) * HEX,
    z: CATAN_TABLE.z + ((pa.y + pb.y) / 2) * HEX,
    yaw: Math.atan2(dx, dz),
    len: Math.hypot(dx, dz),
  };
}

/** For a coast edge: a point out in the sea beyond it (for harbors), `out` hex units past the edge. */
export function seaward(e: number, out: number): [number, number] {
  const { x, z } = edgePos(e);
  const dx = x - CATAN_TABLE.x, dz = z - CATAN_TABLE.z;
  const d = Math.hypot(dx, dz);
  return [x + (dx / d) * out * HEX, z + (dz / d) * out * HEX];
}
