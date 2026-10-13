import { type Kit, legs, seeded } from "../parts.ts";
import { pal } from "../textures.ts";
import type { Builder } from "./types.ts";

// The greenhouse (GAME_SPEC §8.3): benches and shelves of plants, hanging baskets, and the bear's
// winter stockpile: stacks of donut-hole boxes and canned pasta rings (plain made-up labels, no real
// brands), a cooler of salmon on ice, smoked-salmon packs, crates.

const SLATS = "wood:#a8875f";

/** A clump of leaves: a few small blobs in mixed greens round a point. */
function leaves(k: Kit, x: number, y: number, z: number, r: number, n: number, seed: number) {
  const rnd = seeded(seed);
  const greens = ["fabric:#3e7d3a", "fabric:#2f5d2a", "fabric:#5f8f4a", "fabric:#4a7a3a"];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.6;
    k.sphere([x + Math.cos(a) * d, y + rnd() * r * 0.8, z + Math.sin(a) * d], r * (0.35 + rnd() * 0.25), greens[i % 4]!, [1, 0.75, 1], 6);
  }
}

/** A terracotta pot with a plant: a staked tomato (red fruit), herbs, or a fern. */
function potted(k: Kit, x: number, y: number, z: number, kind: number) {
  k.cyl(x, y, z, 0.07, 0.09, 0.14, "plastic:#b8643a", 10);
  k.cyl(x, y + 0.13, z, 0.085, 0.085, 0.01, "fabric:#4a3424", 10); // soil
  const seed = Math.round(x * 100 + z * 10 + kind);
  if (kind === 0) {
    k.cyl(x, y + 0.14, z, 0.006, 0.006, 0.45, "wood:#c9b38a", 4); // stake
    leaves(k, x, y + 0.2, z, 0.12, 7, seed);
    for (let i = 0; i < 4; i++) k.sphere([x + Math.cos(i * 1.7) * 0.07, y + 0.2 + i * 0.06, z + Math.sin(i * 1.7) * 0.07], 0.022, "tex:palette", [1, 1, 1], 6, pal(26));
  } else if (kind === 1) {
    leaves(k, x, y + 0.15, z, 0.08, 5, seed);
  } else {
    for (let i = 0; i < 7; i++) k.at(x, y + 0.14, z, i * 51).sphere([0, 0.05, 0.08], 0.045, i % 2 ? "fabric:#3f7a35" : "fabric:#4f8a3e", [0.45, 0.22, 1.7], 6);
  }
}

/** Slatted potting bench with pots on top and underneath. */
export const plantBench: Builder = (k, { w, d, h }) => {
  for (let i = 0; i < 6; i++) k.box([-w / 2, h - 0.03, -d / 2 + (i * d) / 6 + 0.01], [w / 2, h, -d / 2 + ((i + 1) * d) / 6 - 0.01], SLATS);
  k.box([-w / 2 + 0.04, 0.18, -d / 2 + 0.04], [w / 2 - 0.04, 0.2, d / 2 - 0.04], SLATS);
  legs(k, w, d, h - 0.03, 0.05, SLATS, 0.02);
  const n = Math.floor(w / 0.28);
  for (let i = 0; i < n; i++) potted(k, -w / 2 + 0.16 + i * ((w - 0.32) / Math.max(1, n - 1)), h, (i % 2 ? 0.1 : -0.1), i % 3);
  for (let i = 0; i < n - 1; i += 2) k.cyl(-w / 2 + 0.2 + i * 0.3, 0.2, 0, 0.08, 0.1, 0.16, "plastic:#b8643a", 10); // empty pots below
};

/** Three-tier plant stand with herbs and seedlings. */
export const plantShelf: Builder = (k, { w, d, h }) => {
  for (let t = 0; t < 3; t++) {
    const y = 0.35 + t * ((h - 0.4) / 2), z = d / 2 - 0.12 - t * 0.12;
    k.box([-w / 2, y - 0.03, z - 0.12], [w / 2, y, z + 0.12], SLATS);
    const n = Math.floor(w / 0.26);
    for (let i = 0; i < n; i++) potted(k, -w / 2 + 0.14 + i * ((w - 0.28) / Math.max(1, n - 1)), y, z, (i + t) % 3);
  }
  for (const sx of [-1, 1]) k.box([sx * w / 2 - 0.02, 0, -d / 2], [sx * w / 2 + 0.02, h, d / 2], SLATS);
};

/** A hanging basket on chains, with trailing greenery (or flowers). Built down from y = 0. */
export const hangingBasket: Builder = (k, { w, h }, look) => {
  for (let i = 0; i < 3; i++) k.at(0, 0, 0, i * 120).box([-0.005, -h + 0.3, w * 0.35], [0.005, 0, w * 0.35 + 0.01], "metal:#3a3c3e");
  k.cyl(0, -h + 0.1, 0, w * 0.3, w / 2, 0.2, "wood:#8a6a48", 12);
  leaves(k, 0, -h + 0.28, 0, w * 0.4, 8, look === "flowers" ? 2 : 1);
  for (let i = 0; i < 8; i++) k.at(0, 0, 0, i * 45).sphere([0, -h + 0.02 - (i % 3) * 0.06, w * 0.4], 0.035, "fabric:#4f8a3e", [0.6, 2.4, 0.6], 6); // trailing stems
  if (look === "flowers") for (let i = 0; i < 7; i++) k.at(0, 0, 0, i * 51).sphere([0, -h + 0.38, w * 0.3], 0.04, "tex:palette", [1, 0.8, 1], 6, pal(31));
};

/** Tall stacks of donut-hole boxes: a plain orange-and-pink dotted box, no wordmark. */
export const donutBoxes: Builder = (k, { w, d, h }) => {
  const rnd = seeded(31);
  const bw = 0.32, bh = 0.13, bd = 0.24;
  for (let col = 0; col < Math.floor(w / (bw + 0.02)); col++) {
    const stack = 6 + Math.floor(rnd() * (h / bh - 6));
    for (let i = 0; i < stack; i++) {
      for (const z of [-d / 4, d / 4]) {
        const x = -w / 2 + bw / 2 + 0.02 + col * (bw + 0.03) + (rnd() - 0.5) * 0.02;
        k.box([x - bw / 2, i * bh, z - bd / 2], [x + bw / 2, (i + 1) * bh - 0.003, z + bd / 2], { all: "tex:donut_box", top: "tex:donut_box" }, "fit");
      }
    }
  }
};

/** A pyramid of red-label canned pasta rings (made-up label, no brand). */
export const cannedPasta: Builder = (k, { w, d, h }) => {
  const r = 0.042, ch = 0.11;
  const rows = Math.floor(h / ch);
  for (let row = 0; row < rows; row++) {
    const across = Math.max(1, Math.floor(w / (2 * r + 0.005)) - row);
    for (let i = 0; i < across; i++) {
      for (const z of [-d / 4, d / 4]) k.cyl(-((across - 1) * (2 * r + 0.005)) / 2 + i * (2 * r + 0.005), row * ch, z, r, r, ch - 0.002, "tex:can_label", 12);
    }
  }
};

/** An open cooler of ice with two whole salmon on it. */
export const coolerSalmon: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], "plastic:#2f6fa8");
  k.box([-w / 2 + 0.04, h - 0.02, -d / 2 + 0.04], [w / 2 - 0.04, h - 0.01, d / 2 - 0.04], "plastic:#e8f2f6"); // ice
  const rnd = seeded(5);
  for (let i = 0; i < 18; i++) k.sphere([-w / 2 + 0.08 + rnd() * (w - 0.16), h - 0.01, -d / 2 + 0.08 + rnd() * (d - 0.16)], 0.03, "plastic:#f4fafc", [1, 0.6, 1], 5);
  // Lid propped open behind.
  k.at(0, h, -d / 2, 0).box([-w / 2, 0, -0.04], [w / 2, 0.45, 0], "plastic:#f4f3ef");
  for (const z of [-0.08, 0.1]) {
    k.sphere([0, h + 0.04, z], 0.08, "plastic:#c7c9c6", [3.2, 0.55, 0.9], 10); // body
    k.sphere([0, h + 0.02, z], 0.07, "plastic:#e98a6a", [3.0, 0.3, 0.6], 8); // pink belly flash
    k.box([0.24, h + 0.01, z - 0.05], [0.3, h + 0.05, z + 0.05], "plastic:#8a8f8c"); // tail
  }
};

/** A small table stacked with smoked-salmon packs. */
export const salmonShelf: Builder = (k, { w, d, h }) => {
  k.box([-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], SLATS);
  legs(k, w, d, h - 0.03, 0.04, SLATS, 0.02);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) {
      const x = -w / 2 + 0.12 + i * ((w - 0.24) / 5), y = h + j * 0.025;
      k.box([x - 0.08, y, -0.12], [x + 0.08, y + 0.022, 0.12], "plastic:#e8743a"); // salmon slab
      k.box([x - 0.085, y + 0.022, -0.125], [x + 0.085, y + 0.025, 0.125], "glass"); // plastic wrap
    }
  }
};

/** Two stacked slatted crates, apples and jars in them. */
export const crates: Builder = (k, { w, d, h }) => {
  for (let c = 0; c < 2; c++) {
    const y0 = c * (h / 2), y1 = y0 + h / 2 - 0.01;
    k.box([-w / 2, y0, -d / 2], [w / 2, y0 + 0.02, d / 2], SLATS);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) k.box([-w / 2, y0 + 0.04 + i * 0.12, s * d / 2 - (s > 0 ? 0.02 : 0)], [w / 2, y0 + 0.12 + i * 0.12, s * d / 2 + (s < 0 ? 0.02 : 0)], SLATS);
      k.box([s * w / 2 - (s > 0 ? 0.02 : 0), y0, -d / 2], [s * w / 2 + (s < 0 ? 0.02 : 0), y1, d / 2], SLATS);
    }
  }
  const rnd = seeded(9);
  for (let i = 0; i < 10; i++) k.sphere([-w / 2 + 0.1 + rnd() * (w - 0.2), h + 0.03, -d / 2 + 0.1 + rnd() * (d - 0.2)], 0.04, "tex:palette", [1, 1, 1], 6, pal(26));
};
