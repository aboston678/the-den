import { type Kit, seeded } from "../parts.ts";
import { pal } from "../textures.ts";
import type { Builder } from "./types.ts";

// Bookshelves, the bathroom, lamps and lights, plants, pictures and rugs.

/** Built-in pine bookshelves, every shelf full of books of all sizes (office photo). */
export const bookshelf: Builder = (k, { w, d, h }) => {
  const wood = "wood:#cf9a5e";
  const rnd = seeded(Math.round(w * 1000 + h * 10));
  k.box([-w / 2, 0, -d / 2], [w / 2, h, -d / 2 + 0.02], wood); // back
  const bays = Math.max(1, Math.round(w / 0.8));
  const bw = w / bays;
  for (let b = 0; b <= bays; b++) {
    const x = -w / 2 + b * bw;
    k.box([x - (b === 0 ? 0 : 0.01), 0, -d / 2], [x + (b === bays ? 0 : 0.01), h, d / 2], wood);
  }
  k.box([-w / 2, 0, -d / 2], [w / 2, 0.1, d / 2], wood); // plinth
  k.box([-w / 2, h - 0.06, -d / 2], [w / 2, h, d / 2 + 0.02], wood); // crown
  const shelves = Math.round((h - 0.2) / 0.32);
  const sh = (h - 0.16) / shelves;
  for (let s = 0; s < shelves; s++) {
    const y = 0.1 + s * sh;
    k.box([-w / 2, y - 0.02, -d / 2], [w / 2, y, d / 2], wood);
    for (let b = 0; b < bays; b++) {
      let x = -w / 2 + b * bw + 0.02;
      const end = x + bw - 0.04;
      while (x < end - 0.03) {
        if (rnd() < 0.06) { x += 0.06 + rnd() * 0.1; continue; } // a gap now and then
        const t = 0.02 + rnd() * 0.035, bh = Math.min(sh - 0.04, 0.17 + rnd() * 0.12), bd = d - 0.06 - rnd() * 0.06;
        if (x + t > end) break;
        k.box([x, y, -d / 2 + 0.02], [x + t, y + bh, -d / 2 + 0.02 + bd], "tex:palette", pal(Math.floor(rnd() * 16)));
        x += t + 0.002;
      }
    }
  }
};

/** Pine double closet doors on the wall (mudroom photo). */
export const closetDoors: Builder = (k, { w, d, h }, look) => {
  const wood = look === "white" ? "paint:#f4f2ec" : "wood:#d39b5c";
  k.box([-w / 2 - 0.06, 0, -d / 2], [w / 2 + 0.06, h + 0.06, -d / 2 + 0.01], look === "white" ? "paint:#f8f6f0" : "wood:#d9a868"); // casing
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -w / 2 : 0.005, x1 = sx < 0 ? -0.005 : w / 2;
    k.box([x0, 0.01, -d / 2], [x1, h, d / 2], wood);
    for (const [y0, y1] of [[0.12, 0.85], [0.95, 1.4], [1.5, h - 0.12]] as const) k.box([x0 + 0.08, y0, d / 2], [x1 - 0.08, y1, d / 2 + 0.012], wood);
    k.sphere([sx * 0.05, 1.0, d / 2 + 0.03], 0.02, "brass", [1, 1, 1], 6);
  }
};

export const toilet: Builder = (k, { w, d }) => {
  const china = "plastic:#f4f3ef";
  k.cyl(0, 0, d / 2 - 0.3, 0.13, 0.16, 0.38, china, 16);
  k.cyl(0, 0.38, d / 2 - 0.27, 0.19, 0.19, 0.03, china, 20);
  k.box([-w / 2, 0.38, -d / 2], [w / 2, 0.76, -d / 2 + 0.2], china); // tank
};

export const vanity: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h - 0.04, d / 2], "wood:#e8e0d0");
  k.box([-w / 2, h - 0.04, -d / 2], [w / 2, h, d / 2 + 0.02], "plastic:#e7e2d6");
  k.cyl(0, h - 0.02, 0.02, 0.17, 0.17, 0.025, "plastic:#ffffff", 20);
  k.cyl(0, h, -d / 2 + 0.07, 0.015, 0.015, 0.16, "metal:#c9ccce", 8);
  for (const sx of [-1, 1]) k.box([sx * w / 4 - w / 4 + 0.03, 0.08, d / 2], [sx * w / 4 + w / 4 - 0.03, h - 0.1, d / 2 + 0.012], "wood:#efe8da");
};

export const mirror: Builder = (k, { w, d, h }, look) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], look === "gilt" ? "brass" : "wood:#c9b28a");
  k.box([-w / 2 + 0.04, 0.04, d / 2], [w / 2 - 0.04, h - 0.04, d / 2 + 0.004], "metal:#d8dde0");
};

/** Floor lamp: weighted base, thin brass pole, glowing fabric shade. */
export const floorLamp: Builder = (k, { h }) => {
  k.cyl(0, 0, 0, 0.16, 0.14, 0.03, "brass", 16);
  k.cyl(0, 0.03, 0, 0.012, 0.012, h - 0.33, "brass", 6);
  k.cyl(0, h - 0.33, 0, 0.2, 0.14, 0.3, "glow:#f3e3c2", 16);
};

export const tableLamp: Builder = (k, { h }) => {
  k.cyl(0, 0, 0, 0.07, 0.05, 0.03, "brass", 12);
  k.sphere([0, 0.14, 0], 0.08, "plastic:#2d5a63", [1, 1.2, 1], 10);
  k.cyl(0, 0.24, 0, 0.01, 0.01, h - 0.44, "brass", 6);
  k.cyl(0, h - 0.22, 0, 0.15, 0.1, 0.2, "glow:#f6e7c6", 16);
};

/** Brass ceiling fan with a glass light bowl (dining hall photo). Built down from y = 0 (the ceiling). */
export const ceilingFan: Builder = (k, { w, h }) => {
  k.cyl(0, -0.05, 0, 0.06, 0.06, 0.05, "brass", 10);
  k.cyl(0, -h + 0.18, 0, 0.012, 0.012, h - 0.23, "brass", 6);
  k.cyl(0, -h + 0.08, 0, 0.11, 0.11, 0.12, "brass", 14);
  k.sphere([0, -h + 0.04, 0], 0.09, "glow:#fbe9c4", [1, 0.6, 1], 12);
  for (const a of [0, 72, 144, 216, 288]) k.at(0, -h + 0.14, 0, a).box([-0.06, -0.008, 0.08], [0.06, 0.008, w / 2], "wood:#d9b56e");
};

/** Brass candle chandelier (formal dining). Built down from the ceiling. */
export const chandelier: Builder = (k, { w, h }) => {
  k.cyl(0, -0.04, 0, 0.05, 0.05, 0.04, "brass", 10);
  k.cyl(0, -h + 0.25, 0, 0.012, 0.012, h - 0.29, "brass", 6);
  k.sphere([0, -h + 0.18, 0], 0.08, "brass", [1, 1.4, 1], 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 360, c = k.at(0, -h + 0.15, 0, a);
    c.box([-0.008, -0.008, 0], [0.008, 0.008, w / 2 - 0.04], "brass");
    c.cyl(0, 0, w / 2 - 0.04, 0.035, 0.03, 0.03, "brass", 8);
    c.cyl(0, 0.03, w / 2 - 0.04, 0.012, 0.012, 0.12, "plastic:#f7f2e4", 6);
    c.sphere([0, 0.17, w / 2 - 0.04], 0.018, "glow:#ffd98a", [1, 1.8, 1], 6);
  }
};

/** Brass lantern pendant (foyer). Built down from the ceiling. */
export const pendantLantern: Builder = (k, { w, h }) => {
  k.cyl(0, -h + 0.42, 0, 0.008, 0.008, h - 0.42, "brass", 6);
  k.cyl(0, -h + 0.38, 0, 0.03, w / 2 - 0.02, 0.06, "brass", 8);
  k.cyl(0, -h + 0.08, 0, w / 2 - 0.06, w / 2 - 0.04, 0.3, "glow:#ffe2a8", 8);
  for (let i = 0; i < 4; i++) k.at(0, 0, 0, i * 90 + 45).box([-0.008, -h + 0.06, w / 2 - 0.07], [0.008, -h + 0.4, w / 2 - 0.05], "brass");
  k.cyl(0, -h, 0, w / 2 - 0.08, w / 2 - 0.04, 0.08, "brass", 8);
};

/** White plant stand (dining hall); the flowers sit on top as their own piece. */
export const plantStand: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], "paint:#f4f2ec");
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (w / 2 - 0.03) - 0.02, 0, sz * (d / 2 - 0.03) - 0.02], [sx * (w / 2 - 0.03) + 0.02, h, sz * (d / 2 - 0.03) + 0.02], "paint:#f4f2ec");
  for (const y of [0.25, 0.65]) k.box([-w / 2 + 0.03, y, -d / 2 + 0.03], [w / 2 - 0.03, y + 0.02, d / 2 - 0.03], "paint:#f4f2ec");
};

/** A vase of flowers, a fern, or dried flowers. */
export const flowers: Builder = (k, { w, h }, look) => {
  const rnd = seeded((look ?? "x").length * 17 + 3);
  k.cyl(0, 0, 0, 0.07, 0.09, 0.2, look === "fern" ? "plastic:#8a5a3a" : "glass", 12);
  if (look === "fern") {
    for (let i = 0; i < 9; i++) k.at(0, 0.2, 0, i * 40).sphere([0, 0.05, 0.12], 0.07, "fabric:#3f7a35", [0.5, 0.25, 1.6], 6);
    return;
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * w * 0.35, y = 0.2 + rnd() * (h - 0.25);
    k.cyl(Math.cos(a) * r * 0.5, 0.18, Math.sin(a) * r * 0.5, 0.004, 0.004, y - 0.18, "plastic:#3e6e33", 4);
    const color = look === "dried" ? 21 + (i % 2) * 2 : look === "sun" ? 27 : [26, 27, 31][i % 3]!;
    k.sphere([Math.cos(a) * r, y, Math.sin(a) * r], look === "sun" ? 0.06 : 0.04, "tex:palette", [1, look === "sun" ? 0.4 : 0.8, 1], 6, pal(color));
  }
};

/** A framed picture on the wall. */
function framed(k: Kit, w: number, d: number, h: number, art: string, frame: string, mat = 0) {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], frame);
  if (mat) k.box([-w / 2 + 0.03, 0.03, d / 2], [w / 2 - 0.03, h - 0.03, d / 2 + 0.002], "paint:#f3efe4");
  k.panel([0, h / 2, d / 2 + 0.004], w - 0.06 - mat * 2, h - 0.06 - mat * 2, `tex:art_${art}`);
}
export const frame: Builder = (k, { w, d, h }, look) => framed(k, w, d, h, look ?? "print", look === "map" || look === "print" ? "wood:#3b2a1e" : "plastic:#1b1c1d", 0.05);
export const painting: Builder = (k, { w, d, h }, look) => framed(k, w, d, h, look ?? "landscape", "brass");

/** Rugs: braided ovals, braided rounds, oriental rectangles. */
export const rugBraided: Builder = (k, { w, d }, look) => k.floorPanel([0, 0.006, 0], w, d, `tex:braided_${look ?? "red"}`);
export const rugRound: Builder = (k, { w }, look) => k.disc([0, 0.006, 0], w / 2, `tex:round_${look ?? "blue"}`);
export const rugOriental: Builder = (k, { w, d }, look) => k.floorPanel([0, 0.006, 0], w, d, `tex:oriental_${look ?? "red"}`);
