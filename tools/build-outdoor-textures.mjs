// Ground and building-material textures for the outdoor map (milestone 1.8), from the CC0
// Poly Haven downloads: 1K WebP colour + normal, 512 px roughness.
//
// Usage: node tools/fetch-polyhaven.mjs && node tools/build-outdoor-textures.mjs
//   ->   client/public/textures/outdoor/<name>_{diff,nor,rough}.webp

import { mkdir, readdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = "assets/polyhaven/textures";
const OUT = "client/public/textures/outdoor";

/** Game name -> Poly Haven texture. */
const TEXTURES = {
  lawn: "leafy_grass",
  forest: "forest_leaves_02",
  forest_edge: "forrest_ground_01",
  mud: "brown_mud_leaves_01",
  streambed: "river_small_rocks",
  asphalt: "asphalt_02",
  stone_wall: "stacked_stone_wall",
  planks: "weathered_planks",
};

/** Colour tweaks: the walls in the photos are grey fieldstone, the texture is brown slate. */
const LOOK = {
  stone_wall: { saturation: 0.3, brightness: 1.3 },
};

await mkdir(OUT, { recursive: true });
const have = new Set(await readdir(SRC));
for (const [name, id] of Object.entries(TEXTURES)) {
  if (!have.has(id)) throw new Error(`missing ${SRC}/${id}: run tools/fetch-polyhaven.mjs`);
  const diff = sharp(`${SRC}/${id}/diff.jpg`).resize(1024, 1024);
  if (LOOK[name]) diff.modulate(LOOK[name]);
  await diff.webp({ quality: 85 }).toFile(`${OUT}/${name}_diff.webp`);
  await sharp(`${SRC}/${id}/nor_gl.jpg`).resize(1024, 1024).webp({ quality: 90 }).toFile(`${OUT}/${name}_nor.webp`);
  await sharp(`${SRC}/${id}/rough.jpg`).resize(512, 512).greyscale().webp({ quality: 85 }).toFile(`${OUT}/${name}_rough.webp`);
  console.log("  ", name, "<-", id);
}
console.log(`wrote ${OUT}`);
