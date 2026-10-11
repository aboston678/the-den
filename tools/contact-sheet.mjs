// Tile screenshots into one image for a quick look: node tools/contact-sheet.mjs out.png a.png b.png ...
import sharp from "sharp";

const [out, ...files] = process.argv.slice(2);
const W = 640, H = 360, COLS = 3;
const tiles = await Promise.all(files.map(async (f, i) => ({
  input: await sharp(f).resize(W, H).toBuffer(), left: (i % COLS) * W, top: Math.floor(i / COLS) * H,
})));
await sharp({ create: { width: W * COLS, height: H * Math.ceil(files.length / COLS), channels: 3, background: "#fff" } })
  .composite(tiles).png().toFile(out);
