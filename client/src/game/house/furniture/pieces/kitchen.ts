import { type Kit, seeded } from "../parts.ts";
import { pal } from "../textures.ts";
import type { Builder } from "./types.ts";

// The knotty-pine kitchen (kitchen.jpg): base cabinets with pine counters, upper cabinets, black
// range, stainless fridge, the island with a double sink, small appliances, the pantry shelves.

const PINE = "wood:#d39b5c";
const COUNTER = "wood:#d9a868";
const STEEL = "metal:#c9ccce";
const BLACK = "plastic:#17181a";

/** Doors and drawer fronts on the front of a cabinet run: a slightly raised panel per door, round knobs. */
function fronts(k: Kit, w: number, y0: number, y1: number, z: number, doorW = 0.5) {
  const n = Math.max(1, Math.round(w / doorW));
  const dw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    k.box([x - dw / 2 + 0.02, y0 + 0.02, z], [x + dw / 2 - 0.02, y1 - 0.02, z + 0.015], PINE);
    k.sphere([x + (i % 2 ? -1 : 1) * (dw / 2 - 0.07), y1 - 0.09, z + 0.03], 0.016, "wood:#e8c99a", [1, 1, 1], 6);
  }
}

export const counter: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0.1, -d / 2], [w / 2, h - 0.04, d / 2 - 0.03], PINE);
  k.box([-w / 2, 0, -d / 2], [w / 2, 0.1, d / 2 - 0.08], "paint:#2a2018"); // toe kick
  k.box([-w / 2, h - 0.04, -d / 2], [w / 2, h, d / 2 + 0.02], COUNTER);
  k.box([-w / 2, h - 0.12, d / 2 - 0.03], [w / 2, h - 0.05, d / 2 - 0.015], PINE); // drawer row
  fronts(k, w, 0.12, h - 0.14, d / 2 - 0.03);
};

export const upperCabinet: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2 - 0.015], PINE);
  fronts(k, w, 0, h, d / 2 - 0.015, 0.45);
};

export const range: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h - 0.02, d / 2], BLACK);
  k.box([-w / 2 + 0.06, 0.15, d / 2], [w / 2 - 0.06, 0.62, d / 2 + 0.01], "dark_glass"); // oven window
  k.rodX(-w / 2 + 0.08, w / 2 - 0.08, 0.7, d / 2 + 0.04, 0.012, STEEL);
  k.box([-w / 2, h - 0.02, -d / 2], [w / 2, h, d / 2], "dark_glass"); // smooth top
  for (const [x, z, r] of [[-0.18, 0.12, 0.1], [0.18, 0.12, 0.08], [-0.18, -0.14, 0.08], [0.18, -0.14, 0.1]] as const) k.cyl(x, h, z, r, r, 0.002, "plastic:#2a2b2e", 20);
  k.box([-w / 2, h, -d / 2], [w / 2, h + 0.12, -d / 2 + 0.06], BLACK); // back panel with the clock
  k.box([-0.08, h + 0.04, -d / 2 + 0.061], [0.08, h + 0.08, -d / 2 + 0.065], "glow:#4adf8a");
};

export const rangeHood: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h * 0.35, d / 2], STEEL);
  k.box([-w / 2 + 0.12, h * 0.35, -d / 2], [w / 2 - 0.12, h, d / 2 - 0.15], STEEL);
};

export const fridge: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2 - 0.02], STEEL);
  k.box([-w / 2 + 0.005, 0.02, d / 2 - 0.02], [-0.005, h - 0.02, d / 2], STEEL); // french doors
  k.box([0.005, 0.02, d / 2 - 0.02], [w / 2 - 0.005, h - 0.02, d / 2], STEEL);
  for (const x of [-0.04, 0.04]) k.box([x - 0.012, 0.7, d / 2], [x + 0.012, 1.5, d / 2 + 0.04], "metal:#9a9da0");
};

export const island: Builder = (k, { w, d, h }) => {
  k.box([-w / 2 + 0.05, 0, -d / 2 + 0.05], [w / 2 - 0.05, h - 0.04, d / 2 - 0.05], PINE);
  k.box([-w / 2, h - 0.04, -d / 2], [w / 2, h, d / 2], COUNTER);
  fronts(k, w - 0.1, 0.05, h - 0.1, d / 2 - 0.05, 0.6);
  // Double sink with a gooseneck tap.
  for (const x of [-0.42, -0.02]) k.box([x - 0.18, h - 0.005, -0.2], [x + 0.18, h + 0.002, 0.18], STEEL);
  k.cyl(-0.22, h, -0.3, 0.025, 0.02, 0.3, STEEL, 8);
  k.box([-0.235, h + 0.28, -0.3], [-0.205, h + 0.31, -0.12], STEEL);
};

export const microwave: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], BLACK);
  k.box([-w / 2 + 0.03, 0.04, d / 2], [w / 2 - 0.14, h - 0.04, d / 2 + 0.005], "dark_glass");
};

export const toaster: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], STEEL);
  for (const z of [-0.04, 0.04]) k.box([-w / 2 + 0.04, h, z - 0.015], [w / 2 - 0.04, h + 0.002, z + 0.015], BLACK);
};

export const kettle: Builder = (k, { h }) => {
  k.cyl(0, 0, 0, 0.1, 0.07, h * 0.75, STEEL, 16);
  k.cyl(0, h * 0.75, 0, 0.07, 0.02, h * 0.12, STEEL, 12);
  k.box([-0.015, h * 0.75, -0.08], [0.015, h, 0.08], BLACK); // handle
};

export const fruitBowl: Builder = (k, { w, h }) => {
  k.cyl(0, 0, 0, w * 0.3, w / 2, h * 0.6, "plastic:#2f5f9a", 16);
  const fruit: [number, number, number, number][] = [[-0.06, 0.07, 0, 26], [0.05, 0.07, 0.04, 27], [0.02, 0.08, -0.06, 26], [-0.02, 0.12, 0.01, 28]];
  for (const [x, y, z, c] of fruit) k.sphere([x, y, z], 0.045, "tex:palette", [1, 1, 1], 8, pal(c));
};

export const trashCan: Builder = (k, { w, h }) => {
  k.cyl(0, 0, 0, w / 2, w / 2, h, STEEL, 16);
  k.cyl(0, h, 0, w / 2, w / 2 - 0.01, 0.03, "metal:#8d9093", 16);
};

/** Pantry shelving packed with jars, cans and cereal-box shapes (one palette material). */
export const pantryShelf: Builder = (k, { w, d, h }) => {
  const rnd = seeded(Math.round(w * 100));
  for (const x of [-w / 2, w / 2 - 0.03]) k.box([x, 0, -d / 2], [x + 0.03, h, d / 2], "wood:#c79a5c");
  const shelves = 5;
  for (let i = 0; i < shelves; i++) {
    const y = 0.15 + (i * (h - 0.25)) / (shelves - 1);
    k.box([-w / 2, y - 0.02, -d / 2], [w / 2, y, d / 2], "wood:#c79a5c");
    if (i === shelves - 1) break;
    let x = -w / 2 + 0.06;
    while (x < w / 2 - 0.12) {
      const kind = rnd();
      if (kind < 0.35) {
        // jar with a lid
        const r = 0.04 + rnd() * 0.02, jh = 0.12 + rnd() * 0.08;
        const z = -d / 4 + rnd() * 0.1;
        k.cyl(x + r, y, z, r, r, jh, "tex:palette", 10, pal(16 + Math.floor(rnd() * 4)));
        k.cyl(x + r, y + jh, z, r * 0.9, r * 0.9, 0.02, "tex:palette", 10, pal(22));
        x += r * 2 + 0.03;
      } else if (kind < 0.7) {
        // a stack of cans
        const r = 0.037;
        const label = pal(19 + Math.floor(rnd() * 5));
        for (let s = 0; s < 2; s++) k.cyl(x + r, y + s * 0.115, 0, r, r, 0.11, "tex:palette", 10, label);
        x += r * 2 + 0.02;
      } else {
        // a box
        const bw = 0.07 + rnd() * 0.06, bh = 0.18 + rnd() * 0.12;
        k.box([x, y, -d / 2 + 0.05], [x + bw, y + bh, d / 2 - 0.08], "tex:palette", pal(16 + Math.floor(rnd() * 10)));
        x += bw + 0.02;
      }
    }
  }
};
