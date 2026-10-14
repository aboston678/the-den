import type { Builder } from "./types.ts";

// The bowling lounge (milestone 3.1), from reference/bowling/alley-inspiration.jpg: the walnut wall
// of shoe cubbies and ball shelves with display pins on top, the copper high-top table and its
// leather stools, and the blue-and-white cube stools.

const WALNUT = "wood:#5a3b26";
const WALNUT_DARK = "wood:#3e2819";
const SHOE_BLUE = "plastic:#26407e", SHOE_WHITE = "plastic:#f2f1ec";
const BALL_BLUES = ["plastic:#1d4bc9", "plastic:#2a5fe0", "plastic:#183c9e"];

/** Walnut cubbies: an arched top with display pins, 4 rows of shoe cubbies, 2 shelves of blue balls. */
export const ballWall: Builder = (k, { w, d, h }) => {
  const t = 0.03, cols = 6, back = -d / 2;
  k.box([-w / 2, 0, back], [w / 2, h, back + 0.02], WALNUT_DARK); // back panel
  for (const s of [-1, 1]) k.box([s * w / 2 - (s > 0 ? t : 0), 0, back], [s * w / 2 + (s < 0 ? t : 0), h, d / 2], WALNUT); // sides
  k.box([-w / 2, h - 0.12, back], [w / 2, h, d / 2], WALNUT); // top
  k.box([-w / 2, 0, back], [w / 2, 0.08, d / 2], WALNUT_DARK); // plinth
  // Shelves (bottom up): two ball shelves, then four rows of shoe cubbies, then the display shelf.
  const rows = [0.08, 0.38, 0.68, 0.92, 1.16, 1.4, 1.64];
  for (const y of rows) k.box([-w / 2, y, back], [w / 2, y + t, d / 2], WALNUT);
  const cw = (w - t) / cols;
  for (let i = 1; i < cols; i++) {
    const x = -w / 2 + i * cw;
    k.box([x, rows[2]!, back], [x + t, rows[6]!, d / 2], WALNUT); // cubby dividers (shoe rows only)
  }
  // Shoes: a pair in every cubby (navy with white soles and toes).
  for (let r = 2; r < 6; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = -w / 2 + t + (c + 0.5) * cw, y = rows[r]! + t;
      for (const s of [-1, 1]) {
        const x = cx + s * cw * 0.2;
        k.box([x - 0.045, y, -0.05], [x + 0.045, y + 0.03, 0.17], SHOE_WHITE);
        k.box([x - 0.043, y + 0.03, -0.05], [x + 0.043, y + 0.1, 0.1], SHOE_BLUE);
        k.box([x - 0.043, y + 0.03, 0.1], [x + 0.043, y + 0.07, 0.17], SHOE_WHITE);
      }
    }
  }
  // Blue balls on the two lower shelves.
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      const x = -w / 2 + 0.2 + c * ((w - 0.4) / 4), y = rows[r]! + t + 0.11;
      k.sphere([x, y, 0.02], 0.11, BALL_BLUES[(r + c) % 3]!, [1, 1, 1], 14);
    }
  }
  // Display pins on top: two pairs of wooden pins.
  for (const x of [-w * 0.3, -w * 0.3 + 0.13, w * 0.25, w * 0.25 + 0.13]) {
    k.cyl(x, h, 0, 0.025, 0.06, 0.16, "wood:#d9b27c", 12);
    k.cyl(x, h + 0.16, 0, 0.06, 0.03, 0.12, "wood:#d9b27c", 12);
    k.cyl(x, h + 0.28, 0, 0.03, 0.035, 0.08, "wood:#d9b27c", 12);
    k.sphere([x, h + 0.36, 0], 0.033, "wood:#d9b27c", [1, 1, 1], 10);
    k.cyl(x, h + 0.24, 0, 0.032, 0.032, 0.025, "plastic:#26407e", 12); // neck stripe
  }
};

/** Copper-topped high-top table on a dark pedestal with a brass foot ring. */
export const highTopTable: Builder = (k, { w, h }) => {
  const r = w / 2;
  k.cyl(0, h - 0.04, 0, r, r, 0.04, "metal:#c9774a", 32);
  k.cyl(0, h - 0.07, 0, r * 0.25, r * 0.25, 0.03, "plastic:#1f1b18", 16);
  k.cyl(0, 0.05, 0, 0.05, 0.05, h - 0.11, "plastic:#1f1b18", 12);
  k.cyl(0, 0, 0, r * 0.55, r * 0.5, 0.05, "plastic:#1f1b18", 20);
  k.ring([0, 0.3, 0], r * 0.42, 0.012, "brass");
};

/** Leather bar stool with a turned wooden base. */
export const barStool: Builder = (k, { w, h }) => {
  const r = w / 2;
  k.cyl(0, h - 0.1, 0, r, r * 0.98, 0.1, "leather:#4a2420", 20);
  k.cyl(0, 0.05, 0, 0.05, 0.08, h - 0.15, "wood:#5a3826", 12);
  k.cyl(0, 0, 0, r * 0.75, r * 0.7, 0.05, "wood:#5a3826", 16);
  k.ring([0, 0.32, 0], r * 0.62, 0.01, "brass");
};

/** Cube stool in a blue-and-white geometric print (the photo's little cubes). */
export const cubeStool: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], { all: "tex:fabric_cubes", top: "fabric:#e8ecf4" }, "fit");
};

