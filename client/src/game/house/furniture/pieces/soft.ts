import { legs } from "../parts.ts";
import type { Builder } from "./types.ts";

// Upholstered pieces: the common area's cream sofa (with its sheepskin) and armchair, the
// downstairs queen bed.

/** Box sofa: base, seat cushions, back, rolled arms. */
export const sofa: Builder = (k, { w, d, h }, look) => {
  const cloth = look === "cream" ? "fabric:#e2d8c4" : "fabric:#b9ad98";
  const arm = 0.2, seat = 0.45;
  k.box([-w / 2, 0.08, -d / 2], [w / 2, seat - 0.1, d / 2], cloth);
  legs(k, w, d, 0.08, 0.05, "wood:#4a3020", 0.03, 0.8);
  const n = Math.max(2, Math.round((w - 2 * arm) / 0.6));
  const cw = (w - 2 * arm) / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + arm + cw * (i + 0.5);
    k.box([x - cw / 2 + 0.01, seat - 0.1, -d / 2 + 0.22], [x + cw / 2 - 0.01, seat, d / 2], cloth); // seat cushion
    k.box([x - cw / 2 + 0.01, seat, -d / 2 + 0.08], [x + cw / 2 - 0.01, h - 0.05, -d / 2 + 0.26], cloth); // back cushion
  }
  k.box([-w / 2, seat - 0.1, -d / 2], [w / 2, h, -d / 2 + 0.12], cloth);
  for (const sx of [-1, 1]) {
    k.box([sx * (w / 2 - arm / 2) - arm / 2, seat - 0.1, -d / 2], [sx * (w / 2 - arm / 2) + arm / 2, 0.62, d / 2], cloth);
    k.at(sx * (w / 2 - arm / 2), 0, 0).rodX(-arm / 2, arm / 2, 0.62, 0, 0.1, cloth);
  }
  if (look === "cream") {
    // Sheepskin thrown over one end of the back (common-area photo).
    k.sphere([-w / 2 + 0.45, h - 0.02, -d / 2 + 0.15], 0.28, "fabric:#f6f3ec", [1.2, 0.35, 0.8], 10);
    k.box([w / 2 - 0.55, seat, -d / 2 + 0.24], [w / 2 - 0.2, seat + 0.32, -d / 2 + 0.34], "tex:fabric_floral"); // a pillow
  }
};

export const armchair: Builder = (k, { w, d, h }, look) => {
  const cloth = look === "cream" ? "leather:#e6dccb" : look === "navy" ? "fabric:#1e2a5e" : "fabric:#c9b99a";
  const arm = 0.17, seat = 0.44;
  k.box([-w / 2, 0.06, -d / 2], [w / 2, seat - 0.08, d / 2], cloth);
  legs(k, w, d, 0.06, 0.05, "wood:#4a3020", 0.04);
  k.box([-w / 2 + arm, seat - 0.08, -d / 2 + 0.2], [w / 2 - arm, seat + 0.02, d / 2], cloth);
  k.box([-w / 2, seat - 0.08, -d / 2], [w / 2, h, -d / 2 + 0.2], cloth);
  for (const sx of [-1, 1]) {
    k.box([sx * (w / 2 - arm / 2) - arm / 2, seat - 0.08, -d / 2], [sx * (w / 2 - arm / 2) + arm / 2, 0.6, d / 2], cloth);
    k.at(sx * (w / 2 - arm / 2), 0, 0).rodX(-arm / 2, arm / 2, 0.6, 0, 0.085, cloth);
  }
};

/** Queen bed: low headboard, white comforter, pillows (downstairs bedroom photo). */
export const queenBed: Builder = (k, { w, d, h }) => {
  const frame = "wood:#e8e0d0";
  k.box([-w / 2, 0.1, -d / 2 + 0.06], [w / 2, 0.35, d / 2], frame);
  legs(k, w, d, 0.1, 0.06, frame, 0.02);
  k.box([-w / 2 - 0.04, 0, -d / 2], [w / 2 + 0.04, h, -d / 2 + 0.06], frame); // headboard
  k.box([-w / 2 + 0.03, 0.35, -d / 2 + 0.08], [w / 2 - 0.03, 0.55, d / 2 - 0.02], "fabric:#f4f2ee"); // mattress
  k.box([-w / 2 - 0.02, 0.48, -d / 2 + 0.55], [w / 2 + 0.02, 0.6, d / 2 + 0.01], "fabric:#fbfaf7"); // comforter
  for (const side of [-1, 1]) k.box([side * 0.37 - 0.3, 0.55, -d / 2 + 0.12], [side * 0.37 + 0.3, 0.7, -d / 2 + 0.48], "fabric:#ffffff"); // pillows
};
