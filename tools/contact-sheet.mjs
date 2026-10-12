// Tile screenshots into one image for quick review: node tools/contact-sheet.mjs out.png cols a.png b.png …
import sharp from "sharp";

const [out, colsArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg) || 2;
const W = 640, H = 360;
const tiles = await Promise.all(files.map((f) => sharp(f).resize(W, H).toBuffer()));
const rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: "#000" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * W, top: Math.floor(i / cols) * H })))
  .png()
  .toFile(out);
