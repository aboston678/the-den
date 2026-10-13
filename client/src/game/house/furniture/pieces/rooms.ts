import { seeded } from "../parts.ts";
import { pal } from "../textures.ts";
import type { Builder } from "./types.ts";

// Upstairs and basement-den pieces (milestone 2.2): beds, the papasan, the tub, dresser + hutch,
// the landing's curio cabinet, the den's pine armoire, drapes, the globe and a (blank) pennant.

const WHITE = "paint:#f2f0ea";

/** White four-post twin bed with a quilted yellow comforter (yellow bedroom). */
export const twinBed: Builder = (k, { w, d, h }) => {
  k.box([-w / 2 + 0.04, 0.22, -d / 2 + 0.05], [w / 2 - 0.04, 0.42, d / 2 - 0.05], WHITE);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), 0.035, 0.03, sz < 0 ? h : h * 0.75, WHITE, 8);
  k.box([-w / 2 + 0.04, 0.45, -d / 2 + 0.01], [w / 2 - 0.04, h * 0.7, -d / 2 + 0.05], WHITE);
  k.box([-w / 2 + 0.06, 0.42, -d / 2 + 0.06], [w / 2 - 0.06, 0.58, d / 2 - 0.06], "fabric:#f4f2ee");
  k.box([-w / 2 + 0.02, 0.52, -d / 2 + 0.4], [w / 2 - 0.02, 0.64, d / 2 - 0.02], "fabric:#f0d76a");
  k.box([-0.3, 0.58, -d / 2 + 0.08], [0.3, 0.7, -d / 2 + 0.38], "fabric:#ffffff");
};

/** White metal daybed (skylight bedroom): back and arms of rails, a cream mattress. */
export const daybed: Builder = (k, { w, d, h }) => {
  k.box([-w / 2 + 0.03, 0.3, -d / 2 + 0.03], [w / 2 - 0.03, 0.48, d / 2 - 0.03], "fabric:#efe7d6");
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02), 0.02, 0.02, sz < 0 ? h : h * 0.8, "metal:#f2f0ea", 8);
  k.rodX(-w / 2, w / 2, h - 0.03, -d / 2 + 0.02, 0.02, "metal:#f2f0ea");
  k.rodX(-w / 2, w / 2, 0.3, -d / 2 + 0.02, 0.02, "metal:#f2f0ea");
  for (let i = 1; i < 12; i++) k.cyl(-w / 2 + (i * w) / 12, 0.3, -d / 2 + 0.02, 0.008, 0.008, h - 0.33, "metal:#f2f0ea", 6);
  for (const sx of [-1, 1]) k.at(sx * (w / 2 - 0.02), 0, 0).rodZ(-d / 2, d / 2, h * 0.8 - 0.03, 0, 0.02, "metal:#f2f0ea");
  for (let i = 0; i < 3; i++) k.box([-0.75 + i * 0.5, 0.48, -d / 2 + 0.06], [-0.35 + i * 0.5, 0.78, -d / 2 + 0.2], "tex:fabric_stripes");
};

/** Papasan chair: a round cushion in a rattan bowl on a ring base. */
export const papasan: Builder = (k, { w, h }) => {
  k.cyl(0, 0, 0, w * 0.32, w * 0.28, 0.32, "wood:#b0844a", 16);
  k.sphere([0, 0.55, 0], w / 2, "wood:#b48a52", [1, 0.42, 1], 16);
  k.sphere([0, 0.62, 0.02], w / 2 - 0.05, "fabric:#e6eef0", [1, 0.32, 1], 16);
  k.at(0, 0, 0).sphere([0, h - 0.05, -w * 0.3], w * 0.3, "fabric:#e6eef0", [1.4, 0.7, 0.5], 12);
};

export const tub: Builder = (k, { w, d, h }) => {
  const china = "plastic:#f4f3ef";
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], china);
  k.box([-w / 2 + 0.07, h - 0.3, -d / 2 + 0.07], [w / 2 - 0.07, h + 0.001, d / 2 - 0.07], "plastic:#dfe6e8"); // inside (water-blue tint)
  k.cyl(-w / 2 + 0.12, h, -d / 2 + 0.08, 0.02, 0.02, 0.18, "metal:#c9ccce", 8);
};

/** Cream dresser; with look "hutch", a glass-front hutch of books on top (yellow bedroom). */
export const dresser: Builder = (k, { w, d, h }, look) => {
  const cream = "wood:#e7dfc4";
  const top = 0.9;
  k.box([-w / 2, 0.06, -d / 2], [w / 2, top, d / 2], cream);
  for (let r = 0; r < 4; r++) {
    const y = 0.1 + r * 0.19;
    for (const sx of [-1, 1]) {
      k.box([sx > 0 ? 0.01 : -w / 2 + 0.03, y, d / 2], [sx > 0 ? w / 2 - 0.03 : -0.01, y + 0.17, d / 2 + 0.012], "wood:#ece5cd");
      k.box([sx * w / 4 - 0.05, y + 0.08, d / 2 + 0.012], [sx * w / 4 + 0.05, y + 0.095, d / 2 + 0.03], "brass");
    }
  }
  if (look !== "hutch") return;
  const rnd = seeded(23);
  k.box([-w / 2 + 0.03, top, -d / 2], [w / 2 - 0.03, h, -d / 2 + 0.3], cream);
  for (let s = 0; s < 2; s++) {
    const y = top + 0.05 + s * 0.45;
    k.box([-w / 2 + 0.05, y - 0.02, -d / 2 + 0.02], [w / 2 - 0.05, y, -d / 2 + 0.3], cream);
    let x = -w / 2 + 0.08;
    while (x < w / 2 - 0.12) {
      const t = 0.025 + rnd() * 0.03;
      k.box([x, y, -d / 2 + 0.05], [x + t, y + 0.2 + rnd() * 0.12, -d / 2 + 0.26], "tex:palette", pal(Math.floor(rnd() * 16)));
      x += t + 0.003;
    }
  }
};

/** Dark curio cabinet with glass sides and shelves of china (landing). */
export const curioCabinet: Builder = (k, { w, d, h }) => {
  const dark = "wood:#2e1a12";
  k.box([-w / 2, 0, -d / 2], [w / 2, 0.08, d / 2], dark);
  k.box([-w / 2, h - 0.08, -d / 2], [w / 2, h, d / 2], dark);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * w / 2 - (sx > 0 ? 0.04 : 0), 0, sz * d / 2 - (sz > 0 ? 0.04 : 0)], [sx * w / 2 + (sx < 0 ? 0.04 : 0), h, sz * d / 2 + (sz < 0 ? 0.04 : 0)], dark);
  k.box([-w / 2 + 0.01, 0.08, -d / 2 + 0.01], [w / 2 - 0.01, h - 0.08, -d / 2 + 0.02], "metal:#8a8d90"); // mirrored back
  for (let s = 0; s < 4; s++) {
    const y = 0.35 + s * 0.38;
    k.box([-w / 2 + 0.04, y, -d / 2 + 0.04], [w / 2 - 0.04, y + 0.01, d / 2 - 0.04], "glass");
    k.cyl(-0.1, y + 0.01, 0, 0.04, 0.03, 0.1, "plastic:#f4f2ec", 10);
    k.sphere([0.1, y + 0.06, 0.02], 0.05, "plastic:#c0506a", [1, 1, 1], 8);
  }
  k.box([-w / 2 + 0.04, 0.08, d / 2 - 0.01], [w / 2 - 0.04, h - 0.08, d / 2], "glass");
};

/** Pine armoire (basement den). */
export const armoire: Builder = (k, { w, d, h }) => {
  const pine = "wood:#cf9a5e";
  k.box([-w / 2, 0.08, -d / 2], [w / 2, h - 0.08, d / 2 - 0.02], pine);
  k.box([-w / 2 - 0.03, h - 0.08, -d / 2], [w / 2 + 0.03, h, d / 2 + 0.03], pine);
  k.box([-w / 2, 0, -d / 2], [w / 2, 0.08, d / 2], pine);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -w / 2 + 0.03 : 0.01, x1 = sx < 0 ? -0.01 : w / 2 - 0.03;
    k.box([x0, 0.12, d / 2 - 0.02], [x1, h - 0.12, d / 2], "wood:#d6a467");
    k.box([x0 + 0.08, 0.3, d / 2], [x1 - 0.08, h - 0.4, d / 2 + 0.012], "wood:#d6a467");
    k.sphere([sx * 0.05, h / 2, d / 2 + 0.03], 0.02, "brass", [1, 1, 1], 6);
  }
};

/** Curtains either side of a doorway on a rod (the den's french doors). */
export const drapes: Builder = (k, { w, d, h }, look) => {
  const fabric = look === "floral" ? "tex:fabric_floral" : "fabric:#e8dcc4";
  k.rodX(-w / 2, w / 2, h, d / 2, 0.015, "brass");
  for (const sx of [-1, 1]) k.box([sx > 0 ? w / 2 - 0.45 : -w / 2, 0.02, -d / 2], [sx > 0 ? w / 2 : -w / 2 + 0.45, h - 0.03, d / 2], fabric);
};

/** Desk globe on a brass stand. */
export const globe: Builder = (k, { h }) => {
  k.cyl(0, 0, 0, 0.08, 0.06, 0.03, "wood:#3b2216", 12);
  k.cyl(0, 0.03, 0, 0.01, 0.01, 0.12, "brass", 6);
  k.sphere([0, h - 0.14, 0], 0.13, "tex:art_map", [1, 1, 1], 16);
  k.ring([0, h - 0.14, 0], 0.145, 0.006, "brass");
};

/** A felt pennant with stripes (no school name or logo). */
export const pennant: Builder = (k, { w, d, h }) => {
  for (let i = 0; i < 6; i++) {
    const x0 = -w / 2 + (i * w) / 6, x1 = x0 + w / 6, t = 1 - i / 6, t1 = 1 - (i + 1) / 6;
    k.box([x0, h / 2 - (h / 2) * t, -d / 2], [x1, h / 2 + (h / 2) * t1, d / 2], i < 1 ? "fabric:#f2f0ea" : "fabric:#8c1d22");
  }
};

