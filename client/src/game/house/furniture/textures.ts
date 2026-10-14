import { CanvasTexture, ClampToEdgeWrapping, NearestFilter, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { seeded } from "./parts.ts";

// Pictures drawn in code for furniture (no downloads, no copied artwork): braided and oriental
// rugs, paintings and prints, curtain fabrics, and a palette strip that lets lots of small things
// (books, jars, cans) share one material, each pointing its texture coordinates at one colour.

/** Colours on the palette strip, in order. A part uses `pal(i)` as its fixed texture coordinate. */
export const PALETTE = [
  // book spines
  "#7a1f1f", "#1f3b5c", "#2d4a2b", "#c9b48a", "#5a2d4a", "#20252b", "#a2582a", "#e6dcc4", "#3f6f8f", "#8b6b2e",
  "#6b7f3a", "#b03a2e", "#2b2b6b", "#d7c27a", "#4e3b2a", "#9fb2bf",
  // pantry: jar glass, lids, can labels, boxes
  "#c98a3a", "#7d2a1f", "#e8d9a0", "#3a6b2f", "#b8322a", "#f0e6cf", "#a8a8a8", "#d9a441", "#5b3a1e", "#e07b2e",
  // kitchen bits, plants, flowers
  "#c0392b", "#e2b13c", "#3e7d3a", "#2f5d2a", "#f2f2ee", "#e8a3b5",
] as const;
export const pal = (i: number): [number, number] => [(i % PALETTE.length + 0.5) / PALETTE.length, 0.5];

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false): Texture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  return t;
}

function palette() {
  const t = canvas(PALETTE.length, 1, (ctx) => PALETTE.forEach((c, i) => ((ctx.fillStyle = c), ctx.fillRect(i, 0, 1, 1))));
  t.magFilter = t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** Concentric braided rings (oval or round), like the mudroom/kitchen/dining rugs. */
function braided(colors: string[], oval: boolean) {
  return canvas(512, oval ? 340 : 512, (ctx) => {
    const W = ctx.canvas.width, H = ctx.canvas.height, rnd = seeded(7);
    ctx.clearRect(0, 0, W, H);
    const rings = 22;
    for (let i = 0; i < rings; i++) {
      const t = 1 - i / rings;
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, (W / 2) * t, (H / 2) * t, 0, 0, Math.PI * 2);
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)]!;
      ctx.fill();
      // Braid texture: little slanted dashes round the ring.
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, (W / 2) * t - 4, (H / 2) * t - 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

/** An oriental rug: borders and a field of small motifs round a central medallion. */
function oriental(field: string, border: string, accent: string, light: string) {
  return canvas(512, 384, (ctx) => {
    const W = 512, H = 384;
    ctx.fillStyle = border;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = light;
    ctx.fillRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = border;
    ctx.fillRect(22, 22, W - 44, H - 44);
    // Border motifs.
    ctx.fillStyle = accent;
    for (let x = 30; x < W - 30; x += 16) for (const y of [26, H - 34]) ctx.fillRect(x, y, 8, 8);
    for (let y = 30; y < H - 30; y += 16) for (const x of [26, W - 34]) ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = field;
    ctx.fillRect(44, 44, W - 88, H - 88);
    // Field motifs.
    ctx.fillStyle = light;
    for (let x = 60; x < W - 60; x += 36) for (let y = 60; y < H - 60; y += 36) {
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.fill();
    }
    // Medallion.
    for (const [r, c] of [[110, accent], [86, light], [62, border], [36, accent]] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, r * 1.3, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Simple paintings and prints, made up (no copied art). */
function painting(look: string) {
  return canvas(256, 256, (ctx) => {
    const rnd = seeded(look.length * 31 + look.charCodeAt(0));
    const grad = (stops: string[], y0 = 0, y1 = 256) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
      return g;
    };
    if (look === "sea") {
      ctx.fillStyle = grad(["#9cc3d8", "#e9e2c6"], 0, 130);
      ctx.fillRect(0, 0, 256, 130);
      ctx.fillStyle = grad(["#2f5f7d", "#173a52"], 130, 256);
      ctx.fillRect(0, 130, 256, 126);
      ctx.fillStyle = "#f4f1e6";
      for (let i = 0; i < 40; i++) ctx.fillRect(rnd() * 256, 135 + rnd() * 120, 14 + rnd() * 20, 2);
      ctx.fillStyle = "#3b2b1e";
      ctx.fillRect(150, 100, 50, 34); // a boat
      ctx.fillStyle = "#f4f1e6";
      ctx.beginPath();
      ctx.moveTo(172, 100);
      ctx.lineTo(172, 30);
      ctx.lineTo(210, 100);
      ctx.fill();
    } else if (look === "portrait") {
      ctx.fillStyle = grad(["#3a2b22", "#1c1510"]);
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#c79b7a";
      ctx.beginPath();
      ctx.ellipse(128, 100, 40, 52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2b3b5a";
      ctx.beginPath();
      ctx.ellipse(128, 250, 90, 90, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#4a3324";
      ctx.beginPath();
      ctx.ellipse(128, 70, 44, 30, 0, Math.PI, 0);
      ctx.fill();
    } else if (look === "map") {
      ctx.fillStyle = "#e7dcbd";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#9cc0c9";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let y = 0; y <= 256; y += 16) ctx.lineTo(60 + Math.sin(y / 30) * 20 + rnd() * 10, y);
      ctx.lineTo(0, 256);
      ctx.fill();
      ctx.strokeStyle = "#7a8a5a";
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.ellipse(150 + rnd() * 60, 60 + rnd() * 140, 20 + rnd() * 30, 10 + rnd() * 20, rnd(), 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (look === "photo") {
      ctx.fillStyle = grad(["#cfd6d8", "#8a8f86"]);
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#3d4a3a";
      for (let i = 0; i < 9; i++) {
        const x = rnd() * 256, h = 60 + rnd() * 110;
        ctx.beginPath();
        ctx.moveTo(x, 256 - h);
        ctx.lineTo(x - 22, 256);
        ctx.lineTo(x + 22, 256);
        ctx.fill();
      }
    } else if (look === "print") {
      ctx.fillStyle = "#f2eee2";
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = "#6c7a64";
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const x = 30 + rnd() * 196, y = 60 + rnd() * 150;
        ctx.beginPath();
        ctx.moveTo(x, y + 40);
        ctx.quadraticCurveTo(x + 10, y, x + 4, y - 30);
        ctx.stroke();
        ctx.fillStyle = ["#c86a6a", "#d8b44a", "#7a8fc0"][i % 3]!;
        ctx.beginPath();
        ctx.arc(x + 4, y - 32, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (look === "abstract") {
      // soft purple-and-pink brushwork (pink bedroom)
      ctx.fillStyle = "#c9a8d8";
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = ["rgba(120,60,150,0.35)", "rgba(230,140,180,0.35)", "rgba(250,230,240,0.4)", "rgba(80,90,170,0.3)"][i % 4]!;
        ctx.beginPath();
        ctx.ellipse(rnd() * 256, rnd() * 256, 20 + rnd() * 40, 6 + rnd() * 14, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // landscape: hills, a stand of pines, evening sky
      ctx.fillStyle = grad(["#e8c38f", "#b9cbd4"], 0, 150);
      ctx.fillRect(0, 0, 256, 150);
      for (const [y, c] of [[120, "#6e7f5c"], [150, "#4f6142"], [190, "#3a4a31"]] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, 256);
        for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x / 40 + y) * 14);
        ctx.lineTo(256, 256);
        ctx.fill();
      }
      ctx.fillStyle = "#24301f";
      for (let i = 0; i < 10; i++) {
        const x = rnd() * 256, h = 30 + rnd() * 50;
        ctx.beginPath();
        ctx.moveTo(x, 190 - h);
        ctx.lineTo(x - 9, 195);
        ctx.lineTo(x + 9, 195);
        ctx.fill();
      }
    }
  });
}

/** Repeating curtain / upholstery fabrics. */
function fabric(look: string) {
  return canvas(256, 256, (ctx) => {
    const rnd = seeded(look.charCodeAt(0) * 13);
    if (look === "plaid") {
      ctx.fillStyle = "#6a1f2a";
      ctx.fillRect(0, 0, 256, 256);
      ctx.globalAlpha = 0.45;
      for (const [w, c, o] of [[40, "#1f2b4a", 0], [12, "#c9a24a", 64], [40, "#1f2b4a", 128], [8, "#2e5a3a", 200]] as const) {
        ctx.fillStyle = c;
        ctx.fillRect(o, 0, w, 256);
        ctx.fillRect(0, o, 256, w);
      }
      ctx.globalAlpha = 1;
    } else if (look === "cubes") {
      // Blue-and-white tumbling blocks (the bowling lounge's cube stools): rows of 3D-looking cubes.
      const shades = ["#f3f5fa", "#2b4f9e", "#8fa6d6"];
      const s = 64, hgt = s * Math.sqrt(3) / 2;
      for (let row = -1; row < 256 / hgt + 1; row++) {
        for (let col = -1; col < 256 / s + 1; col++) {
          const cx = col * s + (row % 2 ? s / 2 : 0), cy = row * hgt * 1.0;
          const faces: [number, number][][] = [
            [[0, -s / 2], [s / 2, -s / 4], [0, 0], [-s / 2, -s / 4]], // top
            [[-s / 2, -s / 4], [0, 0], [0, s / 2], [-s / 2, s / 4]], // left
            [[0, 0], [s / 2, -s / 4], [s / 2, s / 4], [0, s / 2]], // right
          ];
          faces.forEach((f, i) => {
            ctx.fillStyle = shades[i]!;
            ctx.beginPath();
            f.forEach(([x, y], j) => (j ? ctx.lineTo(cx + x, cy + y) : ctx.moveTo(cx + x, cy + y)));
            ctx.closePath();
            ctx.fill();
          });
        }
      }
    } else if (look === "floral") {
      // Cream ground, small soft roses with leaves (blue bedroom curtains, cushions).
      ctx.fillStyle = "#efe7d6";
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) {
        const x = rnd() * 256, y = rnd() * 256, r = 4 + rnd() * 6;
        ctx.fillStyle = "#8aa07a";
        ctx.beginPath();
        ctx.ellipse(x + r, y + r * 0.6, r * 0.9, r * 0.4, 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ["#c97d8a", "#d9a2a8", "#7d93b5", "#e0b77a"][i % 4]!;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (look === "quilt") {
      const colors = ["#f1dfe4", "#e4c7cf", "#dfe8d4", "#f4efe2", "#d9b8c2", "#c9d8bf"];
      for (let x = 0; x < 256; x += 32) for (let y = 0; y < 256; y += 32) {
        ctx.fillStyle = colors[Math.floor(rnd() * colors.length)]!;
        ctx.fillRect(x, y, 32, 32);
      }
      ctx.strokeStyle = "rgba(120,80,90,0.25)";
      for (let i = 0; i <= 256; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
    } else if (look === "damask") {
      ctx.fillStyle = "#ecd6d4";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let x = 0; x < 256; x += 64) for (let y = 0; y < 256; y += 64) {
        ctx.beginPath();
        ctx.ellipse(x + 32, y + 32, 18, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // stripes (wingback-ish, pillows)
      ctx.fillStyle = "#efeadf";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#b8c3c9";
      for (let x = 0; x < 256; x += 24) ctx.fillRect(x, 0, 5, 256);
    }
  }, true);
}

/** A made-up donut-hole box: white with orange and pink dots and stripes, no words or logo. */
function donutBox() {
  return canvas(128, 128, (ctx) => {
    ctx.fillStyle = "#fbf6ee";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#e8742e";
    ctx.fillRect(0, 0, 128, 18);
    ctx.fillRect(0, 110, 128, 18);
    const rnd = seeded(4);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 ? "#e0548a" : "#e8742e";
      ctx.beginPath();
      ctx.arc(14 + rnd() * 100, 30 + rnd() * 70, 6 + rnd() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** A made-up can label: red with a yellow band and a bowl of pasta rings, no words or logo. */
function canLabel() {
  return canvas(256, 128, (ctx) => {
    ctx.fillStyle = "#c62a22";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#f2c230";
    ctx.fillRect(0, 50, 256, 26);
    for (const x of [40, 168]) {
      ctx.fillStyle = "#f4f1ea";
      ctx.beginPath();
      ctx.ellipse(x, 98, 26, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e0782e";
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x - 14 + i * 7, 95, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#9a9da0";
    ctx.fillRect(0, 0, 256, 6);
    ctx.fillRect(0, 122, 256, 6);
  });
}

const cache = new Map<string, Texture>();
/** A generated texture by name: palette, braided_red, braided_blue, round_blue, oriental_red/_blue/_gold, art_<look>, fabric_<look>. */
export function furnitureTexture(name: string): Texture {
  let t = cache.get(name);
  if (t) return t;
  if (name === "palette") t = palette();
  else if (name === "braided_red") t = braided(["#8e2b25", "#6f1f1c", "#b2483a", "#d9c3a0", "#5a3a2a"], true);
  else if (name === "braided_blue") t = braided(["#3e5f80", "#6f8fa9", "#d9d2bd", "#2f4a63", "#8ea3a5"], true);
  else if (name === "round_blue") t = braided(["#5d7f9c", "#8fa8bc", "#dcd6c4", "#3d5a76", "#a9b9c0"], false);
  else if (name === "oriental_red") t = oriental("#8a2a26", "#1f2d4a", "#c99a4a", "#e9dcc0");
  else if (name === "oriental_blue") t = oriental("#24375e", "#7d2421", "#c9a85a", "#eadfc6");
  else if (name === "oriental_gold") t = oriental("#c8b48a", "#5a3a2a", "#8a2a26", "#efe4cc");
  else if (name === "donut_box") t = donutBox();
  else if (name === "can_label") t = canLabel();
  else if (name.startsWith("art_")) t = painting(name.slice(4));
  else if (name.startsWith("fabric_")) t = fabric(name.slice(7));
  else t = palette();
  cache.set(name, t);
  return t;
}
