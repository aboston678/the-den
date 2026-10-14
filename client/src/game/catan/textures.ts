import { pips, type Resource, type Terrain } from "@den/shared";
import { CanvasTexture, SRGBColorSpace } from "three";

// Painted bits of the Catan board (GAME_SPEC §16, our own art): number tokens and harbor tags,
// drawn once into a small atlas so all of them share one texture and one draw call.

/** Cartoon terrain colours. */
export const TERRAIN_COLOURS: Record<Terrain, string> = {
  forest: "#2f7a3a",
  pasture: "#8fd16a",
  fields: "#f0c43c",
  hills: "#c8653a",
  mountains: "#8a8f99",
  desert: "#e8d29a",
};

export const RESOURCE_COLOURS: Record<Resource, string> = {
  lumber: "#2f7a3a",
  brick: "#c8653a",
  wool: "#8fd16a",
  grain: "#f0c43c",
  ore: "#8a8f99",
};

export const RESOURCE_LABELS: Record<Resource, string> = { lumber: "Lumber", brick: "Brick", wool: "Wool", grain: "Grain", ore: "Ore" };

/** Atlas cells: tokens 2–12 (index = number), then 6 harbor tags. */
const CELL = 128;
const COLS = 8;
export const HARBOR_TAGS = ["any", "lumber", "brick", "wool", "grain", "ore"] as const;
const CELLS = 13 + HARBOR_TAGS.length;
const ROWS = Math.ceil(CELLS / COLS);

/** UV rectangle [u0, v0, u1, v1] of an atlas cell. */
export function cellUv(i: number): [number, number, number, number] {
  const c = i % COLS, r = Math.floor(i / COLS);
  return [c / COLS, 1 - (r + 1) / ROWS, (c + 1) / COLS, 1 - r / ROWS];
}
export const tokenCell = (n: number) => n;
export const harborCell = (kind: (typeof HARBOR_TAGS)[number]) => 13 + HARBOR_TAGS.indexOf(kind);

let atlas: CanvasTexture | null = null;

/** The shared atlas (made on first use). */
export function boardAtlas(): CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement("canvas");
  canvas.width = CELL * COLS;
  canvas.height = CELL * ROWS;
  const g = canvas.getContext("2d")!;
  const at = (i: number) => [(i % COLS) * CELL, Math.floor(i / COLS) * CELL] as const;

  // Number tokens: cream disc, the number, and its dots (red for 6 and 8).
  for (let n = 2; n <= 12; n++) {
    if (n === 7) continue;
    const [x, y] = at(tokenCell(n));
    const cx = x + CELL / 2, cy = y + CELL / 2;
    g.fillStyle = "#f6ecd2";
    g.beginPath();
    g.arc(cx, cy, CELL * 0.47, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#b89b62";
    g.lineWidth = 5;
    g.stroke();
    const red = n === 6 || n === 8;
    g.fillStyle = red ? "#c0281e" : "#2b2118";
    g.font = `bold ${red ? 62 : 56}px Georgia, 'Times New Roman', serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), cx, cy - 8);
    const dots = pips(n);
    for (let d = 0; d < dots; d++) {
      g.beginPath();
      g.arc(cx + (d - (dots - 1) / 2) * 13, cy + 34, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Harbor tags: a little flag with the trade rate and the resource's colour.
  for (const kind of HARBOR_TAGS) {
    const [x, y] = at(harborCell(kind));
    const cx = x + CELL / 2, cy = y + CELL / 2;
    g.fillStyle = kind === "any" ? "#f6ecd2" : RESOURCE_COLOURS[kind];
    g.beginPath();
    g.arc(cx, cy, CELL * 0.46, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#5a4630";
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = kind === "any" ? "#2b2118" : "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "bold 46px Georgia, serif";
    g.fillText(kind === "any" ? "3:1" : "2:1", cx, cy - (kind === "any" ? 0 : 14));
    if (kind !== "any") {
      g.font = "bold 24px sans-serif";
      g.fillText(RESOURCE_LABELS[kind], cx, cy + 26);
    }
  }

  atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}
