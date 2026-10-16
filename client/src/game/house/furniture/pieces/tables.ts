import { legs, seeded } from "../parts.ts";
import { pal } from "../textures.ts";
import type { Builder } from "./types.ts";

// Tables, chairs, storage, and the garage / deck / porch pieces.

const MAHOGANY = "wood:#6b2a1c";
const WALNUT = "wood:#6e4a2c";
const OAK = "wood:#c79a5c";
const BLACK_PAINT = "plastic:#1b1c1d";
const IRON = "metal:#26282a";

export const farmTable: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, h - 0.045, -d / 2], [w / 2, h, d / 2], "wood:#a06a3a");
  k.box([-w / 2 + 0.08, h - 0.15, -d / 2 + 0.08], [w / 2 - 0.08, h - 0.045, d / 2 - 0.08], "wood:#8a5a30"); // apron
  legs(k, w, d, h - 0.045, 0.075, "wood:#8a5a30", 0.06, 0.7);
  // Placemats and a glass runner (dining-hall photo).
  for (const [x, z] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]] as const) k.box([x - 0.2, h, z - 0.14], [x + 0.2, h + 0.004, z + 0.14], "fabric:#9a8a6a");
  k.box([-0.5, h, -0.12], [0.5, h + 0.006, 0.12], "glass");
};

/** The games table in the basement stair landing (Connect Four): honey wood with a green felt top. */
export const gameTable: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, h - 0.045, -d / 2], [w / 2, h, d / 2], "wood:#a06a3a");
  k.box([-w / 2 + 0.05, h, -d / 2 + 0.05], [w / 2 - 0.05, h + 0.004, d / 2 - 0.05], "fabric:#2f6b45");
  k.box([-w / 2 + 0.06, h - 0.13, -d / 2 + 0.06], [w / 2 - 0.06, h - 0.045, d / 2 - 0.06], "wood:#8a5a30"); // apron
  legs(k, w, d, h - 0.045, 0.06, "wood:#8a5a30", 0.05, 0.7);
};

/** Slat-back side chair (dining hall; black for the bedroom desk). */
export const slatChair: Builder = (k, { w, d, h }, look) => {
  const wood = look === "black" ? BLACK_PAINT : "wood:#6e3f22";
  const seat = 0.46;
  k.box([-w / 2, seat - 0.04, -d / 2], [w / 2, seat, d / 2], wood);
  k.box([-w / 2 + 0.02, seat, -d / 2 + 0.02], [w / 2 - 0.02, seat + 0.03, d / 2 - 0.04], look === "black" ? "fabric:#3a3a3a" : "fabric:#8c9aa5");
  legs(k, w, d, seat - 0.04, 0.04, wood, 0.02);
  // Back posts and slats.
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - 0.04) - 0.02, seat, -d / 2 + 0.01], [sx * (w / 2 - 0.04) + 0.02, h, -d / 2 + 0.05], wood);
  k.box([-w / 2 + 0.04, h - 0.1, -d / 2 + 0.015], [w / 2 - 0.04, h - 0.02, -d / 2 + 0.045], wood);
  for (const x of [-0.08, 0, 0.08]) k.box([x - 0.025, seat + 0.05, -d / 2 + 0.02], [x + 0.025, h - 0.1, -d / 2 + 0.04], wood);
};

/** The formal dining table, under a pale pink cloth (Catan table). */
export const diningTable: Builder = (k, { w, d, h }, look) => {
  k.box([-w / 2, h - 0.04, -d / 2], [w / 2, h, d / 2], MAHOGANY);
  if (look === "cloth") {
    k.box([-w / 2 - 0.08, h - 0.32, -d / 2 - 0.08], [w / 2 + 0.08, h + 0.004, d / 2 + 0.08], "tex:fabric_damask");
  }
  for (const sx of [-1, 1]) {
    k.cyl(sx * (w / 2 - 0.35), 0, 0, 0.22, 0.05, 0.08, MAHOGANY, 12); // pedestal feet
    k.cyl(sx * (w / 2 - 0.35), 0.08, 0, 0.06, 0.05, h - 0.12, MAHOGANY, 10);
  }
};

/** Round glass coffee table on a dark base (great room), or a plain round wood side table. */
export const coffeeTable: Builder = (k, { w, h }) => {
  k.cyl(0, 0, 0, w * 0.3, w * 0.24, h - 0.03, "wood:#3b2216", 16);
  k.cyl(0, h - 0.03, 0, w / 2, w / 2, 0.03, "glass", 32);
  k.ring([0, h - 0.015, 0], w / 2, 0.012, "brass");
};

export const sideTable: Builder = (k, { w, d, h }, look) => {
  if (look === "round") {
    k.cyl(0, h - 0.03, 0, w / 2, w / 2, 0.03, MAHOGANY, 20);
    k.cyl(0, 0.08, 0, 0.03, 0.025, h - 0.11, MAHOGANY, 8);
    for (const a of [0, 120, 240]) k.at(0, 0, 0, a).box([-0.015, 0, 0], [0.015, 0.1, 0.22], MAHOGANY); // tripod feet
    return;
  }
  k.box([-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], WALNUT);
  k.box([-w / 2 + 0.03, h - 0.16, -d / 2 + 0.03], [w / 2 - 0.03, h - 0.03, d / 2 - 0.03], WALNUT);
  k.box([-w / 2 + 0.03, 0.12, -d / 2 + 0.03], [w / 2 - 0.03, 0.14, d / 2 - 0.03], WALNUT);
  legs(k, w, d, h - 0.03, 0.035, WALNUT, 0.02);
  // A few books on the lower shelf (common-area photo).
  for (let i = 0; i < 4; i++) k.box([-0.15, 0.14 + i * 0.035, -0.12], [0.15 - i * 0.02, 0.17 + i * 0.035, 0.1], "tex:palette", pal(i * 3));
};

export const consoleTable: Builder = (k, { w, d, h }, look) => {
  const wood = look === "white" ? "paint:#f4f2ec" : MAHOGANY;
  k.box([-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], wood);
  k.box([-w / 2 + 0.03, h - 0.14, -d / 2 + 0.02], [w / 2 - 0.03, h - 0.03, d / 2 - 0.02], wood);
  legs(k, w, d, h - 0.03, 0.035, wood, 0.02, 0.6);
  k.box([-w / 2 + 0.08, 0.15, -d / 2 + 0.04], [w / 2 - 0.08, 0.17, d / 2 - 0.04], wood);
};

/** Black drop-leaf desk (downstairs bedroom). */
export const desk: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], BLACK_PAINT);
  k.box([-w / 2 + 0.03, h - 0.15, -d / 2 + 0.02], [w / 2 - 0.03, h - 0.03, d / 2 - 0.02], BLACK_PAINT);
  k.box([-0.1, h - 0.1, d / 2 - 0.02], [0.1, h - 0.08, d / 2], "brass");
  legs(k, w, d, h - 0.03, 0.035, BLACK_PAINT, 0.02, 0.7);
};

export const nightstand: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0.08, -d / 2], [w / 2, h, d / 2], "wood:#e8e0d0");
  legs(k, w, d, 0.08, 0.04, "wood:#e8e0d0", 0.01);
  for (const y of [h - 0.2, h - 0.42]) {
    k.box([-w / 2 + 0.03, y, d / 2], [w / 2 - 0.03, y + 0.16, d / 2 + 0.01], "wood:#efe8da");
    k.sphere([0, y + 0.08, d / 2 + 0.02], 0.015, "brass", [1, 1, 1], 6);
  }
};

export const cabinetLow: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], "wood:#d39b5c");
};

export const tvStand: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, h - 0.04, -d / 2], [w / 2, h, d / 2], WALNUT);
  k.box([-w / 2, 0.12, -d / 2], [w / 2, 0.15, d / 2], WALNUT);
  legs(k, w, d, h - 0.04, 0.04, WALNUT, 0.01);
};

/** A flat-screen TV on a small foot (the screen gets the home videos in 2.2). */
export const tv: Builder = (k, { w, d, h }) => {
  k.box([-0.12, 0, -0.08], [0.12, 0.015, 0.08], BLACK_PAINT);
  k.box([-0.025, 0.015, -0.02], [0.025, 0.08, 0.02], BLACK_PAINT);
  k.box([-w / 2, 0.08, -d / 2], [w / 2, 0.08 + h, d / 2 - 0.005], "plastic:#111214");
  k.box([-w / 2 + 0.015, 0.095, d / 2 - 0.005], [w / 2 - 0.015, 0.065 + h, d / 2], "screen");
};

export const workbench: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, h - 0.05, -d / 2], [w / 2, h, d / 2], "wood:#b8875a");
  k.box([-w / 2 + 0.04, 0.12, -d / 2 + 0.04], [w / 2 - 0.04, 0.15, d / 2 - 0.04], "wood:#b8875a");
  legs(k, w, d, h - 0.05, 0.07, "wood:#9a7048", 0.02);
  k.box([0.4, h, 0.0], [0.62, h + 0.1, 0.14], "plastic:#b8322a"); // a toolbox
  k.box([-0.6, h, -0.15], [-0.3, h + 0.04, 0.05], "metal:#8a8d90");
};

/** Pegboard with tools hanging on it. */
export const pegboard: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], "paint:#b39a74");
  const rnd = seeded(11);
  for (let i = 0; i < 9; i++) {
    const x = -w / 2 + 0.15 + (i * (w - 0.3)) / 8, y = 0.25 + rnd() * 0.45;
    k.box([x - 0.015, y - 0.15, d / 2], [x + 0.015, y + 0.1, d / 2 + 0.02], i % 3 ? "metal:#8a8d90" : "plastic:#b8322a");
  }
};

/** Grey steel shelving with storage bins. */
export const steelShelf: Builder = (k, { w, d, h }) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (w / 2) - (sx > 0 ? 0.03 : 0), 0, sz * (d / 2) - (sz > 0 ? 0.03 : 0)], [sx * (w / 2) + (sx < 0 ? 0.03 : 0), h, sz * (d / 2) + (sz < 0 ? 0.03 : 0)], "metal:#7d8084");
  const rnd = seeded(5);
  for (let i = 0; i < 4; i++) {
    const y = 0.1 + i * 0.55;
    k.box([-w / 2, y, -d / 2], [w / 2, y + 0.025, d / 2], "metal:#8d9094");
    if (i === 3) break;
    for (let b = 0; b < 2; b++) {
      const x = -w / 2 + 0.08 + b * (w / 2), bh = 0.25 + rnd() * 0.15;
      k.box([x, y + 0.025, -d / 2 + 0.04], [x + w / 2 - 0.16, y + 0.025 + bh, d / 2 - 0.04], b ? "plastic:#2f4f7a" : "plastic:#c9c2b0");
    }
  }
};

/** Trash and recycling bins. */
export const bins: Builder = (k, { w, d, h }) => {
  for (const [x, c] of [[-w / 4, "plastic:#2b3a2e"], [w / 4, "plastic:#2a4f8a"]] as const) {
    k.box([x - w / 4 + 0.02, 0, -d / 2], [x + w / 4 - 0.02, h - 0.05, d / 2], c);
    k.box([x - w / 4 + 0.01, h - 0.05, -d / 2 - 0.01], [x + w / 4 - 0.01, h, d / 2 + 0.03], c);
  }
};

/** Firewood rack, full of split logs. */
export const firewoodRack: Builder = (k, { w, d, h }) => {
  for (const sx of [-1, 1]) k.box([sx * (w / 2) - 0.02, 0, -d / 2], [sx * (w / 2) + 0.02, h, d / 2], IRON);
  k.box([-w / 2, 0.05, -d / 2], [w / 2, 0.08, d / 2], IRON);
  const rnd = seeded(3);
  for (let row = 0; row < 6; row++) {
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 0.08 + i * ((w - 0.16) / 5);
      k.rodZ(-d / 2 + 0.02, d / 2 - 0.02, x, 0.13 + row * 0.11, 0.05, rnd() > 0.5 ? "wood:#8a6a48" : "wood:#a8875f", 6);
    }
  }
};

/** Black wrought-iron table and chairs under a green market umbrella (deck.jpg). */
export const patioSet: Builder = (k, { h }) => {
  const r = 0.5, th = 0.72;
  k.cyl(0, th - 0.02, 0, r, r, 0.02, IRON, 24);
  k.cyl(0, 0, 0, 0.25, 0.04, 0.06, IRON, 12);
  k.cyl(0, 0.06, 0, 0.03, 0.03, th - 0.08, IRON, 8);
  // Umbrella: pole and a shallow green cone.
  k.cyl(0, th, 0, 0.02, 0.02, h - th - 0.3, "metal:#d9d4c6", 8);
  k.cyl(0, h - 0.5, 0, 1.35, 0.05, 0.42, "fabric:#1f6b4f", 8);
  for (const a of [0, 90, 180, 270]) {
    const c = k.at(Math.sin((a * Math.PI) / 180) * 0.78, 0, Math.cos((a * Math.PI) / 180) * 0.78, a + 180);
    c.box([-0.22, 0.44, -0.22], [0.22, 0.47, 0.22], IRON);
    legs(c, 0.44, 0.44, 0.44, 0.025, IRON, 0.02);
    c.box([-0.22, 0.47, -0.24], [0.22, 0.9, -0.21], IRON);
  }
};

/** Porch rocking chair (white). */
export const rockingChair: Builder = (k, { w, d, h }) => {
  const white = "paint:#f2f0ea";
  for (const sx of [-1, 1]) {
    k.box([sx * (w / 2 - 0.03) - 0.02, 0, -d / 2], [sx * (w / 2 - 0.03) + 0.02, 0.05, d / 2], white); // rockers
    k.box([sx * (w / 2 - 0.03) - 0.02, 0.05, -d / 2 + 0.15], [sx * (w / 2 - 0.03) + 0.02, 0.62, -d / 2 + 0.19], white);
    k.box([sx * (w / 2 - 0.03) - 0.02, 0.05, d / 2 - 0.25], [sx * (w / 2 - 0.03) + 0.02, 0.62, d / 2 - 0.21], white);
    k.box([sx * (w / 2 - 0.03) - 0.03, 0.62, -d / 2 + 0.12], [sx * (w / 2 - 0.03) + 0.03, 0.65, d / 2 - 0.15], white); // arms
  }
  k.box([-w / 2 + 0.05, 0.42, -d / 2 + 0.15], [w / 2 - 0.05, 0.45, d / 2 - 0.2], white);
  for (let i = 0; i < 7; i++) {
    const x = -w / 2 + 0.08 + (i * (w - 0.16)) / 6;
    k.box([x - 0.015, 0.45, -d / 2 + 0.12], [x + 0.015, h, -d / 2 + 0.15], white);
  }
  k.box([-w / 2 + 0.05, h - 0.06, -d / 2 + 0.11], [w / 2 - 0.05, h, -d / 2 + 0.16], white);
};
