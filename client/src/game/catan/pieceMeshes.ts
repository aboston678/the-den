import { BoxGeometry, type BufferGeometry, CanvasTexture, CylinderGeometry, SRGBColorSpace, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Shapes for the Catan pieces (GAME_SPEC §16), built in code: chunky wooden-toy roads, houses,
// cities and the robber, plus the dice. World metres, sized for the ~1.3 m board.

export const ROAD = { w: 0.017, h: 0.016 } as const;

const strip = (g: BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  return out;
};

/** A road: a plank along +z, length 1 (scaled per edge). */
export const roadGeometry = () => new BoxGeometry(ROAD.w, ROAD.h, 1).translate(0, ROAD.h / 2, 0);

/** A settlement: a little house with a pitched roof (a 3-sided cylinder turned ridge-along-z, point up). */
export function settlementGeometry() {
  const s = 0.03;
  const base = strip(new BoxGeometry(s, s * 0.8, s * 1.1).translate(0, s * 0.4, 0));
  const roof = strip(new CylinderGeometry(s * 0.62, s * 0.62, s * 1.1, 3).rotateX(-Math.PI / 2).translate(0, s * 0.8 + s * 0.31, 0));
  return mergeGeometries([base, roof])!;
}

/** A city: a wide house with a tall tower. */
export function cityGeometry() {
  const s = 0.03;
  const hall = strip(new BoxGeometry(s * 1.8, s * 0.8, s * 1.1).translate(s * 0.35, s * 0.4, 0));
  const tower = strip(new BoxGeometry(s, s * 1.6, s * 1.1).translate(-s * 0.45, s * 0.8, 0));
  const roof = strip(new CylinderGeometry(s * 0.62, s * 0.62, s * 1.1, 3).rotateX(-Math.PI / 2).translate(-s * 0.45, s * 1.6 + s * 0.31, 0));
  return mergeGeometries([hall, tower, roof])!;
}

/** The robber: a dark chess-pawn shape. */
export function robberGeometry() {
  const base = strip(new CylinderGeometry(0.02, 0.026, 0.012, 14).translate(0, 0.006, 0));
  const body = strip(new CylinderGeometry(0.013, 0.02, 0.05, 14).translate(0, 0.037, 0));
  const head = strip(new SphereGeometry(0.016, 14, 10).translate(0, 0.07, 0));
  return mergeGeometries([base, body, head])!;
}

/** A marker ring for spots you can pick. */
export const ringGeometry = () => new CylinderGeometry(1, 1, 0.004, 20, 1, true);

export const DIE = 0.045;

/** Faces of a die in BoxGeometry order (+x, −x, +y, −y, +z, −z); opposite faces add up to 7. */
export const DIE_FACES = [2, 5, 1, 6, 3, 4] as const;

/** A die: a cube with each face mapped to its own cell of the pip texture. */
export function dieGeometry() {
  const g = new BoxGeometry(DIE, DIE, DIE);
  const uv = g.getAttribute("uv");
  // Each face has 4 vertices in order; squeeze its 0..1 square into cell (value − 1) of 6 across.
  for (let f = 0; f < 6; f++) {
    const cell = DIE_FACES[f]! - 1;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setX(i, (cell + uv.getX(i)) / 6);
    }
  }
  return g;
}

let pipTexture: CanvasTexture | null = null;

/** Ivory faces with dark pips, 6 cells across. */
export function diePips(): CanvasTexture {
  if (pipTexture) return pipTexture;
  const C = 128;
  const canvas = document.createElement("canvas");
  canvas.width = C * 6;
  canvas.height = C;
  const g = canvas.getContext("2d")!;
  const spots: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  };
  for (let v = 1; v <= 6; v++) {
    const x0 = (v - 1) * C;
    g.fillStyle = "#fbf6e9";
    g.fillRect(x0, 0, C, C);
    g.strokeStyle = "#d8cdb3";
    g.lineWidth = 6;
    g.strokeRect(x0 + 3, 3, C - 6, C - 6);
    g.fillStyle = v === 1 ? "#b8261c" : "#1d1a17";
    for (const [px, py] of spots[v]!) {
      g.beginPath();
      g.arc(x0 + px * C, py * C, v === 1 ? 15 : 11, 0, Math.PI * 2);
      g.fill();
    }
  }
  pipTexture = new CanvasTexture(canvas);
  pipTexture.colorSpace = SRGBColorSpace;
  pipTexture.anisotropy = 4;
  return pipTexture;
}
