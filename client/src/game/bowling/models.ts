import { BALL, PIN } from "@den/shared";
import {
  type BufferGeometry, CanvasTexture, LatheGeometry, MeshStandardMaterial, SRGBColorSpace, SphereGeometry, Vector2,
} from "three";

// What the pins and balls look like (GAME_SPEC §15). Pins are a lathe of the regulation pin profile
// (15 in tall, 4.766 in at the belly, a slim neck and a round head) in white with two red neck
// stripes; balls are glossy swirled spheres in each bowler's colour. Sizes are real metres.

const IN = 0.0254;
/** Pin profile: [height, radius] in inches, base to crown. */
export const PIN_PROFILE: [number, number][] = [
  [0, 0], [0, 1.0], [0.4, 1.35], [1.3, 1.85], [2.5, 2.2], [3.75, 2.38], [4.5, 2.383], [5.6, 2.25], [6.75, 1.95],
  [7.9, 1.5], [8.9, 1.12], [9.7, 0.93], [10.3, 0.9], [11.0, 1.02], [11.8, 1.22], [12.6, 1.27], [13.4, 1.18],
  [14.1, 0.95], [14.6, 0.62], [14.9, 0.3], [15, 0],
];

/** Pin geometry, base at y = 0. */
export function pinGeometry(segments = 18): BufferGeometry {
  const pts = PIN_PROFILE.map(([h, r]) => new Vector2(r * IN, h * IN));
  const g = new LatheGeometry(pts, segments);
  // Texture v from the height, so the stripes land on the neck.
  const pos = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / PIN.height);
  return g;
}

/** White pin with two red stripes on the neck. */
export function pinMaterial() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f7f5f0";
  ctx.fillRect(0, 0, 4, 256);
  ctx.fillStyle = "#c8202b";
  // Canvas y runs top-down; texture v runs up the pin (stripes at ~9.2 in and ~10.6 in).
  for (const h of [9.0, 10.5]) ctx.fillRect(0, 256 * (1 - (h + 0.55) / 15), 4, 256 * (0.4 / 15));
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  return new MeshStandardMaterial({ map, emissiveMap: map, emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 0.28 }); // lit like the lane (see style.ts "lane")
}

export const ballGeometry = (segments = 24) => new SphereGeometry(BALL.radius, segments, Math.round(segments * 0.75));

/** Each bowler slot's ball colour (the photo's blue first). */
export const BALL_COLOURS = ["#1f4fd6", "#c9302c", "#1f9a5a", "#7b3fc4"] as const;

/** A swirled, glossy ball in one colour, with finger holes. */
export function ballMaterial(colour: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 256, 128);
  // Marbled swirls: soft lighter and darker strokes.
  let s = colour.length * 9301;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.18)" : "rgba(0,0,20,0.22)";
    ctx.lineWidth = 2 + rand() * 7;
    ctx.beginPath();
    let x = rand() * 256, y = rand() * 128;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) ctx.quadraticCurveTo(x + (rand() - 0.5) * 120, y + (rand() - 0.5) * 60, (x += (rand() - 0.5) * 140), (y += (rand() - 0.5) * 50));
    ctx.stroke();
  }
  // Finger holes (three dark dots near the "top").
  ctx.fillStyle = "#0b0b10";
  for (const [x, y, r] of [[120, 20, 5], [136, 20, 5], [128, 36, 6]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  return new MeshStandardMaterial({ map, roughness: 0.12, metalness: 0.15 });
}
