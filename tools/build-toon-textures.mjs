// Painted ground textures for the cartoon art style, from the Higgsfield pictures in
// assets/concepts/scenery/ (8 lawn, 9 forest floor, 10 asphalt). Each is made seamless (blended
// with a copy of itself shifted by half, so the edges wrap round without a seam) and written next
// to the realistic ones. The forest edge is half lawn, half forest floor.
//
// Usage: node tools/build-toon-textures.mjs  ->  client/public/textures/outdoor/toon_*_diff.webp

import sharp from "sharp";

const SRC = "assets/concepts/scenery";
const DIR = "client/public/textures/outdoor";
const SIZE = 1024;

/** RGB pixels of a picture, resized to SIZE × SIZE. */
const pixels = async (file) => (await sharp(file).resize(SIZE, SIZE).removeAlpha().raw().toBuffer());

/** Blend the picture with itself shifted by half: the original in the middle, the shifted copy at the edges. */
function seamless(img) {
  const out = Buffer.alloc(img.length), h = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // 1 in the middle, 0 at the borders, soft in between.
      const dx = Math.abs(x - h + 0.5) / h, dy = Math.abs(y - h + 0.5) / h;
      const m = Math.min(1, Math.max(0, (1 - Math.max(dx, dy)) / 0.35));
      const i = (y * SIZE + x) * 3, j = (((y + h) % SIZE) * SIZE + ((x + h) % SIZE)) * 3;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(img[i + c] * m + img[j + c] * (1 - m));
    }
  }
  return out;
}

const write = (buf, name) => sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 88 }).toFile(`${DIR}/toon_${name}_diff.webp`);

const lawn = seamless(await pixels(`${SRC}/8-lawn-texture.png`));
const forest = seamless(await pixels(`${SRC}/9-forest-floor-texture.png`));
const asphalt = seamless(await pixels(`${SRC}/10-asphalt-texture.png`));
const edge = Buffer.alloc(lawn.length);
for (let i = 0; i < lawn.length; i++) edge[i] = Math.round((lawn[i] + forest[i]) / 2);

await Promise.all([write(lawn, "lawn"), write(forest, "forest"), write(edge, "forest_edge"), write(asphalt, "asphalt")]);
console.log(`wrote ${DIR}/toon_{lawn,forest,forest_edge,asphalt}_diff.webp`);
